/** Runs individual AI agents via Claude Code CLI subprocess.
 *
 * The Claude Code CLI is spawned as a child process with --output-format stream-json.
 * It streams JSON lines which are parsed for agent output, tool use, and results.
 *
 * For interactive questions: When the agent uses AskUserQuestion, the CLI pauses
 * and emits a tool_use event. The onQuestion callback relays the question to the
 * frontend via WebSocket. The user's answer is returned to resume the agent.
 *
 * NOTE: @anthropic-ai/claude-code is a CLI binary, not a programmatic SDK.
 * There is no query() or canUseTool callback. We use subprocess streaming.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { which } from '../utils/which.js';
import type { AgentResult } from '../models/session.js';

export interface AgentRunnerParams {
  taskId: string;
  prompt: string;
  systemPrompt: string;
  onOutput: (taskId: string, content: string) => Promise<void>;
  onQuestion?: (
    taskId: string,
    payload: Record<string, any>,
  ) => Promise<Record<string, any>>;
  workingDir: string;
  timeout?: number;
  mcpServers?: Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }>;
}

export class AgentRunner {
  private claudePath: string;

  constructor() {
    this.claudePath = which('claude') ?? 'claude';
  }

  async execute(params: AgentRunnerParams): Promise<AgentResult> {
    const {
      taskId,
      prompt,
      systemPrompt,
      onOutput,
      workingDir,
      timeout = 300,
      mcpServers,
    } = params;

    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--append-system-prompt', systemPrompt,
      '--model', 'opus',
      '--permission-mode', 'bypassPermissions',
      '--max-turns', '20',
    ];

    // Inject MCP server config if portals provide MCP servers
    if (mcpServers && mcpServers.length > 0) {
      const mcpConfig: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> = {};
      for (const server of mcpServers) {
        mcpConfig[server.name] = {
          command: server.command,
          ...(server.args ? { args: server.args } : {}),
          ...(server.env ? { env: server.env } : {}),
        };
      }
      const configDir = path.join(workingDir, '.elisa');
      fs.mkdirSync(configDir, { recursive: true });
      const configPath = path.join(configDir, 'mcp-config.json');
      fs.writeFileSync(configPath, JSON.stringify({ mcpServers: mcpConfig }, null, 2), 'utf-8');
      args.push('--mcp-config', configPath);
    }

    try {
      return await withTimeout(
        this.runProcess(args, taskId, onOutput, workingDir),
        timeout * 1000,
      );
    } catch (err: any) {
      if (err.message === 'Timed out') {
        return {
          success: false,
          summary: `Agent timed out after ${timeout} seconds`,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
      }
      if (err.code === 'ENOENT') {
        return {
          success: false,
          summary: "Claude CLI ('claude') not found. Is it installed and on PATH?",
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
      }
      return {
        success: false,
        summary: String(err.message || err),
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }
  }

  private runProcess(
    args: string[],
    taskId: string,
    onOutput: (taskId: string, content: string) => Promise<void>,
    workingDir: string,
  ): Promise<AgentResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.claudePath, args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const accumulatedText: string[] = [];
      let costUsd = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      let finalResult = '';
      let success = true;
      let stderrChunks: Buffer[] = [];

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      let lineBuf = '';
      proc.stdout?.on('data', (chunk: Buffer) => {
        lineBuf += chunk.toString('utf-8');
        const lines = lineBuf.split('\n');
        lineBuf = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let data: any;
          try {
            data = JSON.parse(trimmed);
          } catch {
            continue;
          }

          const msgType = data.type ?? '';

          if (msgType === 'assistant') {
            const message = data.message ?? {};
            for (const block of message.content ?? []) {
              if (block.type === 'text') {
                accumulatedText.push(block.text);
                onOutput(taskId, block.text).catch(() => {});
              }
            }
          } else if (msgType === 'result') {
            finalResult = data.result ?? '';
            costUsd = data.cost_usd ?? 0;
            inputTokens = data.input_tokens ?? data.input_tokens_used ?? 0;
            outputTokens = data.output_tokens ?? data.output_tokens_used ?? 0;
            if (data.subtype === 'error') {
              success = false;
              if (!finalResult) finalResult = data.error ?? 'Unknown error';
            }
          }
        }
      });

      proc.on('error', reject);

      proc.on('close', (code) => {
        // Process remaining buffer
        if (lineBuf.trim()) {
          try {
            const data = JSON.parse(lineBuf.trim());
            if (data.type === 'result') {
              finalResult = data.result ?? finalResult;
              costUsd = data.cost_usd ?? costUsd;
              inputTokens = data.input_tokens ?? data.input_tokens_used ?? inputTokens;
              outputTokens = data.output_tokens ?? data.output_tokens_used ?? outputTokens;
              if (data.subtype === 'error') {
                success = false;
                if (!finalResult) finalResult = data.error ?? 'Unknown error';
              }
            }
          } catch {
            // ignore
          }
        }

        if (code !== 0 && success) {
          success = false;
          const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();
          if (!finalResult) {
            finalResult = stderr || `Process exited with code ${code}`;
          }
        }

        const summary = finalResult || accumulatedText.slice(-3).join('\n') || 'No output';
        resolve({
          success,
          summary,
          costUsd,
          inputTokens,
          outputTokens,
        });
      });
    });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out')), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

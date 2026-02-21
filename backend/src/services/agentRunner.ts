/** Runs individual AI agents via OpenAI chat completions. */

import OpenAI from 'openai';
import type { AgentResult } from '../models/session.js';
import { withTimeout } from '../utils/withTimeout.js';
import { MAX_TURNS_DEFAULT } from '../utils/constants.js';
import { getOpenAIClient } from '../utils/openaiClient.js';

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
  model?: string;
  maxTurns?: number;
  mcpServers?: Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }>;
  allowedTools?: string[];
  abortSignal?: AbortSignal;
}

export class AgentRunner {
  private client: OpenAI;

  constructor() {
    this.client = getOpenAIClient();
  }

  async execute(params: AgentRunnerParams): Promise<AgentResult> {
    const {
      taskId,
      prompt,
      systemPrompt,
      onOutput,
      workingDir,
      timeout = 300,
      model = process.env.OPENAI_MODEL || 'gpt-4.1',
      maxTurns = MAX_TURNS_DEFAULT,
      mcpServers,
      allowedTools,
    } = params;

    const abortController = new AbortController();

    if (params.abortSignal) {
      if (params.abortSignal.aborted) {
        abortController.abort();
      } else {
        params.abortSignal.addEventListener('abort', () => abortController.abort(), { once: true });
      }
    }

    try {
      return await withTimeout(
        this.runCompletion(
          prompt,
          systemPrompt,
          workingDir,
          taskId,
          onOutput,
          model,
          maxTurns,
          mcpServers,
          allowedTools,
          abortController,
        ),
        timeout * 1000,
      );
    } catch (err: any) {
      // Ensure the query is aborted on timeout or any error
      abortController.abort();
      if (err.message === 'Timed out') {
        return {
          success: false,
          summary: `Agent timed out after ${timeout} seconds`,
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

  private async runCompletion(
    prompt: string,
    systemPrompt: string,
    cwd: string,
    taskId: string,
    onOutput: (taskId: string, content: string) => Promise<void>,
    model: string,
    maxTurns: number,
    mcpServers?: Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }>,
    allowedTools?: string[],
    abortController?: AbortController,
  ): Promise<AgentResult> {
    const capabilityNotes: string[] = [];
    if (allowedTools?.length) capabilityNotes.push(`Allowed tools: ${allowedTools.join(', ')}`);
    if (mcpServers?.length) capabilityNotes.push(`MCP servers available: ${mcpServers.map(s => s.name).join(', ')}`);

    const userPrompt = [
      prompt,
      '',
      `Working directory: ${cwd}`,
      `Max turns budget: ${maxTurns}`,
      ...(capabilityNotes.length > 0 ? capabilityNotes : []),
      '',
      'Important: Return concise implementation notes and concrete file-level changes.',
    ].join('\n');

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_completion_tokens: 4000,
    }, abortController ? { signal: abortController.signal } : undefined);

    const text = response.choices[0]?.message?.content ?? '';
    if (text) {
      onOutput(taskId, text).catch(() => {});
    }

    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const summary = text || 'No output';
    return { success: true, summary, costUsd: 0, inputTokens, outputTokens };
  }
}

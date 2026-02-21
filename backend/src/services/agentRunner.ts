/** Runs individual AI agents via OpenAI chat completions. */

import OpenAI from 'openai';
import type { AgentResult } from '../models/session.js';
import { withTimeout } from '../utils/withTimeout.js';
import { AGENT_MAX_COMPLETION_TOKENS_DEFAULT, MAX_TURNS_DEFAULT } from '../utils/constants.js';
import { getOpenAIClient } from '../utils/openaiClient.js';

export const CONTEXT_WINDOW_EXCEEDED_MARKER = 'CONTEXT_WINDOW_EXCEEDED:';
export const OUTPUT_LIMIT_REACHED_MARKER = 'OUTPUT_LIMIT_REACHED:';

function isContextWindowExceededError(err: any): boolean {
  const code = String(err?.code ?? '').toLowerCase();
  const type = String(err?.type ?? '').toLowerCase();
  const message = String(err?.message ?? '').toLowerCase();
  return (
    code === 'context_length_exceeded' ||
    type === 'context_length_exceeded' ||
    /context length|context window|too many tokens|max(?:imum)? context|prompt (?:is )?too long|context_window_exceeded/.test(message)
  );
}

function isOutputLimitError(err: any): boolean {
  const code = String(err?.code ?? '').toLowerCase();
  const type = String(err?.type ?? '').toLowerCase();
  const message = String(err?.message ?? '').toLowerCase();
  return (
    code === 'max_tokens' ||
    type === 'max_tokens' ||
    /max_tokens|model output limit|output limit was reached|could not finish the message|try again with higher max_tokens|completion length/i.test(message)
  );
}

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
  maxCompletionTokens?: number;
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
      model = process.env.OPENAI_MODEL || 'gpt-5.2',
      maxTurns = MAX_TURNS_DEFAULT,
      maxCompletionTokens = AGENT_MAX_COMPLETION_TOKENS_DEFAULT,
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
          maxCompletionTokens,
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
      if (isContextWindowExceededError(err)) {
        return {
          success: false,
          summary: `${CONTEXT_WINDOW_EXCEEDED_MARKER} Prompt exceeded model context window`,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
      }
      if (isOutputLimitError(err)) {
        return {
          success: false,
          summary: `${OUTPUT_LIMIT_REACHED_MARKER} Response exceeded max completion tokens`,
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
    maxCompletionTokens: number,
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
      max_completion_tokens: maxCompletionTokens,
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

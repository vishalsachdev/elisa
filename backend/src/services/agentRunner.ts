/** Runs individual AI agents via OpenAI chat completions with streaming and tool calling. */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { AgentResult, ToolCallRecord } from '../models/session.js';
import { withTimeout } from '../utils/withTimeout.js';
import { AGENT_MAX_COMPLETION_TOKENS_DEFAULT, MAX_TURNS_DEFAULT } from '../utils/constants.js';
import { getOpenAIClient } from '../utils/openaiClient.js';
import { getToolsForAllowedList } from '../utils/toolDefinitions.js';
import { executeToolsParallel } from '../utils/toolExecutor.js';
import { calculateTotalCost } from '../utils/pricing.js';

export const CONTEXT_WINDOW_EXCEEDED_MARKER = 'CONTEXT_WINDOW_EXCEEDED:';
export const OUTPUT_LIMIT_REACHED_MARKER = 'OUTPUT_LIMIT_REACHED:';

function isContextWindowExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  const code = String(e.code ?? '').toLowerCase();
  const type = String(e.type ?? '').toLowerCase();
  const message = String(e.message ?? '').toLowerCase();
  return (
    code === 'context_length_exceeded' ||
    type === 'context_length_exceeded' ||
    /context length|context window|too many tokens|max(?:imum)? context|prompt (?:is )?too long|context_window_exceeded/.test(message)
  );
}

function isOutputLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  const code = String(e.code ?? '').toLowerCase();
  const type = String(e.type ?? '').toLowerCase();
  const message = String(e.message ?? '').toLowerCase();
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
  onToolCall?: (taskId: string, toolName: string, args: string) => Promise<void>;
  onToolResult?: (taskId: string, toolName: string, result: string) => Promise<void>;
  onQuestion?: (
    taskId: string,
    payload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  workingDir: string;
  timeout?: number;
  model?: string;
  maxTurns?: number;
  maxCompletionTokens?: number;
  mcpServers?: Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }>;
  allowedTools?: string[];
  abortSignal?: AbortSignal;
  enableStreaming?: boolean;
  enableToolCalling?: boolean;
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
      onToolCall,
      onToolResult,
      workingDir,
      timeout = 300,
      model = process.env.OPENAI_MODEL || 'gpt-5.2',
      maxTurns = MAX_TURNS_DEFAULT,
      maxCompletionTokens = AGENT_MAX_COMPLETION_TOKENS_DEFAULT,
      allowedTools = [],
      enableStreaming = true,
      enableToolCalling = true,
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
        this.runAgentLoop(
          taskId,
          prompt,
          systemPrompt,
          workingDir,
          onOutput,
          onToolCall,
          onToolResult,
          model,
          maxTurns,
          maxCompletionTokens,
          allowedTools,
          abortController,
          enableStreaming,
          enableToolCalling,
        ),
        timeout * 1000,
      );
    } catch (err: unknown) {
      abortController.abort();
      if (err instanceof Error && err.message === 'Timed out') {
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
        summary: err instanceof Error ? err.message : String(err),
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }
  }

  private async runAgentLoop(
    taskId: string,
    prompt: string,
    systemPrompt: string,
    workingDir: string,
    onOutput: (taskId: string, content: string) => Promise<void>,
    onToolCall: ((taskId: string, toolName: string, args: string) => Promise<void>) | undefined,
    onToolResult: ((taskId: string, toolName: string, result: string) => Promise<void>) | undefined,
    model: string,
    maxTurns: number,
    maxCompletionTokens: number,
    allowedTools: string[],
    abortController: AbortController,
    enableStreaming: boolean,
    enableToolCalling: boolean,
  ): Promise<AgentResult> {
    const tools = enableToolCalling ? getToolsForAllowedList(allowedTools) : [];
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.buildUserPrompt(prompt, workingDir, maxTurns, allowedTools) },
    ];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedInputTokens = 0;
    let totalReasoningTokens = 0;
    const allToolCalls: ToolCallRecord[] = [];
    let turn = 0;
    let finalSummary = '';

    while (turn < maxTurns) {
      turn++;

      if (abortController.signal.aborted) {
        return {
          success: false,
          summary: 'Agent was cancelled',
          costUsd: calculateTotalCost(model, totalInputTokens, totalOutputTokens, totalCachedInputTokens),
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cachedInputTokens: totalCachedInputTokens,
          reasoningTokens: totalReasoningTokens,
          toolCalls: allToolCalls,
        };
      }

      const { content, toolCalls, usage } = enableStreaming
        ? await this.streamCompletion(taskId, messages, model, maxCompletionTokens, tools, onOutput, abortController)
        : await this.nonStreamingCompletion(taskId, messages, model, maxCompletionTokens, tools, onOutput, abortController);

      // Accumulate tokens
      totalInputTokens += usage.inputTokens;
      totalOutputTokens += usage.outputTokens;
      totalCachedInputTokens += usage.cachedInputTokens ?? 0;
      totalReasoningTokens += usage.reasoningTokens ?? 0;

      // Add assistant message to history
      if (toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: content || null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });
      } else if (content) {
        messages.push({ role: 'assistant', content });
      }

      // If no tool calls, we're done
      if (toolCalls.length === 0) {
        finalSummary = content || 'No output';
        break;
      }

      // Execute tools in parallel (per Attractor spec)
      const toolInputs = toolCalls.map((tc) => ({
        name: tc.name,
        args: JSON.parse(tc.arguments),
        id: tc.id,
      }));

      // Notify about tool calls
      for (const tc of toolCalls) {
        onToolCall?.(taskId, tc.name, tc.arguments).catch(() => {});
      }

      const results = await executeToolsParallel(toolInputs, workingDir);

      // Add tool results to messages and record
      for (const tc of toolCalls) {
        const result = results.get(tc.id);
        const output = result?.success
          ? result.output
          : `Error: ${result?.error ?? 'Unknown error'}`;

        // Truncate long outputs (per Attractor spec: character-based truncation)
        const truncatedOutput = output.length > 10000
          ? output.slice(0, 10000) + '\n[Output truncated]'
          : output;

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: truncatedOutput,
        });

        allToolCalls.push({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
          result: truncatedOutput,
          durationMs: result?.durationMs,
        });

        onToolResult?.(taskId, tc.name, truncatedOutput).catch(() => {});
      }

      // Update final summary with latest content
      if (content) {
        finalSummary = content;
      }
    }

    const costUsd = calculateTotalCost(model, totalInputTokens, totalOutputTokens, totalCachedInputTokens);

    return {
      success: true,
      summary: finalSummary,
      costUsd,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cachedInputTokens: totalCachedInputTokens > 0 ? totalCachedInputTokens : undefined,
      reasoningTokens: totalReasoningTokens > 0 ? totalReasoningTokens : undefined,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    };
  }

  private async streamCompletion(
    taskId: string,
    messages: ChatCompletionMessageParam[],
    model: string,
    maxCompletionTokens: number,
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
    onOutput: (taskId: string, content: string) => Promise<void>,
    abortController: AbortController,
  ): Promise<{
    content: string;
    toolCalls: Array<{ id: string; name: string; arguments: string }>;
    usage: { inputTokens: number; outputTokens: number; cachedInputTokens?: number; reasoningTokens?: number };
  }> {
    const stream = await this.client.chat.completions.create(
      {
        model,
        messages,
        temperature: 0.2,
        max_completion_tokens: maxCompletionTokens,
        stream: true,
        stream_options: { include_usage: true },
        ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
      },
      { signal: abortController.signal },
    );

    let content = '';
    const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();
    let usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0 };
    let lastChunkTime = Date.now();
    const streamBuffer: string[] = [];
    const STREAM_DEBOUNCE_MS = 100;

    const flushBuffer = async () => {
      if (streamBuffer.length > 0) {
        const chunk = streamBuffer.join('');
        streamBuffer.length = 0;
        await onOutput(taskId, chunk);
      }
    };

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // Handle content streaming
      if (delta?.content) {
        content += delta.content;
        streamBuffer.push(delta.content);

        // Debounce streaming output
        const now = Date.now();
        if (now - lastChunkTime > STREAM_DEBOUNCE_MS) {
          await flushBuffer();
          lastChunkTime = now;
        }
      }

      // Handle tool calls
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCallsMap.get(tc.index);
          if (existing) {
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
          } else {
            toolCallsMap.set(tc.index, {
              id: tc.id ?? `call_${tc.index}`,
              name: tc.function?.name ?? '',
              arguments: tc.function?.arguments ?? '',
            });
          }
        }
      }

      // Handle usage (comes in final chunk)
      if (chunk.usage) {
        const usageAny = chunk.usage as unknown as Record<string, unknown>;
        const promptDetails = usageAny.prompt_tokens_details as Record<string, number> | undefined;
        const completionDetails = usageAny.completion_tokens_details as Record<string, number> | undefined;
        usage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
          cachedInputTokens: promptDetails?.cached_tokens ?? 0,
          reasoningTokens: completionDetails?.reasoning_tokens ?? 0,
        };
      }
    }

    // Flush any remaining buffer
    await flushBuffer();

    return {
      content,
      toolCalls: Array.from(toolCallsMap.values()),
      usage,
    };
  }

  private async nonStreamingCompletion(
    taskId: string,
    messages: ChatCompletionMessageParam[],
    model: string,
    maxCompletionTokens: number,
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
    onOutput: (taskId: string, content: string) => Promise<void>,
    abortController: AbortController,
  ): Promise<{
    content: string;
    toolCalls: Array<{ id: string; name: string; arguments: string }>;
    usage: { inputTokens: number; outputTokens: number; cachedInputTokens?: number; reasoningTokens?: number };
  }> {
    const response = await this.client.chat.completions.create(
      {
        model,
        messages,
        temperature: 0.2,
        max_completion_tokens: maxCompletionTokens,
        ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
      },
      { signal: abortController.signal },
    );

    const message = response.choices[0]?.message;
    const content = message?.content ?? '';

    if (content) {
      await onOutput(taskId, content);
    }

    const toolCalls = (message?.tool_calls ?? [])
      .filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: 'function' } => tc.type === 'function')
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));

    const usageData = response.usage as Record<string, unknown> | undefined;
    const usage = {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      cachedInputTokens: usageData?.prompt_tokens_details
        ? (usageData.prompt_tokens_details as Record<string, number>).cached_tokens ?? 0
        : 0,
      reasoningTokens: usageData?.completion_tokens_details
        ? (usageData.completion_tokens_details as Record<string, number>).reasoning_tokens ?? 0
        : 0,
    };

    return { content, toolCalls, usage };
  }

  private buildUserPrompt(
    prompt: string,
    workingDir: string,
    maxTurns: number,
    allowedTools: string[],
  ): string {
    const parts = [
      prompt,
      '',
      `Working directory: ${workingDir}`,
      `Max turns budget: ${maxTurns}`,
    ];

    if (allowedTools.length > 0) {
      parts.push(`Available tools: ${allowedTools.join(', ')}`);
    }

    parts.push('', 'Important: Return concise implementation notes and concrete file-level changes.');

    return parts.join('\n');
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunner } from './agentRunner.js';
import { resetOpenAIClient } from '../utils/openaiClient.js';

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

describe('AgentRunner', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    resetOpenAIClient();
  });

  it('calls OpenAI chat.completions.create with model and prompts', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Done' } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });

    const runner = new AgentRunner();
    await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'you are a bot',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
      maxTurns: 12,
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const req = mockCreate.mock.calls[0][0];
    expect(req.model).toBe('gpt-5.2');
    expect(req.messages[0].role).toBe('system');
    expect(req.messages[0].content).toBe('you are a bot');
    expect(req.messages[1].role).toBe('user');
    expect(req.messages[1].content).toContain('hello');
    expect(req.messages[1].content).toContain('Working directory: /tmp/test');
    expect(req.messages[1].content).toContain('Max turns budget: 12');
  });

  it('forwards output text to onOutput callback', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Hello world' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const onOutput = vi.fn().mockResolvedValue(undefined);
    const runner = new AgentRunner();
    await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'you are a bot',
      onOutput,
      workingDir: '/tmp/test',
    });

    expect(onOutput).toHaveBeenCalledWith('test-1', 'Hello world');
    expect(onOutput).toHaveBeenCalledTimes(1);
  });

  it('extracts token counts from usage', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Done' } }],
      usage: { prompt_tokens: 500, completion_tokens: 200 },
    });

    const runner = new AgentRunner();
    const result = await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'you are a bot',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
    });

    expect(result.success).toBe(true);
    expect(result.costUsd).toBe(0);
    expect(result.inputTokens).toBe(500);
    expect(result.outputTokens).toBe(200);
  });

  it('returns timeout failure when request exceeds time limit', async () => {
    mockCreate.mockReturnValue(new Promise(() => {}));

    const runner = new AgentRunner();
    const result = await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'you are a bot',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
      timeout: 0.01,
    });

    expect(result.success).toBe(false);
    expect(result.summary).toContain('timed out');
  });

  it('catches thrown errors and returns failure', async () => {
    mockCreate.mockRejectedValue(new Error('OpenAI connection failed'));

    const runner = new AgentRunner();
    const result = await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'you are a bot',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
    });

    expect(result.success).toBe(false);
    expect(result.summary).toContain('OpenAI connection failed');
  });

  it('maps context-length errors to a stable marker summary', async () => {
    const err = new Error('This model\'s maximum context length is exceeded');
    (err as any).code = 'context_length_exceeded';
    mockCreate.mockRejectedValue(err);

    const runner = new AgentRunner();
    const result = await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'you are a bot',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
    });

    expect(result.success).toBe(false);
    expect(result.summary).toContain('CONTEXT_WINDOW_EXCEEDED');
  });
});

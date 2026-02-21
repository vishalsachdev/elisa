import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { safeEnv } from './safeEnv.js';

describe('safeEnv', () => {
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-1234';
    process.env.OPENAI_API_KEY = 'sk-openai-test-key-1234';
  });

  afterEach(() => {
    if (originalAnthropicKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (originalOpenAIKey !== undefined) {
      process.env.OPENAI_API_KEY = originalOpenAIKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it('returns env without API keys', () => {
    const env = safeEnv();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it('preserves other env vars', () => {
    const env = safeEnv();
    expect(env.PATH).toBe(process.env.PATH);
    expect(env.NODE_ENV).toBe(process.env.NODE_ENV);
  });

  it('does not mutate process.env', () => {
    safeEnv();
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-test-key-1234');
    expect(process.env.OPENAI_API_KEY).toBe('sk-openai-test-key-1234');
  });
});

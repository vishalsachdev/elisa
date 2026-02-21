import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      _id = Math.random();
    },
  };
});

import { getAnthropicClient, resetAnthropicClient } from './anthropicClient.js';

describe('anthropicClient singleton', () => {
  beforeEach(() => {
    resetAnthropicClient();
  });

  it('returns the same instance on repeated calls', () => {
    const a = getAnthropicClient();
    const b = getAnthropicClient();
    expect(a).toBe(b);
  });

  it('returns a new instance after reset', () => {
    const a = getAnthropicClient();
    resetAnthropicClient();
    const b = getAnthropicClient();
    expect(a).not.toBe(b);
  });
});

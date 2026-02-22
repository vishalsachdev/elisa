import { describe, it, expect } from 'vitest';
import { calculateCost, calculateTotalCost, getModelPricing, supportsReasoningTokens } from './pricing.js';

describe('pricing', () => {
  describe('calculateCost', () => {
    it('calculates cost for GPT-5.2 without caching', () => {
      const result = calculateCost('gpt-5.2', {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
      });

      expect(result.inputCost).toBeCloseTo(2.50, 2);
      expect(result.outputCost).toBeCloseTo(5.00, 2);
      expect(result.cacheSavings).toBe(0);
      expect(result.totalCost).toBeCloseTo(7.50, 2);
    });

    it('calculates cost with cached input tokens', () => {
      const result = calculateCost('gpt-5.2', {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        cachedInputTokens: 800_000,
      });

      // 200k uncached at $2.50/M = $0.50
      // 800k cached at $1.25/M = $1.00
      // Total input: $1.50
      expect(result.inputCost).toBeCloseTo(1.50, 2);
      expect(result.outputCost).toBeCloseTo(5.00, 2);
      // Savings: 800k * ($2.50 - $1.25) / 1M = $1.00
      expect(result.cacheSavings).toBeCloseTo(1.00, 2);
      expect(result.totalCost).toBeCloseTo(6.50, 2);
    });

    it('calculates cost for o1 reasoning model', () => {
      const result = calculateCost('o1', {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        reasoningTokens: 100_000,
      });

      // o1: $15/M input, $60/M output
      expect(result.inputCost).toBeCloseTo(15.00, 2);
      // Reasoning tokens are part of output tokens, already billed
      expect(result.outputCost).toBeCloseTo(30.00, 2);
      expect(result.totalCost).toBeCloseTo(45.00, 2);
    });

    it('uses default pricing for unknown models', () => {
      const result = calculateCost('unknown-model', {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      });

      // Default: $2.50/M input, $10.00/M output
      expect(result.inputCost).toBeCloseTo(2.50, 2);
      expect(result.outputCost).toBeCloseTo(10.00, 2);
    });
  });

  describe('calculateTotalCost', () => {
    it('returns total cost as a simple number', () => {
      const cost = calculateTotalCost('gpt-5.2', 1_000_000, 500_000);
      expect(cost).toBeCloseTo(7.50, 2);
    });

    it('handles cached tokens', () => {
      const cost = calculateTotalCost('gpt-5.2', 1_000_000, 500_000, 800_000);
      expect(cost).toBeCloseTo(6.50, 2);
    });
  });

  describe('getModelPricing', () => {
    it('returns pricing for known models', () => {
      const pricing = getModelPricing('gpt-5.2');
      expect(pricing.input).toBe(2.50);
      expect(pricing.output).toBe(10.00);
      expect(pricing.cachedInput).toBe(1.25);
    });

    it('returns default pricing for unknown models', () => {
      const pricing = getModelPricing('unknown');
      expect(pricing.input).toBe(2.50);
      expect(pricing.output).toBe(10.00);
    });
  });

  describe('supportsReasoningTokens', () => {
    it('returns true for o1 models', () => {
      expect(supportsReasoningTokens('o1')).toBe(true);
      expect(supportsReasoningTokens('o1-mini')).toBe(true);
      expect(supportsReasoningTokens('o1-preview')).toBe(true);
    });

    it('returns true for o3 models', () => {
      expect(supportsReasoningTokens('o3')).toBe(true);
      expect(supportsReasoningTokens('o3-mini')).toBe(true);
    });

    it('returns false for other models', () => {
      expect(supportsReasoningTokens('gpt-5.2')).toBe(false);
      expect(supportsReasoningTokens('gpt-4o')).toBe(false);
    });
  });
});

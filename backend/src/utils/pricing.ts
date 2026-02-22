/** OpenAI model pricing and cost calculation utilities. */

/**
 * Pricing per million tokens (USD) for OpenAI models.
 * Updated: February 2026
 * Source: https://openai.com/pricing
 */
export const MODEL_PRICING: Record<string, { input: number; output: number; cachedInput?: number }> = {
  // GPT-5.2 (latest)
  'gpt-5.2': { input: 2.50, output: 10.00, cachedInput: 1.25 },

  // GPT-4.1 (fallback)
  'gpt-4.1': { input: 2.00, output: 8.00, cachedInput: 1.00 },

  // GPT-4o models
  'gpt-4o': { input: 2.50, output: 10.00, cachedInput: 1.25 },
  'gpt-4o-mini': { input: 0.15, output: 0.60, cachedInput: 0.075 },

  // o1 reasoning models
  'o1': { input: 15.00, output: 60.00, cachedInput: 7.50 },
  'o1-mini': { input: 3.00, output: 12.00, cachedInput: 1.50 },
  'o1-preview': { input: 15.00, output: 60.00, cachedInput: 7.50 },

  // o3 reasoning models
  'o3': { input: 10.00, output: 40.00, cachedInput: 5.00 },
  'o3-mini': { input: 1.10, output: 4.40, cachedInput: 0.55 },
};

/** Default pricing if model not found (use GPT-4o pricing as fallback). */
const DEFAULT_PRICING = { input: 2.50, output: 10.00, cachedInput: 1.25 };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheSavings: number;
  totalCost: number;
}

/**
 * Calculate cost in USD for token usage.
 *
 * @param model - The model name (e.g., 'gpt-5.2')
 * @param usage - Token counts including cached and reasoning tokens
 * @returns Cost breakdown in USD
 */
export function calculateCost(model: string, usage: TokenUsage): CostBreakdown {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;

  // Calculate input cost (cached tokens are cheaper)
  const cachedTokens = usage.cachedInputTokens ?? 0;
  const uncachedInputTokens = usage.inputTokens - cachedTokens;

  const cachedCost = (cachedTokens / 1_000_000) * (pricing.cachedInput ?? pricing.input);
  const uncachedCost = (uncachedInputTokens / 1_000_000) * pricing.input;
  const inputCost = cachedCost + uncachedCost;

  // Calculate savings from cache
  const cacheSavings = cachedTokens > 0
    ? (cachedTokens / 1_000_000) * (pricing.input - (pricing.cachedInput ?? pricing.input))
    : 0;

  // Output tokens include reasoning tokens (they're billed as output)
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;

  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    cacheSavings,
    totalCost,
  };
}

/**
 * Simple cost calculation that returns just the total USD amount.
 */
export function calculateTotalCost(model: string, inputTokens: number, outputTokens: number, cachedInputTokens = 0): number {
  return calculateCost(model, { inputTokens, outputTokens, cachedInputTokens }).totalCost;
}

/**
 * Get pricing info for a model.
 */
export function getModelPricing(model: string): { input: number; output: number; cachedInput: number } {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  return {
    input: pricing.input,
    output: pricing.output,
    cachedInput: pricing.cachedInput ?? pricing.input,
  };
}

/**
 * Check if a model supports reasoning tokens (o1, o3 series).
 */
export function supportsReasoningTokens(model: string): boolean {
  return model.startsWith('o1') || model.startsWith('o3');
}

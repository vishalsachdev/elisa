/** Legacy alias maintained for backwards-compatibility in tests.
 *
 * Prefer using `openaiClient.ts` in runtime code.
 */

import OpenAI from 'openai';

let instance: OpenAI | null = null;

export function getAnthropicClient(): OpenAI {
  if (!instance) {
    instance = new OpenAI();
  }
  return instance;
}

/** Reset singleton (for tests). */
export function resetAnthropicClient(): void {
  instance = null;
}

/** Singleton factory for the OpenAI SDK client. */

import OpenAI from 'openai';

let instance: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!instance) {
    instance = new OpenAI();
  }
  return instance;
}

/** Reset singleton (for tests). */
export function resetOpenAIClient(): void {
  instance = null;
}

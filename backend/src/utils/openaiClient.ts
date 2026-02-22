/** Singleton factory for the OpenAI SDK client. */

import OpenAI from 'openai';

let instance: OpenAI | null = null;

/**
 * Get or create the OpenAI client singleton.
 *
 * Supports proxy mode via environment variables:
 * - OPENAI_BASE_URL: Custom base URL (e.g., https://elisa-openai-proxy.workers.dev/v1)
 * - OPENAI_WORKSHOP_CODE: Workshop code for proxy auth
 * - OPENAI_STUDENT_ID: Optional student ID for usage tracking
 *
 * When using a proxy, OPENAI_API_KEY can be a dummy value since the proxy holds the real key.
 */
export function getOpenAIClient(): OpenAI {
  if (!instance) {
    const baseURL = process.env.OPENAI_BASE_URL;
    const workshopCode = process.env.OPENAI_WORKSHOP_CODE;
    const studentId = process.env.OPENAI_STUDENT_ID;

    // Build custom headers for proxy mode
    const defaultHeaders: Record<string, string> = {};
    if (workshopCode) {
      defaultHeaders['X-Workshop-Code'] = workshopCode;
    }
    if (studentId) {
      defaultHeaders['X-Student-Id'] = studentId;
    }

    instance = new OpenAI({
      ...(baseURL && { baseURL }),
      ...(Object.keys(defaultHeaders).length > 0 && { defaultHeaders }),
    });
  }
  return instance;
}

/** Reset singleton (for tests). */
export function resetOpenAIClient(): void {
  instance = null;
}

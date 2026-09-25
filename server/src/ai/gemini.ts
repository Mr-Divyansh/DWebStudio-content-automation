import { GoogleGenAI } from '@google/genai';

let genAIInstance: GoogleGenAI | null = null;
let genAIInstanceKey = '';

export const GEMINI_MODEL = (process.env.GEMINI_MODEL ?? '').trim() || 'gemini-2.5-flash';
export const GEMINI_TIMEOUT_MS = Math.max(5_000, Math.min(20_000, Number(process.env.GEMINI_TIMEOUT_MS ?? 10_000) || 10_000));
export const GEMINI_MAX_RETRIES = Math.max(0, Math.min(1, Number(process.env.GEMINI_MAX_RETRIES ?? 1) || 1));

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY ?? '').trim();
  if (!apiKey) return null;
  if (!genAIInstance || genAIInstanceKey !== apiKey) {
    genAIInstance = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    genAIInstanceKey = apiKey;
  }
  return genAIInstance;
}

export function isGeminiConfigured(): boolean {
  const key = (process.env.GEMINI_API_KEY ?? '').trim();
  return Boolean(key && key.length > 5);
}

/** Vault se nayi key aane par purana client hatao — bina restart kaam karega. */
export function resetGeminiClient(): void {
  genAIInstance = null;
  genAIInstanceKey = '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(error: any): boolean {
  const status = Number(error?.status ?? error?.code ?? error?.response?.status);
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(error?.message ?? '').toLowerCase();
  return /timeout|timed out|network|fetch failed|econnreset|socket hang up|rate limit|overloaded|unavailable|temporarily/.test(message);
}

export interface GeminiJsonOptions {
  systemInstruction: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Central bounded JSON call used by every Gemini feature. Retries only transient
 * failures, applies a hard timeout, and never logs prompts, responses, or keys.
 */
export async function generateGeminiJson<T>(options: GeminiJsonOptions, parse: (value: unknown) => T): Promise<T> {
  const ai = getGeminiClient();
  if (!ai) throw new Error('Gemini API key is not configured.');

  let lastError: unknown;
  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: options.userPrompt,
        config: {
          systemInstruction: options.systemInstruction,
          responseMimeType: 'application/json',
          temperature: options.temperature ?? 0.2,
          maxOutputTokens: options.maxOutputTokens ?? 2_048,
          abortSignal: controller.signal,
        },
      });
      const text = (response.text || '{}').trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      return parse(JSON.parse(text || '{}'));
    } catch (error) {
      lastError = error;
      if (attempt >= GEMINI_MAX_RETRIES || !isRetryableGeminiError(error)) break;
      await sleep(Math.min(500 * 2 ** attempt, 4_000));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Gemini request failed.');
}

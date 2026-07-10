import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// Primary model first; then a wide ladder of rarely-overloaded fallbacks.
// The lite tiers handle this app's structured extraction fine, and 2.5-pro
// (busiest during demand spikes) goes last.
const MODEL_CHAIN = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.5-pro"];
const ATTEMPTS_PER_MODEL = 2;
const RETRY_DELAYS_MS = [1500, 3000];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * The genai SDK often throws errors whose message is a JSON string like
 * {"error":{"code":503,"message":"...","status":"UNAVAILABLE"}}.
 * Extract the code/status so we can decide whether to retry.
 */
function isRetryable(err: any): boolean {
  const msg = String(err?.message || err || '');
  let code: number | undefined = err?.status ?? err?.code;
  let status = '';
  const jsonStart = msg.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(msg.slice(jsonStart));
      code = parsed?.error?.code ?? code;
      status = parsed?.error?.status || '';
    } catch { /* not JSON, fall through to text matching */ }
  }
  if (code === 503 || code === 429 || code === 500) return true;
  if (/UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|try again/i.test(status + ' ' + msg)) return true;
  return false;
}

/**
 * Calls generateContent with automatic retry and model fallback.
 * Retryable errors (503 overload, 429 rate limit, 500) are retried
 * ATTEMPTS_PER_MODEL times per model before moving down MODEL_CHAIN.
 * Non-retryable errors (bad key, bad request) are thrown immediately.
 */
export async function generateWithRetry(
  ai: GoogleGenAI,
  request: { contents: any; config?: any }
): Promise<GenerateContentResponse> {
  let lastErr: any = null;
  for (const model of MODEL_CHAIN) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      try {
        return await ai.models.generateContent({ model, ...request });
      } catch (err: any) {
        // 404 = model not available for this key/region; skip to next model
        const notFound = /NOT_FOUND|is not found/i.test(String(err?.message || ''));
        if (!isRetryable(err) && !notFound) throw err;
        lastErr = err;
        if (notFound) break;
        if (attempt < ATTEMPTS_PER_MODEL) await sleep(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]);
      }
    }
  }
  throw new Error('Google AI 模型暂时繁忙，已自动重试多次仍未成功。请等 1-2 分钟后再点一次上传。');
}

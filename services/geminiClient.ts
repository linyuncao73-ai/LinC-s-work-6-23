import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// Primary model first. Fallbacks favor vision accuracy: dense-table OCR gets
// worse on lite models, so prefer 2.5-pro before dropping to 2.0-flash.
const MODEL_CHAIN = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"];
const ATTEMPTS_PER_MODEL = 2;
const RETRY_DELAY_MS = 1500;

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
        if (attempt < ATTEMPTS_PER_MODEL) await sleep(RETRY_DELAY_MS);
      }
    }
  }
  throw new Error('Google AI 模型暂时繁忙，已自动重试多次仍未成功。请等 1-2 分钟后再点一次上传。');
}

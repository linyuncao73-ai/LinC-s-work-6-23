const STORAGE_KEY = 'gemini_api_key';

export function getStoredApiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredApiKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode etc.) — key just won't persist
  }
}

export function getApiKey(): string {
  const stored = getStoredApiKey();
  if (stored) return stored;
  const envKey = process.env.API_KEY;
  if (envKey) return envKey;
  throw new Error('未设置 Gemini API Key。请点击页面右上角的钥匙图标，粘贴你的 API Key（只保存在本机浏览器，不会上传）。');
}

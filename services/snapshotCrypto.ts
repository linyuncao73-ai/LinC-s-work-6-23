// AES-GCM encryption for cloud snapshots, keyed by a shared team passcode.
// Protects the data from anyone who finds the Supabase URL + anon key.

export interface EncryptedPayload {
  v: 2;
  salt: string; // base64
  iv: string;   // base64
  ct: string;   // base64 ciphertext
}

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveKey(passcode: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function isEncryptedPayload(data: any): data is EncryptedPayload {
  return !!data && data.v === 2 && typeof data.ct === 'string' && typeof data.salt === 'string' && typeof data.iv === 'string';
}

export async function encryptJson(obj: unknown, passcode: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passcode, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext);
  return { v: 2, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptJson<T = unknown>(payload: EncryptedPayload, passcode: string): Promise<T> {
  const key = await deriveKey(passcode, fromB64(payload.salt));
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(payload.iv) as BufferSource },
      key,
      fromB64(payload.ct) as BufferSource
    );
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    throw new Error('团队口令不正确，无法解密云端数据。请核对右上角设置里的团队口令（需与保存者一致）。');
  }
}

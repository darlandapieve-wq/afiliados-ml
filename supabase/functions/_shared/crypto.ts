// Criptografia de tokens (AES-256-GCM, WebCrypto — funciona em Deno e Node 20+).
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(s: string): Uint8Array {
  const n = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(n + '='.repeat((4 - (n.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = unb64(base64Key);
  if (raw.length !== 32) throw new Error('ENCRYPTION_KEY deve ter 32 bytes (base64).');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(key: CryptoKey, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function decrypt(key: CryptoKey, payload: string): Promise<string> {
  const [v, iv, ct] = payload.split('.');
  if (v !== 'v1' || !iv || !ct) throw new Error('Formato de segredo inválido');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
  return dec.decode(pt);
}

export function randomToken(bytes = 32): string {
  return b64(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256b64(s: string): Promise<string> {
  return b64(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** Remove possíveis segredos de mensagens de erro antes de gravar logs. */
export function redact(s: string): string {
  return s
    .replace(/(access_token|refresh_token|client_secret|token|key)=([^&\s"]+)/gi, '$1=[REDACTED]')
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]');
}

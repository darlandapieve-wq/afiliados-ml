// Utilidades exclusivas das Edge Functions (Deno).
// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { importKey, encrypt, decrypt, redact } from './crypto.ts';

export const env = (k: string) => Deno.env.get(k) ?? undefined;

export function admin(): SupabaseClient {
  return createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

/** Configuração: variável de ambiente ou, na falta dela, Supabase Vault (get_app_secret). */
const cfgCache = new Map<string, string | null>();
export async function config(name: 'encryption_key' | 'cron_secret' | 'app_url'): Promise<string | undefined> {
  const fromEnv = env(name.toUpperCase());
  if (fromEnv) return fromEnv;
  if (!cfgCache.has(name)) {
    const { data } = await admin().rpc('get_app_secret', { p_name: name });
    cfgCache.set(name, (data as string | null) ?? null);
  }
  return cfgCache.get(name) ?? undefined;
}

// Autenticação é por token Bearer (não por cookie), então CORS aberto não expõe sessões.
export function cors(_req: Request): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(req) } });
}

export async function requireUser(req: Request): Promise<{ id: string; email?: string }> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Não autenticado');
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sessão inválida');
  return { id: data.user.id, email: data.user.email ?? undefined };
}

export class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

let keyPromise: Promise<CryptoKey> | null = null;
export function secretKey(): Promise<CryptoKey> {
  keyPromise ??= (async () => {
    const k = await config('encryption_key');
    if (!k) throw new Error('Chave de criptografia não configurada');
    return importKey(k);
  })();
  return keyPromise;
}

export async function saveSecret(db: SupabaseClient, accountId: string, access: string, refresh?: string | null, expiresIn?: number | null) {
  const key = await secretKey();
  const row: any = {
    account_id: accountId,
    access_ciphertext: await encrypt(key, access),
    refresh_ciphertext: refresh ? await encrypt(key, refresh) : null,
    expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from('account_secrets').upsert(row);
  if (error) throw error;
}

export async function readSecret(db: SupabaseClient, accountId: string) {
  const { data, error } = await db.from('account_secrets').select('*').eq('account_id', accountId).maybeSingle();
  if (error || !data) return null;
  const key = await secretKey();
  return {
    access: await decrypt(key, data.access_ciphertext),
    refresh: data.refresh_ciphertext ? await decrypt(key, data.refresh_ciphertext) : null,
    expiresAt: data.expires_at ? new Date(data.expires_at) : null,
  };
}

export async function upsertAccount(db: SupabaseClient, userId: string, platform: string, externalId: string, displayName: string, scopes: string[], meta: Record<string, unknown>) {
  const { data, error } = await db.from('connected_accounts').upsert({
    user_id: userId, platform, external_id: externalId, display_name: displayName, scopes, meta, status: 'connected',
    last_sync_at: new Date().toISOString(),
  }, { onConflict: 'user_id,platform,external_id' }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
    try {
      return await fn(req);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      const msg = redact(e instanceof Error ? e.message : String(e));
      console.error(`[${status}]`, msg);
      return json(req, { error: status === 500 ? 'Erro interno. Consulte os logs.' : msg, detail: status === 500 ? msg.slice(0, 200) : undefined }, status);
    }
  };
}

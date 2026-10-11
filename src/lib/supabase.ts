import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja .env.example).');
}

export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
export const FUNCTIONS_URL = `${url}/functions/v1`;

/** Chama uma rota da Edge Function `app` com a sessão do usuário. */
export async function api<T = any>(route: 'integrations' | 'ml-lookup' | 'ai-text' | 'account', body: Record<string, any>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`app/${route}`, { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as any).context as Response | undefined;
      if (ctx) { const j = await ctx.json(); msg = j.error ?? msg; }
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data as T;
}

export async function oauthStart(provider: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('oauth/start', { body: { provider } });
  if (error) {
    let msg = error.message;
    try { const j = await ((error as any).context as Response).json(); msg = j.error ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data.url as string;
}

export function publicUrl(path: string): string {
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}

export async function uploadMedia(userId: string, folder: string, name: string, blob: Blob): Promise<{ path: string; url: string }> {
  const path = `${userId}/${folder}/${name}`;
  const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: blob.type, upsert: true, cacheControl: '3600' });
  if (error) throw new Error(`Falha ao enviar arquivo: ${error.message}`);
  return { path, url: publicUrl(path) };
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as any).message);
  return String(e);
}

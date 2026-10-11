// Configuração OAuth por provedor (endpoints oficiais). Credenciais vêm de variáveis de ambiente.
import { http } from './connectors/types.ts';
import { GRAPH } from './connectors/meta.ts';

export type Provider = 'meta' | 'tiktok' | 'google' | 'pinterest' | 'mercadolivre';

type Env = (k: string) => string | undefined;

export interface TokenSet {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
  scope?: string | null;
  raw: any;
}

export const PROVIDER_ENV: Record<Provider, [string, string]> = {
  meta: ['META_APP_ID', 'META_APP_SECRET'],
  tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  pinterest: ['PINTEREST_APP_ID', 'PINTEREST_APP_SECRET'],
  mercadolivre: ['ML_CLIENT_ID', 'ML_CLIENT_SECRET'],
};

export function isConfigured(p: Provider, env: Env): boolean {
  const [a, b] = PROVIDER_ENV[p];
  return !!env(a) && !!env(b);
}

export const SCOPES: Record<Provider, string[]> = {
  meta: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish', 'business_management'],
  tiktok: ['user.info.basic', 'video.publish'],
  google: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
  pinterest: ['boards:read', 'pins:read', 'pins:write', 'user_accounts:read'],
  mercadolivre: [],
};

export function authorizeUrl(p: Provider, env: Env, redirectUri: string, state: string, codeChallenge?: string): string {
  const [idKey] = PROVIDER_ENV[p];
  const id = env(idKey)!;
  const q = (o: Record<string, string>) => new URLSearchParams(o).toString();
  switch (p) {
    case 'meta':
      // Apps do tipo Empresa usam "Login do Facebook para Empresas" com ID de configuração (META_CONFIG_ID).
      return env('META_CONFIG_ID')
        ? `https://www.facebook.com/v25.0/dialog/oauth?${q({ client_id: id, redirect_uri: redirectUri, state, config_id: env('META_CONFIG_ID')!, response_type: 'code', override_default_response_type: 'true' })}`
        : `https://www.facebook.com/v25.0/dialog/oauth?${q({ client_id: id, redirect_uri: redirectUri, state, scope: SCOPES.meta.join(','), response_type: 'code' })}`;
    case 'tiktok':
      return `https://www.tiktok.com/v2/auth/authorize/?${q({ client_key: id, redirect_uri: redirectUri, state, scope: SCOPES.tiktok.join(','), response_type: 'code' })}`;
    case 'google':
      return `https://accounts.google.com/o/oauth2/v2/auth?${q({ client_id: id, redirect_uri: redirectUri, state, scope: SCOPES.google.join(' '), response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' })}`;
    case 'pinterest':
      return `https://www.pinterest.com/oauth/?${q({ client_id: id, redirect_uri: redirectUri, state, scope: SCOPES.pinterest.join(','), response_type: 'code' })}`;
    case 'mercadolivre':
      return `https://auth.mercadolivre.com.br/authorization?${q({ client_id: id, redirect_uri: redirectUri, state, response_type: 'code', code_challenge: codeChallenge!, code_challenge_method: 'S256' })}`;
  }
}

function formBody(o: Record<string, string>) {
  return { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() };
}

export async function exchangeCode(p: Provider, env: Env, f: typeof fetch, code: string, redirectUri: string, verifier?: string | null): Promise<TokenSet> {
  const [idKey, secKey] = PROVIDER_ENV[p];
  const id = env(idKey)!, secret = env(secKey)!;
  let r;
  switch (p) {
    case 'meta': {
      const short = await http(f, `${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: redirectUri, code })}`);
      if (!short.json?.access_token) throw new Error(`Meta: ${short.json?.error?.message ?? 'falha na troca do código'}`);
      // Token de longa duração do usuário -> tokens de Página sem expiração
      r = await http(f, `${GRAPH}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: id, client_secret: secret, fb_exchange_token: short.json.access_token })}`);
      break;
    }
    case 'tiktok':
      r = await http(f, 'https://open.tiktokapis.com/v2/oauth/token/', formBody({ client_key: id, client_secret: secret, code, grant_type: 'authorization_code', redirect_uri: redirectUri }));
      break;
    case 'google':
      r = await http(f, 'https://oauth2.googleapis.com/token', formBody({ client_id: id, client_secret: secret, code, grant_type: 'authorization_code', redirect_uri: redirectUri }));
      break;
    case 'pinterest':
      r = await http(f, 'https://api.pinterest.com/v5/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${btoa(`${id}:${secret}`)}` },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }).toString(),
      });
      break;
    case 'mercadolivre':
      r = await http(f, 'https://api.mercadolibre.com/oauth/token', formBody({ grant_type: 'authorization_code', client_id: id, client_secret: secret, code, redirect_uri: redirectUri, code_verifier: verifier ?? '' }));
      break;
  }
  if (!r.json?.access_token) throw new Error(`${p}: ${r.json?.error_description ?? r.json?.message ?? r.json?.error?.message ?? 'falha ao obter token'}`);
  return { access_token: r.json.access_token, refresh_token: r.json.refresh_token ?? null, expires_in: r.json.expires_in ?? null, scope: r.json.scope ?? null, raw: r.json };
}

export async function refresh(p: Provider, env: Env, f: typeof fetch, refreshToken: string): Promise<TokenSet> {
  const [idKey, secKey] = PROVIDER_ENV[p];
  const id = env(idKey)!, secret = env(secKey)!;
  let r;
  switch (p) {
    case 'tiktok':
      r = await http(f, 'https://open.tiktokapis.com/v2/oauth/token/', formBody({ client_key: id, client_secret: secret, grant_type: 'refresh_token', refresh_token: refreshToken }));
      break;
    case 'google':
      r = await http(f, 'https://oauth2.googleapis.com/token', formBody({ client_id: id, client_secret: secret, grant_type: 'refresh_token', refresh_token: refreshToken }));
      break;
    case 'pinterest':
      r = await http(f, 'https://api.pinterest.com/v5/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${btoa(`${id}:${secret}`)}` },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
      });
      break;
    case 'mercadolivre':
      r = await http(f, 'https://api.mercadolibre.com/oauth/token', formBody({ grant_type: 'refresh_token', client_id: id, client_secret: secret, refresh_token: refreshToken }));
      break;
    default:
      throw new Error(`${p} não usa refresh token`);
  }
  if (!r.json?.access_token) throw new Error(`${p}: renovação falhou (${r.json?.error_description ?? r.json?.message ?? r.status})`);
  return { access_token: r.json.access_token, refresh_token: r.json.refresh_token ?? refreshToken, expires_in: r.json.expires_in ?? null, scope: r.json.scope ?? null, raw: r.json };
}

export function providerOf(platform: string): Provider | null {
  return ({ facebook: 'meta', instagram: 'meta', tiktok: 'tiktok', youtube: 'google', pinterest: 'pinterest', mercadolivre: 'mercadolivre' } as Record<string, Provider>)[platform] ?? null;
}

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { verifier, challenge };
}

// OAuth: POST /oauth/start {provider} (com sessão) e GET /oauth/callback (redirecionamento do provedor).
// deno-lint-ignore-file no-explicit-any
import { admin, config, env, handle, json, requireUser, saveSecret, upsertAccount, HttpError } from '../_shared/supa.ts';
import { authorizeUrl, exchangeCode, isConfigured, pkcePair, SCOPES, type Provider } from '../_shared/oauth.ts';
import { randomToken, redact } from '../_shared/crypto.ts';
import { GRAPH } from '../_shared/connectors/meta.ts';
import { http } from '../_shared/connectors/types.ts';

const PROVIDERS: Provider[] = ['meta', 'tiktok', 'google', 'pinterest', 'mercadolivre'];
const redirectUri = () => `${env('SUPABASE_URL')}/functions/v1/oauth/callback`;
const appUrl = async () => ((await config('app_url')) ?? 'http://localhost:5173').replace(/\/+$/, '');

async function back(params: Record<string, string>) {
  return Response.redirect(`${await appUrl()}/integracoes?${new URLSearchParams(params)}`, 302);
}

Deno.serve(handle(async (req) => {
  const url = new URL(req.url);
  const db = admin();

  if (url.pathname.endsWith('/start') && req.method === 'POST') {
    const user = await requireUser(req);
    const { provider } = await req.json();
    if (!PROVIDERS.includes(provider)) throw new HttpError(400, 'Provedor inválido');
    if (!isConfigured(provider, env)) throw new HttpError(412, 'Credenciais do aplicativo não configuradas no servidor (ver docs/INTEGRACOES.md).');
    const state = randomToken(24);
    const pkce = provider === 'mercadolivre' ? await pkcePair() : null;
    await db.from('oauth_states').insert({ state, user_id: user.id, provider, code_verifier: pkce?.verifier ?? null });
    return json(req, { url: authorizeUrl(provider, env, redirectUri(), state, pkce?.challenge) });
  }

  if (url.pathname.endsWith('/callback')) {
    const state = url.searchParams.get('state') ?? '';
    const code = url.searchParams.get('code');
    const err = url.searchParams.get('error_description') ?? url.searchParams.get('error');
    const { data: st } = await db.from('oauth_states').select('*').eq('state', state).maybeSingle();
    if (!st) return back({ erro: 'Sessão de autorização expirada. Tente novamente.' });
    await db.from('oauth_states').delete().eq('state', state);
    if (Date.now() - new Date(st.created_at).getTime() > 15 * 60e3) return back({ erro: 'Autorização expirada.' });
    if (err || !code) return back({ erro: `Autorização negada: ${err ?? 'sem código'}` });

    try {
      const provider = st.provider as Provider;
      const tok = await exchangeCode(provider, env, fetch, code, redirectUri(), st.code_verifier);
      const n = await persist(provider, db, st.user_id, tok);
      return back({ ok: provider, contas: String(n) });
    } catch (e) {
      return back({ erro: redact((e as Error).message).slice(0, 200) });
    }
  }
  throw new HttpError(404, 'Rota não encontrada');
}));

async function persist(provider: Provider, db: ReturnType<typeof admin>, userId: string, tok: any): Promise<number> {
  const granted = (tok.scope ?? '').split(/[ ,]+/).filter(Boolean);
  switch (provider) {
    case 'meta': {
      // Tokens de Página derivados de token de usuário de longa duração não expiram.
      const r = await http(fetch, `${GRAPH}/me/accounts?fields=id,name,access_token,tasks,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(tok.access_token)}`);
      const perms = await http(fetch, `${GRAPH}/me/permissions?access_token=${encodeURIComponent(tok.access_token)}`);
      const scopes = (perms.json?.data ?? []).filter((p: any) => p.status === 'granted').map((p: any) => p.permission);
      const pages = r.json?.data ?? [];
      if (!pages.length) throw new Error('Nenhuma Página encontrada. Você precisa administrar uma Página do Facebook e autorizá-la.');
      let n = 0;
      for (const pg of pages) {
        const fbId = await upsertAccount(db, userId, 'facebook', pg.id, pg.name, scopes, { tasks: pg.tasks ?? [] });
        await saveSecret(db, fbId, pg.access_token);
        n++;
        const ig = pg.instagram_business_account;
        if (ig?.id) {
          const igId = await upsertAccount(db, userId, 'instagram', ig.id, '@' + (ig.username ?? ig.id), scopes, { page_id: pg.id });
          await saveSecret(db, igId, pg.access_token);
          n++;
        }
      }
      return n;
    }
    case 'tiktok': {
      const r = await http(fetch, 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username', { headers: { authorization: `Bearer ${tok.access_token}` } });
      const u = r.json?.data?.user ?? {};
      const id = await upsertAccount(db, userId, 'tiktok', u.open_id ?? tok.raw.open_id, u.display_name ?? 'TikTok', granted.length ? granted : SCOPES.tiktok, { audited: false, username: u.username ?? null });
      await saveSecret(db, id, tok.access_token, tok.refresh_token, tok.expires_in);
      return 1;
    }
    case 'google': {
      const r = await http(fetch, 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { authorization: `Bearer ${tok.access_token}` } });
      const c = r.json?.items?.[0];
      if (!c) throw new Error('Nenhum canal do YouTube encontrado nesta conta Google.');
      const id = await upsertAccount(db, userId, 'youtube', c.id, c.snippet.title, granted, { audited: false });
      await saveSecret(db, id, tok.access_token, tok.refresh_token, tok.expires_in);
      return 1;
    }
    case 'pinterest': {
      const r = await http(fetch, 'https://api.pinterest.com/v5/user_account', { headers: { authorization: `Bearer ${tok.access_token}` } });
      const id = await upsertAccount(db, userId, 'pinterest', r.json?.username ?? 'pinterest', r.json?.username ?? 'Pinterest', granted, { sandbox: true, board_id: null });
      await saveSecret(db, id, tok.access_token, tok.refresh_token, tok.expires_in);
      return 1;
    }
    case 'mercadolivre': {
      const r = await http(fetch, 'https://api.mercadolibre.com/users/me', { headers: { authorization: `Bearer ${tok.access_token}` } });
      const id = await upsertAccount(db, userId, 'mercadolivre', String(r.json?.id ?? tok.raw.user_id), r.json?.nickname ?? 'Mercado Livre', granted, {});
      await saveSecret(db, id, tok.access_token, tok.refresh_token, tok.expires_in);
      return 1;
    }
  }
}

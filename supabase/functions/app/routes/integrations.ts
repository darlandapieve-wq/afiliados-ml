// Integrações: status dos provedores, conexão do Telegram, teste de conexão e configurações por conta.
// deno-lint-ignore-file no-explicit-any
import { admin, config, env, handle, json, readSecret, requireUser, saveSecret, upsertAccount, HttpError } from '../../_shared/supa.ts';
import { isConfigured, type Provider } from '../../_shared/oauth.ts';
import { CONNECTORS } from '../../_shared/connectors/index.ts';
import { telegram } from '../../_shared/connectors/telegram.ts';
import { http } from '../../_shared/connectors/types.ts';
import { redact } from '../../_shared/crypto.ts';
import type { PlatformCode } from '../../_shared/platforms.ts';

export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const db = admin();
  const body = req.method === 'POST' ? await req.json() : {};
  const action = body.action ?? new URL(req.url).searchParams.get('action');

  const ownAccount = async (id: string) => {
    const { data } = await db.from('connected_accounts').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (!data) throw new HttpError(404, 'Conta não encontrada');
    return data;
  };

  switch (action) {
    case 'status': {
      const providers: Provider[] = ['meta', 'tiktok', 'google', 'pinterest', 'mercadolivre'];
      return json(req, {
        providers: Object.fromEntries(providers.map((p) => [p, isConfigured(p, env)])),
        telegram: true,
        ai: !!(env('GEMINI_API_KEY') || env('ANTHROPIC_API_KEY')),
        encryption: !!(await config('encryption_key')),
        oauth_redirect: `${env('SUPABASE_URL')}/functions/v1/oauth/callback`,
      });
    }

    case 'connect_telegram': {
      const token = String(body.bot_token ?? '').trim();
      const chat = String(body.chat_id ?? '').trim();
      if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) throw new HttpError(400, 'Token do bot em formato inválido (obtenha no @BotFather).');
      if (!/^(@[A-Za-z0-9_]{4,}|-?\d{5,})$/.test(chat)) throw new HttpError(400, 'Informe o @canal ou o ID numérico do chat.');
      const t = await telegram.test({ accessToken: token, account: { externalId: chat, meta: {} }, fetch });
      if (!t.ok) throw new HttpError(400, t.detail);
      const username = chat.startsWith('@') ? chat.slice(1) : null;
      const id = await upsertAccount(db, user.id, 'telegram', chat, t.displayName ?? chat, ['bot'], { chat_username: username });
      await saveSecret(db, id, token);
      await db.from('connected_accounts').update({ last_test_at: new Date().toISOString(), last_test_result: t.detail }).eq('id', id);
      return json(req, { ok: true, detail: t.detail });
    }

    case 'test': {
      const acc = await ownAccount(body.account_id);
      const c = CONNECTORS[acc.platform as PlatformCode];
      const sec = await readSecret(db, acc.id);
      let result: { ok: boolean; detail: string };
      if (!sec) result = { ok: false, detail: 'Credenciais ausentes: reconecte.' };
      else if (sec.expiresAt && sec.expiresAt < new Date() && !sec.refresh) result = { ok: false, detail: 'Token expirado: reconecte.' };
      else if (!c) result = { ok: true, detail: 'Conta registrada (sem teste disponível).' };
      else {
        try { result = await c.test({ accessToken: sec.access, account: { externalId: acc.external_id, meta: acc.meta ?? {} }, fetch }); }
        catch (e) { result = { ok: false, detail: redact((e as Error).message) }; }
      }
      await db.from('connected_accounts').update({
        last_test_at: new Date().toISOString(), last_test_result: result.detail.slice(0, 500),
        status: result.ok ? 'connected' : acc.status === 'connected' ? 'error' : acc.status,
      }).eq('id', acc.id);
      return json(req, result);
    }

    case 'set_meta': {
      // Ajustes declarados pelo usuário: auditoria aprovada, sandbox do Pinterest, pasta de destino
      const acc = await ownAccount(body.account_id);
      const allowed = ['audited', 'sandbox', 'board_id', 'board_name'];
      const patch = Object.fromEntries(Object.entries(body.meta ?? {}).filter(([k]) => allowed.includes(k)));
      await db.from('connected_accounts').update({ meta: { ...acc.meta, ...patch } }).eq('id', acc.id);
      return json(req, { ok: true });
    }

    case 'pinterest_boards': {
      const acc = await ownAccount(body.account_id);
      const sec = await readSecret(db, acc.id);
      if (!sec) throw new HttpError(400, 'Reconecte o Pinterest.');
      const base = acc.meta?.sandbox !== false ? 'https://api-sandbox.pinterest.com/v5' : 'https://api.pinterest.com/v5';
      const r = await http(fetch, `${base}/boards?page_size=100`, { headers: { authorization: `Bearer ${sec.access}` } });
      if (r.status !== 200) throw new HttpError(400, `Pinterest: ${r.json?.message ?? r.status}`);
      return json(req, { boards: (r.json.items ?? []).map((b: any) => ({ id: b.id, name: b.name })) });
    }

    default:
      throw new HttpError(400, 'Ação inválida');
  }
});

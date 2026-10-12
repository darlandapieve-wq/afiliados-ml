// Módulo TikTok Shop — lado do servidor (Edge Functions).
// Envia o vídeo final pela Content Posting API (com rótulo de IA) e acompanha o status.
// Mesma política anti-duplicação do restante do app: tt_request_sent_at é gravado ANTES do envio
// e, se o resultado ficar incerto, nada é reenviado sem confirmação explícita do usuário.
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { env, readSecret, saveSecret, HttpError } from './supa.ts';
import { tiktok } from './connectors/tiktok.ts';
import type { Outcome, PublishContext } from './connectors/types.ts';
import { providerOf, refresh, type Provider } from './oauth.ts';
import { redact } from './crypto.ts';

async function tokenFor(db: SupabaseClient, acc: any): Promise<string> {
  let secret = await readSecret(db, acc.id);
  if (!secret) throw new HttpError(400, 'Credenciais do TikTok ausentes. Reconecte a conta em Integrações.');
  if (secret.expiresAt && secret.expiresAt.getTime() - Date.now() < 5 * 60e3) {
    const prov = providerOf(acc.platform) as Provider | null;
    if (!prov || !secret.refresh) {
      await db.from('connected_accounts').update({ status: 'expired' }).eq('id', acc.id);
      throw new HttpError(400, 'Token do TikTok expirado. Reconecte a conta.');
    }
    try {
      const t = await refresh(prov, env, fetch, secret.refresh);
      await saveSecret(db, acc.id, t.access_token, t.refresh_token, t.expires_in);
      secret = { access: t.access_token, refresh: t.refresh_token ?? null, expiresAt: null };
    } catch (e) {
      await db.from('connected_accounts').update({ status: 'expired', last_test_result: redact((e as Error).message) }).eq('id', acc.id);
      throw new HttpError(400, 'Falha ao renovar o token do TikTok. Reconecte a conta.');
    }
  }
  return secret.access;
}

function ctxFor(cr: any, acc: any, token: string): PublishContext {
  const b = cr.brief ?? {};
  return {
    platform: 'tiktok',
    title: (b.hooks?.[0] ?? cr.product_name ?? '').slice(0, 90),
    caption: String(b.caption ?? cr.product_name).slice(0, 2200),
    hashtags: b.hashtags ?? [],
    link: '',
    videoUrl: cr.video_url,
    aigc: true,
    accessToken: token,
    account: { externalId: acc.external_id, meta: acc.meta ?? {} },
    fetch,
  };
}

async function apply(db: SupabaseClient, cr: any, o: Outcome, prevStatus: string) {
  const patch: Record<string, unknown> = {};
  switch (o.kind) {
    case 'published': {
      const privacy = (o.providerState ?? '').split(':')[1] || cr.tt_privacy || null;
      Object.assign(patch, { status: 'published', publish_route: 'api', published_at: new Date().toISOString(), post_url: o.externalUrl ?? null, tt_state: o.providerState ?? 'PUBLISH_COMPLETE', tt_privacy: privacy, tt_error: null });
      break;
    }
    case 'pending': {
      const privacy = o.providerState.split(':')[1] || cr.tt_privacy || null;
      Object.assign(patch, { status: 'posting', tt_publish_id: o.externalId, tt_state: o.providerState, tt_privacy: privacy, tt_error: null });
      break;
    }
    case 'rejected':
      Object.assign(patch, { status: prevStatus === 'posting' ? 'video_ready' : prevStatus, tt_error: o.error });
      // Nada foi criado: libera um novo envio
      if (!cr.tt_publish_id) patch.tt_request_sent_at = null;
      if (o.authError && cr.tt_account_id) await db.from('connected_accounts').update({ status: 'expired', last_test_result: o.error.slice(0, 300) }).eq('id', cr.tt_account_id);
      break;
    case 'uncertain':
      Object.assign(patch, { status: prevStatus === 'posting' ? 'video_ready' : prevStatus, tt_error: `Resultado incerto: ${o.error} Confira no app do TikTok antes de reenviar.` });
      break;
  }
  const { error } = await db.from('tts_creatives').update(patch).eq('id', cr.id);
  if (error) throw new Error(`update tts: ${error.message}`);
  return patch;
}

export async function publishCreative(db: SupabaseClient, userId: string, id: string, accountId?: string | null, confirmResend = false) {
  const { data: cr } = await db.from('tts_creatives').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (!cr) throw new HttpError(404, 'Criativo não encontrado');
  if (!cr.video_url) throw new HttpError(400, 'Envie o vídeo final (MP4) antes de publicar pela API.');
  if (['posting', 'published', 'anchor_added', 'archived'].includes(cr.status)) throw new HttpError(409, 'Este criativo já foi enviado ou publicado.');
  if (!cr.brief?.caption) throw new HttpError(400, 'Gere o briefing (legenda) antes de publicar.');
  if (cr.tt_request_sent_at && !confirmResend) {
    throw new HttpError(409, 'Já houve uma tentativa de envio com resultado incerto. Confira no app do TikTok e, se o vídeo não estiver lá, confirme o reenvio.');
  }
  let q = db.from('connected_accounts').select('*').eq('user_id', userId).eq('platform', 'tiktok');
  if (accountId) q = q.eq('id', accountId);
  const { data: accs } = await q.limit(1);
  const acc = accs?.[0];
  if (!acc) throw new HttpError(400, 'Nenhuma conta do TikTok conectada. Conecte em Integrações ou publique pelo Pippit.');
  if (acc.status !== 'connected') throw new HttpError(400, `A conta ${acc.display_name ?? ''} precisa ser reconectada.`);
  const token = await tokenFor(db, acc);

  // Marca ANTES de enviar (prevenção de duplicação)
  const prev = cr.status;
  const { error: e1 } = await db.from('tts_creatives').update({ status: 'posting', tt_account_id: acc.id, tt_request_sent_at: new Date().toISOString(), tt_error: null, publish_route: 'api' }).eq('id', id).eq('status', prev);
  if (e1) throw new Error(e1.message);
  const fresh = { ...cr, tt_account_id: acc.id, tt_publish_id: null };
  let outcome: Outcome;
  try { outcome = await tiktok.publish(ctxFor(cr, acc, token)); }
  catch (e) { outcome = { kind: 'uncertain', error: redact((e as Error).message) }; }
  const patch = await apply(db, fresh, outcome, prev);
  return { outcome: outcome.kind, ...patch, audited: acc.meta?.audited === true };
}

export async function checkCreative(db: SupabaseClient, cr: any) {
  if (cr.status !== 'posting' || !cr.tt_publish_id || !cr.tt_account_id) return null;
  const { data: acc } = await db.from('connected_accounts').select('*').eq('id', cr.tt_account_id).maybeSingle();
  if (!acc) return apply(db, cr, { kind: 'uncertain', error: 'A conta do TikTok foi removida durante o envio.' }, 'posting');
  const token = await tokenFor(db, acc);
  const o = await tiktok.check!(ctxFor(cr, acc, token), cr.tt_publish_id, cr.tt_state);
  if (o.kind === 'pending' && o.providerState === cr.tt_state) return null;
  return apply(db, cr, o, 'posting');
}

/** Chamado pelo worker a cada minuto: acompanha os envios em andamento. */
export async function sweepPosting(db: SupabaseClient): Promise<number> {
  const { data } = await db.from('tts_creatives').select('*').eq('status', 'posting').not('tt_publish_id', 'is', null)
    .lt('updated_at', new Date(Date.now() - 20e3).toISOString()).limit(10);
  let n = 0;
  for (const cr of data ?? []) {
    try { if (await checkCreative(db, cr)) n++; }
    catch (e) { console.error('tts check', cr.id, redact((e as Error).message)); }
  }
  // Envio travado sem publish_id há mais de 15 min: devolve ao usuário como incerto
  const { data: stuck } = await db.from('tts_creatives').select('*').eq('status', 'posting').is('tt_publish_id', null)
    .lt('updated_at', new Date(Date.now() - 15 * 60e3).toISOString()).limit(10);
  for (const cr of stuck ?? []) await apply(db, cr, { kind: 'uncertain', error: 'O envio não foi confirmado pelo TikTok.' }, 'posting').catch(() => {});
  return n;
}

// Worker da fila: chamado a cada minuto pelo pg_cron (cabeçalho x-cron-secret).
// deno-lint-ignore-file no-explicit-any
import { admin, config, env, readSecret, saveSecret } from '../_shared/supa.ts';
import { processJob, type Repo, type PubRow, type JobRow } from '../_shared/engine.ts';
import { providerOf, refresh, type Provider } from '../_shared/oauth.ts';
import { redact } from '../_shared/crypto.ts';
import { sweepPosting } from '../_shared/tts-server.ts';

const db = admin();

const repo: Repo = {
  async getPublication(id) {
    const { data } = await db.from('publications').select('id,user_id,platform,mode,status,external_id,provider_state,request_sent_at,attempts').eq('id', id).maybeSingle();
    return data as PubRow | null;
  },
  async updatePublication(id, patch) {
    const { error } = await db.from('publications').update(patch).eq('id', id);
    if (error) throw new Error(`update publication: ${error.message}`);
  },
  async finishJob(id, status, lastError) {
    await db.from('jobs').update({ status, last_error: lastError ?? null, locked_at: null }).eq('id', id);
  },
  async requeueJob(id, runAt, kind, lastError) {
    await db.from('jobs').update({ status: 'queued', run_at: runAt.toISOString(), kind, last_error: lastError ?? null, locked_at: null }).eq('id', id);
  },
  async log(userId, pubId, jobId, level, message, data) {
    await db.from('execution_logs').insert({ user_id: userId, publication_id: pubId, job_id: jobId, level, message: redact(message), data: data ?? {} });
  },
  async countPublishedSince(userId, since) {
    const { count } = await db.from('publications').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('mode', 'auto').in('status', ['published', 'processing']).gte('request_sent_at', since.toISOString());
    return count ?? 0;
  },
  async lastPublishedAt(userId, platform) {
    const { data } = await db.from('publications').select('request_sent_at').eq('user_id', userId).eq('platform', platform)
      .eq('mode', 'auto').not('request_sent_at', 'is', null).order('request_sent_at', { ascending: false }).limit(1).maybeSingle();
    return data?.request_sent_at ? new Date(data.request_sent_at) : null;
  },
  async getSettings(userId) {
    const { data } = await db.from('profiles').select('settings').eq('id', userId).single();
    return data?.settings ?? {};
  },
  async markAccount(accountId, status, detail) {
    await db.from('connected_accounts').update({ status, last_test_result: detail.slice(0, 300) }).eq('id', accountId);
  },
  async loadContext(pub) {
    const { data: p } = await db.from('publications').select('account_id, variant_id, campaign_id').eq('id', pub.id).single();
    if (!p?.account_id) return { ok: false, reason: 'Integração não configurada: nenhuma conta conectada para esta publicação.' };
    const { data: acc } = await db.from('connected_accounts').select('*').eq('id', p.account_id).maybeSingle();
    if (!acc) return { ok: false, reason: 'A conta conectada foi removida. Reconecte em Integrações.' };
    if (acc.status !== 'connected') return { ok: false, reason: `Conta ${acc.display_name ?? ''} precisa ser reconectada (${acc.status}).` };

    let secret = await readSecret(db, acc.id);
    if (!secret) return { ok: false, reason: 'Credenciais ausentes. Reconecte a conta.' };
    // Renovação de token quando suportada
    if (secret.expiresAt && secret.expiresAt.getTime() - Date.now() < 5 * 60e3) {
      const prov = providerOf(acc.platform) as Provider | null;
      if (!prov || !secret.refresh) {
        await db.from('connected_accounts').update({ status: 'expired' }).eq('id', acc.id);
        return { ok: false, reason: 'Token expirado sem renovação automática. Reconecte a conta.' };
      }
      try {
        const t = await refresh(prov, env, fetch, secret.refresh);
        await saveSecret(db, acc.id, t.access_token, t.refresh_token, t.expires_in);
        secret = { access: t.access_token, refresh: t.refresh_token ?? null, expiresAt: null };
      } catch (e) {
        await db.from('connected_accounts').update({ status: 'expired', last_test_result: redact((e as Error).message) }).eq('id', acc.id);
        return { ok: false, reason: 'Falha ao renovar o token. Reconecte a conta.' };
      }
    }

    const { data: v } = await db.from('content_variants').select('title, caption, hashtags, asset_id').eq('id', p.variant_id).maybeSingle();
    if (!v) return { ok: false, reason: 'Texto da publicação não encontrado.' };
    const { data: c } = await db.from('campaigns').select('affiliate_link_id').eq('id', p.campaign_id).single();
    const { data: link } = await db.from('affiliate_links').select('url, validation_status').eq('id', c!.affiliate_link_id).maybeSingle();
    if (!link || link.validation_status === 'invalid') return { ok: false, reason: 'Campanha sem link de afiliado válido.' };

    let imageUrl: string | null = null, videoUrl: string | null = null;
    if (v.asset_id) {
      const { data: a } = await db.from('assets').select('kind, public_url').eq('id', v.asset_id).maybeSingle();
      if (a?.kind === 'video') videoUrl = a.public_url; else if (a) imageUrl = a.public_url;
    }
    return {
      ok: true, accountId: acc.id,
      ctx: {
        platform: pub.platform, title: v.title, caption: v.caption, hashtags: v.hashtags ?? [],
        link: link.url, imageUrl, videoUrl, accessToken: secret.access,
        account: { externalId: acc.external_id, meta: acc.meta ?? {} },
      },
    };
  },
};

Deno.serve(async (req) => {
  const secret = await config('cron_secret');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('forbidden', { status: 403 });

  const started = Date.now();
  const results: Record<string, number> = {};
  // Processa em lotes até ~50 s para caber no limite da função
  while (Date.now() - started < 50_000) {
    const { data: jobs, error } = await db.rpc('claim_due_jobs', { p_limit: 5 });
    if (error) { console.error('claim', error.message); break; }
    if (!jobs?.length) break;
    for (const job of jobs as JobRow[]) {
      try {
        const r = await processJob(job, repo, fetch);
        results[r] = (results[r] ?? 0) + 1;
      } catch (e) {
        // Erro de infraestrutura: o job fica "running" e será retomado após 10 min,
        // com verificação de request_sent_at (sem reenvio às cegas).
        // Erro de infraestrutura (ex.: banco indisponível). Repete com espera; o motor verifica
        // request_sent_at antes de qualquer reenvio, então não há duplicação às cegas.
        const msg = redact((e as Error).message);
        console.error('job', job.id, msg);
        results.error = (results.error ?? 0) + 1;
        if (job.attempts < 5) await repo.requeueJob(job.id, new Date(Date.now() + 300e3), job.kind, msg).catch(() => {});
        else {
          await repo.finishJob(job.id, 'failed', msg).catch(() => {});
          await repo.updatePublication(job.publication_id, { status: 'awaiting_manual', error_message: `Falha interna repetida: ${msg}` }).catch(() => {});
        }
      }
    }
  }
  // Módulo TikTok Shop: acompanha vídeos enviados pela API
  try { results.tts_checked = await sweepPosting(db); } catch (e) { console.error('tts sweep', redact((e as Error).message)); }
  // Limpeza de estados OAuth antigos
  await db.from('oauth_states').delete().lt('created_at', new Date(Date.now() - 15 * 60e3).toISOString());
  return new Response(JSON.stringify({ ok: true, results, ms: Date.now() - started }), { headers: { 'content-type': 'application/json' } });
});

// Motor de publicação: processa um job da fila com prevenção de duplicação.
// Regras:
//  1. request_sent_at é gravado ANTES de chamar a API.
//  2. Se um job encontra request_sent_at sem external_id, o resultado é incerto: NÃO reenvia.
//  3. "Publicada" somente com confirmação da API (Outcome.published).
//  4. Repetição automática só quando a API respondeu e garantiu que nada foi criado.
import { CONNECTORS } from './connectors/index.ts';
import type { Outcome, PublishContext } from './connectors/types.ts';
import type { PlatformCode } from './platforms.ts';
import { redact } from './crypto.ts';

export interface JobRow {
  id: string; user_id: string; publication_id: string; kind: 'publish' | 'verify';
  attempts: number; max_attempts: number;
}
export interface PubRow {
  id: string; user_id: string; platform: PlatformCode; mode: 'auto' | 'assisted'; status: string;
  external_id: string | null; provider_state: string | null; request_sent_at: string | null; attempts: number;
}

export type LoadedContext = { ok: true; ctx: Omit<PublishContext, 'fetch'>; accountId: string } | { ok: false; reason: string };

export interface Repo {
  getPublication(id: string): Promise<PubRow | null>;
  updatePublication(id: string, patch: Record<string, unknown>): Promise<void>;
  finishJob(id: string, status: 'done' | 'failed' | 'cancelled', lastError?: string | null): Promise<void>;
  requeueJob(id: string, runAt: Date, kind: 'publish' | 'verify', lastError?: string | null): Promise<void>;
  log(userId: string, pubId: string, jobId: string, level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): Promise<void>;
  loadContext(pub: PubRow): Promise<LoadedContext>;
  countPublishedSince(userId: string, since: Date): Promise<number>;
  lastPublishedAt(userId: string, platform: PlatformCode): Promise<Date | null>;
  getSettings(userId: string): Promise<{ max_posts_per_day?: number; min_minutes_between_posts?: number }>;
  markAccount(accountId: string, status: 'expired' | 'error', detail: string): Promise<void>;
}

export const MAX_VERIFY_ATTEMPTS = 40;
const now = () => new Date();
const addSec = (s: number) => new Date(Date.now() + s * 1000);

export async function processJob(job: JobRow, repo: Repo, f: typeof fetch): Promise<string> {
  const pub = await repo.getPublication(job.publication_id);
  if (!pub) { await repo.finishJob(job.id, 'cancelled', 'Publicação removida'); return 'missing'; }
  if (pub.status === 'cancelled' || pub.status === 'published') { await repo.finishJob(job.id, 'cancelled'); return 'skipped'; }

  const L = (level: 'info' | 'warn' | 'error', msg: string, data?: Record<string, unknown>) => repo.log(pub.user_id, pub.id, job.id, level, msg, data);

  // Modo assistido: chegou a hora — avisar o usuário, nunca publicar.
  if (pub.mode === 'assisted') {
    await repo.updatePublication(pub.id, { status: 'awaiting_manual', error_message: null });
    await L('info', 'Horário atingido: publicação aguardando ação manual (modo assistido).');
    await repo.finishJob(job.id, 'done');
    return 'assisted';
  }

  const connector = CONNECTORS[pub.platform];
  if (!connector) {
    await repo.updatePublication(pub.id, { status: 'not_configured', error_message: 'Plataforma sem integração automática oficial.' });
    await repo.finishJob(job.id, 'failed', 'sem conector');
    return 'no_connector';
  }

  const isVerify = job.kind === 'verify' || !!pub.external_id;

  if (!isVerify && pub.request_sent_at) {
    const msg = 'Resultado incerto de uma tentativa anterior. Para evitar duplicação, não foi reenviado. Confira na plataforma e marque o resultado.';
    await repo.updatePublication(pub.id, { status: 'awaiting_manual', error_message: msg });
    await L('warn', msg, { request_sent_at: pub.request_sent_at });
    await repo.finishJob(job.id, 'failed', 'uncertain');
    return 'uncertain_previous';
  }

  if (isVerify && job.attempts > MAX_VERIFY_ATTEMPTS) {
    const msg = 'Não foi possível confirmar o estado final da publicação. Confira na plataforma.';
    await repo.updatePublication(pub.id, { status: 'awaiting_manual', error_message: msg });
    await L('warn', msg);
    await repo.finishJob(job.id, 'failed', 'verify_timeout');
    return 'verify_timeout';
  }

  if (!isVerify) {
    const settings = await repo.getSettings(pub.user_id);
    const max = settings.max_posts_per_day ?? 10;
    const count = await repo.countPublishedSince(pub.user_id, new Date(Date.now() - 24 * 3600e3));
    if (count >= max) {
      await repo.requeueJob(job.id, addSec(3600), 'publish', `limite diário (${max})`);
      await L('info', `Limite de ${max} publicações em 24 h atingido. Nova tentativa em 1 h.`);
      return 'rate_limited_local';
    }
    const gap = settings.min_minutes_between_posts ?? 0;
    const last = gap > 0 ? await repo.lastPublishedAt(pub.user_id, pub.platform) : null;
    if (last && Date.now() - last.getTime() < gap * 60e3) {
      const wait = Math.ceil((gap * 60e3 - (Date.now() - last.getTime())) / 1000);
      await repo.requeueJob(job.id, addSec(wait), 'publish', 'intervalo mínimo');
      await L('info', `Intervalo mínimo de ${gap} min entre publicações na mesma rede. Reagendado.`);
      return 'gap';
    }
  }

  let loaded: LoadedContext;
  try {
    loaded = await repo.loadContext(pub);
  } catch (e) {
    loaded = { ok: false, reason: `Erro ao carregar credenciais ou conteúdo: ${redact((e as Error).message)}. Reconecte a conta.` };
  }
  if (!loaded.ok) {
    await repo.updatePublication(pub.id, { status: 'not_configured', error_message: loaded.reason });
    await L('error', loaded.reason);
    await repo.finishJob(job.id, 'failed', loaded.reason);
    return 'not_configured';
  }
  const ctx: PublishContext = { ...loaded.ctx, fetch: f };

  let outcome: Outcome;
  try {
    if (isVerify) {
      outcome = connector.check
        ? await connector.check(ctx, pub.external_id!, pub.provider_state)
        : { kind: 'published', externalId: pub.external_id!, providerState: pub.provider_state ?? 'sent' };
    } else {
      await repo.updatePublication(pub.id, { status: 'processing', request_sent_at: now().toISOString(), attempts: pub.attempts + 1, error_message: null });
      await L('info', `Enviando para ${pub.platform} (tentativa ${pub.attempts + 1}).`);
      outcome = await connector.publish(ctx);
    }
  } catch (e) {
    outcome = { kind: 'uncertain', error: `Erro inesperado: ${(e as Error).message}` };
  }

  return applyOutcome(job, pub, outcome, isVerify, repo, L, loaded.accountId);
}

async function applyOutcome(
  job: JobRow, pub: PubRow, o: Outcome, isVerify: boolean, repo: Repo,
  L: (l: 'info' | 'warn' | 'error', m: string, d?: Record<string, unknown>) => Promise<void>, accountId: string,
): Promise<string> {
  switch (o.kind) {
    case 'published':
      await repo.updatePublication(pub.id, {
        status: 'published', external_id: o.externalId, external_url: o.externalUrl ?? null,
        provider_state: o.providerState ?? null, confirmed_at: now().toISOString(), error_message: null,
      });
      await L('info', 'Publicação confirmada pela plataforma.', { external_id: o.externalId, url: o.externalUrl, state: o.providerState });
      await repo.finishJob(job.id, 'done');
      return 'published';

    case 'pending':
      await repo.updatePublication(pub.id, { status: 'processing', external_id: o.externalId, provider_state: o.providerState });
      await L('info', `Aceita pela plataforma; aguardando confirmação (${o.providerState}).`, { external_id: o.externalId });
      await repo.requeueJob(job.id, addSec(o.checkAfterSec), 'verify');
      return 'pending';

    case 'rejected': {
      const err = redact(o.error);
      if (o.authError) await repo.markAccount(accountId, 'expired', err);
      const canRetry = o.retryable && job.attempts < job.max_attempts;
      if (isVerify) {
        if (o.retryable) {
          await L('warn', `Verificação adiada: ${err}`);
          await repo.requeueJob(job.id, addSec(o.retryAfterSec ?? 120), 'verify', err);
          return 'verify_retry';
        }
        await repo.updatePublication(pub.id, { status: 'failed', error_message: err });
        await L('error', err);
        await repo.finishJob(job.id, 'failed', err);
        return 'failed';
      }
      if (canRetry) {
        // A plataforma respondeu e nada foi criado: é seguro tentar de novo.
        await repo.updatePublication(pub.id, { status: 'scheduled', request_sent_at: null, error_message: `Tentativa falhou, nova tentativa agendada: ${err}` });
        await L('warn', `Falha temporária, nova tentativa em ${o.retryAfterSec ?? 300}s: ${err}`);
        await repo.requeueJob(job.id, addSec(o.retryAfterSec ?? 300), 'publish', err);
        return 'retry';
      }
      await repo.updatePublication(pub.id, { status: 'failed', request_sent_at: null, error_message: err });
      await L('error', err);
      await repo.finishJob(job.id, 'failed', err);
      return 'failed';
    }

    case 'uncertain': {
      const err = redact(o.error);
      const msg = `Resultado incerto: ${err}. Não será reenviado automaticamente para evitar duplicação — confira na plataforma.`;
      await repo.updatePublication(pub.id, { status: 'awaiting_manual', error_message: msg });
      await L('error', msg);
      await repo.finishJob(job.id, 'failed', err);
      return 'uncertain';
    }
  }
}

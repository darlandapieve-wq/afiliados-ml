import type { PlatformCode } from '../platforms.ts';

export interface AccountRef {
  externalId: string;               // page id, ig user id, chat id, board id, channel id...
  meta: Record<string, unknown>;    // ex.: { audited: false, sandbox: true, chat_username: 'meucanal' }
}

export interface PublishContext {
  platform: PlatformCode;
  title?: string | null;
  caption: string;
  hashtags: string[];
  /** Link de afiliado (sem alteração) ou página intermediária, conforme a campanha. */
  link: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  accessToken: string;
  account: AccountRef;
  fetch: typeof fetch;
}

/**
 * Resultado de uma chamada a um conector.
 * - published: a plataforma confirmou a publicação.
 * - pending: a plataforma aceitou e está processando; verificar depois.
 * - rejected: houve resposta e NADA foi criado (pode repetir se retryable).
 * - uncertain: não há como saber se foi criado (timeout, 5xx após envio). Nunca repetir automaticamente.
 */
export type Outcome =
  | { kind: 'published'; externalId: string; externalUrl?: string | null; providerState?: string }
  | { kind: 'pending'; externalId: string; providerState: string; checkAfterSec: number }
  | { kind: 'rejected'; error: string; retryable: boolean; retryAfterSec?: number; authError?: boolean }
  | { kind: 'uncertain'; error: string };

export interface TestResult { ok: boolean; detail: string; displayName?: string }

export interface Connector {
  publish(ctx: PublishContext): Promise<Outcome>;
  check?(ctx: PublishContext, externalId: string, providerState: string | null): Promise<Outcome>;
  test(ctx: Pick<PublishContext, 'accessToken' | 'account' | 'fetch'>): Promise<TestResult>;
}

export class NetworkError extends Error {}

export interface HttpResult { status: number; json: any; headers: Headers }

export async function http(f: typeof fetch, url: string, init: RequestInit = {}, timeoutMs = 30000): Promise<HttpResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await f(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    throw new NetworkError(e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(t);
  }
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 500) }; }
  return { status: res.status, json, headers: res.headers };
}

/** Classifica uma resposta de ERRO de uma chamada que CRIA conteúdo. */
export function classifyCreateError(r: HttpResult, message: string): Outcome {
  if (r.status === 429) {
    const ra = Number(r.headers.get('retry-after')) || 60;
    return { kind: 'rejected', error: message, retryable: true, retryAfterSec: ra };
  }
  if (r.status === 401) return { kind: 'rejected', error: message, retryable: false, authError: true };
  if (r.status >= 500) return { kind: 'uncertain', error: `${message} (HTTP ${r.status})` };
  return { kind: 'rejected', error: message, retryable: false };
}

/** Executa uma chamada de criação tratando falhas de rede como resultado incerto. */
export async function createCall(fn: () => Promise<Outcome>): Promise<Outcome> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof NetworkError) return { kind: 'uncertain', error: `Falha de rede após envio: ${e.message}` };
    throw e;
  }
}

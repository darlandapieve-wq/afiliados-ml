import { describe, it, expect, beforeEach } from 'vitest';
import { processJob, type Repo, type PubRow, type JobRow } from '../supabase/functions/_shared/engine.ts';
import { telegram } from '../supabase/functions/_shared/connectors/telegram.ts';
import { instagram } from '../supabase/functions/_shared/connectors/meta.ts';
import { tiktok } from '../supabase/functions/_shared/connectors/tiktok.ts';
import { youtube } from '../supabase/functions/_shared/connectors/youtube.ts';

const AFF = 'https://mercadolivre.com/sec/1aB2cD3?matt_tool=1';

function memRepo(pub: Partial<PubRow>, opts: { configured?: boolean; published24h?: number } = {}) {
  const state = {
    pub: { id: 'p1', user_id: 'u1', platform: 'telegram', mode: 'auto', status: 'scheduled', external_id: null, provider_state: null, request_sent_at: null, attempts: 0, ...pub } as PubRow & Record<string, any>,
    job: { status: 'running', run_at: null as Date | null, kind: 'publish' as string, last_error: null as string | null },
    logs: [] as string[],
    account: 'connected',
  };
  const repo: Repo = {
    async getPublication() { return { ...state.pub }; },
    async updatePublication(_id, patch) { Object.assign(state.pub, patch); },
    async finishJob(_id, status, err) { state.job.status = status; state.job.last_error = err ?? null; },
    async requeueJob(_id, runAt, kind, err) { state.job = { status: 'queued', run_at: runAt, kind, last_error: err ?? null }; },
    async log(_u, _p, _j, level, msg) { state.logs.push(`${level}:${msg}`); },
    async loadContext() {
      if (opts.configured === false) return { ok: false, reason: 'Integração não configurada' };
      return { ok: true, accountId: 'a1', ctx: { platform: state.pub.platform, caption: 'Olá', hashtags: [], link: AFF, imageUrl: 'https://x.supabase.co/storage/v1/object/public/media/u1/a.jpg', videoUrl: null, accessToken: 'TOKEN', account: { externalId: '@canal', meta: {} } } };
    },
    async countPublishedSince() { return opts.published24h ?? 0; },
    async lastPublishedAt() { return null; },
    async getSettings() { return { max_posts_per_day: 10, min_minutes_between_posts: 0 }; },
    async markAccount(_id, st) { state.account = st; },
  };
  return { repo, state };
}

const job = (over: Partial<JobRow> = {}): JobRow => ({ id: 'j1', user_id: 'u1', publication_id: 'p1', kind: 'publish', attempts: 1, max_attempts: 3, ...over });

function mockFetch(handler: (url: string, init?: RequestInit) => { status?: number; body?: any; headers?: Record<string, string> } | 'network') {
  const calls: { url: string; body?: any }[] = [];
  const f = (async (url: any, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body });
    const r = handler(String(url), init);
    if (r === 'network') throw new TypeError('fetch failed');
    return new Response(r.body === undefined ? '' : typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status ?? 200, headers: r.headers });
  }) as typeof fetch;
  return { f, calls };
}

describe('motor de publicação', () => {
  it('publica no Telegram e só marca como publicada com confirmação da API', async () => {
    const { repo, state } = memRepo({});
    const { f, calls } = mockFetch(() => ({ body: { ok: true, result: { message_id: 42, chat: { username: 'canal' } } } }));
    expect(await processJob(job(), repo, f)).toBe('published');
    expect(state.pub.status).toBe('published');
    expect(state.pub.external_url).toBe('https://t.me/canal/42');
    expect(state.pub.confirmed_at).toBeTruthy();
    // link de afiliado vai intacto no botão
    const sent = JSON.parse(String(calls[0].body));
    expect(sent.reply_markup.inline_keyboard[0][0].url).toBe(AFF);
  });

  it('falha de rede após envio NÃO reenvia (sem duplicação) e pede conferência manual', async () => {
    const { repo, state } = memRepo({});
    const { f, calls } = mockFetch(() => 'network');
    expect(await processJob(job(), repo, f)).toBe('uncertain');
    expect(state.pub.status).toBe('awaiting_manual');
    expect(state.job.status).toBe('failed');
    expect(state.pub.request_sent_at).toBeTruthy();
    // Um novo processamento do mesmo item não chama a API novamente
    const again = await processJob(job({ attempts: 2 }), repo, f);
    expect(again).toBe('uncertain_previous');
    expect(calls.length).toBe(1);
  });

  it('429 da plataforma reagenda com segurança (nada foi criado)', async () => {
    const { repo, state } = memRepo({});
    const { f } = mockFetch(() => ({ status: 429, body: { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 15 } } }));
    expect(await processJob(job(), repo, f)).toBe('retry');
    expect(state.pub.status).toBe('scheduled');
    expect(state.pub.request_sent_at).toBeNull();
    expect(state.job.status).toBe('queued');
  });

  it('erro definitivo é registrado e apresentado', async () => {
    const { repo, state } = memRepo({});
    const { f } = mockFetch(() => ({ status: 400, body: { ok: false, error_code: 400, description: 'Bad Request: chat not found' } }));
    expect(await processJob(job(), repo, f)).toBe('failed');
    expect(state.pub.status).toBe('failed');
    expect(state.pub.error_message).toMatch(/chat not found/);
    expect(state.logs.some((l) => l.startsWith('error:'))).toBe(true);
  });

  it('esgotadas as tentativas, marca falha em vez de repetir indefinidamente', async () => {
    const { repo, state } = memRepo({});
    const { f } = mockFetch(() => ({ status: 429, body: { ok: false, error_code: 429, description: 'x' } }));
    expect(await processJob(job({ attempts: 3 }), repo, f)).toBe('failed');
    expect(state.pub.status).toBe('failed');
  });

  it('integração não configurada é identificada sem simular sucesso', async () => {
    const { repo, state } = memRepo({}, { configured: false });
    const { f, calls } = mockFetch(() => ({ body: {} }));
    expect(await processJob(job(), repo, f)).toBe('not_configured');
    expect(state.pub.status).toBe('not_configured');
    expect(calls.length).toBe(0);
  });

  it('WhatsApp (sem conector oficial) nunca é marcado como publicado', async () => {
    const { repo, state } = memRepo({ platform: 'whatsapp' });
    const { f } = mockFetch(() => ({ body: {} }));
    expect(await processJob(job(), repo, f)).toBe('no_connector');
    expect(state.pub.status).toBe('not_configured');
  });

  it('modo assistido apenas avisa no horário', async () => {
    const { repo, state } = memRepo({ mode: 'assisted' });
    const { f, calls } = mockFetch(() => ({ body: {} }));
    expect(await processJob(job(), repo, f)).toBe('assisted');
    expect(state.pub.status).toBe('awaiting_manual');
    expect(calls.length).toBe(0);
  });

  it('respeita o limite diário de publicações', async () => {
    const { repo, state } = memRepo({}, { published24h: 10 });
    const { f, calls } = mockFetch(() => ({ body: {} }));
    expect(await processJob(job(), repo, f)).toBe('rate_limited_local');
    expect(state.job.status).toBe('queued');
    expect(calls.length).toBe(0);
  });

  it('cancelada não é publicada', async () => {
    const { repo } = memRepo({ status: 'cancelled' });
    const { f, calls } = mockFetch(() => ({ body: {} }));
    expect(await processJob(job(), repo, f)).toBe('skipped');
    expect(calls.length).toBe(0);
  });

  it('token expirado marca a conta para reconexão', async () => {
    const { repo, state } = memRepo({});
    const { f } = mockFetch(() => ({ status: 401, body: { ok: false, error_code: 401, description: 'Unauthorized' } }));
    await processJob(job(), repo, f);
    expect(state.account).toBe('expired');
  });
});

describe('Instagram: fluxo em duas etapas com verificação', () => {
  it('contêiner -> FINISHED -> media_publish -> permalink', async () => {
    const { repo, state } = memRepo({ platform: 'instagram' });
    let containerStatus = 'IN_PROGRESS';
    const { f } = mockFetch((url, init) => {
      if (url.endsWith('/media') && init?.method === 'POST') return { body: { id: 'C1' } };
      if (url.includes('/C1?fields=status_code')) return { body: { status_code: containerStatus } };
      if (url.endsWith('/media_publish')) return { body: { id: 'M1' } };
      if (url.includes('/M1?fields=permalink')) return { body: { permalink: 'https://instagram.com/p/xyz' } };
      return { status: 404, body: {} };
    });
    expect(await processJob(job(), repo, f)).toBe('pending');
    expect(state.pub.status).toBe('processing');
    expect(state.job.kind).toBe('verify');
    // ainda processando
    expect(await processJob(job({ kind: 'verify', attempts: 2 }), repo, f)).toBe('pending');
    containerStatus = 'FINISHED';
    expect(await processJob(job({ kind: 'verify', attempts: 3 }), repo, f)).toBe('published');
    expect(state.pub.external_url).toBe('https://instagram.com/p/xyz');
  });
});

describe('conectores: limitações reais', () => {
  const base = { platform: 'tiktok' as const, caption: 'x', hashtags: [], link: AFF, accessToken: 't', account: { externalId: 'me', meta: {} } };
  it('TikTok não auditado publica como SELF_ONLY', async () => {
    let sentPrivacy = '';
    const { f } = mockFetch((url, init) => {
      if (url.includes('creator_info')) return { body: { data: { privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], creator_username: 'eu' }, error: { code: 'ok' } } };
      if (url.includes('content/init')) { sentPrivacy = JSON.parse(String(init?.body)).post_info.privacy_level; return { body: { data: { publish_id: 'P1' }, error: { code: 'ok' } } }; }
      return { status: 404 };
    });
    const o = await tiktok.publish({ ...base, imageUrl: 'https://img/x.jpg', fetch: f });
    expect(o.kind).toBe('pending');
    expect(sentPrivacy).toBe('SELF_ONLY');
  });
  it('YouTube recusa imagem estática como Short', async () => {
    const { f, calls } = mockFetch(() => ({ body: {} }));
    const o = await youtube.publish({ ...base, platform: 'youtube', imageUrl: 'https://img/x.jpg', videoUrl: null, fetch: f });
    expect(o.kind).toBe('rejected');
    expect(calls.length).toBe(0);
  });
  it('Instagram: falha ao criar contêiner é segura para repetir', async () => {
    const { f } = mockFetch(() => 'network');
    const o = await instagram.publish({ ...base, platform: 'instagram', imageUrl: 'https://img/x.jpg', fetch: f });
    expect(o).toMatchObject({ kind: 'rejected', retryable: true });
  });
  it('Telegram: teste exige bot administrador do canal', async () => {
    const { f } = mockFetch((url) => {
      if (url.includes('getMe')) return { body: { ok: true, result: { id: 1, username: 'bot' } } };
      if (url.includes('getChatMember')) return { body: { ok: true, result: { status: 'member' } } };
      if (url.includes('getChat')) return { body: { ok: true, result: { type: 'channel', title: 'Canal' } } };
      return { status: 404 };
    });
    const t = await telegram.test({ accessToken: 'x', account: { externalId: '@canal', meta: {} }, fetch: f });
    expect(t.ok).toBe(false);
  });
});

describe('robustez', () => {
  it('erro ao carregar credenciais não trava a fila nem publica', async () => {
    const { repo, state } = memRepo({});
    repo.loadContext = async () => { throw new Error('Formato de segredo inválido'); };
    const { f, calls } = mockFetch(() => ({ body: {} }));
    expect(await processJob(job(), repo, f)).toBe('not_configured');
    expect(state.job.status).toBe('failed');
    expect(state.pub.error_message).toMatch(/Reconecte/);
    expect(calls.length).toBe(0);
  });
  it('job retomado após queda do worker durante o envio não reenvia', async () => {
    const { repo, state } = memRepo({ status: 'processing', request_sent_at: new Date().toISOString() });
    const { f, calls } = mockFetch(() => ({ body: { ok: true, result: { message_id: 1, chat: {} } } }));
    expect(await processJob(job({ attempts: 2 }), repo, f)).toBe('uncertain_previous');
    expect(state.pub.status).toBe('awaiting_manual');
    expect(calls.length).toBe(0);
  });
});

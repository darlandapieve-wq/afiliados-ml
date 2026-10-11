// Pinterest API v5 — POST /v5/pins. Acesso de teste (trial) escreve no sandbox.
import { type Connector, type HttpResult, http, createCall, classifyCreateError } from './types.ts';

const apiBase = (sandbox: boolean) => (sandbox ? 'https://api-sandbox.pinterest.com/v5' : 'https://api.pinterest.com/v5');
const pinMsg = (r: HttpResult) => `Pinterest: ${r.json?.message ?? 'HTTP ' + r.status}`;

export const pinterest: Connector = {
  async publish(ctx) {
    const sandbox = ctx.account.meta?.sandbox !== false;
    const board = String(ctx.account.meta?.board_id ?? '');
    if (!board) return { kind: 'rejected', error: 'Escolha a pasta (board) do Pinterest em Integrações.', retryable: false };
    if (!ctx.imageUrl) return { kind: 'rejected', error: 'Pinterest exige imagem.', retryable: false };
    return createCall(async () => {
      const r = await http(ctx.fetch, `${apiBase(sandbox)}/pins`, {
        method: 'POST',
        headers: { authorization: `Bearer ${ctx.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          board_id: board, title: (ctx.title ?? '').slice(0, 100), description: ctx.caption.slice(0, 800),
          link: ctx.link, media_source: { source_type: 'image_url', url: ctx.imageUrl },
        }),
      });
      if (r.status !== 201 && r.status !== 200) return classifyCreateError(r, pinMsg(r));
      return { kind: 'pending', externalId: String(r.json.id), providerState: sandbox ? 'sandbox' : 'created', checkAfterSec: 10 };
    });
  },
  async check(ctx, id, providerState) {
    const sandbox = providerState === 'sandbox';
    const r = await http(ctx.fetch, `${apiBase(sandbox)}/pins/${id}`, { headers: { authorization: `Bearer ${ctx.accessToken}` } });
    if (r.status !== 200) return { kind: 'pending', externalId: id, providerState: providerState ?? '', checkAfterSec: 60 };
    return { kind: 'published', externalId: id, externalUrl: sandbox ? null : `https://www.pinterest.com/pin/${id}/`, providerState: providerState ?? 'created' };
  },
  async test(ctx) {
    const r = await http(ctx.fetch, 'https://api.pinterest.com/v5/user_account', { headers: { authorization: `Bearer ${ctx.accessToken}` } });
    if (r.status !== 200) return { ok: false, detail: pinMsg(r) };
    return { ok: true, displayName: r.json.username, detail: `Conta ${r.json.username} (${r.json.account_type}). ${ctx.account.meta?.sandbox !== false ? 'Modo sandbox (trial).' : ''}` };
  },
};

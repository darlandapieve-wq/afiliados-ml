// Telegram Bot API — https://core.telegram.org/bots/api
import { type Connector, type Outcome, http, createCall } from './types.ts';

const base = (token: string) => `https://api.telegram.org/bot${token}`;

function tgError(j: any): Outcome {
  const code = j?.error_code ?? 0;
  const msg = `Telegram: ${j?.description ?? 'erro desconhecido'}`;
  if (code === 429) return { kind: 'rejected', error: msg, retryable: true, retryAfterSec: j?.parameters?.retry_after ?? 30 };
  if (code === 401) return { kind: 'rejected', error: msg, retryable: false, authError: true };
  if (code >= 500) return { kind: 'uncertain', error: msg };
  return { kind: 'rejected', error: msg, retryable: false };
}

export const telegram: Connector = {
  async publish(ctx) {
    const chat_id = ctx.account.externalId;
    const reply_markup = { inline_keyboard: [[{ text: '🛒 Ver no Mercado Livre', url: ctx.link }]] };
    const body = ctx.imageUrl
      ? { method: 'sendPhoto', payload: { chat_id, photo: ctx.imageUrl, caption: ctx.caption.slice(0, 1024), parse_mode: 'HTML', reply_markup } }
      : { method: 'sendMessage', payload: { chat_id, text: ctx.caption.slice(0, 4096), parse_mode: 'HTML', reply_markup } };
    return createCall(async () => {
      const r = await http(ctx.fetch, `${base(ctx.accessToken)}/${body.method}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body.payload),
      });
      if (!r.json?.ok) return tgError(r.json ?? { error_code: r.status });
      const m = r.json.result;
      const username = m?.chat?.username;
      return {
        kind: 'published',
        externalId: String(m.message_id),
        externalUrl: username ? `https://t.me/${username}/${m.message_id}` : null,
        providerState: 'sent',
      };
    });
  },

  async test(ctx) {
    const me = await http(ctx.fetch, `${base(ctx.accessToken)}/getMe`);
    if (!me.json?.ok) return { ok: false, detail: `Token do bot inválido: ${me.json?.description ?? me.status}` };
    const chat = await http(ctx.fetch, `${base(ctx.accessToken)}/getChat?chat_id=${encodeURIComponent(ctx.account.externalId)}`);
    if (!chat.json?.ok) return { ok: false, detail: `Bot @${me.json.result.username} não acessa o chat: ${chat.json?.description}` };
    const member = await http(ctx.fetch, `${base(ctx.accessToken)}/getChatMember?chat_id=${encodeURIComponent(ctx.account.externalId)}&user_id=${me.json.result.id}`);
    const st = member.json?.result;
    const canPost = st?.status === 'administrator' ? (st.can_post_messages ?? true) : st?.status === 'creator';
    const isChannel = chat.json.result.type === 'channel';
    if (isChannel && !canPost) return { ok: false, detail: 'O bot precisa ser administrador do canal com permissão "Publicar mensagens".' };
    const name = chat.json.result.title ?? chat.json.result.username ?? ctx.account.externalId;
    return { ok: true, detail: `Bot @${me.json.result.username} pode publicar em "${name}".`, displayName: name };
  },
};

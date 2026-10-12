// TikTok Content Posting API — developers.tiktok.com/doc/content-posting-api-reference-*
// Apps não auditados: conteúdo SEMPRE privado (SELF_ONLY). Conteúdo de marca não pode ser privado,
// então antes da auditoria só é possível um envio de TESTE privado.
import { type Connector, type Outcome, type HttpResult, http, createCall, classifyCreateError } from './types.ts';

const API = 'https://open.tiktokapis.com/v2';

function ttMsg(r: HttpResult): string {
  const e = r.json?.error;
  return `TikTok: ${e?.message || e?.code || 'HTTP ' + r.status}`;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8' };
}

export async function creatorInfo(f: typeof fetch, token: string) {
  const r = await http(f, `${API}/post/publish/creator_info/query/`, { method: 'POST', headers: auth(token) });
  return r;
}

export const tiktok: Connector = {
  async publish(ctx) {
    const audited = ctx.account.meta?.audited === true;
    const info = await creatorInfo(ctx.fetch, ctx.accessToken);
    if (info.status !== 200 || info.json?.error?.code !== 'ok') return { kind: 'rejected', error: ttMsg(info), retryable: info.status >= 500, retryAfterSec: 300, authError: info.status === 401 };
    const options: string[] = info.json.data?.privacy_level_options ?? [];
    const privacy = audited && options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY';
    const post_info: Record<string, unknown> = {
      title: (ctx.title ?? '').slice(0, 90),
      privacy_level: privacy,
      disable_comment: false,
      // Divulgação de afiliado = conteúdo de marca de terceiro. Só é permitido em publicações não privadas.
      brand_content_toggle: privacy !== 'SELF_ONLY',
      brand_organic_toggle: false,
    };

    if (ctx.videoUrl) {
      // Baixa o vídeo do nosso Storage e envia por FILE_UPLOAD (não exige verificação de domínio).
      const vid = await ctx.fetch(ctx.videoUrl);
      if (!vid.ok) return { kind: 'rejected', error: `Não consegui ler o vídeo (${vid.status}).`, retryable: true, retryAfterSec: 120 };
      const bytes = new Uint8Array(await vid.arrayBuffer());
      const size = bytes.byteLength;
      if (size > 64 * 1024 * 1024) return { kind: 'rejected', error: 'Vídeo acima de 64 MB.', retryable: false };
      const init = await http(ctx.fetch, `${API}/post/publish/video/init/`, {
        method: 'POST', headers: auth(ctx.accessToken),
        body: JSON.stringify({ post_info: { ...post_info, title: ctx.caption.slice(0, 2200), ...(ctx.aigc ? { is_aigc: true } : {}) }, source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 } }),
      });
      if (init.status !== 200 || init.json?.error?.code !== 'ok') return classifyCreateError(init, ttMsg(init));
      const { publish_id, upload_url } = init.json.data;
      return createCall(async () => {
        const up = await ctx.fetch(upload_url, {
          method: 'PUT', body: bytes,
          headers: { 'content-type': vid.headers.get('content-type') ?? 'video/mp4', 'content-range': `bytes 0-${size - 1}/${size}`, 'content-length': String(size) },
        });
        if (!up.ok) return { kind: 'uncertain', error: `Upload ao TikTok falhou (HTTP ${up.status}). Confira o app.` };
        return { kind: 'pending', externalId: publish_id, providerState: `PROCESSING_UPLOAD:${privacy}`, checkAfterSec: 30 };
      });
    }

    if (!ctx.imageUrl) return { kind: 'rejected', error: 'TikTok exige foto ou vídeo.', retryable: false };
    return createCall(async () => {
      const r = await http(ctx.fetch, `${API}/post/publish/content/init/`, {
        method: 'POST', headers: auth(ctx.accessToken),
        body: JSON.stringify({
          post_info: { ...post_info, description: ctx.caption.slice(0, 4000), auto_add_music: true },
          source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: [ctx.imageUrl] },
          post_mode: 'DIRECT_POST', media_type: 'PHOTO',
        }),
      });
      if (r.status !== 200 || r.json?.error?.code !== 'ok') {
        const o = classifyCreateError(r, ttMsg(r));
        if (r.json?.error?.code === 'url_ownership_unverified') {
          return { kind: 'rejected', error: 'TikTok: o prefixo de URL das imagens ainda não foi verificado no portal de desenvolvedor (ver docs/INTEGRACOES.md).', retryable: false };
        }
        return o;
      }
      return { kind: 'pending', externalId: r.json.data.publish_id, providerState: `PROCESSING_DOWNLOAD:${privacy}`, checkAfterSec: 20 };
    });
  },

  async check(ctx, publishId, providerState) {
    const privacy = providerState?.split(':')[1] ?? '';
    const r = await http(ctx.fetch, `${API}/post/publish/status/fetch/`, {
      method: 'POST', headers: auth(ctx.accessToken), body: JSON.stringify({ publish_id: publishId }),
    });
    if (r.status !== 200 || r.json?.error?.code !== 'ok') return { kind: 'pending', externalId: publishId, providerState: providerState ?? '', checkAfterSec: 60 };
    const d = r.json.data;
    if (d.status === 'PUBLISH_COMPLETE') {
      const postId = d.publicaly_available_post_id?.[0];
      return {
        kind: 'published', externalId: String(postId ?? publishId),
        externalUrl: postId ? `https://www.tiktok.com/@${String(ctx.account.meta?.username ?? "")}/video/${postId}` : null,
        providerState: `PUBLISH_COMPLETE:${privacy}`,
      };
    }
    if (d.status === 'FAILED') return { kind: 'rejected', error: `TikTok: falha na publicação (${d.fail_reason})`, retryable: false };
    return { kind: 'pending', externalId: publishId, providerState: `${d.status}:${privacy}`, checkAfterSec: 30 };
  },

  async test(ctx) {
    const r = await creatorInfo(ctx.fetch, ctx.accessToken);
    if (r.status !== 200 || r.json?.error?.code !== 'ok') return { ok: false, detail: ttMsg(r) };
    const d = r.json.data;
    const audited = ctx.account.meta?.audited === true;
    return {
      ok: true,
      displayName: '@' + d.creator_username,
      detail: `Conta @${d.creator_username} conectada. ${audited ? 'App auditado.' : 'App NÃO auditado: publicações serão privadas (somente você vê).'} Opções de privacidade: ${(d.privacy_level_options ?? []).join(', ')}.`,
    };
  },
};

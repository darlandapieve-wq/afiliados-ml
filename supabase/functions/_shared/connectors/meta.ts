// Facebook Pages API e Instagram Content Publishing API (Graph API / Facebook Login).
// Docs: developers.facebook.com/documentation/pages-api/posts
//       developers.facebook.com/documentation/instagram-platform/content-publishing
import { type Connector, type Outcome, type HttpResult, http, createCall, classifyCreateError } from './types.ts';

export const GRAPH = 'https://graph.facebook.com/v25.0';

function graphMsg(r: HttpResult): string {
  const e = r.json?.error;
  return e ? `Meta: ${e.message} (código ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''})` : `Meta: HTTP ${r.status}`;
}

function graphCreateError(r: HttpResult): Outcome {
  const code = r.json?.error?.code;
  if ([4, 17, 32, 613].includes(code)) return { kind: 'rejected', error: graphMsg(r), retryable: true, retryAfterSec: 900 };
  if (code === 190) return { kind: 'rejected', error: graphMsg(r), retryable: false, authError: true };
  if (code === 10 || code === 200) return { kind: 'rejected', error: graphMsg(r) + ' — permissão ausente.', retryable: false };
  return classifyCreateError(r, graphMsg(r));
}

function form(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

export const facebook: Connector = {
  async publish(ctx) {
    const page = ctx.account.externalId;
    return createCall(async () => {
      let r: HttpResult;
      if (ctx.imageUrl) {
        r = await http(ctx.fetch, `${GRAPH}/${page}/photos`, {
          method: 'POST', body: form({ url: ctx.imageUrl, caption: ctx.caption, published: 'true', access_token: ctx.accessToken }),
        }, 60000);
      } else {
        r = await http(ctx.fetch, `${GRAPH}/${page}/feed`, {
          method: 'POST', body: form({ message: ctx.caption, link: ctx.link, access_token: ctx.accessToken }),
        });
      }
      if (r.status !== 200 || r.json?.error) return graphCreateError(r);
      const postId = r.json.post_id ?? r.json.id;
      return { kind: 'pending', externalId: String(postId), providerState: 'created', checkAfterSec: 5 };
    });
  },

  async check(ctx, externalId) {
    const r = await http(ctx.fetch, `${GRAPH}/${externalId}?fields=permalink_url,is_published&access_token=${encodeURIComponent(ctx.accessToken)}`);
    if (r.status !== 200) {
      return { kind: 'pending', externalId, providerState: 'verify_retry', checkAfterSec: 60 };
    }
    if (r.json.is_published === false) return { kind: 'pending', externalId, providerState: 'unpublished', checkAfterSec: 120 };
    return { kind: 'published', externalId, externalUrl: r.json.permalink_url ?? `https://www.facebook.com/${externalId}`, providerState: 'is_published' };
  },

  async test(ctx) {
    // "tasks" só existe em /me/accounts; aqui o token já é da Página.
    const r = await http(ctx.fetch, `${GRAPH}/${ctx.account.externalId}?fields=name,instagram_business_account{username}&access_token=${encodeURIComponent(ctx.accessToken)}`);
    if (r.status !== 200) return { ok: false, detail: graphMsg(r) };
    const tasks: string[] = (ctx.account.meta?.tasks as string[]) ?? [];
    if (tasks.length && !tasks.includes('CREATE_CONTENT')) return { ok: false, detail: 'Sua função na Página não permite criar conteúdo.' };
    const ig = r.json.instagram_business_account?.username;
    return { ok: true, detail: `Página "${r.json.name}" pronta para publicar.${ig ? ` Instagram vinculado: @${ig}.` : ' Nenhuma conta profissional do Instagram vinculada a esta Página.'}`, displayName: r.json.name };
  },
};

export const instagram: Connector = {
  async publish(ctx) {
    const ig = ctx.account.externalId;
    const params: Record<string, string> = { caption: ctx.caption, access_token: ctx.accessToken };
    if (ctx.videoUrl) { params.media_type = 'REELS'; params.video_url = ctx.videoUrl; }
    else if (ctx.imageUrl) { params.image_url = ctx.imageUrl; }
    else return { kind: 'rejected', error: 'Instagram exige imagem ou vídeo.', retryable: false };
    // Criar contêiner não publica nada; uma falha aqui é segura para repetir.
    try {
      const r = await http(ctx.fetch, `${GRAPH}/${ig}/media`, { method: 'POST', body: form(params) }, 60000);
      if (r.status !== 200 || r.json?.error) {
        const o = graphCreateError(r);
        return o.kind === 'uncertain' ? { kind: 'rejected', error: o.error, retryable: true, retryAfterSec: 120 } : o;
      }
      return { kind: 'pending', externalId: String(r.json.id), providerState: 'container', checkAfterSec: ctx.videoUrl ? 30 : 5 };
    } catch (e) {
      return { kind: 'rejected', error: `Falha de rede ao criar contêiner: ${(e as Error).message}`, retryable: true, retryAfterSec: 120 };
    }
  },

  async check(ctx, externalId, providerState) {
    const ig = ctx.account.externalId;
    const tok = encodeURIComponent(ctx.accessToken);
    if (providerState === 'container') {
      const s = await http(ctx.fetch, `${GRAPH}/${externalId}?fields=status_code,status&access_token=${tok}`);
      const code = s.json?.status_code;
      if (code === 'IN_PROGRESS' || s.status !== 200) return { kind: 'pending', externalId, providerState: 'container', checkAfterSec: 30 };
      if (code === 'ERROR' || code === 'EXPIRED') return { kind: 'rejected', error: `Instagram recusou a mídia: ${s.json?.status ?? code}`, retryable: false };
      if (code === 'PUBLISHED') return { kind: 'uncertain', error: 'Contêiner já publicado anteriormente; confira o perfil.' };
      // FINISHED -> publicar (um contêiner só pode ser publicado uma vez)
      return createCall(async () => {
        const p = await http(ctx.fetch, `${GRAPH}/${ig}/media_publish`, { method: 'POST', body: form({ creation_id: externalId, access_token: ctx.accessToken }) });
        if (p.status !== 200 || p.json?.error) return graphCreateError(p);
        const mediaId = String(p.json.id);
        const l = await http(ctx.fetch, `${GRAPH}/${mediaId}?fields=permalink&access_token=${tok}`).catch(() => null);
        return { kind: 'published', externalId: mediaId, externalUrl: l?.json?.permalink ?? null, providerState: 'published' };
      });
    }
    // Já publicado: apenas confirmar o permalink
    const l = await http(ctx.fetch, `${GRAPH}/${externalId}?fields=permalink&access_token=${tok}`);
    if (l.status === 200) return { kind: 'published', externalId, externalUrl: l.json.permalink, providerState: 'published' };
    return { kind: 'pending', externalId, providerState: providerState ?? 'published', checkAfterSec: 60 };
  },

  async test(ctx) {
    const tok = encodeURIComponent(ctx.accessToken);
    const r = await http(ctx.fetch, `${GRAPH}/${ctx.account.externalId}?fields=username&access_token=${tok}`);
    if (r.status !== 200) return { ok: false, detail: graphMsg(r) };
    const lim = await http(ctx.fetch, `${GRAPH}/${ctx.account.externalId}/content_publishing_limit?fields=quota_usage,config&access_token=${tok}`);
    const usage = lim.json?.data?.[0];
    const q = usage ? ` Uso nas últimas 24 h: ${usage.quota_usage}/${usage.config?.quota_total ?? '?'}.` : '';
    return { ok: true, detail: `Conta @${r.json.username} pronta para publicar.${q}`, displayName: '@' + r.json.username };
  },
};

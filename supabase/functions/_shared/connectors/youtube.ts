// YouTube Data API v3 — videos.insert (upload resumível) e videos.list para verificação.
// Projetos não auditados: todo upload fica travado como PRIVADO.
import { type Connector, type HttpResult, http, createCall, classifyCreateError } from './types.ts';

const UP = 'https://www.googleapis.com/upload/youtube/v3/videos';
const API = 'https://www.googleapis.com/youtube/v3';

function ytMsg(r: HttpResult): string {
  return `YouTube: ${r.json?.error?.message ?? 'HTTP ' + r.status}`;
}

export const youtube: Connector = {
  async publish(ctx) {
    if (!ctx.videoUrl) return { kind: 'rejected', error: 'YouTube Shorts exige um vídeo vertical — imagem estática não é um Short.', retryable: false };
    const audited = ctx.account.meta?.audited === true;
    const vid = await ctx.fetch(ctx.videoUrl);
    if (!vid.ok) return { kind: 'rejected', error: `Não consegui ler o vídeo (${vid.status}).`, retryable: true, retryAfterSec: 120 };
    const bytes = new Uint8Array(await vid.arrayBuffer());
    const type = vid.headers.get('content-type') ?? 'video/webm';
    const meta = {
      snippet: { title: (ctx.title ?? 'Produto').slice(0, 100), description: ctx.caption.slice(0, 5000), tags: ctx.hashtags.map((h) => h.replace(/^#/, '')).slice(0, 15), categoryId: '22' },
      status: { privacyStatus: audited ? 'public' : 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: false },
    };
    // 1) Abrir sessão (nada é criado ainda — falha é segura)
    let session: HttpResult;
    try {
      session = await http(ctx.fetch, `${UP}?uploadType=resumable&part=snippet,status`, {
        method: 'POST',
        headers: { authorization: `Bearer ${ctx.accessToken}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': type, 'x-upload-content-length': String(bytes.byteLength) },
        body: JSON.stringify(meta),
      });
    } catch (e) {
      return { kind: 'rejected', error: `Falha de rede ao iniciar upload: ${(e as Error).message}`, retryable: true, retryAfterSec: 120 };
    }
    if (session.status !== 200) {
      const o = classifyCreateError(session, ytMsg(session));
      return o.kind === 'uncertain' ? { kind: 'rejected', error: o.error, retryable: true, retryAfterSec: 300 } : o;
    }
    const location = session.headers.get('location');
    if (!location) return { kind: 'rejected', error: 'YouTube não retornou a sessão de upload.', retryable: true, retryAfterSec: 300 };
    // 2) Enviar bytes (a partir daqui o vídeo pode existir)
    return createCall(async () => {
      const r = await http(ctx.fetch, location, { method: 'PUT', headers: { 'content-type': type }, body: bytes }, 300000);
      if (r.status !== 200 && r.status !== 201) return classifyCreateError(r, ytMsg(r));
      return { kind: 'pending', externalId: r.json.id, providerState: `uploaded:${r.json.status?.privacyStatus ?? ''}`, checkAfterSec: 60 };
    });
  },

  async check(ctx, id) {
    const r = await http(ctx.fetch, `${API}/videos?part=status,processingDetails&id=${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${ctx.accessToken}` } });
    const v = r.json?.items?.[0];
    if (r.status !== 200 || !v) return { kind: 'pending', externalId: id, providerState: 'verify_retry', checkAfterSec: 120 };
    const st = v.status.uploadStatus;
    const privacy = v.status.privacyStatus;
    if (st === 'processed') return { kind: 'published', externalId: id, externalUrl: `https://youtube.com/shorts/${id}`, providerState: `processed:${privacy}` };
    if (st === 'failed' || st === 'rejected' || st === 'deleted') return { kind: 'rejected', error: `YouTube: upload ${st} (${v.status.failureReason ?? v.status.rejectionReason ?? ''})`, retryable: false };
    return { kind: 'pending', externalId: id, providerState: `${st}:${privacy}`, checkAfterSec: 120 };
  },

  async test(ctx) {
    const r = await http(ctx.fetch, `${API}/channels?part=snippet&mine=true`, { headers: { authorization: `Bearer ${ctx.accessToken}` } });
    const c = r.json?.items?.[0];
    if (r.status !== 200 || !c) return { ok: false, detail: ytMsg(r) };
    const audited = ctx.account.meta?.audited === true;
    return { ok: true, displayName: c.snippet.title, detail: `Canal "${c.snippet.title}" conectado. ${audited ? 'Projeto auditado.' : 'Projeto NÃO auditado: uploads ficarão privados.'}` };
  },
};

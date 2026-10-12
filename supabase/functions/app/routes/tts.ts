// Módulo TikTok Shop: briefing com IA (com a foto do produto), publicação pela API e verificação.
// deno-lint-ignore-file no-explicit-any
import { admin, env, handle, json, requireUser, HttpError } from '../../_shared/supa.ts';
import { http } from '../../_shared/connectors/types.ts';
import { generateBrief, normalizeBrief, aiBriefPrompt, parseJsonLoose, type TtsInput } from '../../_shared/tts.ts';
import { publishCreative, checkCreative } from '../../_shared/tts-server.ts';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function loadImage(url: string): Promise<{ data: string; mime: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const mime = (r.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
    if (!/^image\/(png|jpeg|webp)$/.test(mime)) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return { data: toBase64(bytes), mime };
  } catch { return null; }
}

async function askAI(prompt: string, image: { data: string; mime: string } | null): Promise<string> {
  if (env('GEMINI_API_KEY')) {
    const parts: any[] = [];
    if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
    parts.push({ text: prompt });
    const r = await http(fetch, `https://generativelanguage.googleapis.com/v1beta/models/${env('GEMINI_MODEL') ?? 'gemini-2.5-flash'}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY')! },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.8, maxOutputTokens: 4096, responseMimeType: 'application/json' } }),
    }, 60000);
    const text = r.json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
    if (!text) throw new HttpError(502, `IA indisponível: ${r.json?.error?.message ?? r.status}`);
    return text;
  }
  if (env('ANTHROPIC_API_KEY')) {
    const content: any[] = [];
    if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } });
    content.push({ type: 'text', text: prompt });
    const r = await http(fetch, 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env('ANTHROPIC_MODEL') ?? 'claude-haiku-5-5', max_tokens: 4096, messages: [{ role: 'user', content }] }),
    }, 60000);
    const text = r.json?.content?.map((c: any) => c.text ?? '').join('') ?? '';
    if (!text) throw new HttpError(502, `IA indisponível: ${r.json?.error?.message ?? r.status}`);
    return text;
  }
  throw new HttpError(501, 'IA não configurada. O briefing por modelos continua disponível.');
}

export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const db = admin();
  const body = await req.json();
  const id = String(body.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Criativo inválido');

  switch (body.action) {
    case 'brief_ai': {
      const { data: cr } = await db.from('tts_creatives').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
      if (!cr) throw new HttpError(404, 'Criativo não encontrado');
      const imageUrl = cr.image_path ? db.storage.from('media').getPublicUrl(cr.image_path).data.publicUrl : null;
      const input: TtsInput = {
        productName: cr.product_name, productUrl: cr.product_url, notes: cr.notes, format: cr.format, goal: cr.goal,
        durationS: cr.duration_s, hasImage: !!imageUrl, seed: cr.id,
      };
      const base = generateBrief(input);
      const image = imageUrl ? await loadImage(imageUrl) : null;
      const raw = parseJsonLoose(await askAI(aiBriefPrompt({ ...input, hasImage: !!image }, base), image));
      if (!raw) throw new HttpError(502, 'A IA respondeu em formato inesperado. Tente novamente ou use o briefing por modelos.');
      const brief = normalizeBrief(raw, base);
      const patch: Record<string, unknown> = { brief, brief_source: 'ai' };
      if (cr.status === 'draft') patch.status = 'brief_ready';
      const { error } = await db.from('tts_creatives').update(patch).eq('id', id).eq('user_id', user.id);
      if (error) throw new HttpError(400, error.message);
      return json(req, { brief, image_used: !!image });
    }

    case 'publish':
      return json(req, await publishCreative(db, user.id, id, body.account_id ?? null, body.confirm_resend === true));

    case 'check': {
      const { data: cr } = await db.from('tts_creatives').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
      if (!cr) throw new HttpError(404, 'Criativo não encontrado');
      const patch = await checkCreative(db, cr);
      return json(req, { changed: !!patch, ...(patch ?? {}) });
    }

    default:
      throw new HttpError(400, 'Ação inválida');
  }
});

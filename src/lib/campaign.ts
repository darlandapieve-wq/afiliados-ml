import { supabase, uploadMedia } from './supabase';
import { drawArt, canvasToBlob, loadImage, renderVideo, type ArtData, type Brand } from './art';
import { generateText, type Style } from '../../supabase/functions/_shared/text.ts';
import { PLATFORMS, TEMPLATES, type PlatformCode, type TemplateCode } from '../../supabase/functions/_shared/platforms.ts';

export interface ProductRow {
  id: string; title: string; price: number | null; price_checked_at: string | null; image_url: string | null; image_path: string | null;
  features: string[]; description: string | null; category: string | null; audience: string | null; notes: string | null; original_url: string | null;
}

export const CTA_BY_STYLE: Record<Style, string> = {
  informativo: 'Ver detalhes no Mercado Livre',
  promocional: 'Confira no Mercado Livre',
  comparativo: 'Compare no Mercado Livre',
  descontraido: 'Dá uma olhada no Mercado Livre',
};

export function productImageSrc(p: ProductRow): string | null {
  if (p.image_path) return supabase.storage.from('media').getPublicUrl(p.image_path).data.publicUrl;
  return p.image_url;
}

export async function artData(p: ProductRow, brand: Brand, style: Style, showPrice: boolean): Promise<{ data: ArtData; warnings: string[] }> {
  const warnings: string[] = [];
  const src = productImageSrc(p);
  const image = src ? await loadImage(src) : null;
  if (src && !image) warnings.push('Não foi possível carregar a imagem do produto (o site de origem bloqueia o uso). Envie uma imagem própria no cadastro do produto.');
  const logo = brand.logo_path ? await loadImage(supabase.storage.from('media').getPublicUrl(brand.logo_path).data.publicUrl) : null;
  return {
    warnings,
    data: {
      title: p.title, features: p.features ?? [], price: p.price, priceCheckedAt: p.price_checked_at,
      showPrice, cta: CTA_BY_STYLE[style], disclosure: 'Publicidade · link de afiliado', image, logo, brand,
    },
  };
}

/** Renderiza e envia as artes necessárias; retorna asset_id por template+formato. */
export async function generateArts(userId: string, campaignId: string, p: ProductRow, brand: Brand, style: Style, showPrice: boolean, platforms: PlatformCode[]) {
  const { data, warnings } = await artData(p, brand, style, showPrice);
  const needed = new Map<string, { template: TemplateCode; mime: 'image/png' | 'image/jpeg' }>();
  for (const pl of platforms) {
    const cap = PLATFORMS[pl];
    if (cap.requiresVideo) { needed.set('thumb|image/jpeg', { template: 'thumb', mime: 'image/jpeg' }); continue; }
    const t = cap.recommendedTemplates[0];
    needed.set(`${t}|${cap.imageMime}`, { template: t, mime: cap.imageMime });
  }
  needed.set('square|image/png', { template: 'square', mime: 'image/png' }); // usada na página intermediária
  const canvas = document.createElement('canvas');
  const out: Record<string, string> = {};
  for (const [key, { template, mime }] of needed) {
    drawArt(canvas, template, data);
    let blob: Blob;
    try { blob = await canvasToBlob(canvas, mime); }
    catch (e) {
      // Imagem externa "contaminou" o canvas: refaz sem ela
      warnings.push((e as Error).message);
      drawArt(canvas, template, { ...data, image: null });
      blob = await canvasToBlob(canvas, mime);
    }
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const { path, url } = await uploadMedia(userId, campaignId, `${template}-${Date.now()}.${ext}`, blob);
    const { w, h } = TEMPLATES[template];
    const { data: a, error } = await supabase.from('assets').insert({
      campaign_id: campaignId, kind: 'image', template, width: w, height: h, mime, storage_path: path, public_url: url,
      price_shown: showPrice && p.price_checked_at ? p.price : null, price_checked_at: showPrice ? p.price_checked_at : null,
    }).select('id').single();
    if (error) throw error;
    out[key] = a.id;
  }
  return { assets: out, warnings: [...new Set(warnings)] };
}

export async function generateVideoAsset(userId: string, campaignId: string, p: ProductRow, brand: Brand, style: Style, showPrice: boolean) {
  const { data, warnings } = await artData(p, brand, style, showPrice);
  const { blob, ext } = await renderVideo(data, 8);
  const { path, url } = await uploadMedia(userId, campaignId, `video-${Date.now()}.${ext}`, blob);
  const { data: a, error } = await supabase.from('assets').insert({
    campaign_id: campaignId, kind: 'video', template: 'story', width: 1080, height: 1920, mime: blob.type, storage_path: path, public_url: url,
  }).select('id').single();
  if (error) throw error;
  if (ext === 'webm') warnings.push('Seu navegador gerou WebM. TikTok e YouTube aceitam; o Instagram (Reels) exige MP4 — use Chrome/Edge recentes para MP4.');
  return { assetId: a.id as string, warnings };
}

export function assetFor(platform: PlatformCode, assets: Record<string, string>): string | null {
  const cap = PLATFORMS[platform];
  if (cap.requiresVideo) return null;
  return assets[`${cap.recommendedTemplates[0]}|${cap.imageMime}`] ?? null;
}

export async function upsertVariants(campaignId: string, p: ProductRow, style: Style, showPrice: boolean, link: string, platforms: PlatformCode[], assets: Record<string, string>, handle?: string | null) {
  const rows = platforms.map((pl) => {
    const g = generateText(pl, {
      title: p.title, price: p.price, priceCheckedAt: p.price_checked_at, features: p.features, description: p.description,
      category: p.category, audience: p.audience, notes: p.notes,
    }, { style, showPrice, link, seed: campaignId, handle });
    return { campaign_id: campaignId, platform: pl, title: g.title, caption: g.caption, hashtags: g.hashtags, link_placement: g.linkPlacement, asset_id: assetFor(pl, assets) };
  });
  const { error } = await supabase.from('content_variants').upsert(rows, { onConflict: 'campaign_id,platform' });
  if (error) throw error;
}

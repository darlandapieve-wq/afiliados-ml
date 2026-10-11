// Composição de artes no navegador (Canvas) — gratuita, sem serviço externo.
import { TEMPLATES, type TemplateCode } from '../../supabase/functions/_shared/platforms.ts';
import { formatBRL } from '../../supabase/functions/_shared/text.ts';

export interface Brand { primary: string; secondary: string; text: string; font: string; handle?: string | null; logo_path?: string | null }

export interface ArtData {
  title: string;
  features: string[];
  price?: number | null;
  priceCheckedAt?: string | null;
  showPrice: boolean;
  cta: string;
  disclosure: string;
  image: HTMLImageElement | null;
  logo?: HTMLImageElement | null;
  brand: Brand;
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // necessário para exportar o canvas
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else cur = test;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxW && last.length > 1) last = last.slice(0, -1);
    lines[maxLines - 1] = last.trimEnd() + '…';
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Desenha a arte. `t` (0..1) permite animar para o vídeo. */
export function drawArt(canvas: HTMLCanvasElement, template: TemplateCode, d: ArtData, t = 1) {
  const { w, h } = TEMPLATES[template];
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const s = Math.min(w, h) / 1080; // escala
  const font = (wt: number, px: number) => `${wt} ${Math.round(px * s)}px ${d.brand.font || 'Inter'}, system-ui, sans-serif`;
  const pad = 64 * s;
  const landscape = w > h;

  // Fundo
  ctx.fillStyle = d.brand.secondary;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = d.brand.primary;
  ctx.globalAlpha = 0.18;
  ctx.beginPath(); ctx.arc(w * 0.9, h * 0.08, 420 * s, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // Medidas do bloco de texto (para a imagem ocupar só o espaço que sobra)
  const titlePx = template === 'story' ? 72 : landscape ? 56 : 62;
  const titleLH = titlePx * 1.18 * s;
  const textW = landscape ? w * 0.5 - pad : w - pad * 2;
  ctx.font = font(800, titlePx);
  const titleLines = wrap(ctx, d.title, textW, 3);
  const priceOk = d.showPrice && d.price != null && !!d.priceCheckedAt;
  const ctaH = 96 * s;
  const handleH = d.brand.handle && !landscape ? 52 * s : 0;
  const featLH = 54 * s;
  const maxFeat = template === 'story' || template === 'pin' ? 4 : 3;
  const priceH = priceOk ? 130 * s : 0;
  const fixedText = titleLines.length * titleLH + 24 * s + priceH + 36 * s + ctaH + handleH;
  const top = pad * 1.6;
  let nFeat = Math.min(maxFeat, d.features.length);
  let imgH = h - top - pad - fixedText - nFeat * featLH - 50 * s;
  while (!landscape && imgH < h * 0.3 && nFeat > 0) { nFeat--; imgH += featLH; }
  imgH = Math.max(imgH, h * 0.22);

  // Área da imagem
  const imgBox = landscape
    ? { x: pad, y: pad, w: w * 0.45 - pad, h: h - pad * 2 }
    : { x: pad, y: top, w: w - pad * 2, h: imgH };
  ctx.save();
  roundRect(ctx, imgBox.x, imgBox.y, imgBox.w, imgBox.h, 36 * s);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.clip();
  if (d.image) {
    const zoom = 1 + (1 - t) * 0.08;
    const r = Math.min((imgBox.w * 0.88) / d.image.width, (imgBox.h * 0.88) / d.image.height) * zoom;
    const iw = d.image.width * r, ih = d.image.height * r;
    ctx.drawImage(d.image, imgBox.x + (imgBox.w - iw) / 2, imgBox.y + (imgBox.h - ih) / 2, iw, ih);
  } else {
    ctx.fillStyle = d.brand.secondary; ctx.globalAlpha = 0.25;
    ctx.font = font(700, 54); ctx.textAlign = 'center';
    ctx.fillText('Imagem do produto', imgBox.x + imgBox.w / 2, imgBox.y + imgBox.h / 2);
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }
  ctx.restore();

  // Selo de publicidade
  ctx.font = font(600, 26);
  const tag = d.disclosure;
  const tw = ctx.measureText(tag).width + 32 * s;
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  roundRect(ctx, pad, pad * 0.45, tw, 44 * s, 22 * s); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  ctx.fillText(tag, pad + 16 * s, pad * 0.45 + 22 * s);
  ctx.textBaseline = 'alphabetic';

  // Texto
  const tx = landscape ? w * 0.5 : pad;
  let y = landscape ? pad * 1.6 : imgBox.y + imgBox.h + titleLH;
  const fade = Math.min(1, Math.max(0, (t - 0.2) / 0.5));
  ctx.globalAlpha = fade;
  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, titlePx);
  for (const line of titleLines) { ctx.fillText(line, tx, y); y += titleLH; }
  y += 6 * s;
  ctx.font = font(500, 38);
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  for (const f of d.features.slice(0, landscape ? 3 : nFeat)) {
    ctx.fillText(wrap(ctx, `✓ ${f}`, textW, 1)[0], tx, y); y += featLH;
  }

  // Preço (somente quando confirmado e com data)
  if (priceOk) {
    ctx.fillStyle = d.brand.primary;
    ctx.font = font(900, 80);
    ctx.fillText(formatBRL(d.price!), tx, y + 58 * s);
    ctx.font = font(500, 24);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    const dt = new Date(d.priceCheckedAt!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    ctx.fillText(`Preço visto em ${dt}. Sujeito a alteração.`, tx, y + 96 * s);
  }

  // CTA ancorado no rodapé
  const ctaY = h - pad - ctaH - handleH;
  ctx.fillStyle = d.brand.primary;
  roundRect(ctx, tx, ctaY, textW, ctaH, ctaH / 2); ctx.fill();
  ctx.fillStyle = d.brand.text;
  ctx.font = font(800, 40);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(wrap(ctx, d.cta, textW - 40 * s, 1)[0], tx + textW / 2, ctaY + ctaH / 2);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  if (handleH) {
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = font(600, 30); ctx.textAlign = 'center';
    ctx.fillText(d.brand.handle!, w / 2, h - pad * 0.7);
    ctx.textAlign = 'left';
  }
  if (d.logo) {
    const lh = 70 * s, lw = (d.logo.width / d.logo.height) * lh;
    ctx.drawImage(d.logo, w - pad - lw, pad * 0.3, lw, lh);
  }
  ctx.globalAlpha = 1;
}

export function canvasToBlob(canvas: HTMLCanvasElement, mime: 'image/png' | 'image/jpeg'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao exportar a arte'))), mime, 0.92);
    } catch (e) {
      reject(new Error('A imagem externa bloqueou a exportação (CORS). Envie a imagem do produto pelo botão "Enviar imagem".'));
    }
  });
}

export function videoMime(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const opts = [
    { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ];
  return opts.find((o) => MediaRecorder.isTypeSupported(o.mime)) ?? null;
}

/** Gera um vídeo vertical curto (9:16) animando a arte. */
export async function renderVideo(d: ArtData, seconds = 8): Promise<{ blob: Blob; ext: string }> {
  const vm = videoMime();
  if (!vm) throw new Error('Seu navegador não grava vídeo (MediaRecorder). Use Chrome ou Edge atualizados.');
  const canvas = document.createElement('canvas');
  drawArt(canvas, 'story', d, 0);
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: vm.mime, videoBitsPerSecond: 4_000_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(250);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const frame = () => {
      const el = (performance.now() - start) / 1000;
      drawArt(canvas, 'story', d, Math.min(1, el / (seconds * 0.6)));
      if (el < seconds) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
  rec.stop();
  await done;
  return { blob: new Blob(chunks, { type: vm.mime.split(';')[0] }), ext: vm.ext };
}

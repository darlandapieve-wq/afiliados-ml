// Vídeo vertical (1080×1920) gerado no navegador a partir do roteiro do criativo:
// foto real do produto com zoom/movimento por cena + texto grande na tela. Gratuito, sem serviço externo.
// Sem narração: no TikTok, adicione música ou "texto para fala" ao publicar.
import type { TtsBrief, TtsScene } from '../../supabase/functions/_shared/tts.ts';
import { videoMime } from './art';

export const VW = 1080, VH = 1920;

export interface VideoStyle { accent: string; accentText: string; disclosure: string }
export const DEFAULT_STYLE: VideoStyle = { accent: '#FFE600', accentText: '#111111', disclosure: '#publi · Conteúdo criado com IA' };

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** Texto exibido na cena: o "texto na tela" do roteiro (ou a narração, se vazio). */
export function sceneText(s: TtsScene): string {
  return (s.onscreen || s.narration || '').trim();
}

/** Duração total do roteiro em segundos. */
export function briefDuration(b: TtsBrief): number {
  return b.scenes.reduce((m, s) => Math.max(m, s.end), 0);
}

/** Cena ativa no instante `t` (segundos). */
export function sceneAt(b: TtsBrief, t: number): { scene: TtsScene; index: number; local: number } {
  const idx = b.scenes.findIndex((s) => t >= s.start && t < s.end);
  const index = idx >= 0 ? idx : b.scenes.length - 1;
  const scene = b.scenes[index];
  const dur = Math.max(0.1, scene.end - scene.start);
  return { scene, index, local: Math.min(1, Math.max(0, (t - scene.start) / dur)) };
}

/** Desenha o quadro do instante `t`. */
export function drawFrame(ctx: CanvasRenderingContext2D, b: TtsBrief, img: HTMLImageElement | null, t: number, st: VideoStyle = DEFAULT_STYLE) {
  const { scene, index, local } = sceneAt(b, t);
  const last = index === b.scenes.length - 1;

  // Fundo: a própria foto desfocada e escurecida
  ctx.fillStyle = '#0d0f14';
  ctx.fillRect(0, 0, VW, VH);
  if (img) {
    const r = Math.max(VW / img.width, VH / img.height) * 1.1;
    ctx.save();
    ctx.filter = 'blur(38px) brightness(0.45)';
    ctx.drawImage(img, (VW - img.width * r) / 2, (VH - img.height * r) / 2, img.width * r, img.height * r);
    ctx.restore();
  }

  // Produto: zoom e movimento alternados por cena (efeito Ken Burns)
  const box = { x: 70, y: 560, w: VW - 140, h: 900 };
  if (img) {
    const dir = index % 4;
    const zoomIn = dir % 2 === 0;
    const k = ease(local);
    const zoom = last ? 1 : zoomIn ? 1 + 0.18 * k : 1.18 - 0.18 * k;
    const panX = (dir === 1 ? -1 : dir === 3 ? 1 : 0) * 50 * k;
    const panY = (dir === 2 ? -1 : 0) * 40 * k;
    const fit = Math.min(box.w / img.width, box.h / img.height) * zoom;
    const iw = img.width * fit, ih = img.height * fit;
    ctx.save();
    roundRect(ctx, box.x, box.y, box.w, box.h, 44);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 40;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.clip();
    ctx.drawImage(img, box.x + (box.w - iw) / 2 + panX, box.y + (box.h - ih) / 2 + panY, iw, ih);
    ctx.restore();
  }

  // Texto grande da cena (zona segura do TikTok: parte superior)
  const text = sceneText(scene).toUpperCase();
  const pop = ease(local * 5);
  const size = text.length > 26 ? 84 : 100;
  ctx.font = `900 ${size}px Inter, "Arial Black", system-ui, sans-serif`;
  const lines = wrap(ctx, text, VW - 200, 3);
  const lh = size * 1.12;
  const blockH = lines.length * lh + 56;
  const cy = 330;
  ctx.save();
  ctx.translate(VW / 2, cy);
  ctx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop);
  ctx.globalAlpha = pop;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  roundRect(ctx, -widest / 2 - 44, -blockH / 2, widest + 88, blockH, 34);
  ctx.fillStyle = st.accent; ctx.fill();
  ctx.fillStyle = st.accentText;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, 0, -blockH / 2 + 28 + lh * i + lh / 2));
  ctx.restore();

  // Chamada final com seta animada
  if (last) {
    const bounce = Math.sin(t * 8) * 14;
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 140px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('↓', VW / 2, 1660 + bounce);
  }

  // Identificação de publicidade / IA
  ctx.font = '600 34px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(st.disclosure).width + 48;
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  roundRect(ctx, (VW - tw) / 2, 1488, tw, 60, 30); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(st.disclosure, VW / 2, 1518);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  // Barra de progresso discreta
  const total = briefDuration(b);
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, VH - 10, VW, 10);
  ctx.fillStyle = st.accent; ctx.fillRect(0, VH - 10, VW * Math.min(1, t / total), 10);
}

/**
 * Grava o vídeo em tempo real (30 fps). A aba precisa ficar visível durante a gravação,
 * pois o navegador pausa animações em abas ocultas.
 */
export async function renderBriefVideo(b: TtsBrief, img: HTMLImageElement | null, onProgress?: (p: number) => void, st: VideoStyle = DEFAULT_STYLE): Promise<{ blob: Blob; ext: string; seconds: number }> {
  const vm = videoMime();
  if (!vm) throw new Error('Seu navegador não grava vídeo. Use Chrome ou Edge atualizados.');
  if (!b.scenes.length) throw new Error('O roteiro não tem cenas.');
  const seconds = briefDuration(b);
  const canvas = document.createElement('canvas');
  canvas.width = VW; canvas.height = VH;
  const ctx = canvas.getContext('2d')!;
  drawFrame(ctx, b, img, 0, st);
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: vm.mime, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(500);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const frame = () => {
      const el = (performance.now() - start) / 1000;
      drawFrame(ctx, b, img, Math.min(el, seconds - 0.001), st);
      onProgress?.(Math.min(1, el / seconds));
      if (el < seconds) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
  rec.stop();
  await done;
  stream.getTracks().forEach((tr) => tr.stop());
  return { blob: new Blob(chunks, { type: vm.mime.split(';')[0] }), ext: vm.ext, seconds };
}

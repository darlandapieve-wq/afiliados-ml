// Gerador de textos por modelos (gratuito, sem IA).
// Regra: nunca inventar preço, desconto, avaliação, estoque, frete ou urgência.
import { PLATFORMS, type PlatformCode, type LinkPlacement } from './platforms.ts';

export type Style = 'informativo' | 'promocional' | 'comparativo' | 'descontraido';

export interface ProductInput {
  title: string;
  price?: number | null;
  priceCheckedAt?: string | null;
  features?: string[];
  description?: string | null;
  category?: string | null;
  audience?: string | null;
  notes?: string | null;
}

export interface TextOptions {
  style: Style;
  showPrice: boolean;
  /** Link que vai no conteúdo: afiliado (direto) ou página intermediária. */
  link: string;
  seed?: string;
  handle?: string | null;
}

export interface GeneratedText {
  platform: PlatformCode;
  title: string;
  caption: string;
  hashtags: string[];
  linkPlacement: LinkPlacement;
  short: string;
  long: string;
  warnings: string[];
}

const OPENERS: Record<Style, string[]> = {
  informativo: ['Conheça o {t}.', 'Vale a pena conhecer: {t}.', 'Em destaque: {t}.'],
  promocional: ['Achado no Mercado Livre: {t}!', 'Olha que achado: {t}!', 'Recomendação da semana: {t}!'],
  comparativo: ['Procurando {cat}? Veja o {t}.', 'Comparando opções de {cat}? O {t} merece atenção.', 'Entre as opções de {cat}, confira o {t}.'],
  descontraido: ['Sabe aquele item que faz falta? {t} 😄', 'Para quem curte praticidade: {t} ✨', 'Esse aqui chamou minha atenção: {t} 👀'],
};

const CTAS: Record<Style, string[]> = {
  informativo: ['Veja todos os detalhes no Mercado Livre', 'Confira as especificações completas no Mercado Livre'],
  promocional: ['Confira as condições atuais no Mercado Livre', 'Veja o preço de hoje no Mercado Livre'],
  comparativo: ['Compare as especificações no Mercado Livre', 'Veja os detalhes e compare no Mercado Livre'],
  descontraido: ['Dá uma olhada no Mercado Livre', 'Corre lá conferir no Mercado Livre'],
};

const DISCLOSURE = 'Contém link de afiliado: posso receber comissão por compras feitas por ele, sem custo extra para você.';
const DISCLOSURE_SHORT = '#publi Link de afiliado.';

const STOP = new Set(['de','da','do','das','dos','para','com','sem','e','a','o','as','os','em','no','na','um','uma','kit','por','the','and','x','cm','mm','ml','kg','g','v','w']);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pick<T>(arr: T[], seed: string, salt: string): T { return arr[hash(seed + salt) % arr.length]; }

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function buildHashtags(p: ProductInput, max: number): string[] {
  if (max <= 0) return [];
  const words = stripAccents(`${p.category ?? ''} ${p.title}`).toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
  const uniq: string[] = [];
  for (const w of words) if (!uniq.includes(w)) uniq.push(w);
  const tags = uniq.slice(0, Math.max(0, max - 1)).map((w) => `#${w}`);
  tags.push('#achadosmercadolivre');
  return tags.slice(0, max);
}

export function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function priceLine(p: ProductInput, showPrice: boolean): { line: string | null; warning: string | null } {
  if (!showPrice) return { line: null, warning: null };
  if (p.price == null) return { line: null, warning: 'Preço não informado: a arte e o texto não exibirão valor.' };
  if (!p.priceCheckedAt) return { line: null, warning: 'Preço sem data de conferência: não será exibido.' };
  const d = new Date(p.priceCheckedAt);
  const when = d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  const ageH = (Date.now() - d.getTime()) / 36e5;
  return {
    line: `Preço visto em ${when}: ${formatBRL(p.price)} (sujeito a alteração).`,
    warning: ageH > 24 ? 'O preço foi conferido há mais de 24 h. Confira antes de publicar.' : 'Confira o preço no Mercado Livre antes de publicar.',
  };
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)).trimEnd() + '…';
}

const HASHTAG_MAX: Record<PlatformCode, number> = {
  instagram: 8, tiktok: 4, facebook: 3, pinterest: 2, youtube: 3, telegram: 2, whatsapp: 0,
};

export function generateText(platform: PlatformCode, p: ProductInput, o: TextOptions): GeneratedText {
  const cap = PLATFORMS[platform];
  const seed = `${o.seed ?? p.title}:${platform}`;
  const cat = p.category?.trim() || 'produtos';
  const t = p.title.trim();
  const opener = pick(OPENERS[o.style], seed, 'o').replace('{t}', t).replace('{cat}', cat.toLowerCase());
  const cta = pick(CTAS[o.style], seed, 'c');
  const feats = (p.features ?? []).map((f) => f.trim()).filter(Boolean).slice(0, 5);
  const { line: price, warning: priceWarn } = priceLine(p, o.showPrice);
  const warnings: string[] = [];
  if (priceWarn) warnings.push(priceWarn);
  const hashtags = buildHashtags(p, HASHTAG_MAX[platform]);
  if (platform === 'youtube' && !hashtags.includes('#shorts')) hashtags.unshift('#shorts');

  const bullets = feats.map((f) => `• ${f}`).join('\n');
  const audience = p.audience ? `Ideal para ${p.audience.trim().replace(/\.$/, '')}.` : '';
  const desc = p.description ? truncate(p.description.trim(), 280) : '';
  const placement = cap.linkPlacement;

  let linkLine: string;
  switch (placement) {
    case 'bio':
      linkLine = o.handle ? `🔗 Link na bio (${o.handle}).` : '🔗 Link na bio.';
      break;
    case 'button':
    case 'pin_link':
      linkLine = ''; // o link vai no botão / destino do Pin
      break;
    default:
      linkLine = `👉 ${cta}: ${o.link}`;
  }

  const short = [opener, price, linkLine || cta + '.', DISCLOSURE_SHORT].filter(Boolean).join('\n');
  const long = [opener, desc, bullets, audience, price, linkLine || cta + '.', '', DISCLOSURE].filter((x) => x !== null && x !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();

  let caption: string;
  let title = truncate(t, cap.limits.title ?? 100);
  switch (platform) {
    case 'whatsapp':
      caption = [`*${t}*`, feats.length ? bullets : desc, price, `👉 ${cta}: ${o.link}`, `_${DISCLOSURE}_`].filter(Boolean).join('\n\n');
      break;
    case 'telegram':
      caption = [`<b>${escapeHtml(t)}</b>`, escapeHtml(opener === t ? '' : opener), bullets && escapeHtml(bullets), price && escapeHtml(price), `<i>${escapeHtml(DISCLOSURE)}</i>`]
        .filter(Boolean).join('\n\n');
      break;
    case 'pinterest':
      title = truncate(`${t}`, 100);
      caption = [opener, feats.slice(0, 3).join(' · '), price, cta + '.', DISCLOSURE_SHORT, hashtags.join(' ')].filter(Boolean).join(' ');
      break;
    case 'tiktok':
      title = truncate(opener, 90);
      caption = [opener, feats.slice(0, 3).map((f) => `✔ ${f}`).join('\n'), price, linkLine, DISCLOSURE_SHORT, hashtags.join(' ')].filter(Boolean).join('\n');
      break;
    case 'youtube':
      title = truncate(`${t} ${hashtags.includes('#shorts') ? '#shorts' : ''}`.trim(), 100);
      caption = [long, '', 'Link do produto: veja na descrição do canal ou nos links do perfil.', hashtags.join(' ')].join('\n');
      break;
    case 'instagram':
      caption = [long, '', hashtags.join(' ')].join('\n');
      break;
    default: // facebook
      caption = [long, hashtags.join(' ')].filter(Boolean).join('\n\n');
  }

  caption = truncate(caption, cap.limits.caption);
  if (placement === 'bio') warnings.push(`No ${cap.name} o link na legenda não é clicável: atualize o link da bio ou use a página intermediária.`);
  return { platform, title, caption, hashtags, linkPlacement: placement, short, long, warnings };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Frases que indicam alegações proibidas sem confirmação. */
const RISKY = [/últimas unidades/i, /acaba hoje/i, /\bfrete gr[aá]tis\b/i, /\d+\s?% off/i, /\bdesconto\b/i, /mais vendido/i, /garantia de \d+/i, /estoque limitado/i];
export function riskyClaims(text: string): string[] {
  return RISKY.filter((r) => r.test(text)).map((r) => r.source.replace(/\\b|\\s\?|\\d\+|\[aá\]/g, ''));
}

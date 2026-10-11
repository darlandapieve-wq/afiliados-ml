// Regras para links do Mercado Livre e links de afiliado.
// Princípio: o link de afiliado é guardado EXATAMENTE como foi gerado no painel oficial.

const ML_HOSTS = [
  'mercadolivre.com.br', 'www.mercadolivre.com.br', 'produto.mercadolivre.com.br',
  'mercadolivre.com', 'www.mercadolivre.com', 'meli.la', 'lista.mercadolivre.com.br',
];

export interface LinkCheck {
  status: 'valid' | 'warning' | 'invalid';
  notes: string[];
  itemId: string | null;
}

/** Só remove espaços nas pontas — nunca reescreve parâmetros. */
export function cleanPasted(input: string): string {
  return input.trim();
}

export function parseUrl(input: string): URL | null {
  try {
    const u = new URL(cleanPasted(input));
    return u;
  } catch {
    return null;
  }
}

export function isMercadoLivreHost(host: string): boolean {
  const h = host.toLowerCase();
  return ML_HOSTS.includes(h) || h.endsWith('.mercadolivre.com.br');
}

/** Extrai o código do anúncio (ex.: MLB1234567890) de um URL comum. */
export function extractItemId(input: string): string | null {
  const m = cleanPasted(input).match(/\bMLB-?(\d{6,})/i);
  return m ? `MLB${m[1]}` : null;
}

/** Indícios de que o URL foi gerado pelo Programa de Afiliados. */
export function looksLikeAffiliate(u: URL): boolean {
  if (u.hostname === 'meli.la') return true;
  if (/^\/sec\//.test(u.pathname)) return true;
  const p = u.searchParams;
  return p.has('matt_tool') || p.has('matt_word') || p.has('matt_source');
}

export function checkOriginalUrl(input: string): LinkCheck {
  const notes: string[] = [];
  const u = parseUrl(input);
  if (!u) return { status: 'invalid', notes: ['URL inválido.'], itemId: null };
  if (u.protocol !== 'https:') return { status: 'invalid', notes: ['Use um endereço https.'], itemId: null };
  if (!isMercadoLivreHost(u.hostname)) return { status: 'invalid', notes: ['O endereço não é do Mercado Livre.'], itemId: null };
  const itemId = extractItemId(input);
  if (!itemId) notes.push('Não encontrei o código do anúncio (MLB...). Preencha os dados manualmente.');
  if (u.pathname === '/' || u.pathname === '') {
    return { status: 'invalid', notes: ['A página inicial do Mercado Livre não é elegível para links de afiliado.'], itemId };
  }
  return { status: notes.length ? 'warning' : 'valid', notes, itemId };
}

export function checkAffiliateUrl(input: string, originalUrl?: string | null): LinkCheck {
  const notes: string[] = [];
  const u = parseUrl(input);
  if (!u) return { status: 'invalid', notes: ['URL inválido.'], itemId: null };
  if (u.protocol !== 'https:') return { status: 'invalid', notes: ['O link de afiliado deve usar https.'], itemId: null };
  if (!isMercadoLivreHost(u.hostname)) {
    return { status: 'invalid', notes: ['O link de afiliado deve ser um endereço do Mercado Livre (não use encurtadores de terceiros).'], itemId: null };
  }
  if (originalUrl && cleanPasted(originalUrl) === cleanPasted(input) && !looksLikeAffiliate(u)) {
    return { status: 'invalid', notes: ['Este é o link comum do produto, não um link de afiliado. Gere o link no painel de afiliados.'], itemId: null };
  }
  if (!looksLikeAffiliate(u)) {
    notes.push('Não identifiquei marcas de link de afiliado (ex.: /sec/, matt_tool). Confira se ele foi gerado no "Gerador de links".');
  }
  return { status: notes.length ? 'warning' : 'valid', notes, itemId: extractItemId(input) };
}

/** Garante que o link usado em uma publicação é idêntico ao cadastrado. */
export function isSameLink(saved: string, used: string): boolean {
  return saved === used;
}

/** Hosts autorizados para buscas externas pelo backend (proteção contra SSRF). */
const FETCH_ALLOW = ['api.mercadolibre.com', 'http2.mlstatic.com'];
export function isAllowedFetch(url: string): boolean {
  const u = parseUrl(url);
  if (!u || u.protocol !== 'https:' || u.port || u.username || u.password) return false;
  return FETCH_ALLOW.includes(u.hostname.toLowerCase());
}

export function landingUrl(appUrl: string, slug: string, platform?: string): string {
  const base = appUrl.replace(/\/+$/, '');
  return `${base}/p/${encodeURIComponent(slug)}${platform ? `?via=${encodeURIComponent(platform)}` : ''}`;
}

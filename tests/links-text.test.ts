import { describe, it, expect } from 'vitest';
import { checkAffiliateUrl, checkOriginalUrl, extractItemId, isAllowedFetch, cleanPasted, landingUrl } from '../supabase/functions/_shared/links.ts';
import { generateText, riskyClaims, priceLine } from '../supabase/functions/_shared/text.ts';
import { PLATFORMS, PLATFORM_ORDER, LINK_PLACEMENT_LABEL } from '../supabase/functions/_shared/platforms.ts';
import { importKey, encrypt, decrypt, redact } from '../supabase/functions/_shared/crypto.ts';

const AFF = 'https://mercadolivre.com/sec/1aB2cD3?matt_tool=12345678&matt_word=darlan&forceInApp=true';

describe('links de afiliado', () => {
  it('preserva o link exatamente (apenas remove espaços nas pontas)', () => {
    expect(cleanPasted(`  ${AFF}\n`)).toBe(AFF);
  });
  it('aceita link de afiliado com marcas do programa', () => {
    expect(checkAffiliateUrl(AFF).status).toBe('valid');
  });
  it('recusa link comum usado como afiliado', () => {
    const orig = 'https://produto.mercadolivre.com.br/MLB-1234567890-fone-bluetooth-_JM';
    expect(checkAffiliateUrl(orig, orig).status).toBe('invalid');
  });
  it('alerta quando não há marcas de afiliado', () => {
    expect(checkAffiliateUrl('https://www.mercadolivre.com.br/fone/p/MLB123456789').status).toBe('warning');
  });
  it('recusa encurtadores de terceiros e http', () => {
    expect(checkAffiliateUrl('https://bit.ly/abc').status).toBe('invalid');
    expect(checkAffiliateUrl('http://mercadolivre.com/sec/abc').status).toBe('invalid');
  });
  it('extrai o código do anúncio', () => {
    expect(extractItemId('https://produto.mercadolivre.com.br/MLB-1234567890-fone')).toBe('MLB1234567890');
    expect(checkOriginalUrl('https://www.mercadolivre.com.br/').status).toBe('invalid');
  });
  it('bloqueia SSRF em buscas externas', () => {
    expect(isAllowedFetch('https://api.mercadolibre.com/items/MLB1')).toBe(true);
    expect(isAllowedFetch('http://169.254.169.254/latest')).toBe(false);
    expect(isAllowedFetch('https://api.mercadolibre.com:8443/x')).toBe(false);
    expect(isAllowedFetch('https://evil.com/?h=api.mercadolibre.com')).toBe(false);
  });
  it('monta a página intermediária sem tocar no link', () => {
    expect(landingUrl('https://app.example.com/', 'abc', 'instagram')).toBe('https://app.example.com/p/abc?via=instagram');
  });
});

describe('gerador de textos', () => {
  const product = { title: 'Fone Bluetooth XYZ', features: ['Bateria de 30 h', 'Cancelamento de ruído'], category: 'Áudio', price: 199.9, priceCheckedAt: new Date().toISOString() };

  it('gera versões diferentes para cada rede', () => {
    const caps = PLATFORM_ORDER.map((p) => generateText(p, product, { style: 'informativo', showPrice: false, link: AFF, seed: 'c1' }).caption);
    expect(new Set(caps).size).toBe(caps.length);
  });
  it('respeita limites de caracteres', () => {
    const long = { ...product, description: 'x'.repeat(10000), features: Array(5).fill('y'.repeat(300)) };
    for (const p of PLATFORM_ORDER) {
      const g = generateText(p, long, { style: 'promocional', showPrice: false, link: AFF });
      expect(g.caption.length).toBeLessThanOrEqual(PLATFORMS[p].limits.caption);
    }
  });
  it('não exibe preço sem pedido ou sem data de conferência', () => {
    expect(generateText('facebook', product, { style: 'informativo', showPrice: false, link: AFF }).caption).not.toMatch(/R\$/);
    expect(priceLine({ ...product, priceCheckedAt: null }, true).line).toBeNull();
    const g = generateText('facebook', product, { style: 'informativo', showPrice: true, link: AFF });
    expect(g.caption).toMatch(/Preço visto em/);
    expect(g.warnings.join(' ')).toMatch(/Confira o preço/);
  });
  it('não inventa urgência, desconto ou frete', () => {
    for (const style of ['informativo', 'promocional', 'comparativo', 'descontraido'] as const) {
      for (const p of PLATFORM_ORDER) {
        const g = generateText(p, product, { style, showPrice: false, link: AFF });
        expect(riskyClaims(g.caption)).toEqual([]);
      }
    }
  });
  it('distingue link clicável de link apenas no texto', () => {
    const ig = generateText('instagram', product, { style: 'informativo', showPrice: false, link: AFF });
    expect(LINK_PLACEMENT_LABEL[ig.linkPlacement].clickable).toBe(false);
    expect(ig.caption).not.toContain(AFF);           // não coloca URL não clicável na legenda
    expect(ig.caption).toMatch(/link na bio/i);
    const fb = generateText('facebook', product, { style: 'informativo', showPrice: false, link: AFF });
    expect(LINK_PLACEMENT_LABEL[fb.linkPlacement].clickable).toBe(true);
    expect(fb.caption).toContain(AFF);               // link idêntico, sem alteração
  });
  it('sempre identifica conteúdo de afiliado', () => {
    for (const p of PLATFORM_ORDER) {
      expect(generateText(p, product, { style: 'descontraido', showPrice: false, link: AFF }).caption).toMatch(/afiliado|#publi/i);
    }
  });
});

describe('criptografia de tokens', () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));
  it('cifra e decifra', async () => {
    const k = await importKey(key);
    const c = await encrypt(k, 'segredo-123');
    expect(c).not.toContain('segredo');
    expect(await decrypt(k, c)).toBe('segredo-123');
  });
  it('remove segredos de logs', () => {
    const s = redact('erro em https://api.telegram.org/bot123:ABC_def/sendPhoto?access_token=xyz Bearer abc.def');
    expect(s).not.toMatch(/ABC_def|xyz|abc\.def/);
  });
});

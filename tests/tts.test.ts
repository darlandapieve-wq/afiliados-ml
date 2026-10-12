import { describe, it, expect } from 'vitest';
import {
  generateBrief, normalizeBrief, complianceIssues, briefIssues, timeline, notePoints, ttsHashtags,
  parseJsonLoose, anchorDaysLeft, aiBriefPrompt, type TtsInput,
} from '../supabase/functions/_shared/tts.ts';

const base: TtsInput = {
  productName: 'Politriz orbital 600 W', productUrl: 'https://shop.tiktok.com/view/product/123',
  notes: 'Remove riscos leves da pintura\nNão queima o verniz\nVem com 3 boinas', format: 'demo', goal: 'venda', durationS: 35, hasImage: true, seed: 'x',
};

describe('linha do tempo', () => {
  for (const d of [15, 30, 35, 45, 60]) {
    it(`cobre ${d} s sem buracos, com gancho de 3 s e CTA nos 4 s finais`, () => {
      const t = timeline(d);
      expect(t[0]).toMatchObject({ start: 0, end: 3, key: 'hook' });
      expect(t[t.length - 1]).toMatchObject({ start: d - 4, end: d, key: 'cta' });
      for (let i = 1; i < t.length; i++) { expect(t[i].start).toBe(t[i - 1].end); expect(t[i].end).toBeGreaterThan(t[i].start); }
    });
  }
  it('limita a duração entre 15 e 60 s', () => {
    expect(timeline(5).at(-1)!.end).toBe(15);
    expect(timeline(120).at(-1)!.end).toBe(60);
  });
});

describe('briefing por modelos', () => {
  const b = generateBrief(base);
  it('gera 3 ganchos, 6 cenas e legenda com rótulo de IA', () => {
    expect(b.hooks).toHaveLength(3);
    expect(b.scenes).toHaveLength(6);
    expect(b.caption).toMatch(/Conteúdo criado com IA/);
    expect(b.caption.length).toBeLessThanOrEqual(2200);
  });
  it('usa os comentários do usuário na narração', () => {
    const all = b.scenes.map((s) => s.narration).join(' ');
    expect(all).toMatch(/riscos leves/i);
    expect(all).toMatch(/verniz/i);
  });
  it('prompts de imagem em inglês e verticais', () => {
    for (const s of b.scenes) expect(s.prompt).toMatch(/--ar 9:16/);
  });
  it('prompt do Pippit inclui link, regras e roteiro', () => {
    expect(b.pippitPrompt).toContain(base.productUrl!);
    expect(b.pippitPrompt).toMatch(/3ª pessoa/);
    expect(b.pippitPrompt).toMatch(/Não invente preço/);
  });
  it('não gera alertas de conformidade por conta própria', () => {
    expect(briefIssues(b)).toEqual([]);
  });
  it('máximo de 5 hashtags, incluindo #tiktokshop', () => {
    expect(b.hashtags.length).toBeLessThanOrEqual(5);
    expect(b.hashtags).toContain('#tiktokshop');
  });
  it('CTA de seguidores não pede clique no produto', () => {
    const s = generateBrief({ ...base, goal: 'seguidores' });
    expect(s.cta).toMatch(/segue/i);
    expect(s.scenes.at(-1)!.onscreen).toMatch(/PARTE 2/);
  });
  it('é determinístico com a mesma semente', () => {
    expect(generateBrief(base)).toEqual(generateBrief(base));
  });
  it('avisa quando não há comentários nem imagens', () => {
    const s = generateBrief({ ...base, notes: '', productUrl: null, hasImage: false });
    expect(s.warnings.join(' ')).toMatch(/Sem comentários/);
    expect(s.warnings.join(' ')).toMatch(/sem foto nem link/);
  });
  it('funciona em todos os formatos', () => {
    for (const format of ['demo', 'problema', 'curiosidade', 'explica', 'comparativo'] as const) {
      const s = generateBrief({ ...base, format });
      expect(s.scenes.every((x) => x.narration.length > 5)).toBe(true);
      expect(briefIssues(s)).toEqual([]);
    }
  });
});

describe('conformidade', () => {
  it('detecta depoimento falso em 1ª pessoa', () => {
    expect(complianceIssues('Eu usei no meu carro e amei').join(' ')).toMatch(/depoimento/i);
    expect(complianceIssues('Comprei e recomendo').join(' ')).toMatch(/depoimento/i);
  });
  it('detecta promessas absolutas e alegações não verificadas', () => {
    expect(complianceIssues('Resultado garantido, dura a vida toda').join(' ')).toMatch(/absoluta/);
    expect(complianceIssues('50% off só hoje, últimas unidades').join(' ')).toMatch(/exige confirmação/);
  });
  it('aceita narração de apresentador', () => {
    expect(complianceIssues('Esta politriz remove riscos leves sem queimar o verniz.')).toEqual([]);
  });
});

describe('resposta da IA', () => {
  const tpl = generateBrief(base);
  it('lê JSON com cercas de markdown', () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Aqui está: {"a":2} fim')).toEqual({ a: 2 });
    expect(parseJsonLoose('nada')).toBeNull();
  });
  it('completa campos ausentes com o modelo e aplica o filtro', () => {
    const b = normalizeBrief({ hooks: ['Um', 'Dois'], caption: 'Eu comprei e amei', hashtags: ['carro', '#oficina', 'dica rapida', 'polimento', 'auto', 'extra', 'x'] }, tpl);
    expect(b.scenes).toEqual(tpl.scenes);
    expect(b.hashtags).toEqual(['#carro', '#oficina', '#dicarapida', '#polimento', '#auto']);
    expect(b.caption).toMatch(/Conteúdo criado com IA/);
    expect(b.warnings.join(' ')).toMatch(/depoimento/i);
    expect(b.pippitSteps).toEqual(tpl.pippitSteps);
  });
  it('descarta cenas inválidas', () => {
    const b = normalizeBrief({ scenes: [{ start: 0, end: 3, narration: 'ok' }, { start: 5, end: 2, narration: 'x' }] }, tpl);
    expect(b.scenes).toEqual(tpl.scenes); // menos de 3 cenas válidas → usa o modelo
  });
  it('o prompt da IA proíbe depoimento e invenção de preço', () => {
    const p = aiBriefPrompt(base, tpl);
    expect(p).toMatch(/Nunca depoimento/);
    expect(p).toMatch(/Não invente preço/);
    expect(p).toMatch(/JSON/);
  });
});

describe('utilidades', () => {
  it('separa comentários em pontos', () => {
    expect(notePoints('- Leve\n• Silenciosa; Bivolt')).toEqual(['Leve', 'Silenciosa', 'Bivolt']);
  });
  it('hashtags sem acentos e sem repetição', () => {
    const h = ttsHashtags('Chave de fenda elétrica', 'curiosidade');
    expect(h.every((x) => /^#[a-z0-9]+$/.test(x))).toBe(true);
    expect(new Set(h).size).toBe(h.length);
  });
  it('dias restantes da sacolinha', () => {
    const now = Date.parse('2026-10-12T12:00:00Z');
    expect(anchorDaysLeft('2026-10-20T12:00:00Z', now)).toBe(8);
    expect(anchorDaysLeft(null, now)).toBeNull();
  });
});

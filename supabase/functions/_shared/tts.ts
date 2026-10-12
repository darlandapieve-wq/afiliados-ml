// Módulo TikTok Shop: briefing de criativo para o Pippit (gratuito, por modelos).
// Compartilhado entre o frontend e a Edge Function (a IA usa este formato e este filtro).
// Regras: apresentador (nunca depoimento inventado), sem preço/desconto/avaliação inventados,
// rótulo de conteúdo gerado por IA sempre ligado, produto real na tela no vídeo de venda.
import { riskyClaims, stripAccents } from './text.ts';

export type TtsFormat = 'demo' | 'problema' | 'curiosidade' | 'explica' | 'comparativo';
export type TtsGoal = 'venda' | 'seguidores';

export const TTS_FORMATS: { v: TtsFormat; l: string; hint: string }[] = [
  { v: 'demo', l: 'Demonstração', hint: 'Mostra o produto funcionando. Melhor para vender.' },
  { v: 'problema', l: 'Problema → solução', hint: 'Começa pela dor e revela o produto como saída.' },
  { v: 'curiosidade', l: 'Você não sabia que existia', hint: 'Revelação curiosa. Ótimo para alcance.' },
  { v: 'explica', l: 'Especialista explica', hint: 'Dúvida comum respondida em 30 s. Gera seguidores.' },
  { v: 'comparativo', l: 'Jeito antigo × jeito novo', hint: 'Contraste visual antes/depois do método.' },
];

export const TTS_STATUS: Record<string, { label: string; tone: 'gray' | 'blue' | 'green' | 'red' | 'amber' | 'violet' }> = {
  draft: { label: 'Rascunho', tone: 'gray' },
  brief_ready: { label: 'Briefing pronto', tone: 'blue' },
  video_ready: { label: 'Vídeo pronto', tone: 'violet' },
  scheduled: { label: 'Agendado no Pippit', tone: 'blue' },
  posting: { label: 'Enviando ao TikTok', tone: 'violet' },
  published: { label: 'Publicado', tone: 'green' },
  anchor_added: { label: 'Sacolinha adicionada', tone: 'green' },
  archived: { label: 'Arquivado', tone: 'gray' },
};

export const TTS_PIPELINE = ['draft', 'brief_ready', 'video_ready', 'scheduled', 'published', 'anchor_added'] as const;

export interface TtsInput {
  productName: string;
  productUrl?: string | null;
  notes?: string | null;
  format: TtsFormat;
  goal: TtsGoal;
  durationS: number;
  hasImage?: boolean;
  seed?: string;
}

export interface TtsScene {
  start: number;
  end: number;
  label: string;
  visual: string;
  prompt: string;      // prompt de imagem/vídeo em inglês (Midjourney, Leonardo, Kling, Pippit)
  narration: string;   // locução em pt-BR
  onscreen: string;    // texto na tela
}

export interface TtsBrief {
  hooks: string[];
  scenes: TtsScene[];
  caption: string;
  hashtags: string[];
  cta: string;
  pippitPrompt: string;
  pippitSteps: string[];
  warnings: string[];
}

const CAPTION_MAX = 2200;
const HASHTAG_MAX = 5;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pick<T>(arr: T[], seed: string, salt: string): T { return arr[hash(seed + salt) % arr.length]; }

/** Separa os comentários do usuário em pontos curtos (linhas, "•", "-", ";" ou frases). */
export function notePoints(notes?: string | null, max = 4): string[] {
  if (!notes) return [];
  return notes
    .split(/\n|;|•|(?:^|\s)-\s|\.\s+/)
    .map((s) => s.replace(/^[\s\-–•*]+/, '').trim().replace(/\.$/, ''))
    .filter((s) => s.length >= 3 && s.length <= 140)
    .slice(0, max);
}

export function ttsHashtags(name: string, format: TtsFormat, notes?: string | null): string[] {
  const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'com', 'sem', 'e', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'um', 'uma', 'kit', 'por', 'pra', 'cm', 'mm', 'ml', 'kg', 'pcs', 'pecas', 'unidades']);
  const words = stripAccents(`${name} ${notes ?? ''}`).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w) && !/^\d+$/.test(w));
  const uniq = [...new Set(words)].slice(0, 2).map((w) => `#${w}`);
  const extra = format === 'explica' ? '#dicas' : format === 'curiosidade' ? '#achadinhos' : '#achadinhos';
  return [...new Set([...uniq, extra, '#tiktokshop', '#tiktokmefezcomprar'])].slice(0, HASHTAG_MAX);
}

/** Problemas de conformidade: alegações não verificadas, depoimento inventado e promessas absolutas. */
const TESTIMONIAL = [/\beu (uso|usei|comprei|testei|recomendo|amei|aprovo)\b/i, /\bcomprei\b/i, /\btestei\b/i, /\bminha experi[eê]ncia\b/i, /\buso h[aá]\b/i, /\bmudou minha vida\b/i, /\bno meu carro\b/i, /\bna minha casa\b/i];
const ABSOLUTE = [/100\s?% garantid/i, /nunca (quebra|falha|estraga)/i, /para sempre/i, /dura a vida toda/i, /\bcura\b/i, /melhor do (mundo|brasil|mercado)/i, /resultado garantido/i, /sem nenhum risco/i];

export function complianceIssues(text: string): string[] {
  const out: string[] = [];
  const risky = riskyClaims(text);
  if (risky.length) out.push(`Alegação que exige confirmação: ${risky.join(', ')}.`);
  if (TESTIMONIAL.some((r) => r.test(text))) out.push('Parece depoimento em 1ª pessoa. Com voz/avatar de IA isso é depoimento falso: use narração de apresentador ("este produto faz…").');
  if (ABSOLUTE.some((r) => r.test(text))) out.push('Promessa absoluta (garantido, nunca quebra, para sempre…). Troque por algo verificável.');
  return out;
}

export function briefIssues(b: TtsBrief): string[] {
  const all = [b.caption, b.cta, ...b.hooks, ...b.scenes.map((s) => `${s.narration} ${s.onscreen}`)].join('\n');
  const out = complianceIssues(all);
  if (b.hashtags.length > HASHTAG_MAX) out.push(`Use no máximo ${HASHTAG_MAX} hashtags.`);
  if (b.caption.length > CAPTION_MAX) out.push(`Legenda acima de ${CAPTION_MAX} caracteres.`);
  return [...new Set(out)];
}

/** Divide a duração em blocos: gancho 0–3 s, CTA nos 4 s finais, miolo proporcional. */
export function timeline(durationS: number): { start: number; end: number; key: 'hook' | 'problem' | 'reveal' | 'demo' | 'benefit' | 'cta' }[] {
  const d = Math.min(60, Math.max(15, Math.round(durationS)));
  const ctaStart = d - 4;
  const mid = ctaStart - 3;
  const w = { problem: 0.22, reveal: 0.22, demo: 0.34, benefit: 0.22 };
  const cuts: number[] = [3];
  let acc = 3;
  for (const k of ['problem', 'reveal', 'demo'] as const) { acc += Math.round(mid * w[k]); cuts.push(acc); }
  cuts.push(ctaStart);
  const keys = ['problem', 'reveal', 'demo', 'benefit'] as const;
  return [
    { start: 0, end: 3, key: 'hook' },
    ...keys.map((k, i) => ({ start: cuts[i], end: cuts[i + 1], key: k })),
    { start: ctaStart, end: d, key: 'cta' },
  ];
}

const LABEL: Record<string, string> = { hook: 'Gancho', problem: 'Problema', reveal: 'Revelação', demo: 'Demonstração', benefit: 'Benefício', cta: 'Chamada para ação' };

export function generateBrief(i: TtsInput): TtsBrief {
  const name = i.productName.trim();
  const seed = `${i.seed ?? name}:${i.format}:${i.goal}`;
  const pts = notePoints(i.notes);
  const p1 = pts[0] ?? 'resolve o problema em poucos segundos';
  const p2 = pts[1] ?? 'é simples de usar, sem experiência';
  const p3 = pts[2] ?? 'ocupa pouco espaço e vai para qualquer lugar';
  const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

  const hooksByFormat: Record<TtsFormat, string[]> = {
    demo: [`Olha o que o ${name} faz em 5 segundos.`, `Isso aqui parece truque, mas é o ${name}.`, `Ninguém te mostrou o ${name} funcionando assim.`],
    problema: ['Você ainda perde tempo com isso?', 'Esse erro acontece com quase todo mundo.', 'Se isso já te irritou, assiste até o fim.'],
    curiosidade: ['Você não sabia que isso existia.', 'Essa é a ferramenta mais subestimada que existe.', 'Poucas pessoas conhecem este truque.'],
    explica: ['Vale a pena ter um desses? Eu explico em 30 segundos.', `Para que serve o ${name}? Resposta rápida.`, 'A pergunta que mais aparece nos comentários.'],
    comparativo: ['Jeito antigo ou jeito novo? Olha a diferença.', 'Do lado esquerdo, o jeito difícil. Do direito…', 'A diferença é tão grande que parece edição.'],
  };
  const hooks = [...hooksByFormat[i.format]];
  hooks.unshift(hooks.splice(hash(seed) % hooks.length, 1)[0]);

  const ctaVenda = pick(['Toque no link do produto aqui embaixo para ver os detalhes.', 'O link do produto está aqui embaixo: confira o preço atual na loja.', 'Detalhes e preço atual no link do produto, aqui embaixo.'], seed, 'cta');
  const ctaSeg = pick(['Segue o perfil: amanhã sai a parte 2.', 'Segue para ver mais achados como este.', 'Salva este vídeo e segue para a parte 2.'], seed, 'cta');
  const cta = i.goal === 'venda' ? ctaVenda : ctaSeg;

  const n: Record<string, string> = {
    hook: hooks[0],
    problem: i.format === 'explica'
      ? `Muita gente pergunta se o ${name} realmente ajuda no dia a dia.`
      : i.format === 'comparativo'
        ? 'Do jeito tradicional, leva tempo, dá trabalho e o resultado nem sempre fica bom.'
        : 'Do jeito tradicional, isso toma tempo e dá trabalho.',
    reveal: `É aqui que entra o ${name}.`,
    demo: `Ele ${lc(p1)}.${pts[1] ? ` E ${lc(p2)}.` : ''}`,
    benefit: `${p2.charAt(0).toUpperCase() + p2.slice(1)}${pts[2] ? `, e ${lc(p3)}` : ''}.`,
    cta,
  };
  const onscreen: Record<string, string> = {
    hook: hooks[0].replace(/\.$/, '').toUpperCase().slice(0, 48),
    problem: i.format === 'comparativo' ? 'JEITO ANTIGO' : 'O PROBLEMA',
    reveal: name.toUpperCase().slice(0, 40),
    demo: p1.toUpperCase().slice(0, 44),
    benefit: p2.toUpperCase().slice(0, 44),
    cta: i.goal === 'venda' ? '👇 LINK DO PRODUTO' : 'SEGUE PARA A PARTE 2',
  };
  const productShot = i.hasImage || i.productUrl ? 'imagens reais do produto (foto enviada / anúncio da loja)' : 'produto em destaque';
  const visual: Record<string, string> = {
    hook: `Close extremo e dinâmico do ${name} em ação, corte rápido.`,
    problem: i.format === 'comparativo' ? 'Tela dividida: lado esquerdo com o método tradicional, lento e difícil.' : 'Pessoa (mãos, sem rosto) frustrada com o método tradicional.',
    reveal: `Entrada do ${name} em destaque, fundo limpo — ${productShot}.`,
    demo: `${name} sendo usado passo a passo, mãos em primeiro plano — ${productShot}.`,
    benefit: 'Resultado final em detalhe, câmera lenta, luz suave.',
    cta: i.goal === 'venda' ? `${name} centralizado com seta apontando para baixo (link do produto).` : 'Tela final com a pergunta da parte 2 e convite para seguir.',
  };
  const en = name.replace(/"/g, '');
  const prompt: Record<string, string> = {
    hook: `extreme close-up of "${en}" in action, dynamic motion, dramatic lighting, hyperrealistic product shot, vertical 9:16 --ar 9:16 --style raw`,
    problem: 'frustrated person hands struggling with the old manual method, no face visible, cluttered workspace, cinematic lighting, shallow depth of field, photorealistic --ar 9:16',
    reveal: `"${en}" hero product shot on clean studio background, soft rim light, ultra detailed, commercial photography, vertical --ar 9:16`,
    demo: `hands using "${en}" step by step, top-down view, clean workspace, natural light, photorealistic, vertical 9:16 --ar 9:16`,
    benefit: 'satisfying finished result close-up, slow motion feel, soft golden light, ultra detailed, vertical --ar 9:16',
    cta: `"${en}" centered on minimal background, empty space at bottom for text, studio lighting, vertical 9:16 --ar 9:16`,
  };

  const scenes: TtsScene[] = timeline(i.durationS).map((t) => ({
    start: t.start, end: t.end, label: LABEL[t.key],
    visual: visual[t.key], prompt: prompt[t.key], narration: n[t.key], onscreen: onscreen[t.key],
  }));

  const hashtags = ttsHashtags(name, i.format, i.notes);
  const benefitLines = [p1, p2, p3].slice(0, Math.max(2, Math.min(3, pts.length || 2))).map((p) => `✔ ${p.charAt(0).toUpperCase() + p.slice(1)}`);
  const question = pick(['Você já conhecia?', 'Você usaria?', 'Conta aqui: já passou por isso?'], seed, 'q');
  const caption = [hooks[0], ...benefitLines, i.goal === 'venda' ? '👇 Link do produto no vídeo.' : '➕ Segue para a parte 2.', question, '#publi Conteúdo criado com IA.', hashtags.join(' ')].join('\n');

  const narrationAll = scenes.map((s) => s.narration).join(' ');
  const pippitPrompt = [
    `Crie um vídeo vertical 9:16 de ${scenes[scenes.length - 1].end} segundos, em português do Brasil, para o TikTok Shop.`,
    `Produto: ${name}.${i.productUrl ? ` Link do produto: ${i.productUrl}` : ''}`,
    'Use somente as imagens reais do produto (do link ou enviadas). Não gere outra versão do produto.',
    'Narração de apresentador, em 3ª pessoa. Não faça depoimento ("eu usei", "comprei").',
    'Não invente preço, desconto, avaliações, número de vendas, frete ou garantia.',
    'Legendas grandes na tela, cortes a cada 2–3 segundos, gancho forte nos 3 primeiros segundos.',
    `Roteiro: ${narrationAll}`,
  ].join('\n');

  const pippitSteps = [
    'Abra o Pippit → Video generator.',
    i.productUrl ? 'Cole o link do produto (ou envie a foto) e o texto "Prompt para o Pippit".' : 'Envie a foto do produto e cole o texto "Prompt para o Pippit".',
    'Escolha um avatar ou só narração, em português do Brasil, e gere as variações.',
    'Revise: produto real na tela, sem preço ou promessas inventadas, legenda correta.',
    'Publisher → TikTok → adicione o link do produto do TikTok Shop (sacolinha) e agende.',
    'Ao publicar, ative "Conteúdo gerado por IA". Volte aqui e marque como agendado/publicado.',
  ];

  const warnings: string[] = [];
  if (!pts.length) warnings.push('Sem comentários adicionais: o roteiro usa benefícios genéricos. Descreva o que o produto faz para um roteiro melhor.');
  if (i.goal === 'venda' && !i.productUrl && !i.hasImage) warnings.push('Vídeo de venda sem foto nem link: o Pippit não terá imagens reais do produto.');
  const brief: TtsBrief = { hooks, scenes, caption: caption.slice(0, CAPTION_MAX), hashtags, cta, pippitPrompt, pippitSteps, warnings };
  brief.warnings.push(...briefIssues(brief));
  return brief;
}

/** Valida e completa um briefing vindo da IA usando o modelo como base. */
export function normalizeBrief(raw: any, base: TtsBrief): TtsBrief {
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const hooks = Array.isArray(raw?.hooks) ? raw.hooks.map((h: unknown) => str(h, 160)).filter(Boolean).slice(0, 5) : [];
  const scenes: TtsScene[] = Array.isArray(raw?.scenes) ? raw.scenes.slice(0, 12).map((s: any, idx: number) => ({
    start: Number.isFinite(+s?.start) ? Math.max(0, Math.round(+s.start)) : (base.scenes[idx]?.start ?? 0),
    end: Number.isFinite(+s?.end) ? Math.max(1, Math.round(+s.end)) : (base.scenes[idx]?.end ?? 3),
    label: str(s?.label, 40) || base.scenes[idx]?.label || `Cena ${idx + 1}`,
    visual: str(s?.visual, 400),
    prompt: str(s?.prompt, 600),
    narration: str(s?.narration, 400),
    onscreen: str(s?.onscreen, 80),
  })).filter((s: TtsScene) => s.narration && s.end > s.start) : [];
  const hashtags = Array.isArray(raw?.hashtags)
    ? [...new Set(raw.hashtags.map((h: unknown) => str(h, 40).replace(/^#?/, '#').replace(/\s+/g, '')).filter((h: string) => h.length > 2))].slice(0, HASHTAG_MAX) as string[]
    : [];
  let caption = str(raw?.caption, CAPTION_MAX);
  if (caption && !/conte[uú]do (criado|gerado) com ia/i.test(caption)) caption = `${caption}\n#publi Conteúdo criado com IA.`.slice(0, CAPTION_MAX);
  const b: TtsBrief = {
    hooks: hooks.length >= 2 ? hooks : base.hooks,
    scenes: scenes.length >= 3 ? scenes : base.scenes,
    caption: caption || base.caption,
    hashtags: hashtags.length ? hashtags : base.hashtags,
    cta: str(raw?.cta, 200) || base.cta,
    pippitPrompt: str(raw?.pippitPrompt, 3000) || base.pippitPrompt,
    pippitSteps: base.pippitSteps,
    warnings: [],
  };
  b.warnings = briefIssues(b);
  return b;
}

/** Prompt para a IA gerar o briefing em JSON (usado pela Edge Function). */
export function aiBriefPrompt(i: TtsInput, base: TtsBrief): string {
  const fmt = TTS_FORMATS.find((f) => f.v === i.format)!;
  return `Você é estrategista de vídeos curtos para afiliados do TikTok Shop Brasil.
Crie o briefing de um vídeo vertical de ${i.durationS} segundos, 100% gerado por IA, que será montado no Pippit.
Produto: ${i.productName}
${i.productUrl ? `Link do produto: ${i.productUrl}\n` : ''}Formato: ${fmt.l} (${fmt.hint})
Objetivo: ${i.goal === 'venda' ? 'vender (o vídeo terá o link do produto / sacolinha)' : 'ganhar seguidores (sem link de produto)'}
Comentários do afiliado: ${(i.notes ?? '').slice(0, 2000) || '(nenhum)'}
${i.hasImage ? 'Há uma foto real do produto anexada: descreva o produto a partir dela, sem inventar recursos que não aparecem.\n' : ''}
Regras obrigatórias:
- Narração em português do Brasil, voz de APRESENTADOR em 3ª pessoa. Nunca depoimento ("eu usei", "comprei", "no meu carro").
- Não invente preço, desconto, avaliações, número de vendas, estoque, frete, garantia ou prazos. Sem urgência falsa.
- Sem promessas absolutas ("garantido", "nunca quebra", "para sempre").
- Use somente recursos que constam nos comentários ou na foto.
- Gancho forte nos 3 primeiros segundos; cenas de 2 a 8 segundos; a última cena é a chamada para ação.
- "prompt" de cada cena em INGLÊS, otimizado para Midjourney/Leonardo/Kling, sempre vertical 9:16.
- Legenda com no máximo 5 hashtags, uma pergunta para gerar comentários e terminando com "#publi Conteúdo criado com IA."
Responda SOMENTE com JSON válido neste formato (sem comentários, sem markdown):
{"hooks":["3 ganchos"],"scenes":[{"start":0,"end":3,"label":"Gancho","visual":"descrição visual em pt-BR","prompt":"english prompt --ar 9:16","narration":"locução","onscreen":"TEXTO NA TELA"}],"caption":"legenda","hashtags":["#tag"],"cta":"chamada final","pippitPrompt":"instruções completas para colar no Pippit, incluindo o roteiro"}
Exemplo de estrutura (melhore, não copie): ${JSON.stringify({ hooks: base.hooks, scenes: base.scenes.slice(0, 2), cta: base.cta }).slice(0, 1500)}`;
}

/** Extrai o primeiro objeto JSON de uma resposta (tolerante a ```json). */
export function parseJsonLoose(text: string): any {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { /* tenta recortar */ }
  const a = t.indexOf('{'); const z = t.lastIndexOf('}');
  if (a >= 0 && z > a) { try { return JSON.parse(t.slice(a, z + 1)); } catch { /* ignora */ } }
  return null;
}

/** Dias restantes para adicionar o link do produto (TikTok permite em vídeos dos últimos 30 dias). */
export function anchorDaysLeft(deadlineIso: string | null | undefined, now = Date.now()): number | null {
  if (!deadlineIso) return null;
  return Math.ceil((new Date(deadlineIso).getTime() - now) / 864e5);
}

export function fmtTime(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(1, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Geração de texto com IA (opcional). Só funciona se GEMINI_API_KEY ou ANTHROPIC_API_KEY estiver configurada.
// O resultado é sempre revisado pelo usuário e passa pelo filtro de alegações não verificadas.
// deno-lint-ignore-file no-explicit-any
import { env, handle, json, requireUser, HttpError } from '../../_shared/supa.ts';
import { http } from '../../_shared/connectors/types.ts';
import { PLATFORMS, type PlatformCode } from '../../_shared/platforms.ts';
import { riskyClaims } from '../../_shared/text.ts';

export const handler = handle(async (req) => {
  await requireUser(req);
  const { platform, product, style, base } = await req.json();
  const cap = PLATFORMS[platform as PlatformCode];
  if (!cap) throw new HttpError(400, 'Plataforma inválida');

  const prompt = `Você escreve legendas de divulgação de afiliado em português do Brasil.
Rede: ${cap.name}. Limite: ${cap.limits.caption} caracteres. Estilo: ${style}.
Regras obrigatórias:
- Use SOMENTE os dados fornecidos. Não invente preço, desconto, avaliações, vendas, estoque, frete, garantia ou prazos.
- Não crie urgência ("últimas unidades", "acaba hoje").
- Mantenha a identificação de afiliado e o link EXATAMENTE como aparecem no texto-base.
- ${cap.linkPlacement === 'bio' ? 'Nesta rede o link não é clicável na legenda: diga "link na bio".' : 'Mantenha o link onde está.'}
- Responda apenas com a legenda final, sem comentários.
Dados do produto (JSON): ${JSON.stringify(product).slice(0, 3000)}
Texto-base a melhorar:
${String(base).slice(0, 4000)}`;

  let text: string | null = null;
  if (env('GEMINI_API_KEY')) {
    const r = await http(fetch, `https://generativelanguage.googleapis.com/v1beta/models/${env('GEMINI_MODEL') ?? 'gemini-2.5-flash'}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY')! },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 1200 } }),
    }, 45000);
    text = r.json?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    if (!text) throw new HttpError(502, `IA indisponível: ${r.json?.error?.message ?? r.status}`);
  } else if (env('ANTHROPIC_API_KEY')) {
    const r = await http(fetch, 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env('ANTHROPIC_MODEL') ?? 'claude-haiku-5-5', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
    }, 45000);
    text = r.json?.content?.[0]?.text ?? null;
    if (!text) throw new HttpError(502, `IA indisponível: ${r.json?.error?.message ?? r.status}`);
  } else {
    throw new HttpError(501, 'IA não configurada. Os modelos gratuitos continuam disponíveis.');
  }
  text = text.trim().slice(0, cap.limits.caption);
  return json(req, { caption: text, flagged: riskyClaims(text) });
});

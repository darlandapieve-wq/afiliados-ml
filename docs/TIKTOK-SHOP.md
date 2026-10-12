# Módulo TikTok Shop (afiliado) — Pippit

Menu **TikTok Shop**. Você informa o produto (nome, link e/ou foto) e seus comentários; o app gera o briefing do vídeo, acompanha a produção no Pippit e controla a publicação e a sacolinha.

## Fluxo

| Etapa | O que acontece | Quem faz |
|---|---|---|
| 1. Rascunho → Briefing pronto | Ganchos, roteiro segundo a segundo (visual, prompt em inglês, narração, texto na tela), legenda, hashtags e **prompt para colar no Pippit**. Grátis por modelos; com IA (Gemini/Claude) usando a foto do produto. | App |
| 2. Vídeo pronto | **Grátis no app:** botão "Gerar vídeo no app" cria um MP4 vertical (1080×1920, H.264) com a foto do produto, zoom/movimento por cena e o "texto na tela" de cada cena, mais o selo #publi/IA. Sem som: adicione música ou "texto para fala" no TikTok. **Ou no Pippit** (vídeos exigem o plano Starter): cole o link/foto e o prompt, gere e envie o MP4 ao app. | App ou você + Pippit |
| 3. Agendado | Agende pelo **Publisher do Pippit** já com o link do produto (sacolinha) e registre o horário aqui. | Você + Pippit |
| 3B. Enviado pela API | Alternativa: o app envia o MP4 pela Content Posting API, com `is_aigc` (rótulo de IA). O worker confere o status a cada minuto. | App |
| 4. Publicado | Prazo de 30 dias para incluir a sacolinha (controlado em `anchor_deadline`, com alerta no painel quando faltam 7 dias). | — |
| 5. Sacolinha adicionada | Concluído. | Você |

## Por que não é 100% automático

- **Pippit não tem API pública.** Automatizar o navegador violaria os termos e arriscaria a conta.
- **A Content Posting API do TikTok não tem campo para link de produto.** A sacolinha é adicionada no app ou no agendador do Pippit (vídeos com link passam por revisão extra).
- **Apps sem auditoria do TikTok publicam só como privado.** Depois da auditoria, marque a conta como auditada (`meta.audited = true`), como já ocorre no restante do app.

## Conformidade embutida

- Todo vídeo enviado pela API vai com `is_aigc: true`; a legenda termina com "#publi Conteúdo criado com IA.".
- O filtro `complianceIssues` alerta sobre depoimento em 1ª pessoa ("eu usei", "comprei"), promessas absolutas e alegações não verificadas (desconto, frete grátis, urgência).
- A IA recebe a regra de narração de apresentador e de não inventar preço, desconto, avaliações ou garantia.
- Anti-duplicação: `tt_request_sent_at` é gravado antes do envio; resultado incerto exige confirmação manual antes de reenviar. Campos `tt_*` e o estado "Enviando" são protegidos no banco (`tts_guard`).

## Técnico

- Tabela `tts_creatives` (RLS por usuário) — `supabase/migrations/20261012000001_tiktok_shop.sql`.
- Gerador compartilhado: `supabase/functions/_shared/tts.ts` (testes em `tests/tts.test.ts`).
- Servidor: rota `app/tts` (`brief_ai`, `publish`, `check`) e `_shared/tts-server.ts`; o `worker` chama `sweepPosting` a cada execução.
- Telas: `src/pages/TikTokShop.tsx` (fila + novo criativo) e `src/pages/TikTokShopDetail.tsx`.
- Vídeo no app: `src/lib/ttsVideo.ts` — codifica quadro a quadro com WebCodecs + `mp4-muxer` (não depende da aba visível); sem WebCodecs, grava em tempo real com MediaRecorder.
- Arquivos no Storage em `<uid>/tts-<id>/` (incluídos na exclusão de conta).

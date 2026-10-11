# Matriz de funcionalidades por plataforma

Verificada em **10/10/2026** na documentação oficial de cada plataforma. As regras mudam, então confira os links antes de pedir aprovação.

| | Imagens (auto) | Vídeo (auto) | Link clicável | Agendamento | Conta exigida | Aprovação | Custo | Alternativa assistida |
|---|---|---|---|---|---|---|---|---|
| **Telegram** | ✅ `sendPhoto` | ✅ | ✅ botão inline + texto | Pela fila do app | Bot admin do canal | Nenhuma | Grátis | Copiar texto/arte, `t.me/share` |
| **Facebook** | ✅ `/{page}/photos` | ✅ (não implementado no MVP) | ✅ no texto do post | Pela fila do app (a API também tem nativo) | **Página** (não perfil) | Para Páginas **próprias**: nenhuma (acesso padrão, você com função no app). Para terceiros: App Review + verificação da empresa | Grátis | `facebook.com/sharer` |
| **Instagram** | ✅ contêiner + `media_publish` (**somente JPEG**) | ✅ Reels (MP4) | ❌ legenda não clicável. Use **link na bio** ou página intermediária. Figurinha de link **não** existe na API | Pela fila do app | Conta **profissional** ligada a uma Página | Igual ao Facebook | Grátis (limite de 100 posts/24 h) | Baixar arte + copiar legenda |
| **TikTok** | ✅ Foto (`PULL_FROM_URL`, exige verificar o prefixo de URL) | ✅ `FILE_UPLOAD` | ❌ legenda não clicável. Link na bio | Pela fila do app | Conta TikTok + app no TikTok for Developers | **Auditoria** do Content Posting API. Sem ela: tudo **privado (SELF_ONLY)**, até 5 usuários/24 h. Conteúdo de marca não pode ser privado | Grátis | Baixar vídeo/fotos e publicar pelo app |
| **YouTube Shorts** | ❌ imagem estática não é Short | ✅ `videos.insert` | ❌ links na descrição de Shorts não são clicáveis | Nativo (`publishAt`) ou pela fila | Canal + projeto Google Cloud | **Auditoria de conformidade**. Sem ela, todo upload fica **privado**. Verificação OAuth do Google | Grátis (cota padrão) | Baixar vídeo e enviar pelo app |
| **Pinterest** | ✅ `POST /v5/pins` | ✅ (não implementado no MVP) | ✅ link de destino do Pin | Pela fila do app | Conta **empresarial** + pasta | Acesso *trial* escreve só no **sandbox**. Produção exige upgrade para acesso padrão | Grátis | `pinterest.com/pin/create/button` |
| **WhatsApp** | ❌ sem API para Status, grupos ou Canais | ❌ | ✅ na mensagem (assistido) | Lembrete na hora marcada | — | Não se aplica | Grátis | Botão `wa.me` + baixar arte |

## Mercado Livre

| Item | Situação |
|---|---|
| Geração de link de afiliado por API | **Não existe API pública.** O link é gerado no painel (Afiliados › Gerador de links, ou pela barra de afiliado na página do produto) e colado no app. Ferramentas de terceiros que "geram automaticamente" usam cookies/sessão do navegador, o que não é permitido por este projeto. |
| Dados do produto (`/items/{id}`, `/products/{id}`) | Exigem **access token** (OAuth de um app ML). É opcional: com a conta ML conectada, o app preenche título, preço, imagem e atributos. Sem ela, o preenchimento é manual. |
| Resultados do afiliado (cliques, vendas, comissões) | Sem API oficial pública. O registro é manual, a partir do painel. |
| Regras relevantes | Links só para anúncios elegíveis (ex.: produtos novos de vendedores com reputação verde). Proibido anunciar links de afiliado em buscadores pagos. Comissões até 16 %, sujeitas a aprovação. |

## Fontes
- Facebook Pages API: https://developers.facebook.com/documentation/pages-api/posts
- Instagram Content Publishing: https://developers.facebook.com/documentation/instagram-platform/content-publishing
- TikTok Content Posting API: https://developers.tiktok.com/doc/content-posting-api-reference-photo-post e https://developers.tiktok.com/doc/content-sharing-guidelines
- YouTube `videos.insert`: https://developers.google.com/youtube/v3/docs/videos/insert
- Pinterest API v5: https://developers.pinterest.com/docs/api/v5/
- Telegram Bot API: https://core.telegram.org/bots/api
- Mercado Livre Afiliados: https://www.mercadolivre.com.br/l/afiliados-home e https://developers.mercadolivre.com.br

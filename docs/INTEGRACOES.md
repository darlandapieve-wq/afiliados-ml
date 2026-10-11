# Configurar cada integração oficial

Todas usam o mesmo **URL de redirecionamento OAuth**, mostrado na tela *Integrações*:

```
https://<PROJECT_REF>.supabase.co/functions/v1/oauth/callback
```

As credenciais dos apps de desenvolvedor ficam em **Supabase › Project Settings › Edge Functions › Secrets**. Elas nunca vão para o frontend nem para o repositório. Depois de salvar um segredo, recarregue a tela *Integrações*: o aviso "Pendente de credenciais" some.

| Rede | Segredos | Permissões solicitadas |
|---|---|---|
| Facebook + Instagram | `META_APP_ID`, `META_APP_SECRET` | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `user.info.basic`, `video.publish` |
| YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `youtube.upload`, `youtube.readonly` |
| Pinterest | `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET` | `boards:read`, `pins:read`, `pins:write`, `user_accounts:read` |
| Mercado Livre (dados) | `ML_CLIENT_ID`, `ML_CLIENT_SECRET` | leitura (padrão do app) |
| Telegram | nenhum (token do bot digitado na tela, guardado criptografado) | bot administrador com "Publicar mensagens" |
| IA (opcional) | `GEMINI_API_KEY` (há cota gratuita) **ou** `ANTHROPIC_API_KEY` | — |

## 1. Telegram (5 minutos, funciona no mesmo dia)
1. No Telegram, abra **@BotFather**, envie `/newbot` e copie o token.
2. Adicione o bot como **administrador** do seu canal, com "Publicar mensagens".
3. Em *Integrações › Telegram*, cole o token e o `@canal` (ou o ID `-100…` de um canal privado) e clique em *Conectar*. O app verifica as permissões antes de salvar.

## 2. Facebook e Instagram (sem App Review para as suas contas)
1. Em https://developers.facebook.com crie um app do tipo **Empresa** e adicione os casos de uso *Gerenciar Páginas* e *Instagram (Facebook Login)*.
2. Em *Login do Facebook › Configurações*, cadastre o URL de redirecionamento acima.
   - Em *Configurações › Básico* preencha: ícone (`public/app-icon-1024.png`), **URL da Política de Privacidade** `https://afiliados-ml-nn8n.onrender.com/politica-de-privacidade`, **URL de exclusão de dados** `https://afiliados-ml-nn8n.onrender.com/exclusao-de-dados` e categoria *Negócios e Páginas*.
   - Se o app usar **Login do Facebook para Empresas**, crie uma *Configuração* com as permissões abaixo e salve o ID dela no segredo `META_CONFIG_ID`.
3. Confirme que **você** tem função de Administrador no app. Com o **acesso padrão**, o app funciona para quem tem função nele, sem App Review.
4. A conta do Instagram precisa ser **profissional** (Comercial ou Criador de conteúdo) e estar **vinculada à Página**.
5. Salve `META_APP_ID` e `META_APP_SECRET` nos segredos. Em *Integrações*, clique em *Conectar com login oficial* e autorize a Página. O Instagram vinculado é detectado automaticamente.
6. Clique em **Testar** em cada conta. Depois ative a publicação automática em *Configurações*.
> Para publicar em Páginas de **outras pessoas**, é preciso App Review (`pages_manage_posts`, `instagram_content_publish`) e verificação da empresa.

## 3. TikTok
1. Em https://developers.tiktok.com crie um app com **Login Kit** e **Content Posting API** e ative o *Direct Post*.
2. Cadastre o URL de redirecionamento e os escopos `user.info.basic` e `video.publish`.
3. **Fotos:** o TikTok baixa as imagens por URL e exige verificar o prefixo. Em *URL properties*, verifique o prefixo `https://<PROJECT_REF>.supabase.co/storage/v1/object/public/media/`. Para isso, envie o arquivo de verificação que o TikTok fornece para a raiz desse prefixo pelo painel Storage do Supabase. Os **vídeos** usam upload direto e não precisam disso.
4. Sem auditoria, tudo é publicado como **privado (só você vê)**, com no máximo 5 usuários em 24 h. Para conteúdo público, envie o app para auditoria (*Submit for review*). Quando for aprovado, marque "Meu app foi aprovado na auditoria" em *Integrações*.
5. Exigências de UX do TikTok já atendidas: consulta dos dados do criador antes do envio, consentimento explícito, aviso de Confirmação de Uso de Música e nenhuma marca d'água promocional adicionada pelo app. A publicação de afiliado é marcada como conteúdo de marca, o que só é permitido em posts públicos.

## 4. YouTube Shorts
1. Em https://console.cloud.google.com crie um projeto e ative a **YouTube Data API v3**.
2. Configure a *Tela de consentimento OAuth* (externa; adicione seu e-mail como usuário de teste) e crie uma credencial **OAuth Client ID – Aplicativo da Web** com o URL de redirecionamento acima.
3. Salve `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.
4. Projetos não auditados: **todos os uploads ficam privados**. Para vídeos públicos, preencha o *YouTube API Services Audit and Quota Extension Form*. Depois da aprovação, marque a opção correspondente em *Integrações*.
5. O app gera o vídeo vertical (8 s) a partir da arte. Imagem estática não é enviada como Short.

## 5. Pinterest
1. Em https://developers.pinterest.com crie um app (conta empresarial) e cadastre o URL de redirecionamento.
2. Salve `PINTEREST_APP_ID` e `PINTEREST_APP_SECRET`. Conecte a conta e escolha a pasta (board).
3. O acesso **trial** só cria Pins no **sandbox**. Peça o upgrade para *Standard access* e, depois de aprovado, desmarque "sandbox" em *Integrações*.

## 6. Mercado Livre (opcional: preencher dados do produto)
1. Em https://developers.mercadolivre.com.br crie uma aplicação, com o URL de redirecionamento acima e PKCE habilitado.
2. Salve `ML_CLIENT_ID` e `ML_CLIENT_SECRET` e conecte em *Integrações*.
3. Isso **não** gera links de afiliado, porque não existe API oficial para isso. O link continua sendo gerado no painel do programa.

## WhatsApp
Não há integração automática: a WhatsApp Business Platform não publica em Status, grupos nem Canais. O app oferece **Abrir no WhatsApp** (`wa.me`) com o texto pronto e o download da arte.

## Desconectar e revogar
*Desconectar* apaga os tokens do banco. Para revogar também na plataforma, remova o app em: Facebook › Configurações › Integrações comerciais; TikTok › Segurança › Gerenciar apps; Google › myaccount.google.com/permissions; Pinterest › Configurações › Apps.

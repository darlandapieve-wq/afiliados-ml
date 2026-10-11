# Limitações conhecidas

## Das plataformas (não dependem do app)
- **Mercado Livre:** não há API pública para gerar links de afiliado nem para consultar cliques, vendas e comissões. O link é colado manualmente e os resultados são registrados manualmente.
- **Instagram:** links na legenda não são clicáveis e a figurinha de link não é suportada pela API. A API aceita só **JPEG** para imagens e só **MP4/MOV** para Reels.
- **TikTok:** sem auditoria, tudo fica **privado (SELF_ONLY)**. Divulgação de afiliado é conteúdo de marca, que o TikTok **não permite em posts privados**. Na prática, antes da auditoria só dá para enviar testes privados, sem a marcação comercial. Fotos exigem a verificação do prefixo de URL.
- **YouTube:** sem auditoria, todos os uploads ficam **privados**. Links na descrição de Shorts não são clicáveis. Imagem estática não é Short.
- **Pinterest:** o acesso trial escreve só no sandbox.
- **WhatsApp:** não existe API para Status, grupos ou Canais. Somente o modo assistido.
- **Facebook:** só Páginas (não perfis). Os recursos nativos de marcação de produtos de afiliado não são acessíveis pela API.

## Do MVP
- **Testes reais:** os conectores foram testados com mocks que simulam as respostas documentadas. **Nenhuma integração foi validada com conta real ainda**, porque isso depende das suas credenciais. A fila, as regras do banco e o worker foram testados no Supabase real.
- **Vídeo:** o MP4 depende do navegador (Chrome/Edge recentes). Em outros navegadores sai WebM, aceito pelo TikTok e pelo YouTube, mas não pelo Instagram.
- **Imagens externas:** algumas imagens do Mercado Livre bloqueiam o uso no canvas (CORS). Nesse caso a arte sai sem a foto e o app pede o envio de uma imagem própria. Use apenas imagens que você tem direito de usar.
- **Vídeo no Facebook e no Pinterest:** a arquitetura suporta, mas o MVP publica só imagens nessas redes.
- **Página intermediária:** fica no mesmo domínio do app. Cliques diretos no link de afiliado (sem a página) não são contados pelo app. Não há proteção anti-bot nos cliques (o número é indicativo).
- **Agendamento:** a precisão é de cerca de 1 minuto. Se o Supabase gratuito estiver pausado, a publicação só sai quando ele for reativado.
- **Fuso horário:** os campos de data usam o fuso do navegador. A exibição usa o fuso escolhido em Configurações.
- **Uma conta por pessoa:** o sistema isola os dados por usuário, mas não tem equipes nem permissões compartilhadas.

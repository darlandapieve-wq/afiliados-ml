# Plano de evolução

## Etapa 2 — Integrações oficiais
A ordem considera a facilidade de autorização e o valor prático.
1. **Telegram:** criar o bot e testar uma publicação real. *Pronto no código.*
2. **Facebook + Instagram** (contas próprias, acesso padrão): criar o app Meta, configurar os segredos, testar. *Pronto no código.*
3. **TikTok:** criar o app, testar em modo privado e pedir a auditoria. *Pronto no código.*
4. **YouTube:** criar o projeto, testar o upload privado e preencher o formulário de auditoria. *Pronto no código.*
5. **Pinterest:** criar o app, testar no sandbox e pedir o acesso padrão. *Pronto no código.*
6. Vídeo no Facebook (Reels) e no Pinterest.
7. Testes de integração reais, executados manualmente com credenciais (`tests/live/`), sem rodar no CI.

## Etapa 3 — Métricas e expansão
- Métricas por publicação via APIs oficiais (Insights da Meta, TikTok e YouTube Analytics), quando as permissões forem concedidas.
- Página "link na bio" com várias campanhas (vitrine), mantendo o link de afiliado intacto.
- Biblioteca de templates editáveis (posição de elementos, fundos e fontes próprias).
- Testes A/B de textos (variações alternadas por horário) com comparação de cliques próprios.
- Regras avançadas de agendamento: janelas por rede, intervalos, fila contínua.
- Notificações (e-mail ou Telegram) quando houver ação manual pendente ou falha.
- Importação em lote de produtos (CSV).
- Sugestões de produtos, somente se houver fonte autorizada pelo Mercado Livre.

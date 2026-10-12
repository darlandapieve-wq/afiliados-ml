# ML Afiliados — automação de divulgação do Programa de Afiliados do Mercado Livre

Aplicação web (pt-BR) que transforma o link de um produto do Mercado Livre em uma campanha. Ela gera artes e textos por rede social, guarda o seu link de afiliado **sem alterações**, publica pelas **APIs oficiais** quando possível e oferece **compartilhamento assistido** quando não há API. Também traz agendamento no servidor, histórico e relatórios.

> Sem scraping, sem automação de navegador e sem senhas de redes sociais. Nada é marcado como "publicado" sem confirmação da API ou sua.

## O que funciona hoje

| Recurso | Situação |
|---|---|
| Login (e-mail/senha, recuperação de senha), aviso LGPD, exportação e exclusão de dados | ✅ |
| Cadastro de produtos (manual ou pela API oficial do ML, se você conectar a conta) | ✅ |
| Link de afiliado: validação, preservação exata (imutável no banco), abrir/copiar | ✅ |
| Artes grátis no navegador: quadrado, 4:5, story 9:16, Pin 2:3, miniatura 16:9, WhatsApp/Telegram | ✅ |
| Vídeo vertical de 8 s (MP4 no Chrome/Edge) para Shorts, TikTok e Reels | ✅ |
| Textos por rede (4 estilos), hashtags, limites de caracteres e aviso de alegações não verificadas | ✅ |
| IA opcional (Gemini ou Claude) para melhorar a legenda | ✅ com chave |
| Prévia por rede e indicação de link clicável ou não | ✅ |
| Campanhas: aprovação, pausa, arquivo, duplicação e histórico de alterações | ✅ |
| Agendamento no servidor (pg_cron a cada minuto, funciona com o navegador fechado) | ✅ testado |
| Modo assistido (wa.me, compartilhar no Telegram/Facebook/Pinterest, baixar mídia, marcar como publicada) | ✅ |
| Calendário (dia/semana/mês) e relatórios com origens separadas | ✅ |
| Página intermediária com contagem de cliques próprios | ✅ |
| Telegram automático | ✅ pronto (basta criar o bot) |
| Facebook e Instagram automáticos | ⏳ pendente de credenciais (app Meta próprio, sem App Review) |
| TikTok e YouTube automáticos | ⏳ pendentes de credenciais. Até a auditoria das plataformas, publicam como **privado** |
| Pinterest automático | ⏳ pendente de credenciais. Só sandbox até a aprovação |
| WhatsApp automático | ❌ não existe API oficial para Status, grupos ou Canais (somente assistido) |
| **Módulo TikTok Shop**: foto/link + comentários → briefing (roteiro, prompts, legenda) para o Pippit → vídeo → publicação (Pippit ou API com rótulo de IA) → controle dos 30 dias da sacolinha | ✅ ([docs/TIKTOK-SHOP.md](docs/TIKTOK-SHOP.md)) |

Detalhes por rede: [docs/MATRIZ-PLATAFORMAS.md](docs/MATRIZ-PLATAFORMAS.md). Como configurar cada uma: [docs/INTEGRACOES.md](docs/INTEGRACOES.md).

## Arquitetura

```
Navegador (React + TypeScript, site estático)
  ├── Supabase Auth / Postgres (RLS por usuário) / Storage (artes públicas)
  └── Edge Functions (Deno)
        app     → integrações, busca no ML, IA, exclusão de conta      (exige login)
        oauth   → início e retorno do OAuth (Meta, TikTok, Google, Pinterest, ML)
        worker  → fila de publicação; chamado pelo pg_cron a cada minuto
```

- **Fila confiável:** a tabela `jobs` é reservada com `FOR UPDATE SKIP LOCKED`. Há um job ativo por publicação e o worker retoma jobs travados.
- **Sem duplicação:** `request_sent_at` é gravado *antes* da chamada à API. Se o resultado ficar incerto (timeout, erro 5xx), o sistema **não reenvia** e pede a sua conferência. Só repete automaticamente quando a plataforma respondeu e garantiu que nada foi criado (ex.: 429).
- **Regras no banco:** o link de afiliado é imutável. Agendar exige campanha aprovada. O modo automático exige conta conectada e opção ativada. O usuário não consegue marcar uma publicação automática como "publicada" nem gravar campos de resultado.
- **Segredos:** os tokens são cifrados com AES-256-GCM. A chave fica no Supabase Vault e a tabela de segredos não tem política de acesso (o frontend não lê). Os logs passam por remoção de tokens.
- **Conectores independentes** em `supabase/functions/_shared/connectors/`, com a mesma interface (`publish`, `check`, `test`).

```
src/                      frontend (pages/, lib/, components/)
supabase/migrations/      esquema, RLS, fila, Vault + cron (versionado)
supabase/functions/       Edge Functions + _shared/ (plataformas, links, textos, motor, conectores, OAuth)
tests/                    testes automatizados (Vitest)
docs/                     matriz, integrações, implantação, backup, custos, limitações, evolução
```

**Site publicado:** https://afiliados-ml-nn8n.onrender.com

## Rodar localmente

Requisitos: Node 20+.

```bash
git clone https://github.com/darlandapieve-wq/afiliados-ml.git
cd afiliados-ml
npm ci
cp .env.example .env.local      # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev                     # http://localhost:5173
npm test                        # testes automatizados
```

O banco e as funções já estão implantados no projeto Supabase **afiliados-ml**. Para criar do zero em outro projeto, veja [docs/IMPLANTACAO.md](docs/IMPLANTACAO.md).

## Verificar em 5 minutos
1. Crie a conta, confirme o e-mail e aceite o aviso de privacidade.
2. *Configurações › Carregar dados de demonstração*. Os dados aparecem marcados como **DEMO**.
3. Abra a campanha: textos por rede, artes, prévia e o selo "link clicável/não clicável".
4. Clique em *Aprovar*. Em *Publicar/agendar*, escolha WhatsApp no modo assistido e agende para daqui a 2 minutos. Feche o navegador.
5. Volte depois: a publicação estará em **Aguardando ação manual**, com o registro do worker em *Histórico*.
6. Para publicação real, conecte o Telegram (docs/INTEGRACOES.md §1), ative-o em *Configurações* e agende.

## Documentação
- [Matriz de plataformas](docs/MATRIZ-PLATAFORMAS.md) · [Integrações e permissões](docs/INTEGRACOES.md)
- [Implantação](docs/IMPLANTACAO.md) · [Backup e restauração](docs/BACKUP.md)
- [Custos](docs/CUSTOS.md) · [Limitações conhecidas](docs/LIMITACOES.md) · [Plano de evolução](docs/EVOLUCAO.md)

## Regras do programa (resumo)
Gere links só pelo painel oficial e não os altere. Não anuncie links de afiliado em buscadores pagos. Divulgue apenas produtos elegíveis. Identifique a publicidade (o app já inclui o aviso). Comissões dependem de aprovação do Mercado Livre e não são garantidas. Termos: https://www.mercadolivre.com.br/l/afiliados-home

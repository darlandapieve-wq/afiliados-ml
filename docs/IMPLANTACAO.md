# Implantação

## Ambiente atual
- **Supabase:** projeto `afiliados-ml` (ref `qbhlgenqahqqomtdtrhi`, região São Paulo, plano gratuito). Já tem as migrações aplicadas, as Edge Functions `worker`, `oauth` e `app` publicadas e o pg_cron chamando o worker a cada minuto.
- **Frontend:** publicado no Render em https://afiliados-ml-nn8n.onrender.com (deploy automático a cada push na branch `main`). O endereço já está registrado no Vault como `app_url`.
- **Rotas do site:** o build copia `index.html` para `404.html`, para que links diretos como `/p/<slug>` funcionem. Opcionalmente, adicione no painel do Render (Redirects/Rewrites) a regra `/*` → `/index.html` (Rewrite).

## 1. Publicar o frontend no Render (grátis)
1. Em https://dashboard.render.com, crie um **New › Static Site** a partir do repositório do GitHub. O `render.yaml` já define o build, a pasta `dist` e o redirecionamento das rotas para `index.html`.
2. Variáveis de ambiente: `VITE_SUPABASE_URL=https://qbhlgenqahqqomtdtrhi.supabase.co` e `VITE_SUPABASE_ANON_KEY=<chave anon>`. A chave anon é pública e protegida pelo RLS.
3. Depois do deploy, informe o endereço do site ao backend:
   - Supabase › SQL Editor: `select vault.create_secret('https://SEU-SITE.onrender.com', 'app_url');`
   - Supabase › Authentication › URL Configuration: *Site URL* = endereço do site e *Redirect URLs* = o mesmo endereço.

## 2. Manter o Supabase gratuito ativo
Projetos gratuitos pausam após **7 dias sem atividade**, e uma pausa interromperia os agendamentos. O workflow `.github/workflows/keepalive.yml` faz uma consulta leve a cada 3 dias. Cadastre os segredos do repositório `SUPABASE_URL` e `SUPABASE_ANON_KEY` (GitHub › Settings › Secrets and variables › Actions). Se o projeto pausar mesmo assim, reative-o no painel: os agendamentos vencidos são processados assim que ele voltar.

## 3. Reinstalar do zero em outro projeto Supabase
```bash
npm i -g supabase
supabase login
supabase link --project-ref <NOVO_REF>
# em supabase/migrations/20261010000003_vault_cron.sql troque <PROJECT_REF> pelo novo ref
supabase db push
supabase functions deploy worker --no-verify-jwt
supabase functions deploy oauth  --no-verify-jwt
supabase functions deploy app
```
A chave de criptografia e o segredo do cron são gerados pelo próprio banco (Vault). Se você reinstalar em outro projeto, os tokens antigos não são migrados; reconecte as contas.

## 4. Segredos das integrações
Em Supabase › Project Settings › Edge Functions › Secrets: veja a tabela em [INTEGRACOES.md](INTEGRACOES.md). Nunca coloque segredos em arquivos `.env` versionados nem no frontend.

## 5. Atualizar funções
`npm run bundle:functions` gera os pacotes em `dist-functions/` (útil para publicar pelo painel). Com a CLI, use `supabase functions deploy <nome>`.

**Implantação atual (`app` e `worker`, desde 12/10/2026):** o `index.ts` publicado só importa o código do GitHub fixado em um commit, por exemplo:
```ts
import 'https://raw.githubusercontent.com/darlandapieve-wq/afiliados-ml/<SHA>/supabase/functions/app/index.ts';
```
O Supabase empacota o código no momento da implantação, então mudanças posteriores no repositório não afetam a versão no ar. Para atualizar: faça o push, troque o `<SHA>` pelo novo commit e implante de novo (painel, MCP ou CLI). A função `oauth` continua no pacote anterior.

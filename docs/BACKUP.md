# Backup e restauração

O plano gratuito do Supabase **não inclui backups automáticos**. Faça os seus.

## Backup rápido (pelo app)
*Configurações › Exportar meus dados (JSON)*: produtos, links, campanhas, textos, publicações, logs e resultados. Os tokens não são exportados. Serve como cópia legível e não substitui o backup do banco.

## Backup completo do banco
1. Supabase › Project Settings › Database › *Connection string* (modo *Session*). Copie a URI.
2. No seu computador, com o PostgreSQL client instalado:
```bash
pg_dump "postgresql://postgres.<ref>:<SENHA>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres" \
  --schema=public --no-owner --no-privileges -Fc -f backup-$(date +%F).dump
```
3. Arquivos (artes e vídeos): Supabase › Storage › bucket `media` › baixar. Ou use a CLI:
   `supabase storage cp -r ss:///media ./media-backup --experimental`
4. Guarde o `.dump` e a pasta em local seguro, por exemplo um drive pessoal.

Sugestão: faça o backup semanalmente, ou antes de qualquer migração.

## Restaurar
1. Projeto novo ou vazio: aplique as migrações (`supabase db push`), conforme IMPLANTACAO.md §3.
2. Restaure os dados:
```bash
pg_restore --data-only --disable-triggers --no-owner -d "<URI do projeto>" backup-AAAA-MM-DD.dump
```
3. Reenvie os arquivos do bucket `media`, mantendo os mesmos caminhos.
4. Os segredos do Vault não vêm no dump do schema `public`. Por isso, reconecte as integrações em *Integrações*, já que os tokens cifrados antigos não podem ser decifrados com a nova chave.

## Exclusão
*Configurações › Excluir conta* remove o usuário, todas as linhas (em cascata) e os arquivos do Storage.

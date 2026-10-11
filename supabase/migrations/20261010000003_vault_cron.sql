-- Plataforma auxiliar para dados de produto (OAuth do Mercado Livre)
insert into platforms(code,name,sort) values ('mercadolivre','Mercado Livre (dados de produto)',99) on conflict do nothing;

-- Segredos internos gerados no próprio banco (Supabase Vault) — nunca saem para o frontend.
select vault.create_secret(encode(extensions.gen_random_bytes(32),'base64'), 'encryption_key', 'Chave AES-256 para tokens de integrações');
select vault.create_secret(encode(extensions.gen_random_bytes(24),'hex'), 'cron_secret', 'Autenticação do pg_cron no worker');
-- Opcional: select vault.create_secret('https://seu-app.onrender.com', 'app_url', 'URL pública do frontend');

create or replace function get_app_secret(p_name text) returns text
language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets
   where name = p_name and p_name in ('encryption_key','cron_secret','app_url');
$$;
revoke all on function get_app_secret(text) from public, anon, authenticated;
grant execute on function get_app_secret(text) to service_role;

-- Agendador: chama o worker a cada minuto (funciona com o navegador fechado)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ATENÇÃO: troque <PROJECT_REF> pelo ref do seu projeto ao reinstalar em outro projeto.
select cron.schedule('publish-worker', '* * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/worker',
    headers := jsonb_build_object('content-type','application/json',
                                  'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 58000);
$$);

select cron.schedule('cleanup-weekly', '17 3 * * 0', $$
  delete from public.jobs where status in ('done','cancelled') and updated_at < now() - interval '90 days';
$$);

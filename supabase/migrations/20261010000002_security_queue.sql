-- =====================================================================
-- RLS, regras de transição de estado, fila e RPCs públicas
-- =====================================================================

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table platforms enable row level security;
alter table products enable row level security;
alter table affiliate_links enable row level security;
alter table campaigns enable row level security;
alter table assets enable row level security;
alter table content_variants enable row level security;
alter table connected_accounts enable row level security;
alter table account_secrets enable row level security;   -- sem políticas: só service role
alter table oauth_states enable row level security;      -- sem políticas: só service role
alter table publications enable row level security;
alter table jobs enable row level security;
alter table execution_logs enable row level security;
alter table click_events enable row level security;
alter table affiliate_results enable row level security;
alter table policy_notices enable row level security;
alter table policy_acks enable row level security;
alter table audit_log enable row level security;

create policy profiles_own on profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy platforms_read on platforms for select to anon, authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array['products','affiliate_links','campaigns','assets','content_variants','publications','affiliate_results','policy_acks'] loop
    execute format('create policy %I on %I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t||'_own', t);
  end loop;
  foreach t in array array['jobs','execution_logs','click_events','audit_log'] loop
    execute format('create policy %I on %I for select to authenticated using (user_id = (select auth.uid()))', t||'_read', t);
  end loop;
end $$;

-- Contas conectadas: o usuário lê, atualiza metadados e desconecta; a criação é feita pelas Edge Functions.
create policy accounts_read on connected_accounts for select to authenticated using (user_id = (select auth.uid()));
create policy accounts_delete on connected_accounts for delete to authenticated using (user_id = (select auth.uid()));
create policy notices_read on policy_notices for select to authenticated using (true);

-- Integridade entre tabelas do mesmo usuário (evita referenciar registro alheio)
create or replace function check_same_owner() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'campaigns' then
    if not exists (select 1 from products where id = new.product_id and user_id = new.user_id) then raise exception 'Produto inválido'; end if;
    if new.affiliate_link_id is not null and not exists (select 1 from affiliate_links where id = new.affiliate_link_id and user_id = new.user_id and product_id = new.product_id) then
      raise exception 'Link de afiliado não pertence a este produto'; end if;
  elsif tg_table_name in ('content_variants','publications','assets') then
    if new.campaign_id is not null and not exists (select 1 from campaigns where id = new.campaign_id and user_id = new.user_id) then raise exception 'Campanha inválida'; end if;
    if tg_table_name = 'publications' and new.account_id is not null and not exists (select 1 from connected_accounts where id = new.account_id and user_id = new.user_id and platform = new.platform) then
      raise exception 'Conta conectada inválida para esta plataforma'; end if;
  elsif tg_table_name = 'affiliate_links' then
    if not exists (select 1 from products where id = new.product_id and user_id = new.user_id) then raise exception 'Produto inválido'; end if;
  end if;
  return new;
end $$;
create trigger own_campaigns before insert or update on campaigns for each row execute function check_same_owner();
create trigger own_variants before insert or update on content_variants for each row execute function check_same_owner();
create trigger own_pubs before insert or update on publications for each row execute function check_same_owner();
create trigger own_assets before insert or update on assets for each row execute function check_same_owner();
create trigger own_links before insert or update on affiliate_links for each row execute function check_same_owner();

-- ---------- Regras de publicação ----------
create or replace function is_end_user() returns boolean language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.role', true), (current_setting('request.jwt.claims', true)::jsonb ->> 'role')) = 'authenticated'
$$;

create or replace function publications_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare v_settings jsonb; v_approval text;
begin
  if is_end_user() then
    -- Campos de resultado só podem ser gravados pelo worker
    if tg_op = 'UPDATE' and (new.external_id is distinct from old.external_id or new.confirmed_at is distinct from old.confirmed_at
        or new.request_sent_at is distinct from old.request_sent_at or new.provider_state is distinct from old.provider_state) then
      raise exception 'Campos de resultado da publicação são definidos apenas pelo sistema';
    end if;
    if tg_op = 'INSERT' and (new.external_id is not null or new.confirmed_at is not null or new.request_sent_at is not null) then
      raise exception 'Campos de resultado da publicação são definidos apenas pelo sistema';
    end if;
    if new.status in ('processing','failed','not_configured') and (tg_op = 'INSERT' or new.status is distinct from old.status) then
      raise exception 'Estado % é definido apenas pelo sistema', new.status;
    end if;
    -- "Publicada" pelo usuário só no modo assistido (confirmação manual)
    if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
      if new.mode <> 'assisted' then raise exception 'Publicações automáticas só são marcadas como publicadas após confirmação da API'; end if;
      new.manual_done_at := coalesce(new.manual_done_at, now());
    end if;
    if tg_op = 'UPDATE' and old.status = 'processing' and new.status <> old.status then
      raise exception 'Publicação em processamento não pode ser alterada agora';
    end if;
    if tg_op = 'UPDATE' and old.status = 'published' and new.status <> 'published' then
      raise exception 'Publicação já concluída';
    end if;
  end if;

  if new.status = 'scheduled' then
    if new.scheduled_at is null then raise exception 'Informe data e horário do agendamento'; end if;
    select settings into v_settings from profiles where id = new.user_id;
    select approval_status into v_approval from campaigns where id = new.campaign_id;
    if coalesce((v_settings->>'approval_required')::boolean, true) and v_approval <> 'approved' then
      raise exception 'A campanha precisa ser aprovada antes do agendamento';
    end if;
    if new.mode = 'auto' and new.account_id is null then
      raise exception 'Integração não configurada para %: use o modo assistido ou conecte a conta', new.platform;
    end if;
    if new.mode = 'auto' and not coalesce((v_settings->'auto_publish'->>new.platform)::boolean, false) then
      raise exception 'Publicação automática desativada para % nas Configurações', new.platform;
    end if;
  end if;
  return new;
end $$;
create trigger trg_pubs_guard before insert or update on publications for each row execute function publications_guard();

-- Sincroniza a fila com o estado da publicação
create or replace function publications_sync_jobs() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'scheduled' then
    update jobs set run_at = new.scheduled_at, updated_at = now()
     where publication_id = new.id and status = 'queued';
    if not found and not exists (select 1 from jobs where publication_id = new.id and status = 'running') then
      insert into jobs(user_id, publication_id, run_at) values (new.user_id, new.id, new.scheduled_at);
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'scheduled' and new.status in ('cancelled','draft','awaiting_review','approved') then
    update jobs set status = 'cancelled', updated_at = now() where publication_id = new.id and status = 'queued';
  end if;
  return null;
end $$;
create trigger trg_pubs_jobs after insert or update of status, scheduled_at on publications for each row execute function publications_sync_jobs();

-- ---------- Fila: reserva atômica (somente service role) ----------
create or replace function claim_due_jobs(p_limit int default 10) returns setof jobs
language sql security definer set search_path = public as $$
  update jobs j set status = 'running', locked_at = now(), attempts = j.attempts + 1, updated_at = now()
   where j.id in (
     select id from jobs
      where (status = 'queued' and run_at <= now())
         or (status = 'running' and locked_at < now() - interval '10 minutes')  -- worker caiu: reprocessa com verificação
      order by run_at
      limit p_limit
      for update skip locked)
  returning j.*;
$$;
revoke all on function claim_due_jobs(int) from public, anon, authenticated;

-- ---------- Página intermediária (pública) ----------
create or replace function get_landing(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'title', p.title,
    'image', coalesce((select a.public_url from assets a where a.campaign_id = c.id and a.kind = 'image' order by (a.template = 'square') desc, a.created_at desc limit 1), p.image_url),
    'description', left(p.description, 400),
    'features', p.features,
    'affiliate_url', l.url,
    'is_demo', c.is_demo)
  from campaigns c
  join products p on p.id = c.product_id
  join affiliate_links l on l.id = c.affiliate_link_id
  where c.landing_slug = p_slug and c.landing_enabled and c.status not in ('archived')
$$;
grant execute on function get_landing(text) to anon, authenticated;

create or replace function register_click(p_slug text, p_platform text default null, p_referrer text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_c campaigns; v_url text;
begin
  select * into v_c from campaigns where landing_slug = p_slug and landing_enabled;
  if not found then return null; end if;
  select url into v_url from affiliate_links where id = v_c.affiliate_link_id;
  insert into click_events(user_id, campaign_id, platform_hint, referrer)
    values (v_c.user_id, v_c.id, left(p_platform, 20), left(p_referrer, 300));
  return v_url;  -- devolvido sem nenhuma alteração
end $$;
grant execute on function register_click(text, text, text) to anon, authenticated;

-- Exclusão de dados (LGPD): feita pela Edge Function `account` via auth.admin.deleteUser (cascata).

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800, array['image/png','image/jpeg','image/webp','video/webm','video/mp4'])
on conflict (id) do nothing;

create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- Aviso inicial de política ----------
insert into policy_notices(title, body, affects) values
('Regras do Programa de Afiliados e Criadores',
 'Gere os links somente pelo painel oficial do Mercado Livre e não altere seus parâmetros. É proibido divulgar links de afiliado em anúncios pagos de buscadores. Links só podem ser gerados para anúncios elegíveis (ex.: produtos novos de vendedores com reputação verde). Comissões dependem de aprovação do Mercado Livre e não são garantidas. Confira os termos vigentes em mercadolivre.com.br/l/afiliados-home.',
 array['links','landing']);

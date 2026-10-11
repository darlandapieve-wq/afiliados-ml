-- =====================================================================
-- Afiliados ML — esquema inicial
-- Todas as tabelas de dados têm user_id + RLS (isolamento por usuário).
-- Tabelas de segredos NÃO têm políticas: só o service role (Edge Functions) lê.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tipos ----------
create type publication_status as enum (
  'draft',            -- Rascunho
  'awaiting_review',  -- Aguardando revisão
  'approved',         -- Aprovada
  'scheduled',        -- Agendada
  'processing',       -- Em processamento
  'published',        -- Publicada (confirmada pela API)
  'failed',           -- Falha
  'cancelled',        -- Cancelada
  'awaiting_manual',  -- Aguardando ação manual (assistido ou resultado incerto)
  'not_configured'    -- Integração não configurada
);

create type campaign_status as enum ('draft','awaiting_review','approved','active','paused','archived');
create type job_status as enum ('queued','running','done','failed','cancelled');

-- ---------- updated_at helper ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Perfis / configurações ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'America/Sao_Paulo',
  brand jsonb not null default '{"primary":"#FFE600","secondary":"#2D3277","text":"#111111","font":"Inter","logo_path":null,"handle":null}',
  settings jsonb not null default '{"approval_required":true,"auto_publish":{},"max_posts_per_day":10,"min_minutes_between_posts":30,"bio_link_url":null}',
  privacy_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_upd before update on profiles for each row execute function set_updated_at();

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles(id, display_name) values (new.id, split_part(new.email,'@',1)) on conflict do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------- Plataformas (referência) ----------
create table platforms (
  code text primary key,
  name text not null,
  sort int not null default 0
);
insert into platforms(code,name,sort) values
 ('facebook','Facebook',1),('instagram','Instagram',2),('tiktok','TikTok',3),
 ('whatsapp','WhatsApp',4),('pinterest','Pinterest',5),('youtube','YouTube Shorts',6),('telegram','Telegram',7);

-- ---------- Produtos ----------
create table products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(title) between 2 and 300),
  original_url text check (original_url is null or original_url ~* '^https://'),
  ml_item_id text,
  price numeric(12,2) check (price is null or price >= 0),
  price_source text,                 -- 'manual' | 'ml_api'
  price_checked_at timestamptz,      -- quando o preço foi conferido
  image_url text,                    -- imagem externa (referência)
  image_path text,                   -- imagem própria no Storage
  image_rights text not null default 'unknown', -- 'own' | 'ml_listing' | 'unknown'
  category text,
  description text,
  features text[] not null default '{}',
  audience text,
  notes text,
  data_source text not null default 'manual',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on products(user_id, created_at desc);
create trigger trg_products_upd before update on products for each row execute function set_updated_at();

-- ---------- Links de afiliado ----------
create table affiliate_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  url text not null check (url ~* '^https://'),
  source text not null default 'manual_paste',  -- não existe API oficial de geração
  validation_status text not null default 'unchecked' check (validation_status in ('unchecked','valid','warning','invalid')),
  validation_notes text[] not null default '{}',
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);
create index on affiliate_links(product_id);
-- O link é imutável depois de salvo: preserva parâmetros de rastreamento.
create or replace function forbid_affiliate_url_change() returns trigger language plpgsql as $$
begin
  if new.url is distinct from old.url then
    raise exception 'O URL de afiliado não pode ser alterado; cadastre um novo link.';
  end if;
  return new;
end $$;
create trigger trg_aff_immutable before update on affiliate_links for each row execute function forbid_affiliate_url_change();

-- ---------- Campanhas ----------
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  affiliate_link_id uuid references affiliate_links(id) on delete restrict,
  name text not null,
  style text not null default 'informativo' check (style in ('informativo','promocional','comparativo','descontraido')),
  status campaign_status not null default 'draft',
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  approved_at timestamptz,
  show_price boolean not null default false,
  landing_enabled boolean not null default false,
  landing_slug text unique default lower(substr(md5(gen_random_uuid()::text),1,10)),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on campaigns(user_id, created_at desc);
create trigger trg_campaigns_upd before update on campaigns for each row execute function set_updated_at();

-- ---------- Artes / arquivos ----------
create table assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  kind text not null check (kind in ('image','video')),
  template text not null,
  width int not null, height int not null,
  mime text not null,
  storage_path text not null,
  public_url text not null,
  price_shown numeric(12,2),
  price_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on assets(campaign_id);

-- ---------- Variações de conteúdo por rede ----------
create table content_variants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  platform text not null references platforms(code),
  title text,
  caption text not null default '',
  hashtags text[] not null default '{}',
  link_placement text not null,  -- ver platforms.ts (clickable_post, bio, pin_link, ...)
  asset_id uuid references assets(id) on delete set null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, platform)
);
create trigger trg_variants_upd before update on content_variants for each row execute function set_updated_at();

-- ---------- Contas conectadas ----------
create table connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null references platforms(code),
  external_id text not null,
  display_name text,
  scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected','expired','revoked','error')),
  last_sync_at timestamptz,
  last_test_at timestamptz,
  last_test_result text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, external_id)
);
create trigger trg_accounts_upd before update on connected_accounts for each row execute function set_updated_at();

-- Segredos criptografados (AES-GCM na Edge Function). SEM políticas RLS => inacessível ao frontend.
create table account_secrets (
  account_id uuid primary key references connected_accounts(id) on delete cascade,
  access_ciphertext text not null,
  refresh_ciphertext text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  code_verifier text,
  return_to text,
  created_at timestamptz not null default now()
);

-- ---------- Publicações ----------
create table publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  variant_id uuid references content_variants(id) on delete set null,
  platform text not null references platforms(code),
  account_id uuid references connected_accounts(id) on delete set null,
  mode text not null default 'assisted' check (mode in ('auto','assisted')),
  status publication_status not null default 'draft',
  scheduled_at timestamptz,
  idempotency_key text not null unique default gen_random_uuid()::text,
  external_id text,
  external_url text,
  provider_state text,            -- estado retornado pela API (ex.: FINISHED, PUBLISH_COMPLETE)
  error_message text,
  request_sent_at timestamptz,    -- marcado ANTES de enviar: base da prevenção de duplicação
  confirmed_at timestamptz,
  attempts int not null default 0,
  manual_done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on publications(user_id, scheduled_at);
create index on publications(campaign_id);
create trigger trg_pubs_upd before update on publications for each row execute function set_updated_at();

-- ---------- Fila de tarefas ----------
create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  publication_id uuid not null references publications(id) on delete cascade,
  kind text not null default 'publish' check (kind in ('publish','verify')),
  run_at timestamptz not null,
  status job_status not null default 'queued',
  attempts int not null default 0,
  max_attempts int not null default 3,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_due_idx on jobs(status, run_at);
-- No máximo um job ativo por publicação
create unique index jobs_one_active on jobs(publication_id) where status in ('queued','running');
create trigger trg_jobs_upd before update on jobs for each row execute function set_updated_at();

-- ---------- Logs de execução ----------
create table execution_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  publication_id uuid references publications(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  level text not null default 'info' check (level in ('info','warn','error')),
  message text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on execution_logs(user_id, created_at desc);

-- ---------- Cliques na página intermediária ----------
create table click_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  platform_hint text,
  referrer text,
  occurred_at timestamptz not null default now()
);
create index on click_events(campaign_id, occurred_at);

-- ---------- Resultados do afiliado (informados manualmente) ----------
create table affiliate_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  ml_clicks int check (ml_clicks >= 0),
  ml_sales int check (ml_sales >= 0),
  commission_estimated numeric(12,2),
  commission_approved numeric(12,2),
  source text not null default 'manual' check (source in ('manual','official_api')),
  reference_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Avisos de política ----------
create table policy_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null, body text not null,
  affects text[] not null default '{}',
  requires_ack boolean not null default true,
  published_at timestamptz not null default now()
);
create table policy_acks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  notice_id uuid not null references policy_notices(id) on delete cascade,
  acked_at timestamptz not null default now(),
  primary key (user_id, notice_id)
);

-- ---------- Auditoria ----------
create table audit_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  entity text not null,
  entity_id uuid,
  action text not null,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index on audit_log(entity, entity_id, created_at desc);

create or replace function audit_trigger() returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_id uuid; v_changes jsonb;
begin
  if tg_op = 'DELETE' then v_user := old.user_id; v_id := old.id; v_changes := to_jsonb(old);
  elsif tg_op = 'INSERT' then v_user := new.user_id; v_id := new.id; v_changes := to_jsonb(new);
  else
    v_user := new.user_id; v_id := new.id;
    select jsonb_object_agg(n.key, jsonb_build_object('de', o.value, 'para', n.value)) into v_changes
      from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value and n.key not in ('updated_at');
    if v_changes is null then return new; end if;
  end if;
  insert into audit_log(user_id, entity, entity_id, action, changes) values (v_user, tg_table_name, v_id, lower(tg_op), v_changes);
  return coalesce(new, old);
end $$;
create trigger audit_campaigns after insert or update or delete on campaigns for each row execute function audit_trigger();
create trigger audit_variants after insert or update or delete on content_variants for each row execute function audit_trigger();
create trigger audit_publications after insert or update or delete on publications for each row execute function audit_trigger();
create trigger audit_links after insert or delete on affiliate_links for each row execute function audit_trigger();

-- =====================================================================
-- Módulo TikTok Shop (afiliado): criativos produzidos no Pippit
-- Fluxo: rascunho → briefing pronto → vídeo pronto → agendado no Pippit
--        → (enviando pela API) → publicado → sacolinha adicionada
-- A sacolinha (link de produto do TikTok Shop) NÃO existe na API oficial:
-- ela é adicionada no app ou no agendador do Pippit. O prazo de 30 dias
-- para incluir o link em vídeos já publicados é controlado em anchor_deadline.
-- =====================================================================

create type tts_status as enum (
  'draft',          -- Rascunho
  'brief_ready',    -- Briefing pronto (roteiro, legenda, prompt do Pippit)
  'video_ready',    -- Vídeo gerado no Pippit (ou enviado ao app)
  'scheduled',      -- Agendado no Pippit (com sacolinha)
  'posting',        -- Enviando pela API do TikTok (definido só pelo sistema)
  'published',      -- Publicado
  'anchor_added',   -- Sacolinha adicionada / confirmada
  'archived'        -- Arquivado
);

create table tts_creatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_name text not null check (length(product_name) between 2 and 200),
  product_url text check (product_url is null or product_url ~* '^https://'),
  image_path text,
  notes text check (notes is null or length(notes) <= 3000),
  format text not null default 'demo' check (format in ('demo','problema','curiosidade','explica','comparativo')),
  goal text not null default 'venda' check (goal in ('venda','seguidores')),
  duration_s int not null default 30 check (duration_s between 15 and 60),
  brief jsonb,
  brief_source text check (brief_source is null or brief_source in ('template','ai')),
  status tts_status not null default 'draft',
  scheduled_for timestamptz,
  video_path text,
  video_url text,
  publish_route text check (publish_route is null or publish_route in ('pippit','api','app')),
  published_at timestamptz,
  post_url text check (post_url is null or post_url ~* '^https://'),
  anchor_deadline timestamptz,
  anchor_added_at timestamptz,
  -- Campos do sistema (API do TikTok): o usuário não grava
  tt_account_id uuid references connected_accounts(id) on delete set null,
  tt_publish_id text,
  tt_state text,
  tt_privacy text,
  tt_error text,
  tt_request_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on tts_creatives(user_id, created_at desc);
create index tts_posting_idx on tts_creatives(status) where status = 'posting';
create trigger trg_tts_upd before update on tts_creatives for each row execute function set_updated_at();
create trigger audit_tts after insert or update or delete on tts_creatives for each row execute function audit_trigger();

alter table tts_creatives enable row level security;
create policy tts_creatives_own on tts_creatives for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Regras de estado e campos protegidos
create or replace function tts_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_end_user() then
    if tg_op = 'INSERT' and (new.tt_publish_id is not null or new.tt_request_sent_at is not null or new.tt_state is not null or new.tt_account_id is not null) then
      raise exception 'Campos da API do TikTok são definidos apenas pelo sistema';
    end if;
    if tg_op = 'UPDATE' and (new.tt_publish_id is distinct from old.tt_publish_id or new.tt_state is distinct from old.tt_state
        or new.tt_request_sent_at is distinct from old.tt_request_sent_at or new.tt_privacy is distinct from old.tt_privacy
        or new.tt_account_id is distinct from old.tt_account_id or new.tt_error is distinct from old.tt_error) then
      raise exception 'Campos da API do TikTok são definidos apenas pelo sistema';
    end if;
    if new.status = 'posting' and (tg_op = 'INSERT' or old.status <> 'posting') then
      raise exception 'O envio pela API é iniciado apenas pelo sistema';
    end if;
    if tg_op = 'UPDATE' and old.status = 'posting' and new.status <> 'posting' then
      raise exception 'Envio em andamento: aguarde a confirmação do TikTok';
    end if;
    if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') and coalesce(new.publish_route, 'pippit') = 'api' then
      raise exception 'Publicações pela API só são marcadas como publicadas após confirmação do TikTok';
    end if;
  end if;

  if new.status in ('published','anchor_added') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  if new.published_at is not null and (tg_op = 'INSERT' or new.published_at is distinct from old.published_at) then
    new.anchor_deadline := new.published_at + interval '30 days';
  end if;
  if new.status = 'anchor_added' then
    new.anchor_added_at := coalesce(new.anchor_added_at, now());
  end if;
  if new.status = 'scheduled' and new.scheduled_for is null then
    raise exception 'Informe o horário agendado no Pippit';
  end if;
  return new;
end $$;
create trigger trg_tts_guard before insert or update on tts_creatives for each row execute function tts_guard();
revoke execute on function public.tts_guard() from public, anon, authenticated;

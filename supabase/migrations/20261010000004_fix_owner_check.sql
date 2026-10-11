-- Corrige check_same_owner: campos acessados via jsonb (nem toda tabela tem account_id/asset_id)
create or replace function check_same_owner() returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new);
begin
  if tg_table_name = 'campaigns' then
    if not exists (select 1 from products where id = new.product_id and user_id = new.user_id) then raise exception 'Produto inválido'; end if;
    if new.affiliate_link_id is not null and not exists (select 1 from affiliate_links where id = new.affiliate_link_id and user_id = new.user_id and product_id = new.product_id) then
      raise exception 'Link de afiliado não pertence a este produto'; end if;
  elsif tg_table_name in ('content_variants','publications','assets') then
    if j->>'campaign_id' is not null and not exists (select 1 from campaigns where id = (j->>'campaign_id')::uuid and user_id = new.user_id) then
      raise exception 'Campanha inválida'; end if;
    if tg_table_name = 'publications' then
      if j->>'account_id' is not null and not exists (select 1 from connected_accounts where id = (j->>'account_id')::uuid and user_id = new.user_id and platform = j->>'platform') then
        raise exception 'Conta conectada inválida para esta plataforma'; end if;
      if j->>'variant_id' is not null and not exists (select 1 from content_variants where id = (j->>'variant_id')::uuid and campaign_id = (j->>'campaign_id')::uuid) then
        raise exception 'Variação de conteúdo não pertence à campanha'; end if;
    end if;
    if tg_table_name = 'content_variants' and j->>'asset_id' is not null and not exists (select 1 from assets where id = (j->>'asset_id')::uuid and user_id = new.user_id) then
      raise exception 'Arte inválida'; end if;
  elsif tg_table_name = 'affiliate_links' then
    if not exists (select 1 from products where id = new.product_id and user_id = new.user_id) then raise exception 'Produto inválido'; end if;
  end if;
  return new;
end $$;

-- Client requests round 2, workstream W3 (2026-11-09, ADR-0054): public catalogue rules.
--   1. businesses.share_enabled: the platform switches the Share button of a company's product pages off (staff only).
--   2. 3D-only publishing: a product can move to 'published' only with its own GLB row (publish_needs_model).
--      Rows that are already published are untouched (owner decision 2026-11-09).
--   3. The company description is internal: anon loses table-level select on businesses and keeps select on every
--      column except description. Staff and the company itself (the authenticated role) still read and edit it.
--
-- Nothing here deletes or rewrites data. Rollback: supabase/rollback/20261109_catalogue_rules_round2_rollback.sql.
-- Tested: supabase/tests/catalogueRulesRound2.test.ts (PGlite, every migration applied in order).
--
-- NOTE for later migrations: anon now has column grants on businesses. A column added to the table later is NOT readable
-- by anon until the migration adds `grant select (<column>) on public.businesses to anon` (the public pages read it by
-- an explicit column list, supabaseCatalogService PUBLIC_BUSINESS_COLUMNS). Never `select *` from businesses as anon.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Share switch
-- ---------------------------------------------------------------------------------------------------------------------
-- Default true: every company keeps its Share button until the platform turns it off.
alter table public.businesses add column share_enabled boolean not null default true;

-- Who may change it: the update column grant lets an API write reach the row, RLS lets only a business member or platform
-- staff with businesses.edit update it, and guard_business_admin_fields (an allow-list: owner columns are name, logo_url,
-- description, contacts, updated_at) refuses everyone but a platform admin or staff with businesses.edit, so a company's
-- owner gets the existing stable key business_field_admin_only. No change to the guard function is needed: a column that
-- is not on its allow-list is admin-only by construction.
grant update (share_enabled) on public.businesses to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. 3D-only publishing
-- ---------------------------------------------------------------------------------------------------------------------
-- Checked at commit (deferred), like the gallery-image rule, because save_product deletes and re-inserts a product's
-- model rows inside one transaction. Only the transition to 'published' fires it: a product that is already published
-- (a photo-only one from before this rule) can still be edited, and unpublishing or deleting is never blocked.
create function private.assert_publish_model(p_product uuid)
returns void
language plpgsql
security definer -- sees the product's model rows whatever the caller's RLS view
set search_path = ''
as $$
begin
  if exists (select 1 from public.products p where p.id = p_product and p.status = 'published')
     and not exists (select 1 from public.product_models m where m.product_id = p_product and m.format = 'glb') then
    raise exception 'publish_needs_model' using errcode = 'check_violation';
  end if;
end;
$$;

create function private.products_publish_model_check()
returns trigger
language plpgsql
security definer -- callers have no access to the private schema
set search_path = ''
as $$
begin
  perform private.assert_publish_model(new.id);
  return null;
end;
$$;

revoke all on function private.assert_publish_model(uuid) from public;
revoke all on function private.products_publish_model_check() from public;

create constraint trigger products_publish_requires_model_ins
  after insert on public.products
  deferrable initially deferred
  for each row when (new.status = 'published')
  execute function private.products_publish_model_check();

create constraint trigger products_publish_requires_model_upd
  after update of status on public.products
  deferrable initially deferred
  for each row when (new.status = 'published' and old.status is distinct from new.status)
  execute function private.products_publish_model_check();

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Company description is internal
-- ---------------------------------------------------------------------------------------------------------------------
-- A column privilege cannot be revoked from a table-level grant, so the table grant goes and every other column is
-- granted by name. The RLS policy "Active businesses are public" still decides which rows anon sees.
revoke select on public.businesses from anon;
do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_columns
    from pg_attribute
   where attrelid = 'public.businesses'::regclass and attnum > 0 and not attisdropped and attname <> 'description';
  execute format('grant select (%s) on public.businesses to anon', v_columns);
end;
$$;

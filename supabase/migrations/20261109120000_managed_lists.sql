-- Client requests round 2, workstream W4 (ADR-0055): product categories and currencies become admin-managed lists.
--
--  * public.product_categories (slug, label_en, label_pt, sort, active): seeded with the seven built-in categories and "Other".
--    products.category now references it (on update cascade) instead of the old check constraint. "other" can be neither
--    deleted nor hidden, and public.admin_delete_category(slug) moves the products of a category to "other" before removing it.
--  * public.currencies (code, enabled, sort): seeded with EUR, BRL, USD enabled and a common ISO list disabled.
--    products.currency and businesses.default_currency reference it instead of the old check constraints. Disabling a currency
--    that rows use is allowed (the rows keep it); it only stops being offered.
--  * Everyone (anon and authenticated) reads both lists. Writes need the Editor gate that already exists for website content:
--    2FA satisfied and the content.manage permission (public.can_manage_site_content(), migration site_content_assets).
--  * The landing-collection publish gate (private.validate_site_content) accepted a catalog link's category only from the
--    seven built-ins; it now accepts any slug-shaped value (a custom category is a valid link target). The function is patched
--    in place so this migration does not depend on which migration last defined it.
--
-- Code is text with a check (not char(3)): the referencing columns are text, and a foreign key between text and bpchar is not
-- a clean equality.
-- Applied to the testing project only with the owner's go-ahead. Rollback: supabase/rollback/20261109_managed_lists_rollback.sql.

-- =============================================================================
-- 1. product_categories
-- =============================================================================
create table public.product_categories (
  slug        text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  label_en    text not null check (char_length(btrim(label_en)) between 1 and 60),
  label_pt    text not null check (char_length(btrim(label_pt)) between 1 and 60),
  sort        integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint product_categories_other_active check (slug <> 'other' or active)
);

insert into public.product_categories (slug, label_en, label_pt, sort) values
  ('sofa',     'Sofa',     'Sofá',       10),
  ('chair',    'Chair',    'Cadeira',    20),
  ('table',    'Table',    'Mesa',       30),
  ('bed',      'Bed',      'Cama',       40),
  ('storage',  'Storage',  'Arrumação',  50),
  ('lighting', 'Lighting', 'Iluminação', 60),
  ('decor',    'Decor',    'Decoração',  70),
  ('other',    'Other',    'Outro',      1000);

-- "other" is the home of every product whose category was deleted: it keeps its slug and stays on the list.
create function private.product_categories_protect_other()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.slug = 'other' then
      raise exception 'category_protected' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.slug = 'other' and new.slug is distinct from 'other' then
    raise exception 'category_protected' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.product_categories_protect_other() from public, anon, authenticated;

create trigger product_categories_protect_other
  before update or delete on public.product_categories
  for each row execute function private.product_categories_protect_other();

-- =============================================================================
-- 2. currencies
-- =============================================================================
create table public.currencies (
  code     text primary key check (code ~ '^[A-Z]{3}$'),
  enabled  boolean not null default false,
  sort     integer not null default 100
);

insert into public.currencies (code, enabled, sort) values
  ('EUR', true, 1), ('BRL', true, 2), ('USD', true, 3);
insert into public.currencies (code, enabled, sort)
select c, false, 100 + (row_number() over (order by c))::integer
from unnest(array[
  'AED', 'ARS', 'AUD', 'BGN', 'CAD', 'CHF', 'CLP', 'CNY', 'COP', 'CVE', 'CZK', 'DKK', 'EGP', 'GBP', 'HKD', 'HUF',
  'ILS', 'INR', 'ISK', 'JPY', 'KES', 'KRW', 'KWD', 'MAD', 'MXN', 'MZN', 'NGN', 'NOK', 'NZD', 'PEN', 'PLN', 'QAR',
  'RON', 'SAR', 'SEK', 'SGD', 'THB', 'TRY', 'UAH', 'UYU', 'AOA', 'ZAR'
]) as t(c);

-- At least one currency must stay on offer, or the product editor would have nothing to pick.
create function private.currencies_keep_one_enabled()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.enabled and (tg_op = 'DELETE' or not new.enabled)
     and not exists (select 1 from public.currencies c where c.enabled and c.code <> old.code) then
    raise exception 'last_currency' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke execute on function private.currencies_keep_one_enabled() from public, anon, authenticated;

create trigger currencies_keep_one_enabled
  before update of enabled or delete on public.currencies
  for each row execute function private.currencies_keep_one_enabled();

-- =============================================================================
-- 3. Access: everyone reads, the Editor gate writes
-- =============================================================================
alter table public.product_categories enable row level security;
alter table public.currencies enable row level security;

revoke all on public.product_categories from public, anon, authenticated;
revoke all on public.currencies from public, anon, authenticated;
grant select on public.product_categories to anon, authenticated, service_role;
grant select on public.currencies to anon, authenticated, service_role;
grant insert, update, delete on public.product_categories to authenticated;
grant insert, update, delete on public.currencies to authenticated;

create policy "Anyone can read product categories" on public.product_categories
  for select to anon, authenticated using (true);
create policy "Content managers add product categories" on public.product_categories
  for insert to authenticated with check ((select public.can_manage_site_content()));
create policy "Content managers edit product categories" on public.product_categories
  for update to authenticated using ((select public.can_manage_site_content())) with check ((select public.can_manage_site_content()));
create policy "Content managers delete product categories" on public.product_categories
  for delete to authenticated using ((select public.can_manage_site_content()));

create policy "Anyone can read currencies" on public.currencies
  for select to anon, authenticated using (true);
create policy "Content managers add currencies" on public.currencies
  for insert to authenticated with check ((select public.can_manage_site_content()));
create policy "Content managers edit currencies" on public.currencies
  for update to authenticated using ((select public.can_manage_site_content())) with check ((select public.can_manage_site_content()));
create policy "Content managers delete currencies" on public.currencies
  for delete to authenticated using ((select public.can_manage_site_content()));

-- =============================================================================
-- 4. The products and businesses now reference the lists
-- =============================================================================
alter table public.products drop constraint if exists products_category_check;
alter table public.products drop constraint if exists products_currency_check;
alter table public.businesses drop constraint if exists businesses_default_currency_check;

alter table public.products
  add constraint products_category_fkey foreign key (category) references public.product_categories (slug) on update cascade;
alter table public.products
  add constraint products_currency_fkey foreign key (currency) references public.currencies (code) on update cascade;
alter table public.businesses
  add constraint businesses_default_currency_fkey foreign key (default_currency) references public.currencies (code) on update cascade;

-- Foreign-key columns are indexed (deleting a category moves its products; renaming a slug cascades).
create index products_category_idx on public.products (category);
create index products_currency_idx on public.products (currency);
create index businesses_default_currency_idx on public.businesses (default_currency);

-- =============================================================================
-- 5. Deleting a category: its products move to "other" first
-- =============================================================================
-- SECURITY DEFINER because the caller is staff, not the owner of those products; the Editor gate (2FA + content.manage) is
-- the first statement. Returns how many products moved.
create function public.admin_delete_category(p_slug text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moved integer;
begin
  perform private.require_content_manage();
  if p_slug = 'other' then
    raise exception 'category_protected' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.product_categories where slug = p_slug) then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;
  update public.products set category = 'other' where category = p_slug;
  get diagnostics v_moved = row_count;
  delete from public.product_categories where slug = p_slug;
  return v_moved;
end;
$$;
revoke execute on function public.admin_delete_category(text) from public, anon;
grant execute on function public.admin_delete_category(text) to authenticated, service_role;

-- =============================================================================
-- 6. Landing collection links accept any slug-shaped category
-- =============================================================================
do $$
declare
  v_def text := pg_get_functiondef('private.validate_site_content(jsonb)'::regprocedure);
  v_old constant text := '(v_link ->> ''category'') <> all (c_categories)';
  v_new constant text := '(v_link ->> ''category'') !~ c_slug';
begin
  if position(v_old in v_def) = 0 then
    raise notice 'private.validate_site_content: the built-in category check was not found (already changed); left as is';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end;
$$;

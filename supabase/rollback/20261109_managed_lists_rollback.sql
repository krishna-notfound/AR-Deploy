-- Rollback for supabase/migrations/20261109120000_managed_lists.sql (client requests round 2, W4, ADR-0055): puts back the
-- check constraints on products.category, products.currency and businesses.default_currency, restores the built-in-only
-- category check in private.validate_site_content, and drops the two lists with admin_delete_category. Run as the database owner.
--
-- REFUSES (raises, changes nothing) when a product uses a category other than the original seven, or a product or business uses
-- a currency other than EUR, BRL or USD: the old constraints would reject those rows. Move those rows first (for example to
-- 'decor' and 'EUR'), then run this again. Redeploy the release before this change first, or the app would read lists that are gone.
-- DATA: renamed labels, the order, hidden flags, added categories and enabled currencies are lost with the tables.

begin;

do $$
declare
  v_cat integer;
  v_cur integer;
begin
  select count(*) into v_cat from public.products where category not in ('sofa', 'chair', 'table', 'bed', 'storage', 'lighting', 'decor');
  select (select count(*) from public.products where currency not in ('EUR', 'BRL', 'USD'))
       + (select count(*) from public.businesses where default_currency not in ('EUR', 'BRL', 'USD')) into v_cur;
  if v_cat > 0 or v_cur > 0 then
    raise exception 'managed_lists rollback refused: % product(s) use a category outside the original seven and % row(s) use a currency outside EUR/BRL/USD. Move them first.', v_cat, v_cur;
  end if;
end;
$$;

alter table public.products drop constraint products_category_fkey;
alter table public.products drop constraint products_currency_fkey;
alter table public.businesses drop constraint businesses_default_currency_fkey;

alter table public.products
  add constraint products_category_check check (category in ('sofa', 'chair', 'table', 'bed', 'storage', 'lighting', 'decor'));
alter table public.products
  add constraint products_currency_check check (currency in ('EUR', 'BRL', 'USD'));
alter table public.businesses
  add constraint businesses_default_currency_check check (default_currency in ('EUR', 'BRL', 'USD'));

drop index if exists public.products_category_idx;
drop index if exists public.products_currency_idx;
drop index if exists public.businesses_default_currency_idx;

drop function public.admin_delete_category(text);
drop table public.product_categories;
drop table public.currencies;
drop function private.product_categories_protect_other();
drop function private.currencies_keep_one_enabled();

-- The catalog link's category goes back to the seven built-ins.
do $$
declare
  v_def text := pg_get_functiondef('private.validate_site_content(jsonb)'::regprocedure);
  v_new constant text := '(v_link ->> ''category'') <> all (c_categories)';
  v_old constant text := '(v_link ->> ''category'') !~ c_slug';
begin
  if position(v_old in v_def) > 0 then
    execute replace(v_def, v_old, v_new);
  end if;
end;
$$;

commit;

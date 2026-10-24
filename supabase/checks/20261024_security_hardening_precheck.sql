-- Read-only pre-check for 20261024065538_security_hardening. Run on the target BEFORE applying it.
-- Every statement is a SELECT; nothing is created, changed or deleted. Expected on a clean target: 0 everywhere.
--
--   blocks_apply   > 0: the migration FAILS (unique index on existing rows). Fix the rows first.
--   blocks_writes  > 0: the migration applies, but every later update/save of that row (or product) is refused
--                       until the value is fixed; the matching constraint cannot be VALIDATEd yet.

select rule, effect, count(*) as rows
from (
  -- Part 3: more than one primary image (unique indexes; blocks the whole migration).
  select 'product with >1 primary image' as rule, 'blocks_apply' as effect
    from public.product_images where is_primary group by product_id having count(*) > 1
  union all
  select 'variant with >1 primary image', 'blocks_apply'
    from public.product_variant_images where is_primary group by variant_id having count(*) > 1
  -- Part 1: https only (businesses_logo_url_https, product_images_url_https, product_models_url_https).
  union all
  select 'business logo_url not https', 'blocks_writes'
    from public.businesses where logo_url is not null and logo_url !~* '^https://'
  union all
  select 'product image url not https or /path', 'blocks_writes'
    from public.product_images where url is not null and url !~* '^(https://|/[^/])'
  union all
  select 'product model url not https or /path', 'blocks_writes'
    from public.product_models where url is not null and url !~* '^(https://|/[^/])'
  -- Part 2: storage_path shape (policy; save_product re-inserts every image/model, so the product's next save fails).
  union all
  select 'product image storage_path not <business>/<uuid>.(png|jpg|jpeg|webp)', 'blocks_writes'
    from public.product_images i join public.products p on p.id = i.product_id
   where i.storage_path is not null
     and i.storage_path !~ ('^' || p.business_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$')
  union all
  select 'product model storage_path not <business>/<uuid>.(glb|usdz)', 'blocks_writes'
    from public.product_models m join public.products p on p.id = m.product_id
   where m.storage_path is not null
     and m.storage_path !~ ('^' || p.business_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(glb|usdz)$')
  -- Part 3: products_name_en_not_blank, product_variants_price_delta_nonneg.
  union all
  select 'product with blank English name', 'blocks_writes'
    from public.products where coalesce(name ->> 'en', '') !~ '[^[:space:]]'
  union all
  select 'variant with negative price_delta', 'blocks_writes'
    from public.product_variants where price_delta < 0
) v
group by rule, effect
order by effect, rule;

-- Detail for any rule above that is not 0 (ids only; no personal data):
-- select product_id, count(*) from public.product_images where is_primary group by product_id having count(*) > 1;
-- select variant_id, count(*) from public.product_variant_images where is_primary group by variant_id having count(*) > 1;
-- select id, slug from public.businesses where logo_url is not null and logo_url !~* '^https://';
-- select id, product_id, storage_path from public.product_images where storage_path is not null;  -- compare by eye
-- select id, business_id, slug from public.products where coalesce(name ->> 'en', '') !~ '[^[:space:]]';
-- select id, product_id, price_delta from public.product_variants where price_delta < 0;
--
-- Informational (not blocking): AR/3D events already recorded for products that have no model (part 4 only
-- stops new ones; nothing is deleted).
select count(*) as ar_events_without_model
from public.product_analytics a
where a.event_type in ('ar_activation', 'model_interaction')
  and not exists (select 1 from public.product_models m where m.product_id = a.product_id)
  and not exists (select 1 from public.product_variant_models vm where vm.product_id = a.product_id);

-- Informational (COR-16): users with more than one membership (the app shows only the newest business).
select count(*) as users_with_several_memberships
from (select user_id from public.business_members group by user_id having count(*) > 1) s;

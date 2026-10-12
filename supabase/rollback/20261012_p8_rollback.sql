-- =============================================================================
-- ROLLBACK for the three P8 migrations (init_schema, storage, save_product).
-- NOT a migration: kept outside supabase/migrations so the CLI never runs it.
--
-- DESTRUCTIVE: drops every table below and ALL rows in them (businesses, products,
-- memberships, platform admins, analytics). Take a backup first
-- (Dashboard → Database → Backups, or `supabase db dump --data-only`).
--
-- Storage: policies are dropped; buckets are dropped only if they are empty.
-- Remove stored files first through the Storage API/dashboard if you want the buckets gone
-- (deleting rows from storage.objects with SQL does not delete the underlying files).
--
-- After running it, also remove the rows from supabase_migrations.schema_migrations
-- (or run `supabase migration repair --status reverted <version>` for each version).
-- =============================================================================

begin;

drop policy if exists "Logo writers can read" on storage.objects;
drop policy if exists "Members and admins upload logos" on storage.objects;
drop policy if exists "Members and admins update logos" on storage.objects;
drop policy if exists "Members and admins delete logos" on storage.objects;
drop policy if exists "Media of visible products is readable" on storage.objects;
drop policy if exists "Members and admins read own media" on storage.objects;
drop policy if exists "Members and admins upload media" on storage.objects;
drop policy if exists "Members and admins update media" on storage.objects;
drop policy if exists "Members and admins delete media" on storage.objects;

delete from storage.buckets b
where b.id in ('business-logos', 'product-media')
  and not exists (select 1 from storage.objects o where o.bucket_id = b.id);

drop function if exists public.save_product(jsonb, jsonb, jsonb, jsonb);

drop view if exists public.product_analytics_daily;
drop table if exists public.product_analytics;
drop table if exists public.product_variants;
drop table if exists public.product_models;
drop table if exists public.product_images;
drop table if exists public.products;
drop table if exists public.business_members;
drop table if exists public.platform_admins;
drop table if exists public.businesses;

drop function if exists public.guard_business_admin_fields();
drop function if exists public.set_updated_at();
drop function if exists public.is_business_member(uuid);
drop function if exists public.is_platform_admin();

commit;

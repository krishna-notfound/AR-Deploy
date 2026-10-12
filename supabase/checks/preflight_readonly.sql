-- Read-only pre-flight for the P8 migrations. Run BEFORE `supabase db push` on the target project.
-- Every statement is a SELECT; nothing is created, changed or deleted.
-- Expected on a clean target: queries 1–4 return no rows, query 5 returns only Supabase's own policies (or none).

-- 1. Name collisions in public (the migration fails if any of these exist).
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('businesses', 'platform_admins', 'business_members', 'products', 'product_images',
                     'product_models', 'product_variants', 'product_analytics', 'product_analytics_daily');

-- 2. Function collisions.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_platform_admin', 'is_business_member', 'set_updated_at', 'guard_business_admin_fields', 'save_product');

-- 3. Existing buckets with our ids (an existing public product-media bucket aborts the storage migration).
select id, public, file_size_limit, allowed_mime_types from storage.buckets
where id in ('business-logos', 'product-media');

-- 4. Migration history (versions already recorded on the target).
select version, name from supabase_migrations.schema_migrations order by version;

-- 5. Existing storage.objects policies. Policies are OR-ed: any broad policy here
--    (e.g. "using (true)" for anon) would expose product-media regardless of ours.
select policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'storage' and tablename = 'objects';

-- 6. Default privileges in public (informational: the migration revokes and re-grants explicitly).
select defaclrole::regrole, defaclobjtype, defaclacl from pg_default_acl
where defaclnamespace = 'public'::regnamespace;

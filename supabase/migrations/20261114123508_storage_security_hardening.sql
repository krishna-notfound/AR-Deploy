-- =============================================================================
-- Storage security hardening (QA report 2026-11-14, group storage-security; ADR-0071).
--
-- Touches Storage only: bucket limits, storage.objects policies and two helper functions for them. No table, column or
-- table policy changes.
--
--   A. Bucket size limits equal the largest file the app accepts (UX-3). The browser checks stay; the bucket now agrees.
--        business-logos  unchanged at 40 MB (ADR-0065, owner 2026-11-11)
--        product-media   50 MB -> 40 MB  (the largest file is a 40 MB USDZ; a GLB is 30 MB; a picture 5 MB)
--        ar-models       50 MB -> 40 MB  (copies of the product-media models)
--      Unchanged because a legitimate file reaches the limit: site-content 40 MB (.usdz), avatars 512 KB,
--      model-request-photos 10 MB, application-files 20 MB. A limit is only ever lowered here, never raised, and files
--      already stored are not touched.
--   B. Avatars (F-TI-1): a name must be {user id}/{uuid}.{jpg|png|webp}. Storage cannot read file content in a policy, so
--      this stops odd names and extensions; the content check is made in the app (the service reads the file header).
--   C. Platform staff with products.edit only (the Team role) can no longer delete or overwrite a product-media file that a
--      product, option or request still uses (UX-4): they may remove only files nothing references, which is what
--      replacing a picture or a model needs. products.delete, businesses.delete and models.manage keep their rights.
--   D. public.can_sync_ar_models_business(): who may ask sync-ar-models to bring every public AR copy of one business in line
--      with the business and its products (RLS-01 / BL-2: pausing or deleting a business no longer depends on what the caller
--      can read).
--
-- Not changed: the product-media read policies. Anonymous visitors already reach only objects a published product of an active
-- business references (checked against the live project on 2026-11-14: 33 listed, 0 unreferenced).
--
-- Rollback: supabase/rollback/20261114_storage_security_hardening_rollback.sql.
-- Tests: supabase/tests/storageSecurity.test.ts (PGlite). NOT APPLIED to any project; apply only with the owner's go-ahead.
-- =============================================================================

-- PRE-FLIGHT (storage_security_hardening) BEGIN
-- Read-only; run before this migration.
-- select id, public, file_size_limit from storage.buckets order by id;
-- select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
--  and policyname in ('Platform members delete media', 'Platform members update media', 'Users upload their own avatar', 'Users replace their own avatar');
-- PRE-FLIGHT (storage_security_hardening) END

-- ---------------------------------------------------------------------------------------------------------------------
-- A. Bucket limits (only ever lowered)
-- ---------------------------------------------------------------------------------------------------------------------
-- business-logos stays at 40 MB (owner decision 2026-11-11, ADR-0065: catalogue banner originals); not lowered here.
update storage.buckets set file_size_limit = 41943040 where id in ('product-media', 'ar-models') and (file_size_limit is null or file_size_limit > 41943040);

-- ---------------------------------------------------------------------------------------------------------------------
-- B. Avatars: the file name must be {user id}/{uuid}.{jpg|png|webp}
-- ---------------------------------------------------------------------------------------------------------------------
drop policy "Users upload their own avatar" on storage.objects;
create policy "Users upload their own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
              and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'));
drop policy "Users replace their own avatar" on storage.objects;
create policy "Users replace their own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars'
              and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'));

-- ---------------------------------------------------------------------------------------------------------------------
-- C. product-media: staff with products.edit change only files nothing references
-- ---------------------------------------------------------------------------------------------------------------------
-- True when the caller holds products.edit and no product, option, original or request uses `p_name`. Security definer
-- because the caller cannot read every referencing row through RLS. It answers only "may I change this file", so it is no
-- way to ask whether a path is in use (a caller without products.edit always gets false).
create function public.product_media_editor_can_change(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.platform_can('products.edit'), false)
     and coalesce(cardinality(private.unreferenced_media_paths(array[p_name])), 0) = 1;
$$;
revoke execute on function public.product_media_editor_can_change(text) from public, anon;
grant execute on function public.product_media_editor_can_change(text) to authenticated;

-- Body of 20261026120000_s4_model_requests.sql, with products.edit narrowed to files nothing uses.
drop policy "Platform members delete media" on storage.objects;
create policy "Platform members delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-media'
         and ((select public.platform_can('products.delete')) or (select public.platform_can('businesses.delete'))
              or (name ~ '\.(glb|usdz)$' and (select public.platform_can('models.manage')))
              or (select public.product_media_editor_can_change(name))));
-- Body of 20261025070915_platform_team_roles.sql; overwriting a file that is in use is refused. New uploads use new names.
drop policy "Platform members update media" on storage.objects;
create policy "Platform members update media" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-media' and (select public.product_media_editor_can_change(name)))
  with check (bucket_id = 'product-media' and (select public.platform_can('products.edit')));

-- ---------------------------------------------------------------------------------------------------------------------
-- D. Who may ask for a business-wide AR sync
-- ---------------------------------------------------------------------------------------------------------------------
-- A business member (business 2FA gate), or staff who can pause, publish, edit or delete: the staff who change what is public.
-- The Edge Function reads the business's products with the service role, so the caller needs no read access to them. For a
-- business that no longer exists, p_business names the folder to empty and only staff (businesses.delete) pass.
create function public.can_sync_ar_models_business(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_business is not null
     and (coalesce(public.is_business_member(p_business), false)
          or coalesce(public.platform_can('businesses.edit'), false)
          or coalesce(public.platform_can('businesses.delete'), false)
          or coalesce(public.platform_can('products.publish'), false)
          or coalesce(public.platform_can('products.edit'), false));
$$;
revoke execute on function public.can_sync_ar_models_business(uuid) from public, anon;
grant execute on function public.can_sync_ar_models_business(uuid) to authenticated, service_role;

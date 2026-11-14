-- Rollback for supabase/migrations/20261114123508_storage_security_hardening.sql (ADR-0071). Puts the bucket limits and the
-- storage.objects policies back to their earlier bodies and drops the two helper functions. Run as the database owner, only
-- with the owner's approval.
--
-- DATA: nothing is deleted or rewritten. Files already stored are untouched.
-- Limits go back to what they were: business-logos 40 MB (ADR-0065), product-media and ar-models 50 MB.
-- Staff with products.edit (the Team role) can again delete or overwrite any product-media file, and an avatar may again
-- have any name in its owner's folder.
-- Redeploy the release before this change first if the app already calls sync-ar-models with a business id: the function
-- then asks public.can_sync_ar_models_business, which this script removes.

begin;

update storage.buckets set file_size_limit = 41943040 where id = 'business-logos';
update storage.buckets set file_size_limit = 52428800 where id in ('product-media', 'ar-models');

drop policy "Users upload their own avatar" on storage.objects;
create policy "Users upload their own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy "Users replace their own avatar" on storage.objects;
create policy "Users replace their own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Body of 20261026120000_s4_model_requests.sql.
drop policy "Platform members delete media" on storage.objects;
create policy "Platform members delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-media'
         and ((select public.platform_can('products.edit')) or (select public.platform_can('products.delete'))
              or (select public.platform_can('businesses.delete'))
              or (name ~ '\.(glb|usdz)$' and (select public.platform_can('models.manage')))));
-- Body of 20261025070915_platform_team_roles.sql.
drop policy "Platform members update media" on storage.objects;
create policy "Platform members update media" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-media' and (select public.platform_can('products.edit')))
  with check (bucket_id = 'product-media' and (select public.platform_can('products.edit')));

drop function public.product_media_editor_can_change(text);
drop function public.can_sync_ar_models_business(uuid);

commit;

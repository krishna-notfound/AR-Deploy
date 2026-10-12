-- =============================================================================
-- storage: buckets and storage.objects policies for logos, product images and
-- 3D models. Requires the init_schema migration (uses its tables/helpers).
--
-- Safe to review before applying: creates two buckets (skipped if they exist)
-- and adds policies; no objects are uploaded or deleted.
--
-- Path convention (both buckets):  {business_id}/{random-uuid}.{ext}
--   Logos uploaded while creating a new business: new/{uuid}.{ext} (admins only).
--
-- business-logos  public bucket: anyone with the URL can read a logo. No SVG
--                 (an SVG served from a public bucket can carry script).
-- product-media   private bucket: images + GLB/USDZ. Readable by anon only when
--                 referenced by a published product of an active business
--                 (served via signed URLs); drafts stay private.
--
-- Platform admins are added manually:
--   insert into public.platform_admins (user_id)
--   select id from auth.users where email = 'you@example.com';
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('business-logos', 'business-logos', true, 2097152,
   array['image/png', 'image/jpeg', 'image/webp']),
  ('product-media', 'product-media', false, 52428800,
   array['image/png', 'image/jpeg', 'image/webp', 'model/gltf-binary', 'model/vnd.usdz+zip'])
on conflict (id) do nothing;

-- An existing bucket keeps its settings (on conflict do nothing). Refuse to continue if
-- product-media already exists as a public bucket: these policies assume it is private.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'product-media' and public) then
    raise exception 'Bucket product-media exists and is public. Make it private before applying this migration.';
  end if;
end;
$$;

-- Folder = business id. Compared as text: non-uuid folders such as 'new' must not throw.

-- business-logos ------------------------------------------------------------
create policy "Logo writers can read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'business-logos'
    and ((select public.is_platform_admin())
         or exists (select 1 from public.business_members m
                    where m.user_id = (select auth.uid())
                      and m.business_id::text = (storage.foldername(name))[1]))
  );
create policy "Members and admins upload logos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-logos'
    and ((select public.is_platform_admin())
         or exists (select 1 from public.business_members m
                    where m.user_id = (select auth.uid())
                      and m.business_id::text = (storage.foldername(name))[1]))
  );
create policy "Members and admins update logos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'business-logos'
    and ((select public.is_platform_admin())
         or exists (select 1 from public.business_members m
                    where m.user_id = (select auth.uid())
                      and m.business_id::text = (storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'business-logos'
    and ((select public.is_platform_admin())
         or exists (select 1 from public.business_members m
                    where m.user_id = (select auth.uid())
                      and m.business_id::text = (storage.foldername(name))[1]))
  );
create policy "Members and admins delete logos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-logos'
    and ((select public.is_platform_admin())
         or exists (select 1 from public.business_members m
                    where m.user_id = (select auth.uid())
                      and m.business_id::text = (storage.foldername(name))[1]))
  );

-- product-media -------------------------------------------------------------
-- Readable when a visible product references the object (child-table RLS limits
-- this to published products of active businesses for anon).
create policy "Media of visible products is readable" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'product-media'
    and (exists (select 1 from public.product_images i where i.storage_path = name)
         or exists (select 1 from public.product_models pm where pm.storage_path = name))
  );
-- Owners can also read their own not-yet-referenced uploads.
create policy "Members and admins read own media" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'product-media'
    and ((select public.is_platform_admin())
         or exists (select 1 from public.business_members m
                    where m.user_id = (select auth.uid())
                      and m.business_id::text = (storage.foldername(name))[1]))
  );
create policy "Members and admins upload media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-media'
    and ((select public.is_platform_admin())
         or exists (select 1 from public.business_members m
                    where m.user_id = (select auth.uid())
                      and m.business_id::text = (storage.foldername(name))[1]))
  );
create policy "Members and admins update media" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-media'
    and ((select public.is_platform_admin())
         or exists (select 1 from public.business_members m
                    where m.user_id = (select auth.uid())
                      and m.business_id::text = (storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'product-media'
    and ((select public.is_platform_admin())
         or exists (select 1 from public.business_members m
                    where m.user_id = (select auth.uid())
                      and m.business_id::text = (storage.foldername(name))[1]))
  );
create policy "Members and admins delete media" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-media'
    and ((select public.is_platform_admin())
         or exists (select 1 from public.business_members m
                    where m.user_id = (select auth.uid())
                      and m.business_id::text = (storage.foldername(name))[1]))
  );

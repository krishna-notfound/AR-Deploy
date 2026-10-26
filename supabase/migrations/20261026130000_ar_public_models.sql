-- =============================================================================
-- Public AR model copies (owner decision 2026-10-26).
--
-- Phone AR (Scene Viewer, AR Quick Look; ADR-0021) must load the 3D file from a stable public URL, as main does. The
-- uploads stay in the private product-media bucket; the sync-ar-models Edge Function (service role) copies the GLB/USDZ
-- of each PUBLISHED product (and of each of its variants) into the public ar-models bucket and records the copy's URL
-- in public_url. Unpublishing or deleting a product removes its folder and clears public_url.
--
--   1. Bucket ar-models: public read, 50 MB, GLB and USDZ only. No storage.objects policy names it, so anon and
--      authenticated cannot insert, update or delete there; only the service role (bypasses RLS) writes.
--      Path: <business_id>/<product_id>/<variant_id|base>/<format>-<source file id>.<ext>
--   2. product_models.public_url, product_variant_models.public_url: nullable, https only, at most 2048 characters.
--      A trigger keeps the API roles from setting it (their insert stores null, their update keeps the old value).
--   3. can_sync_ar_models(p_product, p_business default null): may the caller ask for a sync? A business member of
--      the product's business (is_business_member, business 2FA gate), or staff with products.publish or products.edit
--      (platform_can, staff 2FA gate). For a product that no longer exists, p_business names the business whose
--      folder is to be removed. Security definer, execute for authenticated and service_role only.
--
-- Rollback: supabase/rollback/20261026_ar_public_models_rollback.sql
-- =============================================================================

-- 1. Bucket. An existing bucket keeps its settings; it must be public for these URLs to work.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ar-models', 'ar-models', true, 52428800, array['model/gltf-binary', 'model/vnd.usdz+zip'])
on conflict (id) do nothing;

do $$
begin
  if exists (select 1 from storage.buckets where id = 'ar-models' and not public) then
    raise exception 'Bucket ar-models exists and is private. Make it public (or remove it) before applying this migration.';
  end if;
end;
$$;

-- 2. public_url columns.
alter table public.product_models
  add column public_url text
  constraint product_models_public_url_https check (public_url ~* '^https://[^/]' and char_length(public_url) <= 2048);
alter table public.product_variant_models
  add column public_url text
  constraint product_variant_models_public_url_https check (public_url ~* '^https://[^/]' and char_length(public_url) <= 2048);

create function private.ar_models_keep_public_url()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only the service role (sync-ar-models) sets public_url. A direct API write, or save_product called by one, keeps
  -- whatever was there (null for a new row).
  if current_user in ('anon', 'authenticated') or coalesce((select auth.jwt()) ->> 'role', '') in ('anon', 'authenticated') then
    new.public_url := case when tg_op = 'UPDATE' then old.public_url else null end;
  end if;
  return new;
end;
$$;
revoke all on function private.ar_models_keep_public_url() from public, anon, authenticated;

create trigger product_models_keep_public_url
  before insert or update on public.product_models
  for each row execute function private.ar_models_keep_public_url();
create trigger product_variant_models_keep_public_url
  before insert or update on public.product_variant_models
  for each row execute function private.ar_models_keep_public_url();

-- 3. Who may ask for a sync.
create function public.can_sync_ar_models(p_product uuid, p_business uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  select p.business_id into v_business from public.products p where p.id = p_product;
  if not found then
    v_business := p_business;
  end if;
  return coalesce(v_business is not null and public.is_business_member(v_business), false)
      or coalesce(public.platform_can('products.publish'), false)
      or coalesce(public.platform_can('products.edit'), false);
end;
$$;
revoke all on function public.can_sync_ar_models(uuid, uuid) from public, anon;
grant execute on function public.can_sync_ar_models(uuid, uuid) to authenticated, service_role;

-- =============================================================================
-- variant_media: per-variant photos and 3D models (owner-approved, additive).
--
-- 1. Products can no longer change business (OWN-01): media would otherwise follow a product into another
--    tenant's catalogue while its files stay in the old business's folder.
-- 2. product_variant_images / product_variant_models: owner uploads only (storage_path, no external URL),
--    with the exact upload path shape {business_id}/{uuid}.{ext} and a composite FK that ties every row to a
--    variant of the same product.
-- 3. product_models / product_variant_models.required_extensions: the GLB's glTF extensionsRequired as read
--    by the editor, so the Android AR (Scene Viewer) warning survives a reload (AR-01/02). NULL = not checked.
-- 4. A storage read policy for media of visible variants (ORs with "Media of visible products is readable").
-- 5. save_product keeps variant ids stable (upsert by id within the product) and writes variant media in the
--    same transaction; removed variants are deleted and cascade their media (AR-14). Caps: 50 variants,
--    20 photos per variant.
--
-- Pre-check before applying: none needed. Nothing here validates existing rows except the new unique
-- constraint on product_variants (id, product_id), which always holds because id is the primary key.
-- Rollback: drop the two tables, the policy, the trigger + function, the constraint and the two columns,
-- then re-apply 20261012192454_save_product.sql's function body with `create or replace`.
-- =============================================================================

-- 1. Products never change business. Applies to every API role, platform admins included;
--    service_role and postgres (migrations, support) are exempt.
create function private.products_business_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.business_id is distinct from old.business_id and current_user in ('anon', 'authenticated') then
    raise exception 'product_business_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.products_business_immutable() from public;

create trigger products_business_immutable
  before update of business_id on public.products
  for each row execute function private.products_business_immutable();

-- 2. Tables -------------------------------------------------------------------
-- Composite FK target: a variant-media row's (variant_id, product_id) must be a real pair.
alter table public.product_variants
  add constraint product_variants_id_product_key unique (id, product_id);

create table public.product_variant_images (
  id           uuid primary key default gen_random_uuid(),
  variant_id   uuid not null,
  product_id   uuid not null,
  storage_path text not null check (char_length(storage_path) <= 512),
  alt          text check (char_length(alt) <= 300),
  is_primary   boolean not null default false,
  sort_order   integer not null default 0 check (sort_order between 0 and 19),
  created_at   timestamptz not null default now(),
  foreign key (variant_id, product_id) references public.product_variants (id, product_id) on delete cascade
);
create index product_variant_images_variant_sort_idx on public.product_variant_images (variant_id, sort_order);
create index product_variant_images_product_idx on public.product_variant_images (product_id);
create index product_variant_images_storage_path_idx on public.product_variant_images (storage_path);

create table public.product_variant_models (
  variant_id          uuid not null,
  product_id          uuid not null,
  format              text not null check (format in ('glb', 'usdz')),
  storage_path        text not null check (char_length(storage_path) <= 512),
  file_name           text not null check (char_length(file_name) <= 255),
  size_bytes          bigint check (size_bytes >= 0),
  required_extensions text[] check (cardinality(required_extensions) <= 32
                                    and char_length(array_to_string(required_extensions, ',')) <= 2000),
  created_at          timestamptz not null default now(),
  primary key (variant_id, format),
  foreign key (variant_id, product_id) references public.product_variants (id, product_id) on delete cascade
);
create index product_variant_models_product_idx on public.product_variant_models (product_id);
create index product_variant_models_storage_path_idx on public.product_variant_models (storage_path);

-- 3. Scene Viewer warning for the product's own GLB (nullable, additive).
alter table public.product_models
  add column required_extensions text[] check (cardinality(required_extensions) <= 32
                                               and char_length(array_to_string(required_extensions, ',')) <= 2000);

-- RLS --------------------------------------------------------------------------
-- Read = the parent product is visible (products RLS applies inside the subquery: anon sees published
-- products of active businesses only). Write = member/admin of the product's business AND the file sits in
-- that business's folder with the exact upload shape (no '..', no sub-folders, images vs models by extension).
alter table public.product_variant_images enable row level security;
alter table public.product_variant_models enable row level security;

create policy "Variant images follow product visibility" on public.product_variant_images
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));

create policy "Members and admins write variant images" on public.product_variant_images
  for all to authenticated
  using (exists (select 1 from public.products p
                 where p.id = product_id
                   and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))))
  with check (exists (select 1 from public.products p
                      where p.id = product_id
                        and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))
                        and storage_path ~ ('^' || p.business_id::text
                            || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$')));

create policy "Variant models follow product visibility" on public.product_variant_models
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));

create policy "Members and admins write variant models" on public.product_variant_models
  for all to authenticated
  using (exists (select 1 from public.products p
                 where p.id = product_id
                   and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))))
  with check (exists (select 1 from public.products p
                      where p.id = product_id
                        and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))
                        and storage_path ~ ('^' || p.business_id::text
                            || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(glb|usdz)$')));

-- Grants. Supabase default privileges give anon/authenticated ALL on new tables: revoke first.
-- No UPDATE for authenticated: save_product replaces rows, so variant_id/product_id can never be re-pointed.
revoke all on public.product_variant_images, public.product_variant_models from public, anon, authenticated;
grant select on public.product_variant_images, public.product_variant_models to anon;
grant select, insert, delete on public.product_variant_images, public.product_variant_models to authenticated;
grant all on public.product_variant_images, public.product_variant_models to service_role;

-- 4. Storage: media of a visible variant is readable (additive; ORs with the existing product-media policy).
create policy "Media of visible variants is readable" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'product-media'
    and (exists (select 1 from public.product_variant_images vi where vi.storage_path = name)
         or exists (select 1 from public.product_variant_models vm where vm.storage_path = name))
  );

-- 5. save_product: same signature (its EXECUTE grants are kept), still SECURITY INVOKER. A variant keeps its
--    id when the client sends an id that ALREADY belongs to this product; any other id is ignored and a new
--    one is generated (no hijacking of another product's variant, no id squatting).
create or replace function public.save_product(
  p_product  jsonb,
  p_images   jsonb,
  p_models   jsonb,
  p_variants jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id   uuid := nullif(p_product ->> 'id', '')::uuid;
  v_var  jsonb;
  v_ord  bigint;
  v_vid  uuid;
  v_cid  uuid;
  v_keep uuid[] := '{}';
begin
  if jsonb_array_length(coalesce(p_variants, '[]'::jsonb)) > 50 then
    raise exception 'too_many_variants' using errcode = 'check_violation';
  end if;

  if v_id is null then
    insert into public.products (
      business_id, slug, name, short_description, description, material, cta_label, cta_url,
      category, price, currency, width, height, depth, dimension_unit, weight_value, weight_unit, status
    ) values (
      (p_product ->> 'business_id')::uuid,
      p_product ->> 'slug',
      p_product -> 'name',
      coalesce(p_product -> 'short_description', '{"en":""}'),
      coalesce(p_product -> 'description', '{"en":""}'),
      coalesce(p_product -> 'material', '{"en":""}'),
      coalesce(p_product -> 'cta_label', '{"en":""}'),
      p_product ->> 'cta_url',
      p_product ->> 'category',
      (p_product ->> 'price')::integer,
      p_product ->> 'currency',
      (p_product ->> 'width')::numeric,
      (p_product ->> 'height')::numeric,
      (p_product ->> 'depth')::numeric,
      p_product ->> 'dimension_unit',
      (p_product ->> 'weight_value')::numeric,
      p_product ->> 'weight_unit',
      'draft'
    )
    returning id into v_id;
  else
    -- business_id, status and published_at are deliberately not editable here.
    update public.products set
      slug              = p_product ->> 'slug',
      name              = p_product -> 'name',
      short_description = coalesce(p_product -> 'short_description', '{"en":""}'),
      description       = coalesce(p_product -> 'description', '{"en":""}'),
      material          = coalesce(p_product -> 'material', '{"en":""}'),
      cta_label         = coalesce(p_product -> 'cta_label', '{"en":""}'),
      cta_url           = p_product ->> 'cta_url',
      category          = p_product ->> 'category',
      price             = (p_product ->> 'price')::integer,
      currency          = p_product ->> 'currency',
      width             = (p_product ->> 'width')::numeric,
      height            = (p_product ->> 'height')::numeric,
      depth             = (p_product ->> 'depth')::numeric,
      dimension_unit    = p_product ->> 'dimension_unit',
      weight_value      = (p_product ->> 'weight_value')::numeric,
      weight_unit       = p_product ->> 'weight_unit'
    where id = v_id;
    if not found then
      raise exception 'Product not found or access denied' using errcode = '42501';
    end if;
  end if;

  delete from public.product_images where product_id = v_id;
  delete from public.product_models where product_id = v_id;

  insert into public.product_images (product_id, url, storage_path, alt, is_primary, kind, sort_order)
  select v_id, r.url, r.storage_path, r.alt, coalesce(r.is_primary, false),
         coalesce(r.kind, 'gallery'), coalesce(r.sort_order, 0)
  from jsonb_to_recordset(coalesce(p_images, '[]'::jsonb))
    as r(url text, storage_path text, alt text, is_primary boolean, kind text, sort_order integer);

  insert into public.product_models (product_id, format, url, storage_path, file_name, size_bytes, required_extensions)
  select v_id, r.format, r.url, r.storage_path, r.file_name, r.size_bytes, r.required_extensions
  from jsonb_to_recordset(coalesce(p_models, '[]'::jsonb))
    as r(format text, url text, storage_path text, file_name text, size_bytes bigint, required_extensions text[]);

  -- Variant media is replaced wholesale; variants themselves are upserted by (id, product) so ids stay stable.
  delete from public.product_variant_images where product_id = v_id;
  delete from public.product_variant_models where product_id = v_id;

  for v_var, v_ord in
    select e, o from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) with ordinality as t(e, o)
  loop
    if jsonb_array_length(coalesce(v_var -> 'images', '[]'::jsonb)) > 20 then
      raise exception 'too_many_variant_images' using errcode = 'check_violation';
    end if;
    v_cid := case when (v_var ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (v_var ->> 'id')::uuid end;
    v_vid := null;
    if v_cid is not null and not (v_cid = any (v_keep)) then
      update public.product_variants set
        name        = v_var -> 'name',
        color_hex   = v_var ->> 'color_hex',
        sku         = v_var ->> 'sku',
        price_delta = (v_var ->> 'price_delta')::integer,
        sort_order  = (v_ord - 1)::integer
      where id = v_cid and product_id = v_id
      returning id into v_vid;
    end if;
    if v_vid is null then
      insert into public.product_variants (product_id, name, color_hex, sku, price_delta, sort_order)
      values (v_id, v_var -> 'name', v_var ->> 'color_hex', v_var ->> 'sku',
              (v_var ->> 'price_delta')::integer, (v_ord - 1)::integer)
      returning id into v_vid;
    end if;
    v_keep := v_keep || v_vid;

    insert into public.product_variant_images (variant_id, product_id, storage_path, alt, is_primary, sort_order)
    select v_vid, v_id, r.storage_path, r.alt, coalesce(r.is_primary, false), (r.o - 1)::integer
    from rows from (jsonb_to_recordset(coalesce(v_var -> 'images', '[]'::jsonb))
           as (storage_path text, alt text, is_primary boolean)) with ordinality as r(storage_path, alt, is_primary, o);

    insert into public.product_variant_models (variant_id, product_id, format, storage_path, file_name, size_bytes, required_extensions)
    select v_vid, v_id, r.format, r.storage_path, r.file_name, r.size_bytes, r.required_extensions
    from jsonb_to_recordset(coalesce(v_var -> 'models', '[]'::jsonb))
      as r(format text, storage_path text, file_name text, size_bytes bigint, required_extensions text[]);
  end loop;

  delete from public.product_variants where product_id = v_id and not (id = any (v_keep));
  return v_id;
end;
$$;

-- create or replace keeps the ACL; re-assert it in case the signature ever changes (a NEW signature would
-- inherit Supabase's default EXECUTE for anon).
revoke execute on function public.save_product(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_product(jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

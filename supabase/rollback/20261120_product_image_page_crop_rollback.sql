-- Rollback for supabase/migrations/20261120172952_product_image_page_crop.sql (ADR-0081): drops the two page-copy read
-- policies, puts the four photo write policies, save_product and private.unreferenced_media_paths back to the bodies of
-- 20261111122043_product_image_crop.sql, and drops page_path and page_crop from product_images and product_variant_images.
-- Run as the database owner, only with the owner's approval.
--
-- DATA: dropping the columns loses every photo's product-page crop and its link to the page copy. The product page then shows
-- the 4:5 card copy again (as before ADR-0081). The page-copy files stay in the product-media bucket but no row points at them
-- any more (they are not readable by visitors and nothing recognises them). Redeploy the release before this change first, or
-- the editor would send page_path and page_crop to a function that ignores them and read columns that are gone.

begin;

-- 1. Visitor read policies for page copies.
drop policy "Page copies of visible products are readable" on storage.objects;
drop policy "Page copies of visible variants are readable" on storage.objects;

-- 2. Write policies as 20261111122043_product_image_crop.sql left them.-- Members and platform admins, product photos (WITH CHECK of 20261024065538_security_hardening.sql plus original_path).
alter policy "Members and admins write images" on public.product_images
  with check (exists (select 1 from public.products p
                      where p.id = product_id
                        and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))
                        and (storage_path is null
                             or storage_path ~ ('^' || p.business_id::text
                                 || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$'))
                        and (original_path is null
                             or original_path ~ ('^' || p.business_id::text
                                 || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$'))));

-- Platform team members, product photos (20261025070915_platform_team_roles.sql plus original_path).
alter policy "Platform members write images" on public.product_images
  with check ((select public.platform_can('products.edit'))
              and exists (select 1 from public.products p where p.id = product_id
                          and (storage_path is null or storage_path ~ ('^' || p.business_id::text
                               || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$'))
                          and (original_path is null or original_path ~ ('^' || p.business_id::text
                               || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$'))));

-- Members and platform admins, option photos (20261020143507_variant_media.sql plus original_path).
alter policy "Members and admins write variant images" on public.product_variant_images
  with check (exists (select 1 from public.products p
                      where p.id = product_id
                        and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))
                        and storage_path ~ ('^' || p.business_id::text
                            || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$')
                        and (original_path is null
                             or original_path ~ ('^' || p.business_id::text
                                 || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$'))));

-- Platform team members, option photos (20261025070915_platform_team_roles.sql plus original_path).
alter policy "Platform members write variant images" on public.product_variant_images
  with check ((select public.platform_can('products.edit'))
              and exists (select 1 from public.products p where p.id = product_id
                          and storage_path ~ ('^' || p.business_id::text
                              || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$')
                          and (original_path is null or original_path ~ ('^' || p.business_id::text
                              || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$'))));

-- 3. save_product and private.unreferenced_media_paths as 20261111122043_product_image_crop.sql left them.
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
  v_id         uuid := nullif(p_product ->> 'id', '')::uuid;
  v_var        jsonb;
  v_ord        bigint;
  v_vid        uuid;
  v_cid        uuid;
  v_keep       uuid[] := '{}';
  v_keep_m     boolean := coalesce((p_product ->> 'keep_models')::boolean, false);
  v_check      boolean := p_product ? 'expected_models_changed_at';
  v_expected   timestamptz := nullif(p_product ->> 'expected_models_changed_at', '')::timestamptz;
  v_stored_at  timestamptz;
begin
  if jsonb_array_length(coalesce(p_variants, '[]'::jsonb)) > 50 then
    raise exception 'too_many_variants' using errcode = 'check_violation';
  end if;

  if v_id is null then
    insert into public.products (
      business_id, slug, name, short_description, description, material, cta_label, cta_url, cta_hidden,
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
      coalesce((p_product ->> 'cta_hidden')::boolean, false),
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
      cta_hidden        = coalesce((p_product ->> 'cta_hidden')::boolean, false),
      category          = p_product ->> 'category',
      price             = (p_product ->> 'price')::integer,
      currency          = p_product ->> 'currency',
      width             = (p_product ->> 'width')::numeric,
      height            = (p_product ->> 'height')::numeric,
      depth             = (p_product ->> 'depth')::numeric,
      dimension_unit    = p_product ->> 'dimension_unit',
      weight_value      = (p_product ->> 'weight_value')::numeric,
      weight_unit       = p_product ->> 'weight_unit'
    where id = v_id
    returning models_changed_at into v_stored_at;
    if not found then
      raise exception 'Product not found or access denied' using errcode = '42501';
    end if;
  end if;

  delete from public.product_images where product_id = v_id;

  insert into public.product_images (product_id, url, storage_path, original_path, crop, alt, is_primary, kind, sort_order)
  select v_id, r.url, r.storage_path, r.original_path, r.crop, r.alt, coalesce(r.is_primary, false),
         coalesce(r.kind, 'gallery'), coalesce(r.sort_order, 0)
  from jsonb_to_recordset(coalesce(p_images, '[]'::jsonb))
    as r(url text, storage_path text, original_path text, crop jsonb, alt text, is_primary boolean, kind text, sort_order integer);

  if not v_keep_m and
     (select coalesce(jsonb_agg(jsonb_build_array(m.format, coalesce(m.storage_path, m.url), coalesce(m.required_extensions, '{}'))
                                order by m.format, coalesce(m.storage_path, m.url)), '[]'::jsonb)
        from public.product_models m where m.product_id = v_id)
     is distinct from
     (select coalesce(jsonb_agg(jsonb_build_array(r.format, coalesce(r.storage_path, r.url), coalesce(r.required_extensions, '{}'))
                                order by r.format, coalesce(r.storage_path, r.url)), '[]'::jsonb)
        from jsonb_to_recordset(coalesce(p_models, '[]'::jsonb))
          as r(format text, url text, storage_path text, required_extensions text[]))
  then
    if v_check and v_stored_at is not null and (v_expected is null or v_stored_at > v_expected) then
      raise exception 'models_changed_elsewhere' using errcode = 'P0001';
    end if;
    delete from public.product_models where product_id = v_id;
    insert into public.product_models (product_id, format, url, storage_path, file_name, size_bytes, required_extensions)
    select v_id, r.format, r.url, r.storage_path, r.file_name, r.size_bytes, r.required_extensions
    from jsonb_to_recordset(coalesce(p_models, '[]'::jsonb))
      as r(format text, url text, storage_path text, file_name text, size_bytes bigint, required_extensions text[]);
  end if;

  -- Variant images are replaced wholesale; variant models per kept option, only when that option's set changed.
  -- Variants themselves are upserted by (id, product) so ids stay stable.
  delete from public.product_variant_images where product_id = v_id;

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

    insert into public.product_variant_images (variant_id, product_id, storage_path, original_path, crop, alt, is_primary, sort_order)
    select v_vid, v_id, r.storage_path, r.original_path, r.crop, r.alt, coalesce(r.is_primary, false), (r.o - 1)::integer
    from rows from (jsonb_to_recordset(coalesce(v_var -> 'images', '[]'::jsonb))
           as (storage_path text, original_path text, crop jsonb, alt text, is_primary boolean)) with ordinality
           as r(storage_path, original_path, crop, alt, is_primary, o);

    if not v_keep_m and
       (select coalesce(jsonb_agg(jsonb_build_array(m.format, m.storage_path, coalesce(m.required_extensions, '{}'))
                                  order by m.format, m.storage_path), '[]'::jsonb)
          from public.product_variant_models m where m.variant_id = v_vid)
       is distinct from
       (select coalesce(jsonb_agg(jsonb_build_array(r.format, r.storage_path, coalesce(r.required_extensions, '{}'))
                                  order by r.format, r.storage_path), '[]'::jsonb)
          from jsonb_to_recordset(coalesce(v_var -> 'models', '[]'::jsonb))
            as r(format text, storage_path text, required_extensions text[]))
    then
      if v_check and v_stored_at is not null and (v_expected is null or v_stored_at > v_expected) then
        raise exception 'models_changed_elsewhere' using errcode = 'P0001';
      end if;
      delete from public.product_variant_models where variant_id = v_vid;
      insert into public.product_variant_models (variant_id, product_id, format, storage_path, file_name, size_bytes, required_extensions)
      select v_vid, v_id, r.format, r.storage_path, r.file_name, r.size_bytes, r.required_extensions
      from jsonb_to_recordset(coalesce(v_var -> 'models', '[]'::jsonb))
        as r(format text, storage_path text, file_name text, size_bytes bigint, required_extensions text[]);
    end if;
  end loop;

  -- Removed options go with their media (foreign-key cascade, which the model guard lets through).
  delete from public.product_variants where product_id = v_id and not (id = any (v_keep));
  return v_id;
end;
$$;
revoke execute on function public.save_product(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_product(jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. A photo's original file is in use while its photo row exists
-- ---------------------------------------------------------------------------
create or replace function private.unreferenced_media_paths(p_paths text[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct x.path order by x.path), '{}'::text[])
    from unnest(p_paths) as x(path)
   where x.path is not null
     and not exists (select 1 from public.product_images i where i.storage_path = x.path or i.original_path = x.path)
     and not exists (select 1 from public.product_models m where m.storage_path = x.path)
     and not exists (select 1 from public.product_variant_images vi where vi.storage_path = x.path or vi.original_path = x.path)
     and not exists (select 1 from public.product_variant_models vm where vm.storage_path = x.path)
     and not exists (select 1 from public.model_request_files s where s.storage_path = x.path);
$$;
revoke execute on function private.unreferenced_media_paths(text[]) from public, anon, authenticated;

-- 4. The columns (their shape checks go with them).
alter table public.product_images drop column page_path, drop column page_crop;
alter table public.product_variant_images drop column page_path, drop column page_crop;

commit;
-- =============================================================================
-- save_product: saves a product and replaces its images, models and variants in
-- one transaction. SECURITY INVOKER: every statement runs under the caller's RLS,
-- so it grants no access the caller does not already have.
--
-- Safe to review before applying: creates one function, no data changes.
-- Status/publishing is not changed here (publish/unpublish are plain updates).
-- =============================================================================

create function public.save_product(
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
  v_id uuid := nullif(p_product ->> 'id', '')::uuid;
begin
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
  delete from public.product_variants where product_id = v_id;

  insert into public.product_images (product_id, url, storage_path, alt, is_primary, kind, sort_order)
  select v_id, r.url, r.storage_path, r.alt, coalesce(r.is_primary, false),
         coalesce(r.kind, 'gallery'), coalesce(r.sort_order, 0)
  from jsonb_to_recordset(coalesce(p_images, '[]'::jsonb))
    as r(url text, storage_path text, alt text, is_primary boolean, kind text, sort_order integer);

  insert into public.product_models (product_id, format, url, storage_path, file_name, size_bytes)
  select v_id, r.format, r.url, r.storage_path, r.file_name, r.size_bytes
  from jsonb_to_recordset(coalesce(p_models, '[]'::jsonb))
    as r(format text, url text, storage_path text, file_name text, size_bytes bigint);

  insert into public.product_variants (product_id, name, color_hex, sku, price_delta, sort_order)
  select v_id, r.name, r.color_hex, r.sku, r.price_delta, coalesce(r.sort_order, 0)
  from jsonb_to_recordset(coalesce(p_variants, '[]'::jsonb))
    as r(name jsonb, color_hex text, sku text, price_delta integer, sort_order integer);

  return v_id;
end;
$$;

revoke execute on function public.save_product(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_product(jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

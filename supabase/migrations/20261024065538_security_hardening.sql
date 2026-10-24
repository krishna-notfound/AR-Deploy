-- =============================================================================
-- security_hardening: owner write limits, media URL/path rules, integrity rules, analytics and audit fixes.
-- Findings: SEC-27, OWN-02, OWN-03, OWN-04, OWN-06 (security), COR-05, COR-16 (correctness).
--
-- Every part is additive. Nothing deletes or rewrites existing rows. New CHECK constraints are NOT VALID:
-- existing rows are not checked when this applies, but any UPDATE (or save_product re-insert) of a row that
-- breaks a rule is refused from then on. So run supabase/checks/20261024_security_hardening_precheck.sql on
-- the target first. Two partial unique indexes (part 3) DO check existing rows: this migration fails as a
-- whole (nothing applied) if the pre-check finds a product or variant with more than one primary image.
--
--   1. SEC-27 / OWN-06  Owners (authenticated, not platform admin) may change only name, logo_url,
--      description and the contact_* columns of their business. Column grants also drop UPDATE of id,
--      created_at and updated_at for every API role (admins included) on businesses and products.
--      Drafts keep their published_at. logo_url and product image/model url must be https (or a
--      same-origin /path for media).
--   2. OWN-02  product_images / product_models storage_path must be exactly <business_id>/<uuid>.<ext>
--      (images: png, jpg, jpeg, webp; models: glb, usdz), as the variant media tables already require.
--      Enforced in the write policies, so it applies to new writes only.
--   3. OWN-03  Blank (whitespace-only) English product name refused; variant price_delta >= 0 (the editor
--      already refuses negatives, so a variant price is never below the base price); at most one primary
--      image per product and per variant.
--   4. OWN-04  record_event_limited returns 'invalid' for ar_activation / model_interaction when the
--      product has no 3D model (neither product_models nor product_variant_models). Same signature, grants.
--   5. COR-05  The business audit trigger records business_slug_changed with {"from", "to"} in metadata.
--   6. COR-16  complete_owner_onboarding accepts every pending membership of the caller (one audit row
--      each) instead of failing with "query returned more than one row".
--
-- After the pre-check shows 0 rows for a rule (or the rows are fixed), validate its constraint:
--   alter table public.businesses       validate constraint businesses_logo_url_https;
--   alter table public.product_images   validate constraint product_images_url_https;
--   alter table public.product_models   validate constraint product_models_url_https;
--   alter table public.products         validate constraint products_name_en_not_blank;
--   alter table public.product_variants validate constraint product_variants_price_delta_nonneg;
--
-- ROLLBACK (full script, tested: supabase/rollback/20261024_security_hardening_rollback.sql):
--   1. Restore the old guard_business_admin_fields (slug/status only) and products_set_published_at bodies;
--      `grant update on public.businesses, public.products to authenticated`; drop the three *_https
--      constraints.
--   2. alter policy "Members and admins write images|models" back to the first-segment check
--      (split_part(storage_path, '/', 1) = p.business_id::text).
--   3. Drop products_name_en_not_blank, product_variants_price_delta_nonneg, product_images_one_primary_idx,
--      product_variant_images_one_primary_idx.
--   4-6. Re-create record_event_limited, private.audit_business_change and complete_owner_onboarding with
--      the bodies from 20261012200810 / 20261020091428 (create or replace keeps grants and triggers).
--   Existing audit rows of type business_slug_changed may stay (append-only history).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. SEC-27 / OWN-06: owner-editable business columns, timestamps, https-only media URLs
-- -----------------------------------------------------------------------------

-- Admins and owners both use the `authenticated` role, so the owner limit is a trigger with an admin check
-- (column grants alone cannot tell them apart). Allow-list: a column added later is admin-only until it is
-- added here. updated_at is listed because businesses_set_updated_at overwrites it with now() anyway.
-- The slug/status message is kept as it was (existing callers and tests match it).
create or replace function public.guard_business_admin_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner_columns constant text[] := array['name', 'logo_url', 'description', 'contact_email', 'contact_phone',
                                           'contact_website', 'contact_address', 'updated_at'];
begin
  if current_user in ('anon', 'authenticated') and not public.is_platform_admin() then
    if new.slug is distinct from old.slug or new.status is distinct from old.status then
      raise exception 'Only platform admins can change a catalog address or status'
        using errcode = '42501';
    end if;
    if (to_jsonb(new) - v_owner_columns) is distinct from (to_jsonb(old) - v_owner_columns) then
      raise exception 'business_field_admin_only' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_business_admin_fields() from public, anon, authenticated;

-- Column grants: no API role may write ids or timestamps. Business columns stay writable for admins
-- (BusinessForm edit mode sends slug, status, accent_color and default_currency); the trigger above stops owners.
-- products keeps business_id (products_business_immutable raises a stable key) and published_at (the
-- publish call sends it; products_set_published_at decides the stored value).
revoke update on public.businesses from authenticated;
grant update (name, slug, status, logo_url, description, contact_email, contact_phone, contact_website,
              contact_address, accent_color, default_currency)
  on public.businesses to authenticated;

revoke update on public.products from authenticated;
grant update (business_id, slug, name, short_description, description, material, cta_label, cta_url, category,
              price, currency, status, published_at, width, height, depth, dimension_unit, weight_value, weight_unit)
  on public.products to authenticated;

-- published_at: stamped on draft -> published, kept while published (unchanged), and now also kept on a draft
-- for API roles, so a draft can no longer carry a client-chosen date.
create or replace function private.products_set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' then
    if tg_op = 'INSERT' or old.status is distinct from 'published' then
      new.published_at := now();
    else
      new.published_at := old.published_at;
    end if;
  elsif current_user in ('anon', 'authenticated') then
    new.published_at := case when tg_op = 'UPDATE' then old.published_at end;
  end if;
  return new;
end;
$$;
revoke all on function private.products_set_published_at() from public;

-- https only. Media keeps the existing same-origin '/path' form (demo assets); plain http:// is refused.
alter table public.businesses
  add constraint businesses_logo_url_https check (logo_url is null or logo_url ~* '^https://') not valid;
alter table public.product_images
  add constraint product_images_url_https check (url is null or url ~* '^(https://|/[^/])') not valid;
alter table public.product_models
  add constraint product_models_url_https check (url is null or url ~* '^(https://|/[^/])') not valid;

-- -----------------------------------------------------------------------------
-- 2. OWN-02: exact upload path shape for product images and models (as for variant media)
-- -----------------------------------------------------------------------------
-- Only WITH CHECK changes (new and re-inserted rows); USING (which rows may be changed) stays as it was.
alter policy "Members and admins write images" on public.product_images
  with check (exists (select 1 from public.products p
                      where p.id = product_id
                        and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))
                        and (storage_path is null
                             or storage_path ~ ('^' || p.business_id::text
                                 || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$'))));

alter policy "Members and admins write models" on public.product_models
  with check (exists (select 1 from public.products p
                      where p.id = product_id
                        and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))
                        and (storage_path is null
                             or storage_path ~ ('^' || p.business_id::text
                                 || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(glb|usdz)$'))));

-- -----------------------------------------------------------------------------
-- 3. OWN-03: integrity rules that only the UI enforced
-- -----------------------------------------------------------------------------
-- The editor requires a trimmed English name on every save (validation.ts), drafts included.
alter table public.products
  add constraint products_name_en_not_blank check ((name ->> 'en') ~ '[^[:space:]]') not valid;

-- Simplest correct rule: no negative deltas (the editor refuses them), so base price + delta >= 0 always.
alter table public.product_variants
  add constraint product_variants_price_delta_nonneg check (price_delta is null or price_delta >= 0) not valid;

-- At most one primary image. The editor sends exactly one (normalizeImages); save_product deletes before it
-- re-inserts, so a normal save never collides. These indexes check existing rows (see the pre-check).
create unique index product_images_one_primary_idx on public.product_images (product_id) where is_primary;
create unique index product_variant_images_one_primary_idx on public.product_variant_images (variant_id) where is_primary;

-- -----------------------------------------------------------------------------
-- 4. OWN-04: AR / 3D events need a 3D model
-- -----------------------------------------------------------------------------
-- Same body as 20261012200810 plus the model check. create or replace keeps the EXECUTE grants.
create or replace function public.record_event_limited(
  p_visitor_key text,
  p_product_id  uuid,
  p_business_id uuid,
  p_event_type  text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit  constant integer := 30; -- events per visitor key per minute
  v_window timestamptz := date_trunc('minute', now());
  v_hits   integer;
begin
  if p_visitor_key is null or p_visitor_key !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;

  insert into private.analytics_hits as h (visitor_key, window_start)
  values (p_visitor_key, v_window)
  on conflict (visitor_key, window_start) do update set hits = h.hits + 1
  returning h.hits into v_hits;

  -- Opportunistic cleanup keeps the table to roughly the last hour.
  if random() < 0.02 then
    delete from private.analytics_hits where window_start < now() - interval '1 hour';
  end if;

  if v_hits > v_limit then
    return 'rate_limited';
  end if;

  if p_event_type is null or p_event_type not in ('view', 'ar_activation', 'model_interaction')
     or not exists (
       select 1 from public.products p
       join public.businesses b on b.id = p.business_id
       where p.id = p_product_id
         and p.business_id = p_business_id
         and p.status = 'published'
         and b.status = 'active'
     ) then
    return 'invalid';
  end if;

  -- The viewer and AR button only exist when the product (or one of its variants) has a model.
  if p_event_type in ('ar_activation', 'model_interaction')
     and not exists (select 1 from public.product_models m where m.product_id = p_product_id)
     and not exists (select 1 from public.product_variant_models vm where vm.product_id = p_product_id) then
    return 'invalid';
  end if;

  insert into public.product_analytics (business_id, product_id, event_type)
  values (p_business_id, p_product_id, p_event_type);
  return 'recorded';
end;
$$;
revoke execute on function public.record_event_limited(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_event_limited(text, uuid, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 5. COR-05: audit catalogue address changes
-- -----------------------------------------------------------------------------
create or replace function private.audit_business_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.audit_events (event_type, actor_id, business_id, from_status, to_status)
      values ('business_status_changed', auth.uid(), new.id, old.status, new.status);
    end if;
    if new.slug is distinct from old.slug then
      insert into public.audit_events (event_type, actor_id, business_id, metadata)
      values ('business_slug_changed', auth.uid(), new.id, jsonb_build_object('from', old.slug, 'to', new.slug));
    end if;
  elsif tg_op = 'DELETE' then
    insert into public.audit_events (event_type, actor_id, metadata)
    values ('business_deleted', auth.uid(), jsonb_build_object('business_id', old.id, 'name', old.name));
  end if;
  return null;
end;
$$;
revoke all on function private.audit_business_change() from public;

-- -----------------------------------------------------------------------------
-- 6. COR-16: onboarding with more than one pending membership
-- -----------------------------------------------------------------------------
-- Accepts every pending membership (one audit row each) and returns the newest membership, the one the app
-- opens (getCurrentUser picks the newest).
create or replace function public.complete_owner_onboarding()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  if auth.uid() is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;
  with accepted as (
    update public.business_members
       set accepted_at = now()
     where user_id = auth.uid() and accepted_at is null
    returning business_id
  )
  insert into public.audit_events (event_type, actor_id, business_id)
  select 'owner_onboarding_completed', auth.uid(), business_id from accepted;

  select business_id into v_business
    from public.business_members
   where user_id = auth.uid()
   order by created_at desc, id
   limit 1;
  return v_business;
end;
$$;
revoke execute on function public.complete_owner_onboarding() from public, anon;
grant execute on function public.complete_owner_onboarding() to authenticated;

-- Rollback for the S4 migration supabase/migrations/<ts>_s4_model_requests.sql
-- (spec: docs/superpowers/specs/2026-10-26-s4-3d-model-requests-design.md, §10.3). Run as the database owner, after
-- deploying the Edge Functions and the app of the release before S4, and before any earlier rollback script.
--
-- What it does: restores the earlier function bodies, policies and constraints, drops the tables, triggers,
-- functions, columns and storage policies S4 added, and keeps every audit_events and email_log row. Delivered models
-- stay: they are ordinary product model rows.
--
-- CUSTOMER DATA: the model-request-photos bucket holds the businesses' request photos. This script refuses to run
-- (model_request_photos_not_empty) while the bucket has objects: export them as the runbook says, empty the bucket,
-- then run it. The bucket is deleted only when empty. Rolling back also drops the request rows and the staged-file
-- rows (their objects in product-media stay, as ordinary unreferenced files).
--
-- Sections run newest task first. Each task writes only between its own markers below, in this format:
--   -- =============================================================================
--   -- S4 Task N rollback: <title> (R-S4-n, ...)
--   -- =============================================================================
--   ...statements...
--   -- ---- end S4 Task N rollback ----

begin;

-- =============================================================================
-- S4 Task 8 rollback: Clean-up with the product, the option, the business and the closure (R-S4-18)
-- =============================================================================
drop function public.model_request_storage_paths(uuid);
-- ---- end S4 Task 8 rollback ----

-- =============================================================================
-- S4 Task 7 rollback: review-model-request Edge Function and the owner email (R-S4-15)
-- =============================================================================
-- Back to the 12 kinds of S1.5, unless a model_request_update row exists: email_log rows are kept, so the wider
-- check stays (the function that wrote them is gone with the release, and no new row of that kind can arrive).
do $$
begin
  if not exists (select 1 from public.email_log where kind = 'model_request_update') then
    alter table public.email_log drop constraint email_log_kind_check;
    alter table public.email_log add constraint email_log_kind_check
      check (kind in ('owner_invitation', 'invitation_resend', 'application_confirmation', 'admin_notification', 'team_invitation', 'test',
                      'security_code', 'security_notice', 'closure_request',
                      'application_decision', 'business_notice', 'team_notice'));
  end if;
end;
$$;
-- ---- end S4 Task 7 rollback ----

-- =============================================================================
-- S4 Task 6 rollback: Staff detail, staging, deliver and decline (R-S4-11, R-S4-12, R-S4-13, R-S4-14, R-S4-16)
-- =============================================================================
-- Model rows delivered by these functions stay (ordinary product rows); staged rows go with Task 1's tables.
drop policy if exists "Model staff upload models" on storage.objects;
drop policy if exists "Platform members delete media" on storage.objects;
create policy "Platform members delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-media'
         and ((select public.platform_can('products.edit')) or (select public.platform_can('products.delete'))
              or (select public.platform_can('businesses.delete'))));
drop function if exists public.admin_reject_model_request(uuid, text);
drop function if exists public.admin_deliver_model_request(uuid);
drop function if exists public.admin_unstage_model_file(uuid, text);
drop function if exists public.admin_stage_model_file(uuid, text, text, text, bigint, text[]);
drop function if exists public.admin_start_model_request(uuid);
drop function if exists private.unreferenced_media_paths(text[]);
-- ---- end S4 Task 6 rollback ----

-- =============================================================================
-- S4 Task 4 rollback: The business request: send, cancel, and the request panel (R-S4-6, R-S4-7, R-S4-8)
-- =============================================================================
drop function if exists public.cancel_model_request(uuid);
drop function if exists public.request_model(uuid, uuid, uuid, text, jsonb);
-- ---- end S4 Task 4 rollback ----

-- =============================================================================
-- S4 Task 3 rollback: Own-upload rules in save and storage, the editor's 3D section, stale-save guard (R-S4-3, R-S4-4, R-S4-17)
-- =============================================================================
drop trigger product_models_stamp_changed on public.product_models;
drop trigger product_variant_models_stamp_changed on public.product_variant_models;
drop function private.stamp_models_changed();

-- save_product: the body of 20261020143507_variant_media.sql (verbatim), with its grants.
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

-- The two product-media policies: the bodies of 20261025163627_account_settings.sql (verbatim).
drop policy "Members and admins upload media" on storage.objects;
create policy "Members and admins upload media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-media'
    and ((select public.is_platform_admin())
         or exists (select 1 from public.business_members m
                    where m.user_id = (select auth.uid())
                      and m.business_id::text = (storage.foldername(name))[1]
                      and public.is_business_member(m.business_id)))
  );
drop policy "Members and admins update media" on storage.objects;
create policy "Members and admins update media" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-media'
    and ((select public.is_platform_admin())
         or exists (select 1 from public.business_members m
                    where m.user_id = (select auth.uid())
                      and m.business_id::text = (storage.foldername(name))[1]
                      and public.is_business_member(m.business_id)))
  )
  with check (
    bucket_id = 'product-media'
    and ((select public.is_platform_admin())
         or exists (select 1 from public.business_members m
                    where m.user_id = (select auth.uid())
                      and m.business_id::text = (storage.foldername(name))[1]
                      and public.is_business_member(m.business_id)))
  );
-- ---- end S4 Task 3 rollback ----

-- =============================================================================
-- S4 Task 1 rollback: Foundation database: migration scaffold, models.manage, the switch and its row guard, tables, bucket (R-S4-1, R-S4-2, R-S4-3, R-S4-5)
-- =============================================================================

-- The request photos are customer data: refuse while any are stored (export and empty the bucket first).
do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'model-request-photos') then
    raise exception 'model_request_photos_not_empty' using errcode = 'P0001',
      hint = 'Export the model-request-photos objects (runbook), empty the bucket, then run this rollback again.';
  end if;
end;
$$;
drop policy "Members add request photos" on storage.objects;
drop policy "Members and model staff read request photos" on storage.objects;
drop policy "Members and clean-up staff delete request photos" on storage.objects;
-- The bucket, only when empty. Hosted Storage blocks direct deletes from its tables unless storage.allow_delete_query
-- is on (ignored where the setting does not exist, e.g. PGlite). If the delete is still refused, the refusal is only
-- a notice (the rest of this rollback commits): delete the empty bucket in the dashboard then
-- (Storage > model-request-photos > Delete bucket).
do $$
begin
  perform set_config('storage.allow_delete_query', 'true', true);
exception when others then
  null;
end;
$$;
do $$
begin
  delete from storage.buckets b
   where b.id = 'model-request-photos'
     and not exists (select 1 from storage.objects o where o.bucket_id = b.id);
exception when others then
  raise notice 'model-request-photos bucket not deleted (%): delete it in the dashboard (Storage > model-request-photos > Delete bucket)', sqlerrm;
end;
$$;

-- Audit reads back to S1.5 Task 8.
drop policy "Model staff read request events" on public.audit_events;
drop policy "Business owners read platform changes to their business" on public.audit_events;
create policy "Business owners read platform changes to their business" on public.audit_events
  for select to authenticated
  using (event_type in ('business_status_changed', 'business_slug_changed', 'product_created', 'product_published',
                        'product_unpublished', 'product_slug_changed', 'product_deleted', 'account_closure_voided')
         and business_id is not null
         and public.is_business_member(business_id));

-- Tables, guards, functions and columns.
drop table public.model_request_files;
drop table public.model_request_photos;
drop table public.model_requests;
drop trigger product_models_guard_own_models on public.product_models;
drop trigger product_variant_models_guard_own_models on public.product_variant_models;
drop function private.guard_own_models();
drop function public.can_write_own_models(uuid);
drop function public.admin_set_own_models(uuid, boolean);
drop trigger businesses_guard_own_models_flag on public.businesses;
drop function private.guard_own_models_flag();
drop function private.require_models_manage();
drop function private.require_business_member(uuid);
alter table public.businesses drop column allow_own_models;
alter table public.products drop column models_changed_at;

-- models.manage leaves every role set (one access_permissions_changed row per role that had it, by the system),
-- then the check constraint goes back to the 15 keys.
do $$
declare
  r record;
begin
  for r in select role from public.platform_role_permissions where permission = 'models.manage' order by role loop
    delete from public.platform_role_permissions where role = r.role and permission = 'models.manage';
    insert into public.audit_events (event_type, actor_id, metadata)
    values ('access_permissions_changed', null,
            jsonb_build_object('role', r.role::text, 'added', '[]'::jsonb, 'removed', jsonb_build_array('models.manage'),
                               'reason', 'model_requests_rollback'));
  end loop;
end;
$$;
alter table public.platform_role_permissions
  drop constraint platform_role_permissions_permission_check,
  add constraint platform_role_permissions_permission_check check (permission in (
    'businesses.view', 'businesses.edit', 'businesses.status', 'businesses.delete', 'owners.manage',
    'applications.view', 'applications.approve', 'applications.reject',
    'products.view', 'products.edit', 'products.publish', 'products.delete',
    'analytics.view', 'records.view', 'access.view'));

-- private.permission_prerequisites as in S1.5 Task 5.
create or replace function private.permission_prerequisites()
returns table (permission text, requires text)
language sql
immutable
security definer
set search_path = ''
as $$
  values
    ('businesses.edit', 'businesses.view'),
    ('businesses.status', 'businesses.edit'),
    ('businesses.delete', 'businesses.edit'),
    ('businesses.delete', 'products.delete'),
    ('owners.manage', 'businesses.view'),
    ('applications.approve', 'applications.view'),
    ('applications.reject', 'applications.view'),
    ('products.edit', 'products.view'),
    ('products.publish', 'products.edit'),
    ('products.delete', 'products.edit');
$$;
revoke execute on function private.permission_prerequisites() from public, anon, authenticated;

-- my_platform_access as in S1.5 Task 9 (15 keys).
create or replace function public.my_platform_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.platform_admins where user_id = (select auth.uid())) then
      jsonb_build_object('role', 'owner', 'permissions', to_jsonb(array[
        'access.view', 'analytics.view', 'applications.approve', 'applications.reject', 'applications.view',
        'businesses.delete', 'businesses.edit', 'businesses.status', 'businesses.view', 'owners.manage',
        'products.delete', 'products.edit', 'products.publish', 'products.view', 'records.view']))
    else (
      select case m.status
        when 'active' then jsonb_build_object('role', m.role::text, 'permissions',
          (select coalesce(jsonb_agg(rp.permission order by rp.permission), '[]'::jsonb)
             from public.platform_role_permissions rp where rp.role = m.role))
        when 'deactivated' then jsonb_build_object('role', null, 'permissions', '[]'::jsonb, 'status', 'deactivated')
      end
      from public.platform_members m
      where m.user_id = (select auth.uid()))
  end;
$$;
revoke execute on function public.my_platform_access() from public, anon;
grant execute on function public.my_platform_access() to authenticated, service_role;

-- admin_set_role_permissions as in S1.5 Task 5.
create or replace function public.admin_set_role_permissions(p_role public.platform_role, p_permissions text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_known constant text[] := array[
    'businesses.view', 'businesses.edit', 'businesses.status', 'businesses.delete', 'owners.manage',
    'applications.view', 'applications.approve', 'applications.reject',
    'products.view', 'products.edit', 'products.publish', 'products.delete',
    'analytics.view', 'records.view', 'access.view'];
  v_asked text[] := array(select distinct unnest(coalesce(p_permissions, '{}')) order by 1);
  v_new text[];
  v_implied text[];
  v_old text[];
  v_added text[];
  v_removed text[];
begin
  if not private.owner_or_deny('set_role_permissions') then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if not (v_asked <@ v_known) then
    return jsonb_build_object('error', 'unknown_permission');
  end if;
  v_new := private.with_prerequisites(v_asked);
  v_implied := array(select p from unnest(v_new) p where p <> all (v_asked) order by array_position(v_known, p));
  v_old := array(select permission from public.platform_role_permissions where role = p_role order by 1);
  v_added := array(select unnest(v_new) except select unnest(v_old) order by 1);
  v_removed := array(select unnest(v_old) except select unnest(v_new) order by 1);
  if cardinality(v_added) = 0 and cardinality(v_removed) = 0 then
    return jsonb_build_object('ok', true, 'added', to_jsonb(v_implied));
  end if;
  delete from public.platform_role_permissions where role = p_role and permission = any (v_removed);
  insert into public.platform_role_permissions (role, permission) select p_role, unnest(v_added);
  insert into public.audit_events (event_type, actor_id, metadata)
  values ('access_permissions_changed', (select auth.uid()),
          jsonb_build_object('role', p_role::text, 'added', to_jsonb(v_added), 'removed', to_jsonb(v_removed)));
  return jsonb_build_object('ok', true, 'added', to_jsonb(v_implied));
end;
$$;
revoke execute on function public.admin_set_role_permissions(public.platform_role, text[]) from public, anon;
grant execute on function public.admin_set_role_permissions(public.platform_role, text[]) to authenticated, service_role;
-- ---- end S4 Task 1 rollback ----

commit;

-- Rollback for supabase/migrations/20261114123349_qa_database_rules.sql (ADR-0072). Run as the database owner, only with the
-- owner's approval. Nothing is deleted from any table: the constraints, triggers, indexes and helper functions of that
-- migration are dropped, and the three functions it redefined get their earlier behaviour back.
--   * cancel_model_request raises model_request_not_found with P0002 again (PostgREST answers 500 for it).
--   * private.unique_business_slug loses its advisory lock.
--   * private.validate_site_content stops checking a social link's domain (the https:// rule stays).
--   * private.platform_invites has row level security off again.

begin;

-- 9. FV-07
alter table public.products drop constraint if exists products_cta_url_host;
alter table public.businesses
  drop constraint if exists businesses_contact_website_host,
  drop constraint if exists businesses_contact_email_shape,
  drop constraint if exists businesses_description_len;

do $$
declare
  v_def text := pg_get_functiondef('private.validate_site_content(jsonb)'::regprocedure);
  v_new constant text := E'(r.value #>> ''{}'') !~ ''^https://'' then';
  v_old constant text := E'(r.value #>> ''{}'') !~ ''^https://'' or not private.social_url_ok(r.key, r.value #>> ''{}'') then';
begin
  if position(v_old in v_def) > 0 then
    execute replace(v_def, v_old, v_new);
  end if;
end;
$$;
drop function if exists private.social_url_ok(text, text);

-- 8. FV-06
drop trigger if exists products_list_values_check on public.products;
drop function if exists private.products_list_values_check();

-- 7. RLS-04
drop trigger if exists push_subscriptions_cap on public.push_subscriptions;
drop function if exists private.push_subscriptions_cap();

-- 6. BL-6
do $$
declare
  v_def text := pg_get_functiondef('private.unique_business_slug(text)'::regprocedure);
  v_lock constant text := E'  perform pg_advisory_xact_lock(hashtext(''private.unique_business_slug''));\n';
begin
  if position(v_lock in v_def) > 0 then
    execute replace(v_def, v_lock, '');
  end if;
end;
$$;

-- 5. BL-4
alter table public.product_variants drop constraint if exists product_variants_name_strings;
alter table public.products
  drop constraint if exists products_cta_label_strings,
  drop constraint if exists products_material_strings,
  drop constraint if exists products_description_strings,
  drop constraint if exists products_short_description_strings,
  drop constraint if exists products_name_strings;

-- 4. BL-3
drop trigger if exists product_models_published_keeps_glb_upd on public.product_models;
drop trigger if exists product_models_published_keeps_glb_del on public.product_models;
drop function if exists private.product_models_keep_glb_check();

-- 3. F-TI-2 (body of 20261026120000_s4_model_requests.sql)
create or replace function public.cancel_model_request(p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req   public.model_requests%rowtype;
  v_paths text[];
begin
  select * into v_req from public.model_requests r where r.id = p_request for update;
  if not found or not exists (select 1 from public.business_members m
                               where m.business_id = v_req.business_id and m.user_id = (select auth.uid())) then
    raise exception 'model_request_not_found' using errcode = 'P0002';
  end if;
  perform private.require_business_member(v_req.business_id);
  if v_req.status <> 'requested' then
    raise exception 'model_request_not_cancellable' using errcode = 'P0001';
  end if;
  update public.model_requests set status = 'cancelled', closed_at = now() where id = p_request;
  select coalesce(array_agg(p.storage_path order by p.sort_order), '{}') into v_paths
    from public.model_request_photos p where p.request_id = p_request;
  insert into public.audit_events (event_type, actor_id, business_id, metadata)
  values ('model_request_cancelled', (select auth.uid()), v_req.business_id,
          jsonb_build_object('request_id', p_request, 'product_id', v_req.product_id, 'variant_id', v_req.variant_id));
  return jsonb_build_object('status', 'cancelled', 'photo_paths', to_jsonb(v_paths));
end;
$$;
revoke execute on function public.cancel_model_request(uuid) from public, anon;
grant execute on function public.cancel_model_request(uuid) to authenticated;

-- 2. DB-F4
drop index if exists public.platform_members_invited_by_idx;
drop index if exists public.platform_settings_updated_by_idx;
drop index if exists public.model_requests_requested_by_idx;
drop index if exists public.model_requests_handled_by_idx;
drop index if exists public.model_request_files_uploaded_by_idx;
drop index if exists private.platform_invites_created_by_idx;
drop index if exists private.platform_invites_revoked_by_idx;
drop index if exists private.owner_invite_attempts_actor_idx;

-- 1. RLS-05
alter table private.platform_invites disable row level security;

commit;

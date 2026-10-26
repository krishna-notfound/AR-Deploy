-- S4 3D model requests (spec: docs/superpowers/specs/2026-10-26-s4-3d-model-requests-design.md, §8.1; the owner
-- decisions of 2026-10-26 at its end override it: no open-request limit).
-- Rollback: supabase/rollback/20261026_s4_model_requests_rollback.sql (sections newest task first).
-- Tests: supabase/tests/s4ModelRequests.test.ts (PGlite, one describe per task).
--
-- This is the only S4 migration. Task 1 wrote one empty slot per later SQL task (3, 4, 6, 7, 8), in this format:
--
--   -- =============================================================================
--   -- S4 Task N: <title> (R-S4-n, ...)
--   -- =============================================================================
--   ...statements...
--   -- ---- end S4 Task N ----
--
-- A task writes only between its own two markers and never edits another section. Wave-2 sections depend only on
-- Task 1's section. To change a function an earlier section defined, `create or replace` it in your own section.
-- SQL rules: RLS on every new table (revoke all from public, anon, authenticated, then explicit grants); every new
-- function security definer with `set search_path = ''`, execute revoked from public and anon and granted explicitly;
-- private trigger functions revoked from public, anon and authenticated. Refusals raise '<key>' with the code of
-- §8.3. Access checks use only the S1 gated helpers: every staff function starts with private.require_models_manage(),
-- every business function with private.require_business_member(p_business).
-- Audit rows of this feature carry business_id and metadata {request_id, product_id, variant_id}.

-- =============================================================================
-- S4 Task 1: Foundation database: migration scaffold, models.manage, the switch and its row guard, tables, bucket (R-S4-1, R-S4-2, R-S4-3, R-S4-5)
-- =============================================================================

-- PRE-FLIGHT (S4) BEGIN
-- Read-only; run before this migration. Shows what the two backfills will do and that the bucket is free.
-- -- Businesses whose own-upload switch starts ON (they already have a product or option 3D file); the rest start OFF.
-- select b.id, b.name, b.slug,
--        exists (select 1 from public.products p
--                 where p.business_id = b.id
--                   and (exists (select 1 from public.product_models pm where pm.product_id = p.id)
--                        or exists (select 1 from public.product_variant_models vm where vm.product_id = p.id))) as starts_on
--   from public.businesses b order by starts_on desc, b.name;
-- -- The stored Admin and Team sets (Admin gains models.manage and any missing prerequisite; Team is unchanged).
-- select role::text, array_agg(permission order by permission) as permissions
--   from public.platform_role_permissions group by role order by role;
-- -- The request-photo bucket must not exist yet (or must be private).
-- select id, public from storage.buckets where id = 'model-request-photos';
-- PRE-FLIGHT (S4) END

-- R-S4-1: the 16th platform permission. Same position in ALL_PERMISSIONS, _shared/team.ts and v_known below.
alter table public.platform_role_permissions
  drop constraint platform_role_permissions_permission_check,
  add constraint platform_role_permissions_permission_check check (permission in (
    'businesses.view', 'businesses.edit', 'businesses.status', 'businesses.delete', 'owners.manage',
    'applications.view', 'applications.approve', 'applications.reject',
    'products.view', 'products.edit', 'products.publish', 'products.delete', 'models.manage',
    'analytics.view', 'records.view', 'access.view'));

-- Body from S1.5 Task 5; models.manage needs both views (the queue shows product and business names).
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
    ('products.delete', 'products.edit'),
    ('models.manage', 'products.view'),
    ('models.manage', 'businesses.view');
$$;
revoke execute on function private.permission_prerequisites() from public, anon, authenticated;

-- Body from S1.5 Task 9; the Owner's fixed list has 16 keys.
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
        'businesses.delete', 'businesses.edit', 'businesses.status', 'businesses.view', 'models.manage', 'owners.manage',
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

-- Body from S1.5 Task 5; v_known gains models.manage (after products.delete, the dashboard order).
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
    'products.view', 'products.edit', 'products.publish', 'products.delete', 'models.manage',
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

-- Backfill: the stored Admin set gains models.manage (and any prerequisite it lacks), by the system, with one
-- access_permissions_changed row. Team's set is not changed (Team has no models.manage by default).
do $$
declare
  v_old text[] := array(select permission from public.platform_role_permissions where role = 'admin' order by 1);
  v_added text[];
begin
  v_added := array(select unnest(private.with_prerequisites(v_old || 'models.manage'::text))
                   except select unnest(v_old) order by 1);
  if cardinality(v_added) > 0 then
    insert into public.platform_role_permissions (role, permission) select 'admin', unnest(v_added);
    insert into public.audit_events (event_type, actor_id, metadata)
    values ('access_permissions_changed', null,
            jsonb_build_object('role', 'admin', 'added', to_jsonb(v_added), 'removed', '[]'::jsonb,
                               'reason', 'model_requests_backfill'));
  end if;
end;
$$;

-- The two gates every S4 function starts with. The 2FA step is checked first, so a direct RPC answers like the
-- dashboard: aal2_required (42501) when the session doesn't meet 2FA, then forbidden (42501).
create function private.require_models_manage()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.caller_mfa_satisfied() then
    raise exception 'aal2_required' using errcode = '42501';
  end if;
  if not public.platform_can('models.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function private.require_models_manage() from public, anon, authenticated;

create function private.require_business_member(p_business uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.caller_mfa_satisfied() then
    raise exception 'aal2_required' using errcode = '42501';
  end if;
  if not public.is_business_member(p_business) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function private.require_business_member(uuid) from public, anon, authenticated;

-- R-S4-2 and R-S4-17: the two new columns. models_changed_at is set by delivery and by a save that changes model
-- rows (Tasks 3 and 6); null until then. Neither is in a column grant, except the switch (see its guard below).
alter table public.businesses add column allow_own_models boolean not null default false;
alter table public.products add column models_changed_at timestamptz;

-- Switch backfill: ON for every business that already has a product or option model row, so none loses what it uses
-- today; OFF for the rest (the column default). updated_at is kept: the business itself did not change.
do $$
begin
  alter table public.businesses disable trigger businesses_set_updated_at;
  update public.businesses b set allow_own_models = true
   where exists (select 1 from public.products p
                  where p.business_id = b.id
                    and (exists (select 1 from public.product_models pm where pm.product_id = p.id)
                         or exists (select 1 from public.product_variant_models vm where vm.product_id = p.id)));
  alter table public.businesses enable trigger businesses_set_updated_at;
end;
$$;

-- The switch changes only through admin_set_own_models (audited). An API write that changes it is refused for
-- everyone (owners are also refused by guard_business_admin_fields). The role test sits in the WHEN clause, which is
-- evaluated as the caller; inside this security definer function current_user is the owner. The update grant
-- lets a staff PATCH reach this trigger, so it gets the stable key instead of a bare privilege error.
create function private.guard_own_models_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.own_models', true), '') <> 'on'
     and ((tg_op = 'INSERT' and new.allow_own_models)
          or (tg_op = 'UPDATE' and new.allow_own_models is distinct from old.allow_own_models)) then
    raise exception 'own_models_admin_only' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_own_models_flag() from public, anon, authenticated;
create trigger businesses_guard_own_models_flag before insert or update of allow_own_models on public.businesses
  for each row
  when (current_user in ('anon', 'authenticated'))
  execute function private.guard_own_models_flag();
grant update (allow_own_models) on public.businesses to authenticated;

-- R-S4-2: the audited change. Answers {allow_own_models, changed}; the same value again changes nothing and writes
-- no row.
create function public.admin_set_own_models(p_business uuid, p_allow boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old boolean;
begin
  perform private.require_models_manage();
  if p_allow is null then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  select b.allow_own_models into v_old from public.businesses b where b.id = p_business for update;
  if not found then
    raise exception 'business_not_found' using errcode = 'P0002';
  end if;
  if v_old = p_allow then
    return jsonb_build_object('allow_own_models', p_allow, 'changed', false);
  end if;
  perform set_config('app.own_models', 'on', true);
  update public.businesses set allow_own_models = p_allow where id = p_business;
  perform set_config('app.own_models', '', true);
  insert into public.audit_events (event_type, actor_id, business_id, metadata)
  values ('business_own_models_changed', (select auth.uid()), p_business,
          jsonb_build_object('from', v_old, 'to', p_allow));
  return jsonb_build_object('allow_own_models', p_allow, 'changed', true);
end;
$$;
revoke execute on function public.admin_set_own_models(uuid, boolean) from public, anon;
grant execute on function public.admin_set_own_models(uuid, boolean) to authenticated;

-- R-S4-3: who may write a business's 3D files. In public because policies run as the caller, who has no USAGE on
-- private (ADR-0029). app.model_delivery is set only inside admin_deliver_model_request (Task 6).
create function public.can_write_own_models(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(current_setting('app.model_delivery', true), '') = 'on'
      or public.is_platform_admin()
      or public.platform_can('products.edit')
      or public.platform_can('models.manage')
      or (public.is_business_member(p_business)
          and coalesce((select b.allow_own_models from public.businesses b where b.id = p_business), false));
$$;
revoke execute on function public.can_write_own_models(uuid) from public, anon;
grant execute on function public.can_write_own_models(uuid) to authenticated;

-- R-S4-3: the row guard on product and option model rows. A DELETE from a foreign-key cascade (a product or an option
-- deleted) passes: pg_trigger_depth() > 1 there. The role test is in the WHEN clause (see guard_own_models_flag).
create function private.guard_own_models()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product uuid := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
  v_business uuid;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  select p.business_id into v_business from public.products p where p.id = v_product;
  if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
    -- Moving a row between products needs the right on both.
    if not public.can_write_own_models((select p.business_id from public.products p where p.id = old.product_id)) then
      raise exception 'own_models_not_allowed' using errcode = '42501';
    end if;
  end if;
  if not public.can_write_own_models(v_business) then
    raise exception 'own_models_not_allowed' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function private.guard_own_models() from public, anon, authenticated;
create trigger product_models_guard_own_models before insert or update or delete on public.product_models
  for each row
  when (current_user in ('anon', 'authenticated'))
  execute function private.guard_own_models();
create trigger product_variant_models_guard_own_models before insert or update or delete on public.product_variant_models
  for each row
  when (current_user in ('anon', 'authenticated'))
  execute function private.guard_own_models();

-- §8.1 tables. No API writes: every change goes through the definer functions of Tasks 4 and 6.
create table public.model_requests (
  id           uuid primary key,
  business_id  uuid not null references public.businesses (id) on delete cascade,
  product_id   uuid not null,
  variant_id   uuid,
  status       text not null default 'requested'
               check (status in ('requested', 'in_progress', 'delivered', 'rejected', 'cancelled')),
  note         text check (char_length(note) <= 1000),
  reason       text check (char_length(reason) <= 1000),
  requested_by uuid references auth.users (id) on delete set null,
  handled_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  started_at   timestamptz,
  delivered_at timestamptz,
  closed_at    timestamptz,
  foreign key (product_id, business_id) references public.products (id, business_id) on delete cascade,
  foreign key (variant_id, product_id) references public.product_variants (id, product_id) on delete cascade,
  constraint model_requests_reason_required check (status <> 'rejected' or coalesce(char_length(btrim(reason)), 0) > 0),
  constraint model_requests_closed_at check ((status in ('delivered', 'rejected', 'cancelled')) = (closed_at is not null))
);
-- At most one open request per target (product, or product option).
create unique index model_requests_one_open_idx on public.model_requests
  (product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('requested', 'in_progress');
create index model_requests_status_created_idx on public.model_requests (status, created_at);
create index model_requests_business_status_idx on public.model_requests (business_id, status);
create index model_requests_product_idx on public.model_requests (product_id);
create index model_requests_variant_idx on public.model_requests (variant_id) where variant_id is not null;
create trigger model_requests_set_updated_at before update on public.model_requests
  for each row execute function public.set_updated_at();

create table public.model_request_photos (
  request_id   uuid not null references public.model_requests (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) <= 512
                 and storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
                 and split_part(storage_path, '/', 2) = request_id::text),
  file_name    text not null check (char_length(file_name) between 1 and 255),
  size_bytes   bigint not null check (size_bytes between 1 and 10485760),
  sort_order   integer not null check (sort_order between 0 and 9),
  primary key (request_id, storage_path)
);

create table public.model_request_files (
  request_id          uuid not null references public.model_requests (id) on delete cascade,
  format              text not null check (format in ('glb', 'usdz')),
  storage_path        text not null check (char_length(storage_path) <= 512),
  file_name           text not null check (char_length(file_name) <= 255),
  size_bytes          bigint check (size_bytes >= 0),
  required_extensions text[] check (cardinality(required_extensions) <= 32
                                    and char_length(array_to_string(required_extensions, ',')) <= 2000),
  uploaded_by         uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  primary key (request_id, format)
);

alter table public.model_requests enable row level security;
alter table public.model_request_photos enable row level security;
alter table public.model_request_files enable row level security;
revoke all on public.model_requests, public.model_request_photos, public.model_request_files from public, anon, authenticated;
grant select on public.model_requests, public.model_request_photos, public.model_request_files to authenticated;
grant all on public.model_requests, public.model_request_photos, public.model_request_files to service_role;

-- §8.2: the business reads its own requests and photos, model staff read all; staged files are staff-only.
create policy "Members and model staff read requests" on public.model_requests
  for select to authenticated
  using (public.is_business_member(business_id) or (select public.platform_can('models.manage')));
create policy "Members and model staff read request photos" on public.model_request_photos
  for select to authenticated
  using (exists (select 1 from public.model_requests r where r.id = request_id));
create policy "Model staff read staged model files" on public.model_request_files
  for select to authenticated
  using ((select public.platform_can('models.manage')));

-- R-S4-5: the private request-photo bucket. An existing bucket keeps its settings; refuse to continue if it is public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('model-request-photos', 'model-request-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
do $$
begin
  if exists (select 1 from storage.buckets where id = 'model-request-photos' and public) then
    raise exception 'Bucket model-request-photos exists and is public. Make it private before applying this migration.';
  end if;
end;
$$;

-- Path: {business_id}/{request_id}/{uuid}.{jpg|jpeg|png|webp}. Folder names are cast to uuid only inside a CASE branch
-- that has matched the uuid shape, so a malformed name is refused, never a cast error. No update policy.
create policy "Members add request photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'model-request-photos'
              and case when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
                       then public.is_business_member(split_part(name, '/', 1)::uuid)
                            -- Photos can't be added to a request that was already sent.
                            and not exists (select 1 from public.model_requests r
                                             where r.id = split_part(name, '/', 2)::uuid)
                       else false end);
create policy "Members and model staff read request photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'model-request-photos'
         and ((select public.platform_can('models.manage'))
              or case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      then public.is_business_member(((storage.foldername(name))[1])::uuid)
                      else false end));
create policy "Members and clean-up staff delete request photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'model-request-photos'
         and ((select public.platform_can('businesses.delete')) or (select public.platform_can('products.delete'))
              or case when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                      then public.is_business_member(split_part(name, '/', 1)::uuid)
                           -- Only before the request is sent, or after it was cancelled.
                           and not exists (select 1 from public.model_requests r
                                            where r.id = split_part(name, '/', 2)::uuid and r.status <> 'cancelled')
                      else false end));

-- Audit reads. Model staff read the request history (R-S4-11); §8.2 gives them no other audit read.
create policy "Model staff read request events" on public.audit_events
  for select to authenticated
  using (event_type in ('model_request_created', 'model_request_cancelled', 'model_request_started',
                        'model_request_delivered', 'model_request_rejected')
         and (select public.platform_can('models.manage')));
-- R-W7-2 as in S1.5 Task 8, plus deliveries, declines and switch changes (the owner's "Changes by the platform team").
drop policy "Business owners read platform changes to their business" on public.audit_events;
create policy "Business owners read platform changes to their business" on public.audit_events
  for select to authenticated
  using (event_type in ('business_status_changed', 'business_slug_changed', 'product_created', 'product_published',
                        'product_unpublished', 'product_slug_changed', 'product_deleted', 'account_closure_voided',
                        'model_request_delivered', 'model_request_rejected', 'business_own_models_changed')
         and business_id is not null
         and public.is_business_member(business_id));
-- ---- end S4 Task 1 ----

-- =============================================================================
-- S4 Task 3: Own-upload rules in save and storage, the editor's 3D section, stale-save guard (R-S4-3, R-S4-4, R-S4-17)
-- =============================================================================

-- R-S4-17: models_changed_at is stamped whenever an API caller writes model rows (save_product runs as the caller, who
-- has no column grant on it). Staff delivery runs as the definer and stamps it itself (Task 6). A foreign-key cascade
-- (product or option deleted) runs as the table owner and is not counted.
create function private.stamp_models_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products set models_changed_at = now()
   where id = case when tg_op = 'DELETE' then old.product_id else new.product_id end
     and models_changed_at is distinct from now();
  return null;
end;
$$;
revoke execute on function private.stamp_models_changed() from public, anon, authenticated;
create trigger product_models_stamp_changed after insert or update or delete on public.product_models
  for each row
  when (current_user in ('anon', 'authenticated'))
  execute function private.stamp_models_changed();
create trigger product_variant_models_stamp_changed after insert or update or delete on public.product_variant_models
  for each row
  when (current_user in ('anon', 'authenticated'))
  execute function private.stamp_models_changed();

-- R-S4-3 and R-S4-17: save_product, same signature, still SECURITY INVOKER (so the guard_own_models trigger decides
-- every model write). It now touches the model rows of the product, and of each kept option, only when that set
-- differs from the stored one, compared as sorted (format, storage path or url, required extensions) tuples.
-- New p_product keys:
--   keep_models boolean                      true: no model row is touched (an owner whose switch is off).
--   expected_models_changed_at timestamptz   the value the editor loaded. When the key is present and a set would
--                                            change while the stored value is newer (or set while this is null),
--                                            models_changed_elsewhere (P0001) and nothing is written. An old client
--                                            that never sends the key is not checked.
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
    where id = v_id
    returning models_changed_at into v_stored_at;
    if not found then
      raise exception 'Product not found or access denied' using errcode = '42501';
    end if;
  end if;

  delete from public.product_images where product_id = v_id;

  insert into public.product_images (product_id, url, storage_path, alt, is_primary, kind, sort_order)
  select v_id, r.url, r.storage_path, r.alt, coalesce(r.is_primary, false),
         coalesce(r.kind, 'gallery'), coalesce(r.sort_order, 0)
  from jsonb_to_recordset(coalesce(p_images, '[]'::jsonb))
    as r(url text, storage_path text, alt text, is_primary boolean, kind text, sort_order integer);

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

    insert into public.product_variant_images (variant_id, product_id, storage_path, alt, is_primary, sort_order)
    select v_vid, v_id, r.storage_path, r.alt, coalesce(r.is_primary, false), (r.o - 1)::integer
    from rows from (jsonb_to_recordset(coalesce(v_var -> 'images', '[]'::jsonb))
           as (storage_path text, alt text, is_primary boolean)) with ordinality as r(storage_path, alt, is_primary, o);

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

-- R-S4-3: a business member's .glb or .usdz in product-media also needs can_write_own_models (the switch). The
-- account-settings bodies otherwise; images are unchanged. The folder is matched as text against the member's
-- business id, so a malformed name is refused, never a cast error.
drop policy "Members and admins upload media" on storage.objects;
create policy "Members and admins upload media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-media'
    and ((select public.is_platform_admin())
         or exists (select 1 from public.business_members m
                    where m.user_id = (select auth.uid())
                      and m.business_id::text = (storage.foldername(name))[1]
                      and public.is_business_member(m.business_id)
                      and (lower(name) !~ '\.(glb|usdz)$' or public.can_write_own_models(m.business_id))))
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
                      and public.is_business_member(m.business_id)
                      and (lower(name) !~ '\.(glb|usdz)$' or public.can_write_own_models(m.business_id))))
  )
  with check (
    bucket_id = 'product-media'
    and ((select public.is_platform_admin())
         or exists (select 1 from public.business_members m
                    where m.user_id = (select auth.uid())
                      and m.business_id::text = (storage.foldername(name))[1]
                      and public.is_business_member(m.business_id)
                      and (lower(name) !~ '\.(glb|usdz)$' or public.can_write_own_models(m.business_id))))
  );
-- ---- end S4 Task 3 ----

-- =============================================================================
-- S4 Task 4: The business request: send, cancel, and the request panel (R-S4-6, R-S4-7, R-S4-8)
-- =============================================================================
-- ---- end S4 Task 4 ----

-- =============================================================================
-- S4 Task 6: Staff detail, staging, deliver and decline (R-S4-11, R-S4-12, R-S4-13, R-S4-14, R-S4-16)
-- =============================================================================
-- ---- end S4 Task 6 ----

-- =============================================================================
-- S4 Task 7: review-model-request Edge Function and the owner email (R-S4-15)
-- =============================================================================
-- ---- end S4 Task 7 ----

-- =============================================================================
-- S4 Task 8: Clean-up with the product, the option, the business and the closure (R-S4-18)
-- =============================================================================
-- ---- end S4 Task 8 ----

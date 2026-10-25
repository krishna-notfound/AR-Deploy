-- Platform team roles (ADR-0029) and link invitations (ADR-0030).
--
-- Owners stay in public.platform_admins, and every existing policy and function that checks
-- public.is_platform_admin() is left as it is. Admin and Team members live in public.platform_members;
-- they get additional permissive policies and function checks through public.platform_can(permission).
-- Only an active member gets permissions. Every membership change goes through security definer
-- functions below; the API roles have no write grants on these tables.
-- Rollback: supabase/rollback/20261025_platform_team_roles_rollback.sql

-- ---------------------------------------------------------------------------
-- 1. Types and tables
-- ---------------------------------------------------------------------------

create type public.platform_role as enum ('admin', 'team');
create type public.member_status as enum ('invited', 'active', 'deactivated');
create type public.invite_status as enum ('pending', 'sent', 'email_failed', 'accepted', 'expired', 'revoked');

create table public.platform_members (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique references auth.users (id) on delete cascade,
  email          text not null unique check (email = lower(email) and char_length(email) between 3 and 254),
  full_name      text check (char_length(full_name) <= 120),
  role           public.platform_role not null,
  status         public.member_status not null default 'invited',
  invited_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  activated_at   timestamptz,
  deactivated_at timestamptz,
  updated_at     timestamptz not null default now()
);
create trigger platform_members_set_updated_at before update on public.platform_members
  for each row execute function public.set_updated_at();

create table public.platform_role_permissions (
  role       public.platform_role not null,
  permission text not null check (permission in (
    'businesses.view', 'businesses.edit', 'businesses.status', 'businesses.delete', 'owners.manage',
    'applications.view', 'applications.approve', 'applications.reject',
    'products.view', 'products.edit', 'products.publish', 'products.delete',
    'analytics.view', 'records.view', 'access.view')),
  primary key (role, permission)
);

insert into public.platform_role_permissions (role, permission)
select 'admin'::public.platform_role, p from unnest(array[
  'businesses.view', 'businesses.edit', 'businesses.status', 'businesses.delete', 'owners.manage',
  'applications.view', 'applications.approve', 'applications.reject',
  'products.view', 'products.edit', 'products.publish', 'products.delete',
  'analytics.view', 'records.view', 'access.view']) as p
union all
select 'team'::public.platform_role, p from unnest(array['businesses.view', 'applications.view', 'products.view', 'analytics.view', 'products.edit']) as p;

-- The invitation secret is never stored: only its SHA-256 (hex). Not reachable by the API roles at all.
create table private.platform_invites (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references public.platform_members (id) on delete cascade,
  token_hash        text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status            public.invite_status not null default 'pending',
  expires_at        timestamptz not null,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  last_email_at     timestamptz,
  last_email_result text check (char_length(last_email_result) <= 220),
  accepted_at       timestamptz,
  revoked_at        timestamptz,
  revoked_by        uuid references auth.users (id) on delete set null
);
create index platform_invites_member_idx on private.platform_invites (member_id, created_at desc);
revoke all on private.platform_invites from public, anon, authenticated;
grant select, insert, update on private.platform_invites to service_role;

-- ---------------------------------------------------------------------------
-- 2. Access checks
-- ---------------------------------------------------------------------------

-- True for an Owner, or for an active member whose role has the permission. Read on every call, so a
-- deactivation or a removed permission applies to the member's next request.
create function public.platform_can(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
      or exists (
        select 1 from public.platform_members m
        join public.platform_role_permissions rp on rp.role = m.role
        where m.user_id = (select auth.uid()) and m.status = 'active' and rp.permission = p_permission);
$$;

-- Owner, or an active Admin/Team member (navigation only; data access is decided by platform_can).
create function public.is_platform_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
      or exists (select 1 from public.platform_members where user_id = (select auth.uid()) and status = 'active');
$$;

-- {"role": "owner"|"admin"|"team", "permissions": [...]} for the caller, or null.
create function public.my_platform_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.platform_admins where user_id = (select auth.uid())) then
      jsonb_build_object('role', 'owner', 'permissions',
        (select coalesce(jsonb_agg(distinct permission order by permission), '[]'::jsonb) from public.platform_role_permissions))
    else (
      select jsonb_build_object('role', m.role::text, 'permissions',
        (select coalesce(jsonb_agg(rp.permission order by rp.permission), '[]'::jsonb)
           from public.platform_role_permissions rp where rp.role = m.role))
      from public.platform_members m
      where m.user_id = (select auth.uid()) and m.status = 'active')
  end;
$$;

revoke execute on function public.platform_can(text) from public, anon;
revoke execute on function public.is_platform_member() from public, anon;
revoke execute on function public.my_platform_access() from public, anon;
grant execute on function public.platform_can(text) to authenticated, service_role;
grant execute on function public.is_platform_member() to authenticated, service_role;
grant execute on function public.my_platform_access() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Read rules for the membership tables (no write grants: writes go through functions)
-- ---------------------------------------------------------------------------

alter table public.platform_members enable row level security;
alter table public.platform_role_permissions enable row level security;
revoke all on public.platform_members from public, anon, authenticated;
revoke all on public.platform_role_permissions from public, anon, authenticated;
grant select on public.platform_members to authenticated;
grant select on public.platform_role_permissions to authenticated;
grant select, insert, update on public.platform_members to service_role;
grant select on public.platform_role_permissions to service_role;

create policy "Owners read platform members"
  on public.platform_members for select to authenticated
  using ((select public.is_platform_admin()));
create policy "Members read their own membership"
  on public.platform_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners read role permissions"
  on public.platform_role_permissions for select to authenticated
  using ((select public.is_platform_admin()));
create policy "Active members read their role's permissions"
  on public.platform_role_permissions for select to authenticated
  using (exists (select 1 from public.platform_members m
                 where m.user_id = (select auth.uid()) and m.status = 'active' and m.role = platform_role_permissions.role));

-- ---------------------------------------------------------------------------
-- 4. Existing admin-only functions also accept the matching permission
-- ---------------------------------------------------------------------------
-- Each function's current definition is taken from the catalogue and its is_platform_admin() check is
-- widened to "is_platform_admin() or <permission check>", so the rest of each body stays exactly as it was.
create function private.widen_admin_check(p_fn regprocedure, p_check text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_def text := pg_get_functiondef(p_fn);
begin
  if position('public.is_platform_admin()' in v_def) = 0 then
    raise exception 'widen_admin_check: % has no is_platform_admin() check', p_fn;
  end if;
  execute replace(v_def, 'public.is_platform_admin()', '(public.is_platform_admin() or ' || p_check || ')');
end;
$$;

select private.widen_admin_check('public.guard_business_admin_fields()',
  '(public.platform_can(''businesses.edit'') and (new.status is not distinct from old.status or public.platform_can(''businesses.status'')))');
select private.widen_admin_check('public.admin_review_application(uuid, text, text)',
  'public.platform_can(case when p_action = ''reject'' then ''applications.reject'' else ''applications.approve'' end)');
select private.widen_admin_check('public.admin_list_business_members(uuid)', 'public.platform_can(''businesses.view'')');
select private.widen_admin_check('public.admin_user_emails(uuid[])',
  '(public.platform_can(''businesses.view'') or public.platform_can(''applications.view'') or public.platform_can(''records.view'') or public.platform_can(''access.view''))');
drop function private.widen_admin_check(regprocedure, text);

-- ---------------------------------------------------------------------------
-- 5. Added policies for active members (permissive: ORed with the existing Owner and business-owner rules)
-- ---------------------------------------------------------------------------

create policy "Platform members read businesses" on public.businesses
  for select to authenticated using ((select public.platform_can('businesses.view')));
create policy "Platform members create businesses" on public.businesses
  for insert to authenticated with check ((select public.platform_can('businesses.edit')));
create policy "Platform members update businesses" on public.businesses
  for update to authenticated
  using ((select public.platform_can('businesses.edit'))) with check ((select public.platform_can('businesses.edit')));
create policy "Platform members delete businesses" on public.businesses
  for delete to authenticated using ((select public.platform_can('businesses.delete')));

create policy "Platform members read business owners" on public.business_members
  for select to authenticated using ((select public.platform_can('businesses.view')));
create policy "Platform members remove business owners" on public.business_members
  for delete to authenticated using ((select public.platform_can('owners.manage')));

create policy "Platform members read applications" on public.business_applications
  for select to authenticated using ((select public.platform_can('applications.view')));

create policy "Platform members read products" on public.products
  for select to authenticated using ((select public.platform_can('products.view')));
create policy "Platform members create products" on public.products
  for insert to authenticated with check ((select public.platform_can('products.edit')));
create policy "Platform members update products" on public.products
  for update to authenticated
  using ((select public.platform_can('products.edit'))) with check ((select public.platform_can('products.edit')));
create policy "Platform members delete products" on public.products
  for delete to authenticated using ((select public.platform_can('products.delete')));

-- Product children: readable through the products rules above; writable with products.edit, keeping the
-- same upload-path rules as the existing policies (a file must sit in the product's own business folder).
create policy "Platform members write images" on public.product_images
  for all to authenticated
  using ((select public.platform_can('products.edit')))
  with check ((select public.platform_can('products.edit'))
              and exists (select 1 from public.products p where p.id = product_id
                          and (storage_path is null or storage_path ~ ('^' || p.business_id::text
                               || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$'))));
create policy "Platform members write models" on public.product_models
  for all to authenticated
  using ((select public.platform_can('products.edit')))
  with check ((select public.platform_can('products.edit'))
              and exists (select 1 from public.products p where p.id = product_id
                          and (storage_path is null or storage_path ~ ('^' || p.business_id::text
                               || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(glb|usdz)$'))));
create policy "Platform members write variants" on public.product_variants
  for all to authenticated
  using ((select public.platform_can('products.edit')))
  with check ((select public.platform_can('products.edit')) and exists (select 1 from public.products p where p.id = product_id));
create policy "Platform members write variant images" on public.product_variant_images
  for all to authenticated
  using ((select public.platform_can('products.edit')))
  with check ((select public.platform_can('products.edit'))
              and exists (select 1 from public.products p where p.id = product_id
                          and storage_path ~ ('^' || p.business_id::text
                              || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$')));
create policy "Platform members write variant models" on public.product_variant_models
  for all to authenticated
  using ((select public.platform_can('products.edit')))
  with check ((select public.platform_can('products.edit'))
              and exists (select 1 from public.products p where p.id = product_id
                          and storage_path ~ ('^' || p.business_id::text
                              || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(glb|usdz)$')));

create policy "Platform members read analytics" on public.product_analytics
  for select to authenticated using ((select public.platform_can('analytics.view')));

create policy "Platform members read the email log" on public.email_log
  for select to authenticated
  using ((select public.platform_can('records.view'))
         or (application_id is not null and (select public.platform_can('applications.view'))));

-- Access events (access_*) need access.view; every other event needs records.view, or applications.view
-- for an application's own timeline.
create policy "Platform members read audit events" on public.audit_events
  for select to authenticated
  using (case when event_type like 'access%'
              then (select public.platform_can('access.view'))
              else (select public.platform_can('records.view'))
                   or (application_id is not null and (select public.platform_can('applications.view')))
         end);

create policy "Platform members read logos" on storage.objects
  for select to authenticated
  using (bucket_id = 'business-logos' and (select public.platform_can('businesses.view')));
create policy "Platform members upload logos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'business-logos' and (select public.platform_can('businesses.edit')));
create policy "Platform members update logos" on storage.objects
  for update to authenticated
  using (bucket_id = 'business-logos' and (select public.platform_can('businesses.edit')))
  with check (bucket_id = 'business-logos' and (select public.platform_can('businesses.edit')));
create policy "Platform members delete logos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'business-logos' and (select public.platform_can('businesses.edit')));
create policy "Platform members read media" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-media' and (select public.platform_can('products.view')));
create policy "Platform members upload media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-media' and (select public.platform_can('products.edit')));
create policy "Platform members update media" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-media' and (select public.platform_can('products.edit')))
  with check (bucket_id = 'product-media' and (select public.platform_can('products.edit')));
create policy "Platform members delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-media' and (select public.platform_can('products.edit')));

-- ---------------------------------------------------------------------------
-- 6. Publishing needs products.publish (or Owner, or the product's own business owner)
-- ---------------------------------------------------------------------------
create function private.products_publish_permission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and ((tg_op = 'INSERT' and new.status = 'published')
          or (tg_op = 'UPDATE' and (old.status = 'published') is distinct from (new.status = 'published')))
     and not public.is_platform_admin()
     and not public.is_business_member(new.business_id)
     and not public.platform_can('products.publish') then
    raise exception 'publish_not_permitted' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger products_publish_permission before insert or update of status on public.products
  for each row execute function private.products_publish_permission();

-- ---------------------------------------------------------------------------
-- 7. Platform access and business ownership stay separate
-- ---------------------------------------------------------------------------
create function private.business_owner_not_platform_member()
returns trigger
language plpgsql
security definer -- sees every membership whatever the caller's RLS view
set search_path = ''
as $$
begin
  if exists (select 1 from public.platform_members where user_id = new.user_id) then
    raise exception 'platform_member_cannot_own' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger business_members_not_platform before insert or update of user_id on public.business_members
  for each row execute function private.business_owner_not_platform_member();

create function private.platform_member_not_business_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and exists (select 1 from public.business_members where user_id = new.user_id) then
    raise exception 'business_owner' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger platform_members_not_business_owner before insert or update of user_id on public.platform_members
  for each row execute function private.platform_member_not_business_owner();

-- ---------------------------------------------------------------------------
-- 8. Member management (Owner only) and invitations
-- ---------------------------------------------------------------------------
-- These return {"ok": true, ...} or {"error": "<code>"} instead of raising, so that the access_denied
-- audit row written for a refused call is kept (Postgres has no autonomous transactions).
-- Audit metadata never contains invitation secrets or their hashes.

-- Records a refused call. Used by the functions below and by the edge functions (service role).
create function public.service_log_access_denied(p_actor uuid, p_action text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_events (event_type, actor_id, metadata)
  values ('access_denied', p_actor, jsonb_build_object('action', left(coalesce(p_action, ''), 80)));
$$;

create function private.owner_or_deny(p_action text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_platform_admin() then
    return true;
  end if;
  perform public.service_log_access_denied((select auth.uid()), p_action);
  return false;
end;
$$;

-- Effective invitation status: a live invitation past its expiry counts as expired.
create function private.invite_state(p_status public.invite_status, p_expires timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_status in ('pending', 'sent', 'email_failed') and p_expires <= now() then 'expired' else p_status::text end;
$$;

create function private.member_json(m public.platform_members)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'userId', m.user_id, 'email', m.email, 'fullName', m.full_name, 'role', m.role::text, 'status', m.status::text,
    'invitedBy', (select u.email::text from auth.users u where u.id = m.invited_by),
    'createdAt', m.created_at, 'activatedAt', m.activated_at, 'deactivatedAt', m.deactivated_at,
    'lastSignInAt', (select u.last_sign_in_at from auth.users u where u.id = m.user_id),
    'invite', (select jsonb_build_object('status', private.invite_state(i.status, i.expires_at), 'expiresAt', i.expires_at)
               from private.platform_invites i where i.member_id = m.id order by i.created_at desc limit 1));
$$;

create function public.admin_invite_member(p_email text, p_role public.platform_role)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_member public.platform_members;
begin
  if not private.owner_or_deny('invite_member') then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('error', 'invalid_email');
  end if;
  if exists (select 1 from auth.users u join public.platform_admins a on a.user_id = u.id where lower(u.email) = v_email) then
    return jsonb_build_object('error', 'owner_protected');
  end if;
  if exists (select 1 from auth.users u join public.business_members b on b.user_id = u.id where lower(u.email) = v_email) then
    return jsonb_build_object('error', 'business_owner');
  end if;
  select * into v_member from public.platform_members where email = v_email for update;
  if found then
    -- A deactivated invitation that was never accepted may be re-sent with a new role; anyone else already has a row.
    if v_member.status = 'deactivated' and v_member.user_id is null then
      update public.platform_members set role = p_role, status = 'invited', invited_by = (select auth.uid()), deactivated_at = null
       where id = v_member.id returning * into v_member;
    else
      return jsonb_build_object('error', 'already_member');
    end if;
  else
    insert into public.platform_members (email, role, status, invited_by)
    values (v_email, p_role, 'invited', (select auth.uid())) returning * into v_member;
  end if;
  insert into public.audit_events (event_type, actor_id, to_status, metadata)
  values ('access_invite_created', (select auth.uid()), p_role::text, jsonb_build_object('member_id', v_member.id, 'email', v_email, 'role', p_role::text));
  return jsonb_build_object('ok', true, 'memberId', v_member.id);
end;
$$;

create function public.admin_set_member_role(p_member uuid, p_role public.platform_role)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.platform_members;
begin
  if not private.owner_or_deny('set_member_role') then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select * into v_member from public.platform_members where id = p_member for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_member.user_id = (select auth.uid()) then
    return jsonb_build_object('error', 'self');
  end if;
  if v_member.role = p_role then
    return jsonb_build_object('ok', true);
  end if;
  update public.platform_members set role = p_role where id = p_member;
  insert into public.audit_events (event_type, actor_id, from_status, to_status, metadata)
  values ('access_role_changed', (select auth.uid()), v_member.role::text, p_role::text,
          jsonb_build_object('member_id', p_member, 'email', v_member.email));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.admin_deactivate_member(p_member uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.platform_members;
begin
  if not private.owner_or_deny('deactivate_member') then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select * into v_member from public.platform_members where id = p_member for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_member.user_id = (select auth.uid()) then
    return jsonb_build_object('error', 'self');
  end if;
  if v_member.status = 'deactivated' then
    return jsonb_build_object('ok', true, 'userId', v_member.user_id);
  end if;
  update public.platform_members set status = 'deactivated', deactivated_at = now() where id = p_member;
  update private.platform_invites set status = 'revoked', revoked_at = now(), revoked_by = (select auth.uid())
   where member_id = p_member and status in ('pending', 'sent', 'email_failed');
  insert into public.audit_events (event_type, actor_id, from_status, to_status, metadata)
  values ('access_member_deactivated', (select auth.uid()), v_member.status::text, 'deactivated',
          jsonb_build_object('member_id', p_member, 'email', v_member.email));
  return jsonb_build_object('ok', true, 'userId', v_member.user_id);
end;
$$;

create function public.admin_reactivate_member(p_member uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.platform_members;
begin
  if not private.owner_or_deny('reactivate_member') then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select * into v_member from public.platform_members where id = p_member for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_member.status <> 'deactivated' then
    return jsonb_build_object('error', 'not_deactivated');
  end if;
  -- Someone who never accepted goes back to "invited" (and needs a new invitation); others are active again.
  update public.platform_members
     set status = case when user_id is null then 'invited'::public.member_status else 'active'::public.member_status end,
         deactivated_at = null
   where id = p_member;
  insert into public.audit_events (event_type, actor_id, from_status, to_status, metadata)
  values ('access_member_reactivated', (select auth.uid()), 'deactivated',
          case when v_member.user_id is null then 'invited' else 'active' end,
          jsonb_build_object('member_id', p_member, 'email', v_member.email));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.admin_revoke_member_invite(p_member uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_count int;
begin
  if not private.owner_or_deny('revoke_member_invite') then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select email into v_email from public.platform_members where id = p_member;
  if v_email is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  update private.platform_invites set status = 'revoked', revoked_at = now(), revoked_by = (select auth.uid())
   where member_id = p_member and status in ('pending', 'sent', 'email_failed');
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return jsonb_build_object('error', 'no_live_invite');
  end if;
  insert into public.audit_events (event_type, actor_id, metadata)
  values ('access_invite_revoked', (select auth.uid()), jsonb_build_object('member_id', p_member, 'email', v_email));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.admin_set_role_permissions(p_role public.platform_role, p_permissions text[])
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
  v_new text[] := array(select distinct unnest(coalesce(p_permissions, '{}')) order by 1);
  v_old text[];
  v_added text[];
  v_removed text[];
begin
  if not private.owner_or_deny('set_role_permissions') then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if not (v_new <@ v_known) then
    return jsonb_build_object('error', 'unknown_permission');
  end if;
  v_old := array(select permission from public.platform_role_permissions where role = p_role order by 1);
  v_added := array(select unnest(v_new) except select unnest(v_old) order by 1);
  v_removed := array(select unnest(v_old) except select unnest(v_new) order by 1);
  if cardinality(v_added) = 0 and cardinality(v_removed) = 0 then
    return jsonb_build_object('ok', true);
  end if;
  delete from public.platform_role_permissions where role = p_role and permission = any (v_removed);
  insert into public.platform_role_permissions (role, permission) select p_role, unnest(v_added);
  insert into public.audit_events (event_type, actor_id, metadata)
  values ('access_permissions_changed', (select auth.uid()),
          jsonb_build_object('role', p_role::text, 'added', to_jsonb(v_added), 'removed', to_jsonb(v_removed)));
  return jsonb_build_object('ok', true);
end;
$$;

-- Owners are listed too (role "owner", id = user id) so the team page shows everyone with access.
create function public.admin_list_members()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.owner_or_deny('list_members') then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return jsonb_build_object('members',
    coalesce((select jsonb_agg(x order by x->>'createdAt') from (
      select jsonb_build_object('id', a.user_id, 'userId', a.user_id, 'email', u.email::text, 'fullName', null, 'role', 'owner',
               'status', 'active', 'invitedBy', null, 'createdAt', a.created_at, 'activatedAt', a.created_at,
               'deactivatedAt', null, 'lastSignInAt', u.last_sign_in_at, 'invite', null) as x
        from public.platform_admins a join auth.users u on u.id = a.user_id
      union all
      select private.member_json(m) from public.platform_members m) s), '[]'::jsonb));
end;
$$;

create function public.admin_get_member(p_member uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.platform_members;
begin
  if not private.owner_or_deny('get_member') then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select * into v_member from public.platform_members where id = p_member;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  return jsonb_build_object('member', private.member_json(v_member));
end;
$$;

create function public.admin_list_member_invites(p_member uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.owner_or_deny('list_member_invites') then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return jsonb_build_object('invites', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', i.id, 'status', private.invite_state(i.status, i.expires_at), 'createdAt', i.created_at, 'expiresAt', i.expires_at,
             'createdBy', (select u.email::text from auth.users u where u.id = i.created_by),
             'lastEmailAt', i.last_email_at, 'lastEmailResult', i.last_email_result,
             'acceptedAt', i.accepted_at, 'revokedAt', i.revoked_at) order by i.created_at desc)
      from private.platform_invites i where i.member_id = p_member), '[]'::jsonb));
end;
$$;

-- Service role only (edge functions): the hash comes from the edge function; the secret never reaches the database.
create function public.service_create_member_invite(p_member uuid, p_token_hash text, p_expires_at timestamptz, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.platform_members;
  v_id uuid;
begin
  select * into v_member from public.platform_members where id = p_member for update;
  if not found or v_member.status <> 'invited' then
    return jsonb_build_object('error', 'not_invited');
  end if;
  if (select count(*) from private.platform_invites where member_id = p_member and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  update private.platform_invites set status = 'revoked', revoked_at = now(), revoked_by = p_actor
   where member_id = p_member and status in ('pending', 'sent', 'email_failed');
  insert into private.platform_invites (member_id, token_hash, expires_at, created_by)
  values (p_member, p_token_hash, p_expires_at, p_actor) returning id into v_id;
  return jsonb_build_object('ok', true, 'inviteId', v_id);
end;
$$;

create function public.service_record_invite_email(p_invite uuid, p_ok boolean, p_detail text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv private.platform_invites;
  v_email text;
begin
  update private.platform_invites
     set status = case when status in ('pending', 'sent', 'email_failed')
                       then (case when p_ok then 'sent' else 'email_failed' end)::public.invite_status else status end,
         last_email_at = now(),
         last_email_result = left(case when p_ok then 'accepted' else 'failed: ' || coalesce(p_detail, 'unknown') end, 220)
   where id = p_invite returning * into v_inv;
  if not found then
    return;
  end if;
  select email into v_email from public.platform_members where id = v_inv.member_id;
  insert into public.audit_events (event_type, actor_id, metadata)
  values (case when p_ok then 'access_invite_email_sent' else 'access_invite_email_failed' end, v_inv.created_by,
          jsonb_build_object('member_id', v_inv.member_id, 'email', v_email)
            || case when p_ok then '{}'::jsonb else jsonb_build_object('reason', left(coalesce(p_detail, ''), 200)) end);
end;
$$;

create function public.service_inspect_invite(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv private.platform_invites;
  v_member public.platform_members;
  v_state text;
begin
  select * into v_inv from private.platform_invites where token_hash = p_token_hash;
  if not found then
    return jsonb_build_object('state', 'invalid');
  end if;
  select * into v_member from public.platform_members where id = v_inv.member_id;
  v_state := case private.invite_state(v_inv.status, v_inv.expires_at)
               when 'accepted' then 'used' when 'revoked' then 'revoked' when 'expired' then 'expired' else 'valid' end;
  if v_state = 'valid' and v_member.status <> 'invited' then
    v_state := 'revoked';
  end if;
  return jsonb_build_object(
    'state', v_state,
    'email', case when v_state = 'valid' then v_member.email end,
    'role', case when v_state = 'valid' then v_member.role::text end,
    'invitedBy', case when v_state = 'valid' then (select u.email::text from auth.users u where u.id = v_inv.created_by) end,
    'expiresAt', case when v_state = 'valid' then v_inv.expires_at end,
    'userExists', case when v_state = 'valid' then exists (select 1 from auth.users u where lower(u.email) = v_member.email) end);
end;
$$;

-- Accepts once: the invitation must be live, the user's email must be the invited one, and the user must not own a business.
create function public.service_accept_invite(p_token_hash text, p_user uuid, p_full_name text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv private.platform_invites;
  v_member public.platform_members;
  v_user_email text;
begin
  select * into v_inv from private.platform_invites where token_hash = p_token_hash for update;
  if not found then
    return 'invite_invalid';
  end if;
  if v_inv.status = 'accepted' then
    return 'invite_used';
  end if;
  if v_inv.status = 'revoked' then
    return 'invite_revoked';
  end if;
  if private.invite_state(v_inv.status, v_inv.expires_at) = 'expired' then
    update private.platform_invites set status = 'expired' where id = v_inv.id;
    insert into public.audit_events (event_type, actor_id, metadata)
    values ('access_invite_expired_attempt', p_user, jsonb_build_object('member_id', v_inv.member_id));
    return 'invite_expired';
  end if;
  select * into v_member from public.platform_members where id = v_inv.member_id for update;
  if v_member.status <> 'invited' then
    return 'invite_revoked';
  end if;
  select lower(email) into v_user_email from auth.users where id = p_user;
  if v_user_email is distinct from v_member.email then
    return 'email_mismatch';
  end if;
  if exists (select 1 from public.business_members where user_id = p_user) then
    return 'business_owner';
  end if;
  update public.platform_members
     set user_id = p_user, status = 'active', activated_at = now(),
         full_name = coalesce(nullif(left(btrim(coalesce(p_full_name, '')), 120), ''), full_name)
   where id = v_member.id;
  update private.platform_invites set status = 'accepted', accepted_at = now() where id = v_inv.id;
  insert into public.audit_events (event_type, actor_id, from_status, to_status, metadata)
  values ('access_invite_accepted', p_user, 'invited', 'active',
          jsonb_build_object('member_id', v_member.id, 'email', v_member.email, 'role', v_member.role::text));
  return 'ok';
end;
$$;

-- For edge functions that act for a signed-in user with the service role (provision-owner): the same rule as
-- platform_can, for a given user.
create function public.service_user_can(p_user uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = p_user)
      or exists (
        select 1 from public.platform_members m
        join public.platform_role_permissions rp on rp.role = m.role
        where m.user_id = p_user and m.status = 'active' and rp.permission = p_permission);
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_invite_member(text, public.platform_role)', 'public.admin_set_member_role(uuid, public.platform_role)',
    'public.admin_deactivate_member(uuid)', 'public.admin_reactivate_member(uuid)', 'public.admin_revoke_member_invite(uuid)',
    'public.admin_set_role_permissions(public.platform_role, text[])', 'public.admin_list_members()',
    'public.admin_get_member(uuid)', 'public.admin_list_member_invites(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.service_log_access_denied(uuid, text)', 'public.service_create_member_invite(uuid, text, timestamptz, uuid)',
    'public.service_record_invite_email(uuid, boolean, text)', 'public.service_inspect_invite(text)',
    'public.service_accept_invite(text, uuid, text)', 'public.service_user_can(uuid, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

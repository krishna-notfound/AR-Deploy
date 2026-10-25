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

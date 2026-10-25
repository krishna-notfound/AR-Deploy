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

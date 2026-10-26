-- S1.5 business-logic fixes (spec: docs/superpowers/specs/2026-10-26-business-logic-fixes-design.md, §10.1).
-- Rollback: supabase/rollback/20261026_business_logic_fixes_rollback.sql (sections in reverse task order).
-- Tests: supabase/tests/businessLogicFixes.test.ts (PGlite, one describe per task).
--
-- This is the only S1.5 migration. Each task appends one section at the END of this file, in this format:
--
--   -- =============================================================================
--   -- S1.5 Task N: <title> (R-Wn-k, ...)
--   -- =============================================================================
--   ...statements...
--   -- ---- end S1.5 Task N ----
--
-- A task never edits another task's section. To change a function an earlier section already redefined,
-- `create or replace` it again in the new section, starting from that earlier section's body.
-- SQL rules: RLS on every new table (revoke all from public, anon, authenticated, then explicit grants); every new
-- function security definer with `set search_path = ''`, execute revoked from public and granted explicitly; every
-- service_* and private trigger function revoked from anon and authenticated. Access checks use only the S1 gated
-- helpers (platform_can, is_platform_admin, is_platform_member, is_business_member, caller_mfa_satisfied).

-- =============================================================================
-- S1.5 Task 1: security-activity privacy, profile visibility and Owner permissions; email kinds (R-W1-4, R-W1-5, R-W1-6, §10.4)
-- =============================================================================

-- R-W1-4: other people's account_* events (sign-ins with IP and device, 2FA changes, closures) are the Owner's
-- alone. The Owner keeps "Platform admins read audit events" and everyone keeps "Users read their own account
-- events"; this staff policy no longer reaches account_* rows.
drop policy "Platform members read audit events" on public.audit_events;
create policy "Platform members read audit events" on public.audit_events
  for select to authenticated
  using (case when event_type like 'access%'
              then (select public.platform_can('access.view'))
              else event_type not like 'account\_%'
                   and ((select public.platform_can('records.view'))
                        or (application_id is not null and (select public.platform_can('applications.view'))))
         end);

-- R-W1-5 (§16): staff read a profile only when their role needs it. Staff profiles (a platform_members or
-- platform_admins row) need access.view or records.view, business owners' profiles need businesses.view.
-- Security definer because the membership tables are not readable by Admin/Team (Owner-only RLS); it reveals
-- nothing to a caller without the permission, since it is then false for every row.
create function public.platform_can_read_profile(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ((exists (select 1 from public.platform_members m where m.user_id = p_user)
           or exists (select 1 from public.platform_admins a where a.user_id = p_user))
          and (public.platform_can('access.view') or public.platform_can('records.view')))
      or (exists (select 1 from public.business_members b where b.user_id = p_user)
          and public.platform_can('businesses.view'));
$$;
-- Only the profiles policy calls it, as the signed-in user.
revoke execute on function public.platform_can_read_profile(uuid) from public, anon, service_role;
grant execute on function public.platform_can_read_profile(uuid) to authenticated;

-- The caller's own row stays readable through "Users read their own profile".
drop policy "Platform members read profiles" on public.profiles;
create policy "Platform members read profiles" on public.profiles
  for select to authenticated
  using ((select public.is_platform_admin()) or public.platform_can_read_profile(user_id));

-- R-W1-6: the Owner always has all 15 permissions, whatever the Admin and Team sets hold. The Owner test is the
-- same ungated platform_admins check as before (this function only reports the role; data access stays gated).
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
      select jsonb_build_object('role', m.role::text, 'permissions',
        (select coalesce(jsonb_agg(rp.permission order by rp.permission), '[]'::jsonb)
           from public.platform_role_permissions rp where rp.role = m.role))
      from public.platform_members m
      where m.user_id = (select auth.uid()) and m.status = 'active')
  end;
$$;
revoke execute on function public.my_platform_access() from public, anon;
grant execute on function public.my_platform_access() to authenticated, service_role;

-- §10.4: the email kinds S1.5 sends (application decisions, notices to business owners, notices to the team).
alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('owner_invitation', 'invitation_resend', 'application_confirmation', 'admin_notification', 'team_invitation', 'test',
                  'security_code', 'security_notice', 'closure_request',
                  'application_decision', 'business_notice', 'team_notice'));
-- ---- end S1.5 Task 1 ----

-- =============================================================================
-- S1.5 Task 5: permission prerequisites and storage deletes (R-W3-3)
-- =============================================================================

-- R-W3-3: what each permission needs to be usable (§4, §16 ruling-11 adjustment). One edge per row; the closure is
-- transitive. src/domain/permissions.ts (PERMISSION_PREREQUISITES) mirrors it, pinned by the PGlite suite.
create function private.permission_prerequisites()
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

-- A permission set plus everything it needs, sorted. Used by admin_set_role_permissions and the backfill below.
create function private.with_prerequisites(p_permissions text[])
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  with recursive closed (permission) as (
    select unnest(coalesce(p_permissions, '{}'::text[]))
    union
    select pp.requires from closed c join private.permission_prerequisites() pp on pp.permission = c.permission
  )
  select coalesce(array_agg(permission order by permission), '{}'::text[]) from closed where permission is not null;
$$;
revoke execute on function private.with_prerequisites(text[]) from public, anon, authenticated;

-- Saving a role set stores it with its prerequisites and answers {ok, added}: `added` lists the prerequisites the
-- caller did not send, in the dashboard's order (ALL_PERMISSIONS in src/domain/permissions.ts). The audit row's
-- added/removed are the stored change, so prerequisites that were not stored before are listed there too.
-- Body from 20261025070915_platform_team_roles; only the closure and the answer are new.
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

-- Backfill: every stored role set gets its prerequisites. This can WIDEN a role (e.g. products.edit for a role that
-- has products.publish); the owner sees it first with the read-only pre-flight below and may narrow the sets before
-- release. One access_permissions_changed row per changed role, by the system (actor null), with exactly what was
-- added (sorted), removed [] and reason 'prerequisites'. A role with nothing missing gets no row.
--
-- Pre-flight for the runbook (read-only; runs before this migration, so it carries its own copy of the map):
-- PRE-FLIGHT (R-W3-3) BEGIN
-- with recursive prereq (permission, requires) as (
--   values ('businesses.edit', 'businesses.view'), ('businesses.status', 'businesses.edit'),
--          ('businesses.delete', 'businesses.edit'), ('businesses.delete', 'products.delete'),
--          ('owners.manage', 'businesses.view'), ('applications.approve', 'applications.view'),
--          ('applications.reject', 'applications.view'), ('products.edit', 'products.view'),
--          ('products.publish', 'products.edit'), ('products.delete', 'products.edit')),
-- closed (role, permission) as (
--   select role, permission from public.platform_role_permissions
--   union
--   select c.role, p.requires from closed c join prereq p on p.permission = c.permission)
-- select role::text as role, array_agg(permission order by permission) as will_add
--   from (select role, permission from closed
--         except select role, permission from public.platform_role_permissions) missing
--  group by role order by role;
-- PRE-FLIGHT (R-W3-3) END
do $$
declare
  r record;
  v_added text[];
begin
  for r in select role, array_agg(permission order by permission) as perms
             from public.platform_role_permissions group by role order by role loop
    v_added := array(select unnest(private.with_prerequisites(r.perms)) except select unnest(r.perms) order by 1);
    if cardinality(v_added) > 0 then
      insert into public.platform_role_permissions (role, permission) select r.role, unnest(v_added);
      insert into public.audit_events (event_type, actor_id, metadata)
      values ('access_permissions_changed', null,
              jsonb_build_object('role', r.role::text, 'added', to_jsonb(v_added), 'removed', '[]'::jsonb,
                                 'reason', 'prerequisites'));
    end if;
  end loop;
end;
$$;

-- Storage deletes follow the permission that deletes the row (BIZ-06 storage part): media with products.edit
-- (replacing files), products.delete or businesses.delete; logos with businesses.edit or businesses.delete.
drop policy "Platform members delete media" on storage.objects;
create policy "Platform members delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-media'
         and ((select public.platform_can('products.edit')) or (select public.platform_can('products.delete'))
              or (select public.platform_can('businesses.delete'))));
drop policy "Platform members delete logos" on storage.objects;
create policy "Platform members delete logos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'business-logos'
         and ((select public.platform_can('businesses.edit')) or (select public.platform_can('businesses.delete'))));
-- ---- end S1.5 Task 5 ----

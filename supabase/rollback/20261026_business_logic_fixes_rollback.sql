-- Rollback for the S1.5 migration supabase/migrations/<ts>_business_logic_fixes.sql
-- (spec: docs/superpowers/specs/2026-10-26-business-logic-fixes-design.md, §10.1). Run as the database owner, after
-- deploying the Edge Functions and the app of the release before S1.5, and before any earlier rollback script.
--
-- What it does: restores the earlier function bodies, policies and constraints, and drops the tables, triggers,
-- views and functions S1.5 added. It keeps every audit_events and email_log row: constraints that S1.5 widened are
-- re-added NOT VALID, so rows written under S1.5 stay while new rows must meet the earlier rule.
--
-- DATA LOSS: restoring the analytics cascade FK (product_analytics.product_id back to on delete cascade) first runs
-- `delete from public.product_analytics where product_id is null`. Every analytics row kept for a product deleted
-- under S1.5 is deleted and cannot be recovered. The FK on audit_events.business_id is re-added NOT VALID, so audit
-- rows that point at deleted businesses remain.
--
-- Sections run newest task first. Each task inserts its section directly below the `begin;` line, in this format:
--   -- =============================================================================
--   -- S1.5 Task N rollback: <title> (R-Wn-k, ...)
--   -- =============================================================================
--   ...statements...
--   -- ---- end S1.5 Task N rollback ----

begin;

-- =============================================================================
-- S1.5 Task 9 rollback: team membership lifecycle: remove, email sync, deactivated access (R-W6-1, R-W6-2, R-W6-7)
-- =============================================================================

-- R-W6-7: back to Task 1's body (a deactivated member gets null again).
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

-- R-W6-2: member rows stop following the sign-in address. Addresses already synced (and their audit rows) stay.
drop trigger if exists on_auth_user_email_sync_member on auth.users;
drop function if exists private.sync_member_email();

-- R-W6-1: removing members goes away; removed members stay removed and their access_member_removed rows stay.
drop function if exists public.admin_remove_member(uuid);
-- ---- end S1.5 Task 9 rollback ----

-- =============================================================================
-- S1.5 Task 1 rollback: security-activity privacy, profile visibility and Owner permissions; email kinds (R-W1-4, R-W1-5, R-W1-6, §10.4)
-- =============================================================================

-- §10.4: back to the 9 kinds of 20261025163627_account_settings. NOT VALID keeps rows of the S1.5 kinds.
alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('owner_invitation', 'invitation_resend', 'application_confirmation', 'admin_notification', 'team_invitation', 'test',
                  'security_code', 'security_notice', 'closure_request')) not valid;

-- R-W1-6: the Owner's permissions are the union of the role sets again (20261025070915_platform_team_roles).
create or replace function public.my_platform_access()
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
revoke execute on function public.my_platform_access() from public, anon;
grant execute on function public.my_platform_access() to authenticated, service_role;

-- R-W1-5: every active staff member reads every profile again (20261025163627_account_settings).
drop policy "Platform members read profiles" on public.profiles;
create policy "Platform members read profiles" on public.profiles
  for select to authenticated using ((select public.is_platform_member()));
drop function public.platform_can_read_profile(uuid);

-- R-W1-4: staff with records.view read account_* events again (20261025070915_platform_team_roles).
drop policy "Platform members read audit events" on public.audit_events;
create policy "Platform members read audit events" on public.audit_events
  for select to authenticated
  using (case when event_type like 'access%'
              then (select public.platform_can('access.view'))
              else (select public.platform_can('records.view'))
                   or (application_id is not null and (select public.platform_can('applications.view')))
         end);
-- ---- end S1.5 Task 1 rollback ----

commit;

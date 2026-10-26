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
-- S1.5 Task 3 rollback: closure integrity: a closure follows the owner's membership; no activation around an open closure (R-W1-2, R-W1-3)
-- =============================================================================

drop trigger businesses_guard_activate_during_closure on public.businesses;
drop function private.guard_activate_during_closure();
drop trigger business_members_void_closure on public.business_members;
drop function private.void_closure_on_owner_removed();

-- Back to the bodies of 20261025163627_account_settings (no membership check).
create or replace function private.undo_closure(p_user uuid, p_actor uuid, p_event text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.account_closure_requests;
  v_old text;
  v_new text;
begin
  select * into v_req from public.account_closure_requests where user_id = p_user for update;
  if not found then
    return false;
  end if;
  if v_req.business_id is not null then
    select status into v_old from public.businesses where id = v_req.business_id for update;
    perform set_config('app.account_closure', 'on', true);
    update public.businesses set status = coalesce(v_req.previous_business_status, 'draft')
     where id = v_req.business_id and status = 'inactive'
    returning status into v_new;
    v_new := coalesce(v_new, v_old);
  end if;
  delete from public.account_closure_requests where user_id = p_user;
  insert into public.audit_events (event_type, actor_id, business_id, from_status, to_status, metadata)
  values (p_event, (select u.id from auth.users u where u.id = p_actor), v_req.business_id, v_old, v_new,
          jsonb_build_object('subject_id', p_user));
  return true;
end;
$$;
revoke execute on function private.undo_closure(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.service_closure_target(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('ok', true, 'business_id', r.business_id, 'email', u.email::text)
       from public.account_closure_requests r join auth.users u on u.id = r.user_id
      where r.user_id = p_user),
    jsonb_build_object('error', 'not_found'));
$$;
revoke execute on function public.service_closure_target(uuid) from public, anon, authenticated;
grant execute on function public.service_closure_target(uuid) to service_role;
-- ---- end S1.5 Task 3 rollback ----

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

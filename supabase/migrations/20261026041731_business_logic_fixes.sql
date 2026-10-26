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
-- S1.5 Task 3: closure integrity: a closure follows the owner's membership; no activation around an open closure (R-W1-2, R-W1-3)
-- =============================================================================

-- R-W1-2: a closure request belongs to the owner's membership. Removing the owner cancels it, logged as
-- account_closure_voided; the business keeps its status. When the business itself is being deleted (this delete is
-- then its cascade), nothing is done: the request keeps its row with business_id set null, so a complete_closure retry
-- still finds it, and no audit row names a business that is gone.
create function private.void_closure_on_owner_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.businesses where id = old.business_id) then
    return null;
  end if;
  delete from public.account_closure_requests where user_id = old.user_id and business_id = old.business_id;
  if found then
    insert into public.audit_events (event_type, actor_id, business_id, metadata)
    values ('account_closure_voided', (select u.id from auth.users u where u.id = auth.uid()), old.business_id,
            jsonb_build_object('subject_id', old.user_id, 'business_id', old.business_id, 'reason', 'owner_removed'));
  end if;
  return null;
end;
$$;
revoke execute on function private.void_closure_on_owner_removed() from public, anon, authenticated;
create trigger business_members_void_closure after delete on public.business_members
  for each row execute function private.void_closure_on_owner_removed();

-- R-W1-3: while a closure request is open, nobody activates the business through the Data API, the Owner included.
-- Only cancel_account_closure and service_restore_closure (private.undo_closure sets app.account_closure) bring it
-- back. Draft and inactive stay allowed, and closure_follow_status records them as the status to restore.
-- The role test sits in the trigger's WHEN clause: it is evaluated as the caller, while inside this security definer
-- function (which must see every request, whatever the caller's RLS view) current_user is the function owner.
create function private.guard_activate_during_closure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.account_closure', true), '') <> 'on'
     and exists (select 1 from public.account_closure_requests where business_id = new.id) then
    raise exception 'closure_pending' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_activate_during_closure() from public, anon, authenticated;
create trigger businesses_guard_activate_during_closure before update of status on public.businesses
  for each row
  when (new.status = 'active' and old.status <> 'active' and current_user in ('anon', 'authenticated'))
  execute function private.guard_activate_during_closure();

-- R-W1-2: restores the business only while the requester is still its member; otherwise the request is deleted and
-- logged with the status unchanged. Otherwise as in 20261025163627_account_settings.
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
    if exists (select 1 from public.business_members where user_id = p_user and business_id = v_req.business_id) then
      perform set_config('app.account_closure', 'on', true);
      update public.businesses set status = coalesce(v_req.previous_business_status, 'draft')
       where id = v_req.business_id and status = 'inactive'
      returning status into v_new;
    end if;
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

-- R-W1-2: not_found unless the requester is still a member of the business. A request whose business is gone
-- (business_id null: a complete_closure retry after a failed user delete) is still returned.
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
      where r.user_id = p_user
        and (r.business_id is null
             or exists (select 1 from public.business_members m where m.user_id = r.user_id and m.business_id = r.business_id))),
    jsonb_build_object('error', 'not_found'));
$$;
revoke execute on function public.service_closure_target(uuid) from public, anon, authenticated;
grant execute on function public.service_closure_target(uuid) to service_role;
-- ---- end S1.5 Task 3 ----

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
-- S1.5 Task 9: team membership lifecycle: remove, email sync, deactivated access (R-W6-1, R-W6-2, R-W6-7)
-- =============================================================================

-- R-W6-1: the Owner removes a deactivated member for good: their invitations and their row go, so the address can be
-- invited again (as staff or as a business owner). The audit row keeps a hash of the address, not the address. The
-- manage-member Edge Function then deletes the login when nothing else uses it.
create function public.admin_remove_member(p_member uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.platform_members;
begin
  if not private.owner_or_deny('remove_member') then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select * into v_member from public.platform_members where id = p_member for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_member.user_id = (select auth.uid()) then
    return jsonb_build_object('error', 'self');
  end if;
  if v_member.status <> 'deactivated' then
    return jsonb_build_object('error', 'not_deactivated');
  end if;
  delete from private.platform_invites where member_id = p_member;
  delete from public.platform_members where id = p_member;
  insert into public.audit_events (event_type, actor_id, from_status, metadata)
  values ('access_member_removed', (select auth.uid()), 'deactivated',
          jsonb_build_object('member_id', p_member, 'email_sha256', encode(sha256(convert_to(v_member.email, 'UTF8')), 'hex'),
                             'role', v_member.role::text));
  return jsonb_build_object('ok', true, 'user_id', v_member.user_id);
end;
$$;
revoke execute on function public.admin_remove_member(uuid) from public, anon;
grant execute on function public.admin_remove_member(uuid) to authenticated, service_role;

-- R-W6-2: a member's row follows their sign-in address, so staff alerts reach the current one. An address that
-- another member's row already holds changes nothing (the event says conflict). This runs inside every auth.users
-- update, so it never raises: a failure is logged as a warning and the address change goes through.
create function private.sync_member_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.platform_members;
  v_to text := lower(new.email);
begin
  begin
    select * into v_member from public.platform_members where user_id = new.id;
    if not found or v_to is null or v_member.email = v_to then
      return new;
    end if;
    if exists (select 1 from public.platform_members where email = v_to and id <> v_member.id) then
      insert into public.audit_events (event_type, actor_id, metadata)
      values ('access_member_email_changed', new.id,
              jsonb_build_object('member_id', v_member.id, 'from', v_member.email, 'to', v_to, 'conflict', true));
    else
      update public.platform_members set email = v_to where id = v_member.id;
      insert into public.audit_events (event_type, actor_id, metadata)
      values ('access_member_email_changed', new.id, jsonb_build_object('member_id', v_member.id, 'from', v_member.email, 'to', v_to));
    end if;
  exception when others then
    raise warning 'sync_member_email: % (%)', sqlerrm, sqlstate;
  end;
  return new;
end;
$$;
revoke execute on function private.sync_member_email() from public, anon, authenticated;
create trigger on_auth_user_email_sync_member after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function private.sync_member_email();

-- Backfill: rows that drifted before the trigger existed. A target address that another row holds (or that two
-- drifted rows would share) is left alone and recorded as a conflict, as the trigger does.
with drift as (
  select m.id, m.email as from_email, lower(u.email) as to_email
    from public.platform_members m join auth.users u on u.id = m.user_id
   where u.email is not null and m.email <> lower(u.email)
), marked as (
  select d.*, (exists (select 1 from public.platform_members o where o.email = d.to_email and o.id <> d.id)
               or count(*) over (partition by d.to_email) > 1) as conflict
    from drift d
), synced as (
  update public.platform_members m set email = k.to_email from marked k where m.id = k.id and not k.conflict returning m.id
)
insert into public.audit_events (event_type, metadata)
select 'access_member_email_changed',
       jsonb_build_object('member_id', k.id, 'from', k.from_email, 'to', k.to_email)
         || case when k.conflict then '{"conflict": true}'::jsonb else '{}'::jsonb end
  from marked k
 where k.conflict or k.id in (select id from synced);

-- R-W6-7: a deactivated member is told so ({role: null, status: 'deactivated'}) instead of getting nothing, so the
-- sign-in page can say why. From Task 1's body: the Owner keeps the literal 15 keys behind the same ungated check.
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
-- ---- end S1.5 Task 9 ----

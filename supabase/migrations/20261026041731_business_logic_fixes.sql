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
-- S1.5 Task 2: staff 2FA gate on Edge Functions, staff password length, owner email conflict (R-W1-1, R-W1-7, R-W1-8)
-- =============================================================================

-- R-W1-1: the Edge Functions now check the caller with caller_mfa_satisfied() and the gated helpers, through the
-- caller's own token (supabase/functions/_shared/gate.ts). service_user_can stays for rollback only.
comment on function public.service_user_can(uuid, text) is
  'not 2FA-aware; do not use for caller checks. Kept only so an earlier release can roll back to it (S1.5 R-W1-1).';

-- R-W1-8: an email with any platform-team row (invited, active or deactivated) can't be linked as a business owner.
-- The team row is compared with the lower-cased account email; removing the member (R-W6-1) clears the way.
create or replace function public.service_link_owner(p_business_id uuid, p_user_id uuid, p_actor uuid, p_application_id uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
begin
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'business_not_found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from auth.users u join public.platform_members m on m.email = lower(u.email::text)
     where u.id = p_user_id
  ) then
    raise exception 'email_is_admin' using errcode = '23514';
  end if;
  select user_id into v_existing from public.business_members where business_id = p_business_id for update;
  if v_existing is not null then
    if v_existing = p_user_id then
      return 'already_linked';
    end if;
    raise exception 'business_has_owner' using errcode = '23505';
  end if;
  insert into public.business_members (business_id, user_id, invited_at) values (p_business_id, p_user_id, now());
  insert into public.audit_events (event_type, actor_id, application_id, business_id, metadata)
  values ('owner_provisioned', p_actor, p_application_id, p_business_id, '{}'::jsonb);
  return 'linked';
end;
$$;
revoke execute on function public.service_link_owner(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.service_link_owner(uuid, uuid, uuid, uuid) to service_role;
-- ---- end S1.5 Task 2 ----

-- =============================================================================
-- S1.5 Task 10: invitation note, exact access history, 2FA reset only when set (R-W6-4, R-W6-5, R-W6-6, R-W6-9)
-- =============================================================================

-- R-W6-5: the inviter's note is stored on the invite (at most 500 characters), so a resend can reuse it.
alter table private.platform_invites add column note text;
alter table private.platform_invites add constraint platform_invites_note_check check (char_length(note) <= 500);

-- R-W6-5: service_create_member_invite gains p_note (default null, so a four-argument call keeps working). The body is
-- the one from 20261025070915_platform_team_roles plus the note.
drop function public.service_create_member_invite(uuid, text, timestamptz, uuid);
create function public.service_create_member_invite(p_member uuid, p_token_hash text, p_expires_at timestamptz, p_actor uuid, p_note text default null)
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
  insert into private.platform_invites (member_id, token_hash, expires_at, created_by, note)
  values (p_member, p_token_hash, p_expires_at, p_actor, nullif(btrim(p_note), '')) returning id into v_id;
  return jsonb_build_object('ok', true, 'inviteId', v_id);
end;
$$;
revoke execute on function public.service_create_member_invite(uuid, text, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.service_create_member_invite(uuid, text, timestamptz, uuid, text) to service_role;

-- R-W6-5: the note of the member's newest invite (null when it had none), for invite-member's resend.
create function public.service_latest_invite_note(p_member uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select i.note from private.platform_invites i where i.member_id = p_member order by i.created_at desc, i.id desc limit 1;
$$;
revoke execute on function public.service_latest_invite_note(uuid) from public, anon, authenticated;
grant execute on function public.service_latest_invite_note(uuid) to service_role;

-- R-W6-4: service_accept_invite already writes {member_id} on access_invite_expired_attempt
-- (20261025070915_platform_team_roles), so a member's Access history finds it; no change is needed here.

-- R-W6-6: someone has 2FA to reset when they have a verified factor or unused recovery codes.
create function private.has_2fa(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and (
    exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.status = 'verified')
    or exists (select 1 from private.recovery_codes r where r.user_id = p_user and r.used_at is null));
$$;
revoke execute on function private.has_2fa(uuid) from public, anon, authenticated, service_role;

-- R-W6-6: admin_list_members and admin_get_member gain has2fa (the bodies from 20261025070915_platform_team_roles).
create or replace function public.admin_list_members()
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
               'deactivatedAt', null, 'lastSignInAt', u.last_sign_in_at, 'invite', null,
               'has2fa', private.has_2fa(a.user_id)) as x
        from public.platform_admins a join auth.users u on u.id = a.user_id
      union all
      select private.member_json(m) || jsonb_build_object('has2fa', private.has_2fa(m.user_id)) from public.platform_members m) s), '[]'::jsonb));
end;
$$;

create or replace function public.admin_get_member(p_member uuid)
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
  return jsonb_build_object('member', private.member_json(v_member) || jsonb_build_object('has2fa', private.has_2fa(v_member.user_id)));
end;
$$;
-- ---- end S1.5 Task 10 ----

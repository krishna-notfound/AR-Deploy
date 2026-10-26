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
-- S1.5 Task 10 rollback: invitation note, exact access history, 2FA reset only when set (R-W6-4, R-W6-5, R-W6-6, R-W6-9)
-- =============================================================================

-- R-W6-6: admin_list_members and admin_get_member as in 20261025070915_platform_team_roles (no has2fa).
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
               'deactivatedAt', null, 'lastSignInAt', u.last_sign_in_at, 'invite', null) as x
        from public.platform_admins a join auth.users u on u.id = a.user_id
      union all
      select private.member_json(m) from public.platform_members m) s), '[]'::jsonb));
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
  return jsonb_build_object('member', private.member_json(v_member));
end;
$$;

drop function private.has_2fa(uuid);

-- R-W6-5: the four-argument service_create_member_invite as in 20261025070915_platform_team_roles. Dropping the note
-- column deletes the stored invitation notes (they are not audit or email rows).
drop function public.service_latest_invite_note(uuid);
drop function public.service_create_member_invite(uuid, text, timestamptz, uuid, text);
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
revoke execute on function public.service_create_member_invite(uuid, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.service_create_member_invite(uuid, text, timestamptz, uuid) to service_role;
alter table private.platform_invites drop column note;
-- ---- end S1.5 Task 10 rollback ----

-- =============================================================================
-- S1.5 Task 2 rollback: staff 2FA gate on Edge Functions, staff password length, owner email conflict (R-W1-1, R-W1-7, R-W1-8)
-- =============================================================================

-- R-W1-1: service_user_can had no comment before S1.5.
comment on function public.service_user_can(uuid, text) is null;

-- R-W1-8: service_link_owner as in 20261020091428_applications_and_owner_access (no team-email check).
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
-- ---- end S1.5 Task 2 rollback ----

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

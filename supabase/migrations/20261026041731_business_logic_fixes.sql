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

-- =============================================================================
-- S1.5 Task 12: email status integrity (R-W7-3, R-W7-4, R-W7-5)
-- =============================================================================

-- R-W7-4: a provider event whose email_log row does not exist yet is kept with applied = false and applied when
-- the row's provider_message_id arrives. Rows stored before this release were applied (or had nothing to apply).
-- error carries the reason an event brings (a suppressed address is a bounce with error 'suppressed').
alter table private.email_provider_events
  add column applied boolean not null default true,
  add column error   text check (char_length(error) <= 200);

-- The log status a Resend event type stands for; null for events that carry no delivery evidence
-- (opened, clicked, scheduled, unknown). email.suppressed is a bounce.
create function private.email_event_status(p_event_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_event_type
    when 'email.sent' then 'sent'
    when 'email.delivered' then 'delivered'
    when 'email.delivery_delayed' then 'delayed'
    when 'email.bounced' then 'bounced'
    when 'email.suppressed' then 'bounced'
    when 'email.complained' then 'complained'
    when 'email.failed' then 'failed'
  end;
$$;
revoke execute on function private.email_event_status(text) from public, anon, authenticated;

-- The only place an email_log status changes from provider evidence. A status moves only to the same or a higher
-- rank (blocked 0, failed 1, accepted 1, sent 2, delayed 3, delivered 4, bounced 5, complained 5) and only when it
-- actually changes, so a duplicate or late event writes nothing. Returns true when it wrote.
-- R-W7-3: a team_invitation row (workflow team_invite:<member>) that ends bounced, complained or failed moves the
-- member's newest sent invite, created no later than the log row, to email_failed.
create function private.apply_email_status(p_message_id text, p_status text, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rank constant jsonb := '{"blocked":0,"failed":1,"accepted":1,"sent":2,"delayed":3,"delivered":4,"bounced":5,"complained":5}';
  v_log  public.email_log;
begin
  if p_message_id is null or p_status is null or not (v_rank ? p_status) then
    return false;
  end if;
  update public.email_log
     set status = p_status,
         updated_at = now(),
         error = coalesce(left(p_error, 500), error)
   where provider_message_id = p_message_id
     and status <> p_status
     and (v_rank ->> p_status)::int >= (v_rank ->> status)::int
  returning * into v_log;
  if not found then
    return false;
  end if;
  if p_status in ('bounced', 'complained', 'failed')
     and v_log.kind = 'team_invitation'
     and v_log.workflow ~ '^team_invite:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    update private.platform_invites
       set status = 'email_failed',
           last_email_result = left(p_status || coalesce(': ' || p_error, ''), 220)
     where id = (select i.id from private.platform_invites i
                  where i.member_id = substr(v_log.workflow, 13)::uuid
                    and i.status = 'sent'
                    and i.created_at <= v_log.created_at
                  order by i.created_at desc, i.id
                  limit 1);
  end if;
  return true;
end;
$$;
revoke execute on function private.apply_email_status(text, text, text) from public, anon, authenticated;

-- Records one Resend webhook event exactly once. The status moves by the rank rule; an event for a message that has
-- no log row yet is stored with applied = false. p_error is the reason the event brings (e.g. 'suppressed').
-- The advisory lock serializes this with the log row's insert, so a pending event is never missed.
drop function public.service_record_email_event(text, text, text);
create function public.service_record_email_event(p_svix_id text, p_provider_message_id text, p_event_type text, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new     text := private.email_event_status(p_event_type);
  v_error   text := case when p_event_type = 'email.suppressed' then 'suppressed' else left(p_error, 200) end;
  v_applied boolean := true;
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_provider_message_id, ''), 0));
  if v_new is not null then
    v_applied := exists (select 1 from public.email_log where provider_message_id = p_provider_message_id);
  end if;
  insert into private.email_provider_events (svix_id, received_at, provider_message_id, event_type, applied, error)
  values (p_svix_id, clock_timestamp(), p_provider_message_id, p_event_type, v_applied, v_error)
  on conflict (svix_id) do nothing;
  if not found then
    return false;
  end if;
  if v_new is not null and v_applied then
    perform private.apply_email_status(p_provider_message_id, v_new, v_error);
  end if;
  return true;
end;
$$;
revoke execute on function public.service_record_email_event(text, text, text, text) from public, anon, authenticated;
grant execute on function public.service_record_email_event(text, text, text, text) to service_role;

-- R-W7-5: the status check (send-test-email) writes through the same rank rule. opened, clicked, scheduled and
-- unknown statuses write nothing. Returns true when it wrote.
create function public.service_apply_provider_status(p_message_id text, p_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_message_id, ''), 0));
  return private.apply_email_status(p_message_id, p_status, null);
end;
$$;
revoke execute on function public.service_apply_provider_status(text, text) from public, anon, authenticated;
grant execute on function public.service_apply_provider_status(text, text) to service_role;

-- R-W7-4: when a log row gets its provider message id, the events that arrived first are applied, oldest first,
-- each exactly once (applied = true afterwards).
create function private.apply_pending_email_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event record;
begin
  if new.provider_message_id is null then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.provider_message_id, 0));
  for v_event in
    select svix_id, event_type, error from private.email_provider_events
     where provider_message_id = new.provider_message_id and not applied
     order by received_at, svix_id
       for update
  loop
    perform private.apply_email_status(new.provider_message_id, private.email_event_status(v_event.event_type), v_event.error);
    update private.email_provider_events set applied = true where svix_id = v_event.svix_id;
  end loop;
  return null;
end;
$$;
revoke execute on function private.apply_pending_email_events() from public, anon, authenticated;
create trigger email_log_apply_pending_events
  after insert or update of provider_message_id on public.email_log
  for each row execute function private.apply_pending_email_events();
-- ---- end S1.5 Task 12 ----

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

-- =============================================================================
-- S1.5 Task 18: application submission: rate limit first, daily hash (R-W2-10, R-W2-11)
-- =============================================================================

-- R-W2-10: every submission attempt that passes the limit is recorded here, whatever its outcome (stored, 409
-- duplicate), so a probe that stores nothing is still limited. submitter_hash is the salted daily (UTC) hash of the
-- submitter's IP computed by submit-application; raw IPs are never stored. Rows older than 2 hours are deleted by
-- the next call of service_application_attempt.
create table private.application_attempts (
  id             bigint generated always as identity primary key,
  submitter_hash text        not null,
  created_at     timestamptz not null default now()
);
create index application_attempts_hash_created_idx on private.application_attempts (submitter_hash, created_at);
create index application_attempts_created_idx on private.application_attempts (created_at);
alter table private.application_attempts enable row level security;
revoke all on private.application_attempts from public, anon, authenticated;
grant select, insert, delete on private.application_attempts to service_role;

-- true when the attempt is allowed, and then it is recorded under p_hashes[1] (today's hash). The attempts of the
-- last hour under any of p_hashes count together (today's and, just after midnight UTC, yesterday's), so the hourly
-- window holds across midnight. A refused attempt is not recorded. The advisory lock serializes concurrent calls
-- for the same submitter, so two calls at p_max - 1 let exactly one through.
create function public.service_application_attempt(p_hashes text[], p_max int default 5)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_hashes is null or cardinality(p_hashes) = 0 or p_hashes[1] is null or p_max is null then
    raise exception 'invalid_attempt' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('application_attempt:' || p_hashes[1]));

  delete from private.application_attempts where created_at < now() - interval '2 hours';

  select count(*) into v_count
    from private.application_attempts
   where submitter_hash = any (p_hashes)
     and created_at > now() - interval '1 hour';
  if v_count >= p_max then
    return false;
  end if;

  insert into private.application_attempts (submitter_hash) values (p_hashes[1]);
  return true;
end;
$$;
revoke execute on function public.service_application_attempt(text[], int) from public, anon, authenticated;
grant execute on function public.service_application_attempt(text[], int) to service_role;
-- ---- end S1.5 Task 18 ----

-- =============================================================================
-- S1.5 Task 7: analytics data: embed views, deleted products, exact counts, local days (R-W5-2, R-W5-3, R-W5-4, R-W5-6)
-- =============================================================================

-- R-W5-3: an embed load is its own event, so the product page and the embed each count once.
alter table public.product_analytics
  drop constraint product_analytics_event_type_check,
  add constraint product_analytics_event_type_check
    check (event_type in ('view', 'embed_view', 'ar_activation', 'model_interaction'));

-- R-W5-4: a product's history outlives the product (product_id becomes null and the row stays in the business
-- totals as "Deleted product"); deleting the business still deletes every analytics row it owns.
alter table public.product_analytics alter column product_id drop not null;
alter table public.product_analytics
  drop constraint product_analytics_product_id_business_id_fkey,
  add constraint product_analytics_product_id_business_id_fkey
    foreign key (product_id, business_id) references public.products (id, business_id) on delete set null (product_id),
  add constraint product_analytics_business_id_fkey
    foreign key (business_id) references public.businesses (id) on delete cascade;

-- R-W5-3: the same view with embed_views appended as its last column (create or replace keeps the grants).
create or replace view public.product_analytics_daily
with (security_invoker = true) as
select
  business_id,
  product_id,
  (created_at at time zone 'utc')::date as day,
  count(*) filter (where event_type = 'view') as views,
  count(*) filter (where event_type = 'ar_activation') as ar_activations,
  count(*) filter (where event_type = 'model_interaction') as model_interactions,
  count(*) filter (where event_type = 'embed_view') as embed_views
from public.product_analytics
group by business_id, product_id, (created_at at time zone 'utc')::date;

-- R-W5-3: same body as 20261024065538 (OWN-04) plus embed_view, which needs no 3D model.
create or replace function public.record_event_limited(
  p_visitor_key text,
  p_product_id  uuid,
  p_business_id uuid,
  p_event_type  text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit  constant integer := 30; -- events per visitor key per minute
  v_window timestamptz := date_trunc('minute', now());
  v_hits   integer;
begin
  if p_visitor_key is null or p_visitor_key !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;

  insert into private.analytics_hits as h (visitor_key, window_start)
  values (p_visitor_key, v_window)
  on conflict (visitor_key, window_start) do update set hits = h.hits + 1
  returning h.hits into v_hits;

  -- Opportunistic cleanup keeps the table to roughly the last hour.
  if random() < 0.02 then
    delete from private.analytics_hits where window_start < now() - interval '1 hour';
  end if;

  if v_hits > v_limit then
    return 'rate_limited';
  end if;

  if p_event_type is null or p_event_type not in ('view', 'embed_view', 'ar_activation', 'model_interaction')
     or not exists (
       select 1 from public.products p
       join public.businesses b on b.id = p.business_id
       where p.id = p_product_id
         and p.business_id = p_business_id
         and p.status = 'published'
         and b.status = 'active'
     ) then
    return 'invalid';
  end if;

  -- The viewer and AR button only exist when the product (or one of its variants) has a model.
  if p_event_type in ('ar_activation', 'model_interaction')
     and not exists (select 1 from public.product_models m where m.product_id = p_product_id)
     and not exists (select 1 from public.product_variant_models vm where vm.product_id = p_product_id) then
    return 'invalid';
  end if;

  insert into public.product_analytics (business_id, product_id, event_type)
  values (p_business_id, p_product_id, p_event_type);
  return 'recorded';
end;
$$;
revoke execute on function public.record_event_limited(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_event_limited(text, uuid, uuid, text) to service_role;

-- R-W5-6: exact product counts per business in one row each (the API caps a plain products read at 1000 rows).
-- security_invoker: a caller counts only the products RLS lets them read.
create view public.business_product_counts
with (security_invoker = true) as
select
  business_id,
  count(*)::integer as total,
  (count(*) filter (where status = 'published'))::integer as published,
  (count(*) filter (where status = 'draft'))::integer as drafts
from public.products
group by business_id;
revoke all on public.business_product_counts from public, anon, authenticated;
grant select on public.business_product_counts to authenticated, service_role;

-- R-W5-2: daily totals by the caller's local day. Security invoker, so the product_analytics RLS policies decide
-- which rows count. The window is the last p_days local dates, today included; its start is local midnight, so a
-- day that is 23 or 25 hours long (DST) is bucketed whole.
create function public.analytics_daily(p_tz text, p_days integer default 30, p_business uuid default null)
returns table (business_id uuid, product_id uuid, day date, views bigint, embed_views bigint, ar_activations bigint,
               model_interactions bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_today date;
begin
  if p_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_tz) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  if p_days is null or p_days < 1 or p_days > 366 then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  v_today := (now() at time zone p_tz)::date;
  return query
    select a.business_id, a.product_id, (a.created_at at time zone p_tz)::date,
           count(*) filter (where a.event_type = 'view'),
           count(*) filter (where a.event_type = 'embed_view'),
           count(*) filter (where a.event_type = 'ar_activation'),
           count(*) filter (where a.event_type = 'model_interaction')
      from public.product_analytics a
     where a.created_at >= ((v_today - (p_days - 1))::timestamp at time zone p_tz)
       and a.created_at < ((v_today + 1)::timestamp at time zone p_tz)
       and (p_business is null or a.business_id = p_business)
     group by a.business_id, a.product_id, (a.created_at at time zone p_tz)::date
     order by 3, 1, 2;
end;
$$;
revoke execute on function public.analytics_daily(text, integer, uuid) from public, anon;
grant execute on function public.analytics_daily(text, integer, uuid) to authenticated, service_role;
-- ---- end S1.5 Task 7 ----

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

-- =============================================================================
-- S1.5 Task 16: application review: possible duplicates, reopening after a deleted business (R-W2-2, R-W2-9)
-- =============================================================================

-- R-W2-2: an approved application remembers when its business was deleted. No backfill: the live L1 application has
-- no known date, so the dashboard says the business was deleted without one.
alter table public.business_applications add column business_deleted_at timestamptz;

create function private.mark_application_business_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Runs before the delete; the business_id foreign key (on delete set null) then clears the link.
  update public.business_applications set business_deleted_at = now() where business_id = old.id;
  return old;
end;
$$;
revoke execute on function private.mark_application_business_deleted() from public, anon, authenticated;
create trigger businesses_mark_application_deleted before delete on public.businesses
  for each row execute function private.mark_application_business_deleted();

-- R-W2-2: the action reopen (approved → under_review) for an application whose business was deleted. Body from
-- 20261020091428_applications_and_owner_access with the check that 20261025070915 widened through widen_admin_check,
-- now written out; the other transitions are unchanged.
create or replace function public.admin_review_application(p_application_id uuid, p_action text, p_reason text default null)
returns public.business_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app    public.business_applications;
  v_new    text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_biz    uuid;
  v_old    text;
begin
  if not (public.is_platform_admin()
          or public.platform_can(case p_action when 'reject' then 'applications.reject' else 'applications.approve' end)) then
    raise exception 'platform_admin_only' using errcode = '42501';
  end if;
  select * into v_app from public.business_applications where id = p_application_id for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;

  -- Reopen: only an approved application whose business no longer exists. Never a no-op repeat.
  if p_action = 'reopen' then
    if v_app.status <> 'approved' or v_app.business_id is not null then
      raise exception 'reopen_not_allowed' using errcode = '22023';
    end if;
    update public.business_applications
       set status = 'under_review',
           reviewed_by = auth.uid(),
           reviewed_at = now()
     where id = v_app.id
    returning * into v_app;
    insert into public.audit_events (event_type, actor_id, application_id, business_id, from_status, to_status, metadata)
    values ('application_status_changed', auth.uid(), v_app.id, null, 'approved', 'under_review',
            jsonb_build_object('action', 'reopen'));
    return v_app;
  end if;

  v_new := case p_action when 'start_review' then 'under_review' when 'approve' then 'approved' when 'reject' then 'rejected' end;
  if v_new is null then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  if v_app.status = v_new then
    return v_app;
  end if;
  v_old := v_app.status;
  if not ((v_app.status = 'submitted' and v_new in ('under_review', 'approved', 'rejected'))
       or (v_app.status = 'under_review' and v_new in ('approved', 'rejected'))
       or (v_app.status = 'rejected' and v_new = 'under_review')) then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  if v_new = 'rejected' and v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  if v_new = 'approved' then
    -- A draft business: not public until the catalogue is activated. Contact fields stay empty on purpose:
    -- the applicant's private email/phone must not become public catalogue contacts.
    insert into public.businesses (name, slug, description, status)
    values (btrim(v_app.business_name), private.unique_business_slug(v_app.business_name),
            left(coalesce(v_app.answers ->> 'description', ''), 5000), 'draft')
    returning id into v_biz;
    insert into public.audit_events (event_type, actor_id, application_id, business_id, metadata)
    values ('business_created', auth.uid(), v_app.id, v_biz, jsonb_build_object('source', 'application'));
  end if;

  update public.business_applications
     set status = v_new,
         decision_reason = case when v_new in ('approved', 'rejected') then v_reason else decision_reason end,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         business_id = coalesce(v_biz, business_id)
   where id = v_app.id
  returning * into v_app;

  insert into public.audit_events (event_type, actor_id, application_id, business_id, from_status, to_status, metadata)
  values ('application_status_changed', auth.uid(), v_app.id, v_app.business_id, v_old, v_new,
          case when v_reason is not null then jsonb_build_object('reason', v_reason) else '{}'::jsonb end);
  return v_app;
end;
$$;
revoke execute on function public.admin_review_application(uuid, text, text) from public, anon;
grant execute on function public.admin_review_application(uuid, text, text) to authenticated;

-- R-W2-9: the business-name key for possible duplicates. Lower-cased and trimmed, Portuguese accents folded with
-- translate() (no unaccent extension), one trailing legal-form word dropped, then only a-z and 0-9 kept. An empty
-- key matches nothing. src/services/applicationRules.ts (normalizeBusinessName) mirrors it for the demo.
create function private.normalize_business_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(
             lower(translate(btrim(coalesce(p_name, '')),
                             'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                             'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
             '(^|[^a-z0-9])(lda|limitada|unipessoal|sa|ltd|limited|llc|inc)[^a-z0-9]*$', '\1'),
           '[^a-z0-9]', '', 'g');
$$;
revoke execute on function private.normalize_business_name(text) from public, anon, authenticated;

-- R-W2-9: possible duplicates of one application, for the reviewer. Only a warning: it never blocks a review action.
-- Other open or approved applications with the same email or business-name key, and businesses (never the one this
-- application created) with the same key or whose owner signs in with the applicant's email. The owner's email itself
-- is never returned. At most 10 of each, newest first.
create function public.admin_application_duplicates(p_application_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_app   public.business_applications;
  v_email text;
  v_name  text;
begin
  if not (public.is_platform_admin() or public.platform_can('applications.view')) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select * into v_app from public.business_applications where id = p_application_id;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  v_email := lower(v_app.applicant_email);
  v_name := nullif(private.normalize_business_name(v_app.business_name), '');

  return jsonb_build_object(
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'reference', m.reference, 'business_name', m.business_name,
                                          'status', m.status, 'created_at', m.created_at,
                                          'match', case when m.by_email and m.by_name then 'both' when m.by_email then 'email' else 'name' end)
                       order by m.created_at desc, m.id)
        from (
          select a.id, a.reference, a.business_name, a.status, a.created_at, c.by_email, c.by_name
            from public.business_applications a
            cross join lateral (
              select lower(a.applicant_email) = v_email as by_email,
                     coalesce(private.normalize_business_name(a.business_name) = v_name, false) as by_name
            ) c
           where a.id <> v_app.id
             and a.status in ('submitted', 'under_review', 'approved')
             and (c.by_email or c.by_name)
           order by a.created_at desc, a.id
           limit 10
        ) m), '[]'::jsonb),
    'businesses', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'status', m.status,
                                          'match', case when m.by_owner and m.by_name then 'both' when m.by_owner then 'owner_email' else 'name' end)
                       order by m.created_at desc, m.id)
        from (
          select b.id, b.name, b.status, b.created_at, c.by_owner, c.by_name
            from public.businesses b
            cross join lateral (
              select exists (select 1 from public.business_members bm join auth.users u on u.id = bm.user_id
                              where bm.business_id = b.id and bm.role = 'owner' and lower(u.email::text) = v_email) as by_owner,
                     coalesce(private.normalize_business_name(b.name) = v_name, false) as by_name
            ) c
           where b.id is distinct from v_app.business_id
             and (c.by_owner or c.by_name)
           order by b.created_at desc, b.id
           limit 10
        ) m), '[]'::jsonb));
end;
$$;
revoke execute on function public.admin_application_duplicates(uuid) from public, anon;
grant execute on function public.admin_application_duplicates(uuid) to authenticated;
-- ---- end S1.5 Task 16 ----

-- =============================================================================
-- S1.5 Task 17: owner invitations and onboarding: rolling limit with reservations, clean concurrent provisioning, acceptance on any sign-in, owner state on every business (R-W2-3, R-W2-4, R-W2-5, R-W2-7)
-- =============================================================================

-- R-W2-4: every owner invitation (provision or resend) reserves an attempt before provision-owner mints a code. The
-- reservation is the cooldown and the rolling limit; its outcome is stored after the send. Rows go with the business.
create table private.owner_invite_attempts (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  recipient   text not null check (recipient = lower(recipient) and char_length(recipient) between 3 and 320),
  attempt     integer not null check (attempt between 1 and 100000),
  actor       uuid references auth.users (id) on delete set null,
  outcome     text check (outcome in ('accepted', 'sent', 'failed', 'blocked')),
  created_at  timestamptz not null default now()
);
create index owner_invite_attempts_recipient_idx on private.owner_invite_attempts (business_id, recipient, created_at desc);
alter table private.owner_invite_attempts enable row level security;
revoke all on private.owner_invite_attempts from public, anon, authenticated;
grant select, insert, update on private.owner_invite_attempts to service_role;

-- The attempt number is the Idempotency-Key suffix and keeps growing per business; 100 is no longer a ceiling.
alter table public.email_log drop constraint email_log_attempt_check;
alter table public.email_log add constraint email_log_attempt_check check (attempt between 1 and 100000);

-- {reservation_id, attempt}, or {error:'cooldown'|'too_many_invitations', retry_at}. Under a per-business advisory
-- lock, so two parallel requests can't both pass the checks (one gets the reservation, the other the cooldown).
--   cooldown: any non-blocked attempt for the business (any recipient) is under 60 s old. Every non-blocked outcome
--     (pending, accepted or failed) starts the cooldown;
--   too_many_invitations: 10 non-blocked attempts for the business and this recipient in the last 24 h;
--     retry_at is when the oldest of them leaves the window.
-- Blocked attempts (nothing was sent) count for neither. Removing and re-inviting the owner doesn't reset anything.
create function public.service_reserve_owner_invite(p_business uuid, p_recipient text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient text := lower(btrim(coalesce(p_recipient, '')));
  v_last      timestamptz;
  v_count     integer;
  v_oldest    timestamptz;
  v_attempt   integer;
  v_id        uuid;
begin
  perform pg_advisory_xact_lock(hashtext('owner_invite:' || p_business::text));

  select max(created_at) into v_last
    from private.owner_invite_attempts
   where business_id = p_business and outcome is distinct from 'blocked';
  if v_last > now() - interval '60 seconds' then
    return jsonb_build_object('error', 'cooldown', 'retry_at', v_last + interval '60 seconds');
  end if;

  select count(*) into v_count
    from private.owner_invite_attempts
   where business_id = p_business and recipient = v_recipient
     and outcome is distinct from 'blocked' and created_at > now() - interval '24 hours';
  if v_count >= 10 then
    -- With exactly 10 this is the oldest counted attempt; the offset keeps it right if there were ever more.
    select created_at into v_oldest
      from private.owner_invite_attempts
     where business_id = p_business and recipient = v_recipient
       and outcome is distinct from 'blocked' and created_at > now() - interval '24 hours'
     order by created_at
    offset v_count - 10
     limit 1;
    return jsonb_build_object('error', 'too_many_invitations', 'retry_at', v_oldest + interval '24 hours');
  end if;

  -- Monotonic per business, continuing the invitations logged before this table existed.
  v_attempt := 1 + greatest(
    coalesce((select max(attempt) from private.owner_invite_attempts where business_id = p_business), 0),
    coalesce((select max(attempt) from public.email_log where workflow = 'invite:' || p_business::text), 0));
  insert into private.owner_invite_attempts (business_id, recipient, attempt, actor)
  values (p_business, v_recipient, v_attempt, p_actor)
  returning id into v_id;
  return jsonb_build_object('reservation_id', v_id, 'attempt', v_attempt);
end;
$$;
revoke execute on function public.service_reserve_owner_invite(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.service_reserve_owner_invite(uuid, text, uuid) to service_role;

-- Stores how the reserved attempt ended: the email status, or 'blocked' when nothing was sent (no code, link refused,
-- email not configured).
create function public.service_finish_owner_invite(p_reservation uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome is null or p_outcome not in ('accepted', 'sent', 'failed', 'blocked') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;
  update private.owner_invite_attempts set outcome = p_outcome where id = p_reservation;
end;
$$;
revoke execute on function public.service_finish_owner_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.service_finish_owner_invite(uuid, text) to service_role;

-- R-W2-7: the Task 2 body (team-email check kept), with the business row locked before the membership check, so two
-- provisions for one business queue here; a unique violation that still slips through reads as business_has_owner.
create or replace function public.service_link_owner(p_business_id uuid, p_user_id uuid, p_actor uuid, p_application_id uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_existing uuid;
begin
  select id into v_business from public.businesses
   where id = p_business_id
     for update;
  if v_business is null then
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
  begin
    insert into public.business_members (business_id, user_id, invited_at) values (p_business_id, p_user_id, now());
  exception
    when unique_violation then
      raise exception 'business_has_owner' using errcode = '23505';
  end;
  insert into public.audit_events (event_type, actor_id, application_id, business_id, metadata)
  values ('owner_provisioned', p_actor, p_application_id, p_business_id, '{}'::jsonb);
  return 'linked';
end;
$$;
revoke execute on function public.service_link_owner(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.service_link_owner(uuid, uuid, uuid, uuid) to service_role;

-- R-W2-3: any successful sign-in accepts the caller's pending owner memberships (an owner who never finished
-- /accept-invite), one owner_onboarding_completed row each with {via:'sign_in'}. This runs before the 60-second rate
-- limit and only touches pending rows, so it is idempotent. The rest is the 20261025163627 body.
create or replace function public.record_sign_in(p_user_agent text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ua  text := nullif(left(btrim(regexp_replace(coalesce(p_user_agent, ''), '[[:cntrl:]]', '', 'g')), 200), '');
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  -- Serialise concurrent calls for the same user so two tabs cannot both record.
  perform pg_advisory_xact_lock(hashtextextended('record_sign_in:' || v_uid::text, 0));
  with accepted as (
    update public.business_members
       set accepted_at = now()
     where user_id = v_uid and accepted_at is null
    returning business_id
  )
  insert into public.audit_events (event_type, actor_id, business_id, metadata)
  select 'owner_onboarding_completed', v_uid, business_id, jsonb_build_object('via', 'sign_in') from accepted;
  if exists (select 1 from public.audit_events
             where actor_id = v_uid and event_type = 'account_signed_in' and created_at > now() - interval '60 seconds') then
    return 'rate_limited';
  end if;
  insert into public.audit_events (event_type, actor_id, metadata)
  values ('account_signed_in', v_uid, case when v_ua is null then '{}'::jsonb else jsonb_build_object('user_agent', v_ua) end);
  return 'recorded';
end;
$$;

-- R-W2-5: the owner state of every business, for the businesses list. last_invited_at is the newest reserved attempt,
-- else the newest invite email (owners invited before the attempts table). email_failed: the newest attempt ended
-- failed or blocked, or its email bounced or was a complaint; with no attempt, the newest invite email decides.
create function public.admin_list_owner_states()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.platform_can('businesses.view') then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'business_id', b.id,
             'state', case when m.user_id is null then 'needs_owner'
                           when m.accepted_at is null then 'invite_pending'
                           else 'owner_active' end,
             'last_invited_at', coalesce(a.created_at, l.created_at),
             'email_failed', case
                               -- A pending attempt (outcome null) has not failed.
                               when a.id is not null then coalesce(a.outcome in ('failed', 'blocked'), false) or coalesce(ae.status in ('bounced', 'complained'), false)
                               when l.status is not null then l.status in ('failed', 'blocked', 'bounced', 'complained')
                               else false
                             end)
           order by b.created_at, b.id)
      from public.businesses b
      left join public.business_members m on m.business_id = b.id
      left join lateral (
        select x.id, x.attempt, x.outcome, x.created_at
          from private.owner_invite_attempts x
         where x.business_id = b.id
         order by x.created_at desc, x.attempt desc
         limit 1) a on true
      left join lateral (
        select e.status
          from public.email_log e
         where e.workflow = 'invite:' || b.id::text and e.attempt = a.attempt
         order by e.created_at desc
         limit 1) ae on a.id is not null
      left join lateral (
        select e.status, e.created_at
          from public.email_log e
         where e.workflow = 'invite:' || b.id::text
         order by e.created_at desc
         limit 1) l on true
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_list_owner_states() from public, anon;
grant execute on function public.admin_list_owner_states() to authenticated;
-- ---- end S1.5 Task 17 ----

-- =============================================================================
-- S1.5 Task 8: dashboard numbers and activity: product audit events, catalogue activity and owner reads (R-W5-5, R-W7-2)
-- =============================================================================

-- R-W5-5: the Overviews' Recent activity reads audit events instead of guessing from timestamps. Every product
-- insert, publish, unpublish, address change and delete writes one row with the product's (English) name, so a
-- deleted product still reads by name. A product deleted by its business's delete (the cascade) writes nothing:
-- by then the business row is gone, and business_deleted already records it.
create function private.audit_product_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_row public.products;
begin
  if tg_op = 'INSERT' then
    v_type := 'product_created';
    v_row := new;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.businesses b where b.id = old.business_id) then
      return null;
    end if;
    v_type := 'product_deleted';
    v_row := old;
  else
    if new.status is distinct from old.status then
      v_type := case when new.status = 'published' then 'product_published' else 'product_unpublished' end;
      insert into public.audit_events (event_type, actor_id, business_id, from_status, to_status, metadata)
      values (v_type, auth.uid(), new.business_id, old.status, new.status,
              jsonb_build_object('product_id', new.id, 'name', left(coalesce(new.name ->> 'en', ''), 200)));
    end if;
    if new.slug is distinct from old.slug then
      insert into public.audit_events (event_type, actor_id, business_id, metadata)
      values ('product_slug_changed', auth.uid(), new.business_id,
              jsonb_build_object('product_id', new.id, 'name', left(coalesce(new.name ->> 'en', ''), 200),
                                 'from', old.slug, 'to', new.slug));
    end if;
    return null;
  end if;
  insert into public.audit_events (event_type, actor_id, business_id, metadata)
  values (v_type, auth.uid(), v_row.business_id,
          jsonb_build_object('product_id', v_row.id, 'name', left(coalesce(v_row.name ->> 'en', ''), 200)));
  return null;
end;
$$;
revoke all on function private.audit_product_change() from public, anon, authenticated;

create trigger products_audit
  after insert or update of status, slug or delete on public.products
  for each row execute function private.audit_product_change();

-- R-W5-5: staff read the catalogue activity their permissions cover, without records.view: product events need
-- products.view, business lifecycle events need businesses.view. Additive (ORed with the other read policies);
-- platform_can carries the staff 2FA gate.
create policy "Platform members read catalogue activity" on public.audit_events
  for select to authenticated
  using ((event_type like 'product\_%' and (select public.platform_can('products.view')))
         or (event_type in ('business_created', 'business_status_changed', 'business_deleted')
             and (select public.platform_can('businesses.view'))));

-- R-W7-2: a business owner reads what happened to their own business's catalogue, the platform team's changes
-- included. is_business_member carries the business 2FA gate.
create policy "Business owners read platform changes to their business" on public.audit_events
  for select to authenticated
  using (event_type in ('business_status_changed', 'business_slug_changed', 'product_created', 'product_published',
                        'product_unpublished', 'product_slug_changed', 'product_deleted', 'account_closure_voided')
         and business_id is not null
         and public.is_business_member(business_id));

-- ---- end S1.5 Task 8 ----

-- =============================================================================
-- S1.5 Task 11: history that survives deletion, owner notices, history gating (R-W7-1, R-W7-2, R-W7-8)
-- =============================================================================

-- R-W7-1: every audit row is stamped at insert with what it needs to stay readable after a delete. The business's
-- name (when the row names a business and does not carry the name already), and the actor's role as a label:
-- Owner (platform_admins), Admin or Team (platform_members), Business owner (business_members), otherwise User.
-- No email and no name of the actor is stored. The label is always computed from the actor's rows, so a caller
-- cannot supply its own. A row without an actor (the system) gets no label.
create function private.snapshot_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if new.business_id is not null and not (new.metadata ? 'business_name') then
    select b.name into v_name from public.businesses b where b.id = new.business_id;
    if v_name is not null then
      new.metadata := new.metadata || jsonb_build_object('business_name', v_name);
    end if;
  end if;
  if new.actor_id is not null then
    new.metadata := new.metadata || jsonb_build_object('actor_label', case
      when exists (select 1 from public.platform_admins a where a.user_id = new.actor_id) then 'Owner'
      when exists (select 1 from public.platform_members m where m.user_id = new.actor_id and m.role = 'admin') then 'Admin'
      when exists (select 1 from public.platform_members m where m.user_id = new.actor_id and m.role = 'team') then 'Team'
      when exists (select 1 from public.business_members bm where bm.user_id = new.actor_id) then 'Business owner'
      else 'User'
    end);
  end if;
  return new;
end;
$$;
revoke all on function private.snapshot_audit_event() from public, anon, authenticated;

create trigger audit_events_snapshot
  before insert on public.audit_events
  for each row execute function private.snapshot_audit_event();

-- R-W7-1: history keeps the business id after the business is deleted, so its rows still filter by it. actor_id keeps
-- its on delete set null (the label above says who it was).
alter table public.audit_events drop constraint audit_events_business_id_fkey;

-- R-W7-1: business_deleted now carries the business id and its name as business_name (the row is gone by the time
-- this AFTER trigger runs, so the snapshot cannot look it up). Body from 20261024065538_security_hardening; the
-- update branch is unchanged, and the delete row keeps metadata business_id and name for existing readers.
create or replace function private.audit_business_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.audit_events (event_type, actor_id, business_id, from_status, to_status)
      values ('business_status_changed', auth.uid(), new.id, old.status, new.status);
    end if;
    if new.slug is distinct from old.slug then
      insert into public.audit_events (event_type, actor_id, business_id, metadata)
      values ('business_slug_changed', auth.uid(), new.id, jsonb_build_object('from', old.slug, 'to', new.slug));
    end if;
  elsif tg_op = 'DELETE' then
    insert into public.audit_events (event_type, actor_id, business_id, metadata)
    values ('business_deleted', auth.uid(), old.id,
            jsonb_build_object('business_id', old.id, 'name', old.name, 'business_name', old.name));
  end if;
  return null;
end;
$$;
revoke all on function private.audit_business_change() from public, anon, authenticated;

-- R-W7-2: the owner-read policy "Business owners read platform changes to their business" is Task 8's; the owner
-- dashboard reads it. R-W7-8 is UI only.

-- ---- end S1.5 Task 11 ----

-- =============================================================================
-- S1.5 Task 13: account-security notices, blocked codes, closure attribution, staff self-closure (R-W6-3, R-W7-6, R-W7-7, R-W7-9)
-- =============================================================================

-- R-W7-9: account_closure_requested (and any account event about a business) stores business_id, so it filters by the
-- business and the snapshot trigger adds its name. Dropped and recreated with the extra argument (the default keeps
-- four-argument calls working); the grants of 20261025163627_account_settings are restated. Body otherwise unchanged.
drop function public.service_log_account_event(uuid, text, jsonb, text);
create function public.service_log_account_event(p_user uuid, p_event text, p_metadata jsonb, p_ip text, p_business_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if p_event is null or p_event not in (
       'account_signed_in', 'account_password_changed', 'account_email_change_requested', 'account_2fa_enabled',
       'account_2fa_disabled', 'account_recovery_used', 'account_recovery_regenerated', 'account_2fa_reset_by_owner',
       'account_closure_requested', 'account_closure_cancelled', 'account_closure_completed', 'account_closure_restored',
       'account_deleted', 'platform_security_policy_changed')
     or jsonb_typeof(v_meta) <> 'object' then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if nullif(btrim(coalesce(p_ip, '')), '') is not null then
    v_meta := v_meta || jsonb_build_object('ip', left(btrim(p_ip), 64));
  end if;
  -- audit_events allows 4096 bytes; answer instead of raising. 3600 leaves room for what the snapshot trigger adds.
  if pg_column_size(v_meta) > 3600 then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  insert into public.audit_events (event_type, actor_id, business_id, metadata)
  values (p_event, (select u.id from auth.users u where u.id = p_user), p_business_id, v_meta);
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.service_log_account_event(uuid, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.service_log_account_event(uuid, text, jsonb, text, uuid) to service_role;

-- R-W6-3: a staff self-closure writes access_member_closed (in the member's history, with the address hashed) while
-- the user still exists, so the actor label is computed; a retry after a failed user delete writes no second row.
-- R-W7-9: the business's move to inactive runs with the service role (auth.uid() is null), so app.actor_id names the
-- requester for audit_business_change. Body otherwise as in 20261025163627_account_settings.
create or replace function public.service_request_closure(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.platform_members;
  v_biz    public.businesses;
begin
  if p_user is null then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('closure:' || p_user::text, 0));
  if exists (select 1 from public.platform_admins where user_id = p_user) then
    return jsonb_build_object('error', 'owner_cannot_close');
  end if;
  if exists (select 1 from public.account_closure_requests where user_id = p_user) then
    return jsonb_build_object('error', 'already_requested');
  end if;

  select * into v_member from public.platform_members where user_id = p_user for update;
  if found then
    -- Idempotent, so a retry after a failed user deletion works.
    update public.platform_members set status = 'deactivated', deactivated_at = coalesce(deactivated_at, now())
     where id = v_member.id and status <> 'deactivated';
    update private.platform_invites set status = 'revoked', revoked_at = now()
     where member_id = v_member.id and status in ('pending', 'sent', 'email_failed');
    perform public.service_end_sessions(p_user);
    if not exists (select 1 from public.audit_events
                    where event_type = 'access_member_closed' and metadata->>'member_id' = v_member.id::text) then
      insert into public.audit_events (event_type, actor_id, metadata)
      values ('access_member_closed', (select u.id from auth.users u where u.id = p_user),
              jsonb_build_object('member_id', v_member.id,
                                 'email_sha256', encode(sha256(convert_to(lower(btrim(v_member.email)), 'UTF8')), 'hex'),
                                 'role', v_member.role::text, 'reason', 'self_closure'));
    end if;
    -- The role lets account-security name it in the Owners' team notice.
    return jsonb_build_object('ok', true, 'kind', 'staff', 'role', v_member.role::text);
  end if;

  select b.* into v_biz from public.businesses b
    join public.business_members m on m.business_id = b.id
   where m.user_id = p_user
   order by m.created_at, b.id
   limit 1
   for update of b;
  if not found then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  insert into public.account_closure_requests (user_id, business_id, previous_business_status)
  values (p_user, v_biz.id, v_biz.status);
  perform set_config('app.account_closure', 'on', true);
  perform set_config('app.actor_id', p_user::text, true);
  update public.businesses set status = 'inactive' where id = v_biz.id and status <> 'inactive';
  perform set_config('app.actor_id', '', true);
  return jsonb_build_object('ok', true, 'kind', 'business', 'business_id', v_biz.id);
end;
$$;
revoke execute on function public.service_request_closure(uuid) from public, anon, authenticated;
grant execute on function public.service_request_closure(uuid) to service_role;

-- R-W7-9: a change made with the service role on someone's behalf names them through app.actor_id (transaction-local,
-- set only by security definer functions such as service_request_closure). A signed-in caller always wins; an id that
-- is not a user records no actor. Body otherwise as in S1.5 Task 11.
create or replace function private.audit_business_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_on_behalf text := nullif(current_setting('app.actor_id', true), '');
begin
  if v_actor is null and v_on_behalf ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select u.id into v_actor from auth.users u where u.id = v_on_behalf::uuid;
  end if;
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.audit_events (event_type, actor_id, business_id, from_status, to_status)
      values ('business_status_changed', v_actor, new.id, old.status, new.status);
    end if;
    if new.slug is distinct from old.slug then
      insert into public.audit_events (event_type, actor_id, business_id, metadata)
      values ('business_slug_changed', v_actor, new.id, jsonb_build_object('from', old.slug, 'to', new.slug));
    end if;
  elsif tg_op = 'DELETE' then
    insert into public.audit_events (event_type, actor_id, business_id, metadata)
    values ('business_deleted', v_actor, old.id,
            jsonb_build_object('business_id', old.id, 'name', old.name, 'business_name', old.name));
  end if;
  return null;
end;
$$;
revoke all on function private.audit_business_change() from public, anon, authenticated;

-- ---- end S1.5 Task 13 ----

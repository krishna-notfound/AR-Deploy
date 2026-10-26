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

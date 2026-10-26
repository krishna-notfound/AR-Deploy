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
-- S1.5 Task 11 rollback: history that survives deletion, owner notices, history gating (R-W7-1, R-W7-2, R-W7-8)
-- =============================================================================

-- Rows keep their business_name and actor_label metadata. The FK comes back NOT VALID, so rows that point at deleted
-- businesses stay; new rows must name an existing business again.
drop trigger if exists audit_events_snapshot on public.audit_events;
drop function if exists private.snapshot_audit_event();
alter table public.audit_events add constraint audit_events_business_id_fkey
  foreign key (business_id) references public.businesses (id) on delete set null not valid;

-- private.audit_business_change as in 20261024065538_security_hardening (business_deleted without business_id).
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
    insert into public.audit_events (event_type, actor_id, metadata)
    values ('business_deleted', auth.uid(), jsonb_build_object('business_id', old.id, 'name', old.name));
  end if;
  return null;
end;
$$;
revoke all on function private.audit_business_change() from public;

-- ---- end S1.5 Task 11 rollback ----

-- =============================================================================
-- S1.5 Task 8 rollback: dashboard numbers and activity: product audit events, catalogue activity and owner reads (R-W5-5, R-W7-2)
-- =============================================================================

-- The product_* audit rows already written stay; nothing new is written once the trigger is gone.
drop policy if exists "Business owners read platform changes to their business" on public.audit_events;
drop policy if exists "Platform members read catalogue activity" on public.audit_events;
drop trigger if exists products_audit on public.products;
drop function if exists private.audit_product_change();

-- ---- end S1.5 Task 8 rollback ----

-- =============================================================================
-- S1.5 Task 17 rollback: owner invitations and onboarding: rolling limit with reservations, clean concurrent provisioning, acceptance on any sign-in, owner state on every business (R-W2-3, R-W2-4, R-W2-5, R-W2-7)
-- =============================================================================

drop function public.admin_list_owner_states();

-- R-W2-3: record_sign_in as in 20261025163627_account_settings (no membership acceptance).
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
  if exists (select 1 from public.audit_events
             where actor_id = v_uid and event_type = 'account_signed_in' and created_at > now() - interval '60 seconds') then
    return 'rate_limited';
  end if;
  insert into public.audit_events (event_type, actor_id, metadata)
  values ('account_signed_in', v_uid, case when v_ua is null then '{}'::jsonb else jsonb_build_object('user_agent', v_ua) end);
  return 'recorded';
end;
$$;

-- R-W2-7: service_link_owner as in the Task 2 section (team-email check, no business row lock).
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

-- R-W2-4: the earlier 1..100 attempt check, NOT VALID so email rows numbered above 100 are kept.
alter table public.email_log drop constraint email_log_attempt_check;
alter table public.email_log add constraint email_log_attempt_check check (attempt between 1 and 100) not valid;

drop function public.service_finish_owner_invite(uuid, text);
drop function public.service_reserve_owner_invite(uuid, text, uuid);
drop table private.owner_invite_attempts;
-- ---- end S1.5 Task 17 rollback ----

-- =============================================================================
-- S1.5 Task 16 rollback: application review: possible duplicates, reopening after a deleted business (R-W2-2, R-W2-9)
-- =============================================================================
-- DATA LOSS: the business deletion dates (business_applications.business_deleted_at) are dropped and cannot be
-- recovered. Applications reopened under S1.5 keep their status and audit rows.

-- admin_review_application as 20261025070915 left it (the 20261020091428 body with the widened check), without reopen.
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
  if not (public.is_platform_admin() or public.platform_can(case when p_action = 'reject' then 'applications.reject' else 'applications.approve' end)) then
    raise exception 'platform_admin_only' using errcode = '42501';
  end if;
  select * into v_app from public.business_applications where id = p_application_id for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
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

drop trigger businesses_mark_application_deleted on public.businesses;
drop function private.mark_application_business_deleted();
drop function public.admin_application_duplicates(uuid);
drop function private.normalize_business_name(text);
alter table public.business_applications drop column business_deleted_at;
-- ---- end S1.5 Task 16 rollback ----

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
-- S1.5 Task 7 rollback: analytics data: embed views, deleted products, exact counts, local days (R-W5-2, R-W5-3, R-W5-4, R-W5-6)
-- =============================================================================

drop function public.analytics_daily(text, integer, uuid);
drop view public.business_product_counts;

-- R-W5-3: record_event_limited as in 20261024065538 (no embed_view). create or replace keeps the grants.
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

  if p_event_type is null or p_event_type not in ('view', 'ar_activation', 'model_interaction')
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

-- R-W5-3: a view cannot drop a column through create or replace; recreate it as in 20261012200810 with its grants.
drop view public.product_analytics_daily;
create view public.product_analytics_daily
with (security_invoker = true) as
select
  business_id,
  product_id,
  (created_at at time zone 'utc')::date as day,
  count(*) filter (where event_type = 'view') as views,
  count(*) filter (where event_type = 'ar_activation') as ar_activations,
  count(*) filter (where event_type = 'model_interaction') as model_interactions
from public.product_analytics
group by business_id, product_id, (created_at at time zone 'utc')::date;
revoke all on public.product_analytics_daily from public, anon, authenticated;
grant select on public.product_analytics_daily to authenticated;
grant all on public.product_analytics_daily to service_role;

-- R-W5-4: back to the cascade FK. DATA LOSS (see the header): rows of deleted products are deleted first.
delete from public.product_analytics where product_id is null;
alter table public.product_analytics
  drop constraint product_analytics_business_id_fkey,
  drop constraint product_analytics_product_id_business_id_fkey,
  add constraint product_analytics_product_id_business_id_fkey
    foreign key (product_id, business_id) references public.products (id, business_id) on delete cascade;
alter table public.product_analytics alter column product_id set not null;

-- R-W5-3: before S1.5 an embed load was recorded as a view, so embed_view rows become view rows (kept, not split).
update public.product_analytics set event_type = 'view' where event_type = 'embed_view';
alter table public.product_analytics
  drop constraint product_analytics_event_type_check,
  add constraint product_analytics_event_type_check
    check (event_type in ('view', 'ar_activation', 'model_interaction'));
-- ---- end S1.5 Task 7 rollback ----

-- =============================================================================
-- S1.5 Task 18 rollback: application submission: rate limit first, daily hash (R-W2-10, R-W2-11)
-- =============================================================================

-- The earlier submit-application counts stored rows by submitter_hash; deploy it before running this.
drop function if exists public.service_application_attempt(text[], int);
drop table if exists private.application_attempts;
-- ---- end S1.5 Task 18 rollback ----

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
-- S1.5 Task 12 rollback: email status integrity (R-W7-3, R-W7-4, R-W7-5)
-- =============================================================================

-- Every email_log row and every stored provider event is kept; invites already moved to email_failed stay so.
drop trigger email_log_apply_pending_events on public.email_log;
drop function private.apply_pending_email_events();
drop function public.service_apply_provider_status(text, text);
drop function public.service_record_email_event(text, text, text, text);
drop function private.apply_email_status(text, text, text);
drop function private.email_event_status(text);
alter table private.email_provider_events drop column error, drop column applied;

-- service_record_email_event as in 20261020091428_applications_and_owner_access.
create function public.service_record_email_event(p_svix_id text, p_provider_message_id text, p_event_type text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new  text;
  v_rank constant jsonb := '{"blocked":0,"failed":1,"accepted":1,"sent":2,"delayed":3,"delivered":4,"bounced":4,"complained":5}';
begin
  insert into private.email_provider_events (svix_id, provider_message_id, event_type)
  values (p_svix_id, p_provider_message_id, p_event_type)
  on conflict (svix_id) do nothing;
  if not found then
    return false;
  end if;
  v_new := case p_event_type
    when 'email.sent' then 'sent'
    when 'email.delivered' then 'delivered'
    when 'email.delivery_delayed' then 'delayed'
    when 'email.bounced' then 'bounced'
    when 'email.complained' then 'complained'
    when 'email.failed' then 'failed'
  end;
  if v_new is not null then
    update public.email_log
       set status = v_new, updated_at = now()
     where provider_message_id = p_provider_message_id
       and (v_rank ->> v_new)::int >= (v_rank ->> status)::int;
  end if;
  return true;
end;
$$;
revoke execute on function public.service_record_email_event(text, text, text) from public, anon, authenticated;
grant execute on function public.service_record_email_event(text, text, text) to service_role;
-- ---- end S1.5 Task 12 rollback ----

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
-- S1.5 Task 5 rollback: permission prerequisites and storage deletes (R-W3-3)
-- =============================================================================

-- The role sets keep the prerequisites the backfill and later saves added (they were audited); narrow them by hand
-- on the role permissions page if needed. The audit rows stay.

-- Storage deletes need products.edit / businesses.edit again (20261025070915_platform_team_roles).
drop policy "Platform members delete logos" on storage.objects;
create policy "Platform members delete logos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'business-logos' and (select public.platform_can('businesses.edit')));
drop policy "Platform members delete media" on storage.objects;
create policy "Platform members delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-media' and (select public.platform_can('products.edit')));

-- admin_set_role_permissions stores exactly the set it is given and answers {ok} (20261025070915_platform_team_roles).
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
  v_new text[] := array(select distinct unnest(coalesce(p_permissions, '{}')) order by 1);
  v_old text[];
  v_added text[];
  v_removed text[];
begin
  if not private.owner_or_deny('set_role_permissions') then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if not (v_new <@ v_known) then
    return jsonb_build_object('error', 'unknown_permission');
  end if;
  v_old := array(select permission from public.platform_role_permissions where role = p_role order by 1);
  v_added := array(select unnest(v_new) except select unnest(v_old) order by 1);
  v_removed := array(select unnest(v_old) except select unnest(v_new) order by 1);
  if cardinality(v_added) = 0 and cardinality(v_removed) = 0 then
    return jsonb_build_object('ok', true);
  end if;
  delete from public.platform_role_permissions where role = p_role and permission = any (v_removed);
  insert into public.platform_role_permissions (role, permission) select p_role, unnest(v_added);
  insert into public.audit_events (event_type, actor_id, metadata)
  values ('access_permissions_changed', (select auth.uid()),
          jsonb_build_object('role', p_role::text, 'added', to_jsonb(v_added), 'removed', to_jsonb(v_removed)));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.admin_set_role_permissions(public.platform_role, text[]) from public, anon;
grant execute on function public.admin_set_role_permissions(public.platform_role, text[]) to authenticated, service_role;

drop function private.with_prerequisites(text[]);
drop function private.permission_prerequisites();
-- ---- end S1.5 Task 5 rollback ----

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

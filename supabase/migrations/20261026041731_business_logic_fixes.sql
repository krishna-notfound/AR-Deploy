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

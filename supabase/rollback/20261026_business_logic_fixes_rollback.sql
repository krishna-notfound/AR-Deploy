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
-- S1.5 Task 18 rollback: application submission: rate limit first, daily hash (R-W2-10, R-W2-11)
-- =============================================================================

-- The earlier submit-application counts stored rows by submitter_hash; deploy it before running this.
drop function if exists public.service_application_attempt(text[], int);
drop table if exists private.application_attempts;
-- ---- end S1.5 Task 18 rollback ----

-- =============================================================================
-- S1.5 Task 2 rollback: staff 2FA gate on Edge Functions, staff password length, owner email conflict (R-W1-1, R-W1-7, R-W1-8)
-- =============================================================================

-- R-W1-1: service_user_can had no comment before S1.5.
comment on function public.service_user_can(uuid, text) is null;

-- R-W1-8: service_link_owner as in 20261020091428_applications_and_owner_access (no team-email check).
create or replace function public.service_link_owner(p_business_id uuid, p_user_id uuid, p_actor uuid, p_application_id uuid default null)
returns text
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

-- Rollback for supabase/migrations/20261025180600_account_settings_optin_2fa.sql.
-- Restores the policy-only 2FA rule of 20261025163627_account_settings (a user's own factor is not enforced
-- while the platform policy is off). Run as the database owner, before 20261025_account_settings_rollback.sql.

begin;

create or replace function private.mfa_satisfied(p_scope text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2' then true
    when p_scope = 'staff' then not coalesce((select s.require_2fa_staff from public.platform_settings s where s.id), false)
    when p_scope = 'business' then not coalesce((select s.require_2fa_business from public.platform_settings s where s.id), false)
    else false
  end;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
     and (coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
          or not coalesce((select s.require_2fa_staff from public.platform_settings s where s.id), false));
$$;

create or replace function public.is_business_member(bid uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members
    where business_id = bid and user_id = (select auth.uid())
  )
     and (coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
          or not coalesce((select s.require_2fa_business from public.platform_settings s where s.id), false));
$$;

-- The own security activity as 20261025163627_account_settings created it (the policy first: it uses
-- caller_mfa_satisfied).
drop policy if exists "Users read their own account events" on public.audit_events;
create policy "Users read their own account events" on public.audit_events
  for select to authenticated
  using (event_type like 'account\_%'
         and (actor_id = (select auth.uid()) or metadata ->> 'subject_id' = (select auth.uid())::text));

create or replace function public.list_my_security_events()
returns setof public.audit_events
language sql
stable
security definer
set search_path = ''
as $$
  select e.* from public.audit_events e
  where (e.actor_id = (select auth.uid()) or e.metadata ->> 'subject_id' = (select auth.uid())::text)
    and e.event_type like 'account\_%'
  order by e.created_at desc, e.id
  limit 50;
$$;

drop function if exists public.caller_mfa_satisfied();
drop function if exists public.caller_has_verified_factor();

commit;

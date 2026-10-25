-- =============================================================================
-- Opt-in 2FA is enforced at the database (follow-up to 20261025163627_account_settings).
-- Rollback: supabase/rollback/20261025_account_settings_optin_2fa_rollback.sql (run it before the main
-- account_settings rollback; the main rollback also drops caller_has_verified_factor if it is still there).
--
-- Before: with the platform policy off, private.mfa_satisfied was true at aal1, so a user who had turned on
-- 2FA themselves could read their data through the API with only a password.
-- Now (Supabase's opt-in pattern): satisfied = aal2, or (the policy for the scope is off and the caller has
-- no verified factor). Users without 2FA are unaffected; an unverified (half-enrolled) factor does not count.
-- Not gated, as before: the own profile row, platform_settings, my_security_state, record_sign_in and the
-- Auth MFA APIs, so a user signed in at aal1 can still finish the TOTP challenge or set 2FA up.
-- =============================================================================

-- True when the caller has a verified MFA factor. Security definer: the API roles cannot read auth.mfa_factors.
-- Answers for auth.uid() only.
create function public.caller_has_verified_factor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified');
$$;
revoke execute on function public.caller_has_verified_factor() from public, anon;
grant execute on function public.caller_has_verified_factor() to authenticated, service_role;

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
                                and not public.caller_has_verified_factor()
    when p_scope = 'business' then not coalesce((select s.require_2fa_business from public.platform_settings s where s.id), false)
                                   and not public.caller_has_verified_factor()
    else false
  end;
$$;

-- The two invoker helpers carry the same rule inline (the API roles have no usage on schema private).
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
     and (coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
          or (not coalesce((select s.require_2fa_staff from public.platform_settings s where s.id), false)
              and not (select public.caller_has_verified_factor())));
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
          or (not coalesce((select s.require_2fa_business from public.platform_settings s where s.id), false)
              and not (select public.caller_has_verified_factor())));
$$;

-- create or replace keeps the grants; restated so the file reads on its own.
revoke execute on function private.mfa_satisfied(text) from public, anon;
grant execute on function private.mfa_satisfied(text) to authenticated, service_role;
revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.is_business_member(uuid) from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.is_business_member(uuid) to authenticated, service_role;

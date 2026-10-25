-- Rollback for supabase/migrations/20261025163627_account_settings.sql (S1: account settings, security and 2FA).
-- Removes profiles, the platform 2FA policy, action and recovery codes and closure requests, and restores the four
-- access helpers without the 2FA clause. Run as the database owner, before the rollback of 20261025070915.
--
-- Kept on purpose:
--   * audit rows already written (account_*, platform_security_policy_changed) and the wider audit_events
--     event_type check (those rows contain digits, e.g. account_2fa_enabled);
--   * email_log_kind_check with the security kinds (rows of those kinds may exist and stay valid);
--   * businesses taken offline by a pending closure request stay inactive (the owner asked for that). List them
--     first with: select business_id, previous_business_status from public.account_closure_requests;
--   * the avatars bucket when it still holds files (remove them through the Storage API first to drop it).
-- TOTP factors live in Supabase Auth and are not touched.

begin;

-- 1. The access helpers as they were before (init_schema and platform_team_roles). create or replace keeps grants.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
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
  );
$$;

create or replace function public.platform_can(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
      or exists (
        select 1 from public.platform_members m
        join public.platform_role_permissions rp on rp.role = m.role
        where m.user_id = (select auth.uid()) and m.status = 'active' and rp.permission = p_permission);
$$;

create or replace function public.is_platform_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
      or exists (select 1 from public.platform_members where user_id = (select auth.uid()) and status = 'active');
$$;

-- 2. Functions.
drop function if exists public.service_create_action_code(uuid, text, text, text);
drop function if exists public.service_check_action_code(uuid, text, text);
drop function if exists public.service_discard_action_code(uuid, uuid);
drop function if exists public.service_set_recovery_codes(uuid, text[], text);
drop function if exists public.service_use_recovery_code(uuid, text);
drop function if exists public.service_clear_recovery_codes(uuid);
drop function if exists public.service_has_recovery_codes(uuid);
drop function if exists public.service_log_account_event(uuid, text, jsonb, text);
drop function if exists public.service_requires_2fa(uuid);
drop function if exists public.service_classify_user(uuid);
drop function if exists public.service_request_closure(uuid);
drop function if exists public.service_restore_closure(uuid, uuid);
drop function if exists public.service_closure_target(uuid);
drop function if exists public.admin_list_closure_requests();
drop function if exists public.cancel_account_closure();
drop function if exists public.my_recovery_codes_left();
drop function if exists public.my_security_state();
drop function if exists public.record_sign_in(text);
drop function if exists public.log_account_event(text);
drop function if exists public.list_my_security_events();
drop function if exists private.undo_closure(uuid, uuid, text);
drop function if exists private.requires_2fa(uuid);
drop function if exists private.account_group(uuid);
drop function if exists private.mfa_satisfied(text);

-- 3. Policies on shared tables.
drop policy if exists "Users read their own account events" on public.audit_events;
drop policy if exists "Users read their own avatar files" on storage.objects;
drop policy if exists "Users upload their own avatar" on storage.objects;
drop policy if exists "Users replace their own avatar" on storage.objects;
drop policy if exists "Users delete their own avatar" on storage.objects;

-- 4. Trigger on auth.users, then the tables (their own triggers and policies go with them).
drop trigger if exists on_auth_user_created_profile on auth.users;
drop table if exists public.account_closure_requests;
drop table if exists private.recovery_codes;
drop table if exists private.action_codes;
drop table if exists public.platform_settings;
drop table if exists public.profiles;
drop function if exists private.create_profile_for_new_user();
drop function if exists private.profiles_valid_timezone();
drop function if exists private.platform_settings_stamp();
drop function if exists private.platform_settings_audit();

-- 5. The avatars bucket, only when empty.
delete from storage.buckets b
 where b.id = 'avatars'
   and not exists (select 1 from storage.objects o where o.bucket_id = b.id);

commit;

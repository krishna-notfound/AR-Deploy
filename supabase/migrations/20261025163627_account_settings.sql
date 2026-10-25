-- =============================================================================
-- Account settings, security and 2FA (S1, spec 2026-10-25-account-settings-s1 §6).
-- Rollback: supabase/rollback/20261025_account_settings_rollback.sql
--
--   1. Profiles (one row per auth user) and the one-row platform security policy.
--   2. "Require 2FA": private.mfa_satisfied and the four access helpers gated on it.
--   3. Self-service RPCs: my_security_state, record_sign_in, log_account_event, list_my_security_events.
--   4. Audit (wider event names, own-events read policy), the avatars bucket, email_log kinds.
--
-- The 2FA gate: when the policy for a group is on, the access helpers (is_platform_admin, is_platform_member,
-- platform_can for staff; is_business_member for business owners) answer false unless the caller's JWT is at aal2.
-- RLS and every admin function then refuse the caller until they verify a second factor. Profiles (own row),
-- platform_settings, my_security_state and the Auth MFA APIs are not gated, so a user can still set 2FA up.
-- Public catalog reads and service_* functions do not use the helpers and are unaffected.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Profiles and the platform security policy
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  display_name            text check (char_length(display_name) between 1 and 80 and btrim(display_name) <> ''),
  -- <user_id>/<uuid>.<ext> inside the avatars bucket (the update policy keeps it in the user's own folder).
  avatar_path             text check (char_length(avatar_path) <= 300),
  timezone                text not null default 'Europe/Lisbon' check (char_length(timezone) <= 64),
  date_format             text not null default 'd MMM yyyy' check (date_format in ('d MMM yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd')),
  clock                   text not null default '24h' check (clock in ('24h', '12h')),
  notify_new_applications boolean not null default true,
  onboarding_completed_at timestamptz,
  onboarding_dismissed_at timestamptz,
  updated_at              timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- An IANA zone name the database knows (the UI formats dates with the same name).
create function private.profiles_valid_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger profiles_valid_timezone before insert or update of timezone on public.profiles
  for each row execute function private.profiles_valid_timezone();

-- Every new auth user gets a profile; the display name comes from the sign-up metadata when present.
create function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80), ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created_profile after insert on auth.users
  for each row execute function private.create_profile_for_new_user();

revoke execute on function private.profiles_valid_timezone() from public, anon, authenticated;
revoke execute on function private.create_profile_for_new_user() from public, anon, authenticated;

-- Backfill: one row per existing user. Name from the sign-up metadata, then the platform member's full name.
insert into public.profiles (user_id, display_name)
select u.id,
       coalesce(nullif(left(btrim(coalesce(u.raw_user_meta_data ->> 'display_name', '')), 80), ''),
                nullif(left(btrim(coalesce(m.full_name, '')), 80), ''))
from auth.users u
left join public.platform_members m on m.user_id = u.id
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated, service_role;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

create policy "Users read their own profile" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
-- Staff need names and photos for team lists and the audit trail (gated by the staff 2FA policy).
create policy "Platform members read profiles" on public.profiles
  for select to authenticated using ((select public.is_platform_member()));
create policy "Users create their own profile" on public.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and (avatar_path is null or avatar_path like (select auth.uid())::text || '/%'));
create policy "Users update their own profile" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and (avatar_path is null or avatar_path like (select auth.uid())::text || '/%'));

-- One row only. Read by every signed-in user (the app needs the policy to guide setup).
create table public.platform_settings (
  id                   boolean primary key default true check (id),
  require_2fa_staff    boolean not null default false,
  require_2fa_business boolean not null default false,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id) on delete set null
);
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from public, anon, authenticated, service_role;
grant select on public.platform_settings to authenticated, service_role;
grant update (require_2fa_staff, require_2fa_business) on public.platform_settings to authenticated;

create policy "Signed-in users read the platform settings" on public.platform_settings
  for select to authenticated using (true);
-- Only the Owner, signed in with a second factor: turning the staff policy on at aal1 would lock them out.
create policy "The Owner at aal2 updates the platform settings" on public.platform_settings
  for update to authenticated
  using ((select public.is_platform_admin()) and ((select auth.jwt()) ->> 'aal') = 'aal2')
  with check ((select public.is_platform_admin()) and ((select auth.jwt()) ->> 'aal') = 'aal2');

create function private.platform_settings_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
create trigger platform_settings_stamp before update on public.platform_settings
  for each row execute function private.platform_settings_stamp();

create function private.platform_settings_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.require_2fa_staff, old.require_2fa_business) is distinct from (new.require_2fa_staff, new.require_2fa_business) then
    insert into public.audit_events (event_type, actor_id, metadata)
    values ('platform_security_policy_changed', (select auth.uid()),
            jsonb_build_object(
              'from', jsonb_build_object('require_2fa_staff', old.require_2fa_staff, 'require_2fa_business', old.require_2fa_business),
              'to', jsonb_build_object('require_2fa_staff', new.require_2fa_staff, 'require_2fa_business', new.require_2fa_business)));
  end if;
  return null;
end;
$$;
create trigger platform_settings_audit after update on public.platform_settings
  for each row execute function private.platform_settings_audit();

revoke execute on function private.platform_settings_stamp() from public, anon, authenticated;
revoke execute on function private.platform_settings_audit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. "Require 2FA": the gate and the four access helpers
-- ---------------------------------------------------------------------------

-- True when the policy for the scope ('staff' | 'business') is off, or the caller's session is at aal2.
-- An unknown scope needs aal2. A missing settings row counts as "policy off" (the defaults).
create function private.mfa_satisfied(p_scope text)
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
revoke execute on function private.mfa_satisfied(text) from public, anon;
grant execute on function private.mfa_satisfied(text) to authenticated, service_role;

-- is_platform_admin and is_business_member stay security invoker (as in init_schema). An invoker function runs as
-- the API role, which has no usage on schema private, so these two carry the same check as private.mfa_satisfied
-- inline, reading public.platform_settings (readable by every signed-in user).
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

revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.is_business_member(uuid) from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.is_business_member(uuid) to authenticated, service_role;

create or replace function public.platform_can(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
          or exists (
            select 1 from public.platform_members m
            join public.platform_role_permissions rp on rp.role = m.role
            where m.user_id = (select auth.uid()) and m.status = 'active' and rp.permission = p_permission))
     and private.mfa_satisfied('staff');
$$;

create or replace function public.is_platform_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
          or exists (select 1 from public.platform_members where user_id = (select auth.uid()) and status = 'active'))
     and private.mfa_satisfied('staff');
$$;

revoke execute on function public.platform_can(text) from public, anon;
revoke execute on function public.is_platform_member() from public, anon;
grant execute on function public.platform_can(text) to authenticated, service_role;
grant execute on function public.is_platform_member() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Self-service RPCs (security definer; never gated, so a user required to set up 2FA can still do it)
-- ---------------------------------------------------------------------------

-- 'staff' (Owner or active platform member), 'business' (owns a business) or 'none'. Read directly, not
-- through the gated helpers, so the answer does not depend on the caller's assurance level.
create function private.account_group(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.platform_admins where user_id = p_user)
      or exists (select 1 from public.platform_members where user_id = p_user and status = 'active') then 'staff'
    when exists (select 1 from public.business_members where user_id = p_user) then 'business'
    else 'none'
  end;
$$;

-- Whether the policy requires 2FA for the user's group.
create function private.requires_2fa(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case private.account_group(p_user)
             when 'staff' then s.require_2fa_staff
             when 'business' then s.require_2fa_business
             else false
           end
    from public.platform_settings s where s.id), false);
$$;

revoke execute on function private.account_group(uuid) from public, anon, authenticated;
revoke execute on function private.requires_2fa(uuid) from public, anon, authenticated;

-- { requires_2fa, aal: 'aal1'|'aal2', closure: { requested_at, business_id } | null,
--   onboarding: { completed_at, dismissed_at } }
create function public.my_security_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where user_id = v_uid;
  return jsonb_build_object(
    'requires_2fa', private.requires_2fa(v_uid),
    'aal', case when (select auth.jwt()) ->> 'aal' = 'aal2' then 'aal2' else 'aal1' end,
    'closure', null,
    'onboarding', jsonb_build_object('completed_at', v_profile.onboarding_completed_at,
                                     'dismissed_at', v_profile.onboarding_dismissed_at));
end;
$$;

-- Logs account_signed_in with a user-agent summary (at most 200 characters), at most once per user per 60 s.
create function public.record_sign_in(p_user_agent text)
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

-- The two events the client reports itself (they happen through the Auth API). Everything else is logged by the
-- account-security Edge Function through service_log_account_event. More than 20 in an hour are not recorded.
create function public.log_account_event(p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_event is null or p_event not in ('account_email_change_requested', 'account_password_changed') then
    raise exception 'unknown_event' using errcode = '22023';
  end if;
  if (select count(*) from public.audit_events
      where actor_id = v_uid and event_type = p_event and created_at > now() - interval '1 hour') >= 20 then
    return;
  end if;
  insert into public.audit_events (event_type, actor_id) values (p_event, v_uid);
end;
$$;

-- The caller's own account_ events (as actor, or as the subject of someone else's action), newest first, at most 50.
create function public.list_my_security_events()
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

revoke execute on function public.my_security_state() from public, anon;
revoke execute on function public.record_sign_in(text) from public, anon;
revoke execute on function public.log_account_event(text) from public, anon;
revoke execute on function public.list_my_security_events() from public, anon;
grant execute on function public.my_security_state() to authenticated;
grant execute on function public.record_sign_in(text) to authenticated;
grant execute on function public.log_account_event(text) to authenticated;
grant execute on function public.list_my_security_events() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Audit, avatars bucket, email log
-- ---------------------------------------------------------------------------

-- Event names may contain digits now (account_2fa_enabled). Still lower-case, starting with a letter.
alter table public.audit_events drop constraint audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check
  check (event_type ~ '^[a-z][a-z0-9_]{2,59}$');

-- Additive (ORed with the staff policies): a user reads their own account events.
create policy "Users read their own account events" on public.audit_events
  for select to authenticated
  using (event_type like 'account\_%'
         and (actor_id = (select auth.uid()) or metadata ->> 'subject_id' = (select auth.uid())::text));

-- Public read so <img> works without signed URLs (photos are not secret). Writes only in <user_id>/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Users read their own avatar files" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users upload their own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users replace their own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users delete their own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('owner_invitation', 'invitation_resend', 'application_confirmation', 'admin_notification', 'team_invitation', 'test',
                  'security_code', 'security_notice', 'closure_request'));

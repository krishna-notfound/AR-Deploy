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
    -- account_closure_requests is created in section 6 (plpgsql resolves it when called).
    'closure', (select jsonb_build_object('requested_at', r.requested_at, 'business_id', r.business_id)
                from public.account_closure_requests r where r.user_id = v_uid),
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

-- ---------------------------------------------------------------------------
-- 5. Emailed action codes and recovery codes (no API access; service role through functions only)
-- ---------------------------------------------------------------------------
-- Hash format (shared with the account-security Edge Function): lower-case hex of sha256(salt || code), where
-- code is the 6 digits for an action code, and for a recovery code the 10 characters upper-cased with dashes and
-- whitespace removed. Plain codes are never stored or logged.

create table private.action_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  purpose     text not null check (purpose in ('disable_2fa', 'regenerate_recovery', 'request_closure', 'owner_reset_2fa', 'complete_closure')),
  code_hash   text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  salt        text not null check (char_length(salt) between 1 and 128),
  expires_at  timestamptz not null default now() + interval '10 minutes',
  attempts    integer not null default 0 check (attempts between 0 and 5),
  -- Set when the code is used, replaced by a newer code, or voided (its email failed). Never usable again.
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index action_codes_user_idx on private.action_codes (user_id, purpose, created_at desc);
alter table private.action_codes enable row level security;
revoke all on private.action_codes from public, anon, authenticated, service_role;

create table private.recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  code_hash  text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  salt       text not null check (char_length(salt) between 1 and 128),
  used_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, code_hash)
);
alter table private.recovery_codes enable row level security;
revoke all on private.recovery_codes from public, anon, authenticated, service_role;

-- A new code for the same user and purpose replaces the older ones. At most 5 codes per user per hour (all
-- purposes; replaced and voided codes still count, so a failing email cannot be used to send more).
create function public.service_create_action_code(p_user uuid, p_purpose text, p_code_hash text, p_salt text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user is null
     or p_purpose is null
     or p_purpose not in ('disable_2fa', 'regenerate_recovery', 'request_closure', 'owner_reset_2fa', 'complete_closure')
     or p_code_hash is null or lower(p_code_hash) !~ '^[0-9a-f]{64}$'
     or coalesce(p_salt, '') = '' or char_length(p_salt) > 128 then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('action_code:' || p_user::text, 0));
  if (select count(*) from private.action_codes where user_id = p_user and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  update private.action_codes set consumed_at = now()
   where user_id = p_user and purpose = p_purpose and consumed_at is null;
  delete from private.action_codes where user_id = p_user and created_at < now() - interval '1 day';
  insert into private.action_codes (user_id, purpose, code_hash, salt)
  values (p_user, p_purpose, lower(p_code_hash), p_salt)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Checks the newest live code for the user and purpose. Consumes it on success; a wrong code counts an attempt.
-- After 5 wrong attempts the code is refused even when correct.
create function public.service_check_action_code(p_user uuid, p_purpose text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row  private.action_codes;
  v_code text := regexp_replace(coalesce(p_code, ''), '[[:space:]]', '', 'g');
begin
  select * into v_row from private.action_codes
   where user_id = p_user and purpose = p_purpose and consumed_at is null
   order by created_at desc limit 1
   for update;
  if not found then
    return jsonb_build_object('error', 'invalid_code');
  end if;
  if v_row.expires_at <= now() then
    return jsonb_build_object('error', 'code_expired');
  end if;
  if v_row.attempts >= 5 then
    return jsonb_build_object('error', 'too_many_attempts');
  end if;
  if v_code ~ '^[0-9]{6}$' and encode(sha256(convert_to(v_row.salt || v_code, 'UTF8')), 'hex') = v_row.code_hash then
    update private.action_codes set consumed_at = now() where id = v_row.id;
    return jsonb_build_object('ok', true);
  end if;
  update private.action_codes set attempts = attempts + 1 where id = v_row.id;
  return jsonb_build_object('error', 'invalid_code');
end;
$$;

-- Makes every live code for the user and purpose unusable (called after the email failed to send). Not rate
-- limited. The rows stay, so they still count towards the hourly limit.
create function public.service_void_action_codes(p_user uuid, p_purpose text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  update private.action_codes set consumed_at = now()
   where user_id = p_user and purpose = p_purpose and consumed_at is null;
  select jsonb_build_object('ok', true);
$$;

-- Replaces the user's set with 8 new hashes (one salt per set). The Edge Function logs the event.
create function public.service_set_recovery_codes(p_user uuid, p_hashes text[], p_salt text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_hashes is null or cardinality(p_hashes) <> 8
     or exists (select 1 from unnest(p_hashes) h where h is null or lower(h) !~ '^[0-9a-f]{64}$')
     or (select count(distinct lower(h)) from unnest(p_hashes) h) <> 8
     or coalesce(p_salt, '') = '' or char_length(p_salt) > 128 then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('recovery_codes:' || p_user::text, 0));
  delete from private.recovery_codes where user_id = p_user;
  insert into private.recovery_codes (user_id, code_hash, salt)
  select p_user, lower(h), p_salt from unnest(p_hashes) h;
  return jsonb_build_object('ok', true);
end;
$$;

-- p_code is the raw input: case, dashes and whitespace are ignored. Each code works once.
create function public.service_use_recovery_code(p_user uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[[:space:]-]', '', 'g'));
  v_id   uuid;
begin
  if v_code !~ '^[A-HJKMNP-Z2-9]{10}$' then
    return jsonb_build_object('error', 'invalid_code');
  end if;
  select id into v_id from private.recovery_codes
   where user_id = p_user and used_at is null
     and code_hash = encode(sha256(convert_to(salt || v_code, 'UTF8')), 'hex')
   limit 1
   for update;
  if not found then
    return jsonb_build_object('error', 'invalid_code');
  end if;
  update private.recovery_codes set used_at = now() where id = v_id;
  return jsonb_build_object('ok', true, 'remaining',
    (select count(*)::int from private.recovery_codes where user_id = p_user and used_at is null));
end;
$$;

create function public.service_clear_recovery_codes(p_user uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  delete from private.recovery_codes where user_id = p_user;
  select jsonb_build_object('ok', true);
$$;

create function public.service_has_recovery_codes(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'count',
    (select count(*)::int from private.recovery_codes where user_id = p_user and used_at is null));
$$;

-- The caller's unused recovery codes (0 when none).
create function public.my_recovery_codes_left()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from private.recovery_codes where user_id = (select auth.uid()) and used_at is null;
$$;
revoke execute on function public.my_recovery_codes_left() from public, anon;
grant execute on function public.my_recovery_codes_left() to authenticated;

-- Account events written by the Edge Function. Metadata keys used by the activity list: user_agent, ip,
-- subject_id (the affected user when the actor is someone else). A deleted subject is logged without an actor.
create function public.service_log_account_event(p_user uuid, p_event text, p_metadata jsonb, p_ip text)
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
  insert into public.audit_events (event_type, actor_id, metadata)
  values (p_event, (select u.id from auth.users u where u.id = p_user), v_meta);
  return jsonb_build_object('ok', true);
end;
$$;

-- { ok, requires, group: 'staff'|'business'|'none' } for the user, from the platform policy.
create function public.service_requires_2fa(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'requires', private.requires_2fa(p_user), 'group', private.account_group(p_user));
$$;

-- 'owner' | 'staff' (any platform member row) | 'business' | 'none'.
create function public.service_classify_user(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'kind', case
    when exists (select 1 from public.platform_admins where user_id = p_user) then 'owner'
    when exists (select 1 from public.platform_members where user_id = p_user) then 'staff'
    when exists (select 1 from public.business_members where user_id = p_user) then 'business'
    else 'none' end);
$$;

-- ---------------------------------------------------------------------------
-- 6. Account closure
-- ---------------------------------------------------------------------------

create table public.account_closure_requests (
  user_id                  uuid primary key references auth.users (id) on delete cascade,
  -- set null, not cascade: if complete_closure deletes the business and then fails to delete the user, the request
  -- stays (business_id null) so a retry finds it. The user_id cascade removes it once the user is gone.
  business_id              uuid references public.businesses (id) on delete set null,
  requested_at             timestamptz not null default now(),
  previous_business_status text check (previous_business_status in ('active', 'inactive', 'draft'))
);
create index account_closure_requests_business_idx on public.account_closure_requests (business_id);

alter table public.account_closure_requests enable row level security;
revoke all on public.account_closure_requests from public, anon, authenticated, service_role;
grant select on public.account_closure_requests to authenticated, service_role;
create policy "Users read their own closure request" on public.account_closure_requests
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Platform members read closure requests" on public.account_closure_requests
  for select to authenticated using ((select public.platform_can('businesses.view')));

-- Business owner: the business goes inactive (previous status remembered) and a request row is added; the Owner
-- completes or restores it later. Staff: the membership is deactivated and every session ended; the Edge Function
-- then deletes the user. The Owner cannot close. The Edge Function logs account_closure_requested.
create function public.service_request_closure(p_user uuid)
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
    return jsonb_build_object('ok', true, 'kind', 'staff');
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
  update public.businesses set status = 'inactive' where id = v_biz.id and status <> 'inactive';
  return jsonb_build_object('ok', true, 'kind', 'business', 'business_id', v_biz.id);
end;
$$;

-- Restores the business to its status before the request (only while it is still inactive, so a status the Owner
-- set in between is kept), deletes the request and logs p_event. False when there is no request.
create function private.undo_closure(p_user uuid, p_actor uuid, p_event text)
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

-- Called by the requester: { ok: true } | { error: 'not_found' }.
create function public.cancel_account_closure()
returns jsonb
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
  if not private.undo_closure(v_uid, v_uid, 'account_closure_cancelled') then
    return jsonb_build_object('error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.cancel_account_closure() from public, anon;
grant execute on function public.cancel_account_closure() to authenticated;

-- The Owner restores a request (through the Edge Function, which checks aal2).
create function public.service_restore_closure(p_user uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.undo_closure(p_user, p_actor, 'account_closure_restored') then
    return jsonb_build_object('error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- What complete_closure needs before deleting: the business and the address for the final notice.
create function public.service_closure_target(p_user uuid)
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

-- [{ user_id, email, business_id, business_name, requested_at }] newest first, or { error: 'forbidden' }.
create function public.admin_list_closure_requests()
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
    select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'email', u.email::text, 'business_id', r.business_id,
                                        'business_name', b.name, 'requested_at', r.requested_at)
                     order by r.requested_at desc, r.user_id)
      from public.account_closure_requests r
      join auth.users u on u.id = r.user_id
      left join public.businesses b on b.id = r.business_id), '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_list_closure_requests() from public, anon;
grant execute on function public.admin_list_closure_requests() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Service-role grants
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.service_create_action_code(uuid, text, text, text)', 'public.service_check_action_code(uuid, text, text)',
    'public.service_void_action_codes(uuid, text)', 'public.service_set_recovery_codes(uuid, text[], text)',
    'public.service_use_recovery_code(uuid, text)', 'public.service_clear_recovery_codes(uuid)',
    'public.service_has_recovery_codes(uuid)', 'public.service_log_account_event(uuid, text, jsonb, text)',
    'public.service_requires_2fa(uuid)', 'public.service_classify_user(uuid)', 'public.service_request_closure(uuid)',
    'public.service_restore_closure(uuid, uuid)', 'public.service_closure_target(uuid)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- Owner sign-in aliases (ADR-0077, owner decision 2026-11-14). The platform Owner (platform_admins) can sign in with up
-- to 3 extra email addresses. The Auth email stays the one primary: every email and the reset codes go there; an alias
-- only signs in. "Make primary" swaps the Auth email with an alias (done by the account-security function, which then
-- calls service_alias_swap), so the platform Owner account can pass to the client without creating a second Owner.
--   1. private.account_aliases: the aliases (RLS on, no policies, no grants; reached only through the functions below).
--   2. The service_alias_* functions (service role only).
--   3. private.action_codes / service_create_action_code accept the purpose 'add_alias' (the code emailed to the alias).
--   4. service_log_account_event accepts account_alias_added, account_alias_removed, account_primary_email_changed.
--   5. service_end_other_sessions: ends every session of the user except one.
-- Rows older than 1 hour that were never verified (an alias whose code was never entered) are deleted by service_alias_begin.
-- service_create_action_code and service_log_account_event are restated from their LATEST definition
-- (20261111160021_password_change_codes.sql). The anonymous rate limit reuses service_application_attempt (20261026041731).
-- Rollback: supabase/rollback/20261114_owner_sign_in_aliases_rollback.sql.

-- ---------------------------------------------------------------------------
-- 1. The aliases
-- ---------------------------------------------------------------------------

create table private.account_aliases (
  -- Lower-case and unique across every user: one address, one account.
  email       text        primary key
              check (email = lower(email) and char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- null while the code emailed to the address has not been entered. Only a verified alias signs in or counts.
  verified_at timestamptz
);
create index account_aliases_user_idx on private.account_aliases (user_id);
alter table private.account_aliases enable row level security;
-- No policies and no grants: only the security-definer functions below (and the database owner) touch the table.
revoke all on private.account_aliases from public, anon, authenticated, service_role;

-- Rules a direct write cannot get around: the owner of an alias is a platform Owner, an alias is never the Auth email of
-- any user, and a user has at most 3 verified aliases. (An Auth email chosen later that equals an alias is not seen here:
-- auth.users is Supabase's own table. A normal sign-in always wins, see ADR-0077.)
create function private.account_aliases_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.platform_admins where user_id = new.user_id) then
    raise exception 'alias_owner_only' using errcode = '23514';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = new.email) then
    raise exception 'alias_email_in_use' using errcode = '23505';
  end if;
  if new.verified_at is not null
     and (select count(*) from private.account_aliases a
           where a.user_id = new.user_id and a.verified_at is not null and a.email <> new.email) >= 3 then
    raise exception 'alias_limit' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function private.account_aliases_guard() from public, anon, authenticated, service_role;
create trigger account_aliases_guard
  before insert or update on private.account_aliases
  for each row execute function private.account_aliases_guard();

-- ---------------------------------------------------------------------------
-- 2. The functions the account-security Edge Function calls (service role only)
-- ---------------------------------------------------------------------------

-- The verified aliases of an Owner, oldest first.
create function public.service_alias_list(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user is null or not exists (select 1 from public.platform_admins where user_id = p_user) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'aliases', coalesce((
    select jsonb_agg(jsonb_build_object('email', a.email, 'added_at', a.verified_at) order by a.verified_at, a.email)
      from private.account_aliases a where a.user_id = p_user and a.verified_at is not null), '[]'::jsonb));
end;
$$;

-- Starts adding an alias: one unverified row per user at a time (a new address replaces the earlier one), so the emailed
-- code, which is per user and purpose, always belongs to this address.
create function public.service_alias_begin(p_user uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if p_user is null or v_email = '' or char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if not exists (select 1 from public.platform_admins where user_id = p_user) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account_alias:' || p_user::text, 0));
  delete from private.account_aliases where verified_at is null and (user_id = p_user or created_at < now() - interval '1 hour');
  if (select count(*) from private.account_aliases where user_id = p_user and verified_at is not null) >= 3 then
    return jsonb_build_object('error', 'alias_limit');
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email)
     or exists (select 1 from private.account_aliases where email = v_email) then
    return jsonb_build_object('error', 'email_in_use');
  end if;
  insert into private.account_aliases (user_id, email) values (p_user, v_email);
  return jsonb_build_object('ok', true, 'email', v_email);
exception when unique_violation or check_violation then
  return jsonb_build_object('error', 'email_in_use');
end;
$$;

-- The email failed to send: the unverified row goes (a verified alias is never touched).
create function public.service_alias_cancel(p_user uuid, p_email text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from private.account_aliases where user_id = p_user and email = lower(btrim(coalesce(p_email, ''))) and verified_at is null returning 1)
  select jsonb_build_object('ok', true);
$$;

-- The code was right: the pending address becomes an alias. Called after service_check_action_code accepted the code.
create function public.service_alias_verify(p_user uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if p_user is null or v_email = '' then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account_alias:' || p_user::text, 0));
  if not exists (select 1 from private.account_aliases where user_id = p_user and email = v_email and verified_at is null) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if (select count(*) from private.account_aliases where user_id = p_user and verified_at is not null) >= 3 then
    return jsonb_build_object('error', 'alias_limit');
  end if;
  update private.account_aliases set verified_at = now() where user_id = p_user and email = v_email;
  return jsonb_build_object('ok', true, 'email', v_email);
exception when unique_violation or check_violation then
  return jsonb_build_object('error', 'email_in_use');
end;
$$;

-- Removes one verified alias of the user. The Auth email is not here, so the primary can never be removed by this.
create function public.service_alias_remove(p_user uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from private.account_aliases where user_id = p_user and email = lower(btrim(coalesce(p_email, ''))) and verified_at is not null;
  get diagnostics v_n = row_count;
  return case when v_n = 1 then jsonb_build_object('ok', true) else jsonb_build_object('error', 'not_found') end;
end;
$$;

-- Sign-in and reset: which Owner does this alias belong to? Verified aliases only. Never reachable from the browser.
create function public.service_alias_resolve(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('ok', true, 'user_id', a.user_id)
       from private.account_aliases a
      where a.email = lower(btrim(coalesce(p_email, ''))) and a.verified_at is not null),
    jsonb_build_object('error', 'not_found'));
$$;

-- After the Auth email became p_new: p_new stops being an alias and the old primary p_old becomes one (verified), in
-- one statement block, so the user keeps the same number of aliases. Called by the Edge Function, which puts the Auth
-- email back if this fails.
create function public.service_alias_swap(p_user uuid, p_new text, p_old text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new text := lower(btrim(coalesce(p_new, '')));
  v_old text := lower(btrim(coalesce(p_old, '')));
begin
  if p_user is null or v_new = '' or v_old = '' or v_new = v_old then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account_alias:' || p_user::text, 0));
  delete from private.account_aliases where user_id = p_user and email = v_new and verified_at is not null;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  insert into private.account_aliases (user_id, email, verified_at) values (p_user, v_old, now());
  return jsonb_build_object('ok', true);
exception when unique_violation or check_violation then
  return jsonb_build_object('error', 'email_in_use');
end;
$$;

-- Every session of the user except p_keep (their current one). A null p_keep ends them all.
create function public.service_end_other_sessions(p_user uuid, p_keep uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.sessions where user_id = p_user and id is distinct from p_keep;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.service_alias_list(uuid)', 'public.service_alias_begin(uuid, text)', 'public.service_alias_cancel(uuid, text)',
    'public.service_alias_verify(uuid, text)', 'public.service_alias_remove(uuid, text)', 'public.service_alias_resolve(text)',
    'public.service_alias_swap(uuid, text, text)', 'public.service_end_other_sessions(uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The action-code purpose 'add_alias'
-- ---------------------------------------------------------------------------

alter table private.action_codes drop constraint action_codes_purpose_check;
alter table private.action_codes add constraint action_codes_purpose_check
  check (purpose in ('disable_2fa', 'regenerate_recovery', 'request_closure', 'owner_reset_2fa', 'complete_closure', 'change_password', 'add_alias'));

-- Body as 20261111160021_password_change_codes (its latest definition), with 'add_alias' in the list.
create or replace function public.service_create_action_code(p_user uuid, p_purpose text, p_code_hash text, p_salt text)
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
     or p_purpose not in ('disable_2fa', 'regenerate_recovery', 'request_closure', 'owner_reset_2fa', 'complete_closure', 'change_password', 'add_alias')
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
revoke execute on function public.service_create_action_code(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.service_create_action_code(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The audit events
-- ---------------------------------------------------------------------------

-- Body as 20261111160021_password_change_codes (its latest definition), with the three alias events added.
create or replace function public.service_log_account_event(p_user uuid, p_event text, p_metadata jsonb, p_ip text, p_business_id uuid default null)
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
       'account_deleted', 'platform_security_policy_changed', 'account_password_reset',
       'account_alias_added', 'account_alias_removed', 'account_primary_email_changed')
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

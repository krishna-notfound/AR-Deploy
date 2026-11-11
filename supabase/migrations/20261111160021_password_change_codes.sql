-- Password change verification (ADR-0066, owner decision 2026-11-11): changing the password needs an emailed code
-- (new action-code purpose 'change_password') and, with 2FA on, a fresh authenticator code; the reset's last step goes
-- through the account-security function too and is audited as 'account_password_reset'.
--   1. private.action_codes: the purpose check accepts 'change_password'.
--   2. public.service_create_action_code: accepts 'change_password' (body otherwise as 20261025163627_account_settings).
--   3. public.service_log_account_event: accepts 'account_password_reset' (body otherwise as
--      20261026041731_business_logic_fixes, its latest definition).
-- Both functions keep their signatures, so `create or replace` keeps their grants; they are restated anyway.
-- service_check_action_code and service_void_action_codes take any purpose, so they need no change.
-- Rollback: supabase/rollback/20261111_password_change_codes_rollback.sql.

-- 1. The purpose check (named by Postgres from the column: action_codes_purpose_check).
alter table private.action_codes drop constraint action_codes_purpose_check;
alter table private.action_codes add constraint action_codes_purpose_check
  check (purpose in ('disable_2fa', 'regenerate_recovery', 'request_closure', 'owner_reset_2fa', 'complete_closure', 'change_password'));

-- 2. A new code for the same user and purpose replaces the older ones. At most 5 codes per user per hour (all
-- purposes; replaced and voided codes still count, so a failing email cannot be used to send more).
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
     or p_purpose not in ('disable_2fa', 'regenerate_recovery', 'request_closure', 'owner_reset_2fa', 'complete_closure', 'change_password')
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

-- 3. The account events the Edge Functions write, now with the password reset.
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
       'account_deleted', 'platform_security_policy_changed', 'account_password_reset')
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

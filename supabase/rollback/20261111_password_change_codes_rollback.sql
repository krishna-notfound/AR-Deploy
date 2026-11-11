-- Rollback for supabase/migrations/20261111160021_password_change_codes.sql (ADR-0066): puts the action-code purpose
-- check, service_create_action_code and service_log_account_event back to their earlier definitions
-- (20261025163627_account_settings.sql and 20261026041731_business_logic_fixes.sql). Run as the database owner, only
-- with the owner's approval.
--
-- DATA: every 'change_password' action code is deleted (they live 10 minutes and are useless without this release).
-- account_password_reset events stay in audit_events (its check is a pattern, so they remain valid rows).
-- Redeploy the account-security function from before this change first: the new one sends 'change_password' codes and
-- logs account_password_reset, which the rolled-back functions refuse (a code send then answers invalid_request).

begin;

delete from private.action_codes where purpose = 'change_password';
alter table private.action_codes drop constraint action_codes_purpose_check;
alter table private.action_codes add constraint action_codes_purpose_check
  check (purpose in ('disable_2fa', 'regenerate_recovery', 'request_closure', 'owner_reset_2fa', 'complete_closure'));

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
revoke execute on function public.service_create_action_code(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.service_create_action_code(uuid, text, text, text) to service_role;

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
       'account_deleted', 'platform_security_policy_changed')
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

commit;

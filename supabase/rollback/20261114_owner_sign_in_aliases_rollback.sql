-- Rollback for supabase/migrations/20261114164820_owner_sign_in_aliases.sql (ADR-0077): drops the alias table and its
-- functions, and puts the action-code purpose check, service_create_action_code and service_log_account_event back to
-- their definitions of 20261111160021_password_change_codes.sql. Run as the database owner, only with the owner's approval.
--
-- DATA: every alias is deleted (the Owner can still sign in with the primary email, which is the Auth email and is
-- not touched here). If "Make primary" was used, the Auth email is already the new address: nothing to undo for sign-in.
-- Every 'add_alias' action code is deleted (they live 10 minutes). account_alias_added, account_alias_removed and
-- account_primary_email_changed events stay in audit_events (its check is a pattern, so they remain valid rows).
-- Redeploy the account-security function from before this change first: the new one sends 'add_alias' codes and logs
-- the alias events, which the rolled-back functions refuse, and it needs service_alias_* (gone after this script).

begin;

drop function public.service_end_other_sessions(uuid, uuid);
drop function public.service_alias_swap(uuid, text, text);
drop function public.service_alias_resolve(text);
drop function public.service_alias_remove(uuid, text);
drop function public.service_alias_verify(uuid, text);
drop function public.service_alias_cancel(uuid, text);
drop function public.service_alias_begin(uuid, text);
drop function public.service_alias_list(uuid);
drop trigger account_aliases_guard on private.account_aliases;
drop function private.account_aliases_guard();
drop table private.account_aliases;

delete from private.action_codes where purpose = 'add_alias';
alter table private.action_codes drop constraint action_codes_purpose_check;
alter table private.action_codes add constraint action_codes_purpose_check
  check (purpose in ('disable_2fa', 'regenerate_recovery', 'request_closure', 'owner_reset_2fa', 'complete_closure', 'change_password'));

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

commit;

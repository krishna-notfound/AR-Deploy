-- ADR-0069: gives back a recovery code that account-security spent but could not use. redeem_recovery_code consumes the
-- code (service_use_recovery_code) before it removes the authenticator; when the removal fails the person still has the
-- factor and would have lost one of their codes. The Edge Function calls this on that failure.
-- Only a code spent in the last 5 minutes can be given back, and only the service role can call it (as the other
-- service_* functions). It answers { ok: true } when a code was given back, { error: 'invalid_code' } otherwise.
-- Not applied by this change; the owner applies it. Rollback: supabase/rollback/20261114_recovery_code_restore_rollback.sql.

create function public.service_restore_recovery_code(p_user uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[[:space:]-]', '', 'g'));
  v_id   uuid;
begin
  if p_user is null or v_code !~ '^[A-HJKMNP-Z2-9]{10}$' then
    return jsonb_build_object('error', 'invalid_code');
  end if;
  select id into v_id from private.recovery_codes
   where user_id = p_user
     and used_at is not null
     and used_at > now() - interval '5 minutes'
     and code_hash = encode(sha256(convert_to(salt || v_code, 'UTF8')), 'hex')
   limit 1
   for update;
  if not found then
    return jsonb_build_object('error', 'invalid_code');
  end if;
  update private.recovery_codes set used_at = null where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.service_restore_recovery_code(uuid, text) from public, anon, authenticated;
grant execute on function public.service_restore_recovery_code(uuid, text) to service_role;

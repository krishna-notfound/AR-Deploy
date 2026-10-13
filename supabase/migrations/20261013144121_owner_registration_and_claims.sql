-- Owner self-registration and business claim links (design approved by the owner, 2026-10-13).
-- NOT APPLIED to the live project. Staging first; production only with explicit approval.
--
-- Rule: an account proves control of an email inbox, never ownership of a business. Owner links
-- (business_members rows) are created only by:
--   1. a platform admin, for a confirmed account (admin_add_business_member, 20261013093006);
--   2. a single-use claim link a platform admin issued for that business (redeem_business_claim);
--   3. registering a NEW business, which starts as a draft until an admin activates it (register_business).
-- Matching a business's name or contact email grants nothing.
--
-- All three functions are SECURITY DEFINER because API roles cannot write business_members or read
-- auth.users; each checks the caller first. Errors use stable message keys the app maps to text.

-- Claim links ------------------------------------------------------------------------------------------
-- Only a SHA-256 of the token is stored. Lives in `private` (not exposed by the Data API); RLS on with no
-- policies as a second lock.
create table private.business_claims (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  token_hash  bytea not null unique,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  redeemed_by uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz
);
create index business_claims_business_id_idx on private.business_claims (business_id);
alter table private.business_claims enable row level security;
revoke all on table private.business_claims from public, anon, authenticated;

create function private.caller_email_confirmed()
returns boolean
language sql
stable
security definer -- reads auth.users
set search_path = ''
as $$
  select exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null)
$$;
revoke all on function private.caller_email_confirmed() from public, anon, authenticated;

-- Issues a claim link for a business and cancels any unused earlier one. Returns the token ONCE.
-- Token: two v4 UUIDs (~244 random bits from the server's strong RNG), hex only, so it is URL-safe.
create function public.admin_create_business_claim(p_business_id uuid)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires timestamptz := now() + interval '7 days';
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can manage business owners' using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id) then
    raise exception 'business_not_found' using errcode = 'P0002';
  end if;
  delete from private.business_claims c where c.business_id = p_business_id and c.redeemed_at is null;
  insert into private.business_claims (business_id, token_hash, created_by, expires_at)
  values (p_business_id, sha256(convert_to(v_token, 'UTF8')), auth.uid(), v_expires);
  return query select v_token, v_expires;
end;
$$;

-- Redeems a claim link: the signed-in, email-confirmed caller becomes an owner of that business.
-- Unknown, used and expired tokens all give the same error (no oracle). Returns the business id.
create function public.redeem_business_claim(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_claim private.business_claims;
begin
  if v_uid is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;
  if not private.caller_email_confirmed() then
    raise exception 'email_not_confirmed' using errcode = '42501';
  end if;
  select * into v_claim from private.business_claims c
    where c.token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'))
    for update;
  if v_claim.id is null or v_claim.redeemed_at is not null or v_claim.expires_at <= now() then
    raise exception 'claim_invalid' using errcode = 'P0002';
  end if;
  insert into public.business_members (business_id, user_id)
  values (v_claim.business_id, v_uid)
  on conflict (business_id, user_id) do nothing;
  update private.business_claims set redeemed_by = v_uid, redeemed_at = now() where id = v_claim.id;
  return v_claim.business_id;
end;
$$;

-- Registers a NEW business owned by the caller. Always a draft: invisible to the public (RLS needs
-- status 'active') and only a platform admin can activate it (guard_business_admin_fields).
-- One draft registration per account at a time, to limit spam and address squatting.
create function public.register_business(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;
  if not private.caller_email_confirmed() then
    raise exception 'email_not_confirmed' using errcode = '42501';
  end if;
  -- Serialise registrations per account so two parallel calls cannot both pass the one-draft check.
  perform pg_advisory_xact_lock(hashtext('register_business:' || v_uid::text));
  if exists (
    select 1 from public.business_members m join public.businesses b on b.id = m.business_id
    where m.user_id = v_uid and b.status = 'draft'
  ) then
    raise exception 'registration_pending' using errcode = 'P0001';
  end if;
  begin
    -- name/slug rules (length, format, reserved names) are the table's CHECK constraints.
    insert into public.businesses (name, slug, status) values (btrim(p_name), lower(btrim(p_slug)), 'draft')
    returning id into v_id;
  exception when unique_violation then
    raise exception 'slug_taken' using errcode = '23505';
  end;
  insert into public.business_members (business_id, user_id) values (v_id, v_uid);
  return v_id;
end;
$$;

revoke execute on function public.admin_create_business_claim(uuid) from public, anon;
revoke execute on function public.redeem_business_claim(text) from public, anon;
revoke execute on function public.register_business(text, text) from public, anon;
grant execute on function public.admin_create_business_claim(uuid) to authenticated;
grant execute on function public.redeem_business_claim(text) to authenticated;
grant execute on function public.register_business(text, text) to authenticated;

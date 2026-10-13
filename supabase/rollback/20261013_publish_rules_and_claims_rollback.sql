-- =============================================================================
-- ROLLBACK for 20261013093006_publish_rules and 20261013144121_owner_registration_and_claims.
-- NOT a migration: kept outside supabase/migrations so the CLI never runs it.
--
-- Data effects: drops private.business_claims (unused and used claim links). Keeps every business,
-- product and business_members row, including owners added by a claim link and draft businesses
-- registered by owners (remove those separately if wanted).
-- Restores admin_add_business_member WITHOUT the confirmed-email check (the pre-20261013 version).
-- The rls_auto_enable EXECUTE revoke is left in place (harmless hygiene).
-- =============================================================================

begin;

-- 20261013144121_owner_registration_and_claims
drop function if exists public.register_business(text, text);
drop function if exists public.redeem_business_claim(text);
drop function if exists public.admin_create_business_claim(uuid);
drop function if exists private.caller_email_confirmed();
drop table if exists private.business_claims;

-- 20261013093006_publish_rules
drop trigger if exists products_publish_requires_image on public.products;
drop trigger if exists product_images_publish_requires_image on public.product_images;
drop trigger if exists products_published_at on public.products;
drop function if exists private.products_publish_check();
drop function if exists private.product_images_publish_check();
drop function if exists private.products_set_published_at();
drop function if exists private.assert_publishable(uuid);

-- From 20261012200813_business_member_admin.sql
create or replace function public.admin_add_business_member(p_business_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can manage business owners' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if v_user is null then
    raise exception 'No account uses this email address' using errcode = 'P0002';
  end if;
  insert into public.business_members (business_id, user_id)
  values (p_business_id, v_user)
  on conflict (business_id, user_id) do nothing;
  return v_user;
end;
$$;

delete from supabase_migrations.schema_migrations where version in ('20261013093006', '20261013144121');

commit;

-- Server-side publish rules and account hygiene (audit 2026-10-13: P2-04, P1-08, P3-06).
-- Applied to pmnjchhrgvajtjpadpqo on 2026-10-13 with the owner's approval (comment-only update; SQL unchanged).
-- Verified against all earlier migrations in a disposable Postgres (supabase/tests/migrations.test.ts).
-- Pre-check on live (read-only, 2026-10-13): 0 of 18 published products lack a gallery image.

-- 1. A published product needs at least one gallery image ------------------------------------------
-- The UI checks this (services/validation.ts validateForPublish), but members can PATCH products and
-- product_images directly through the Data API. Constraint triggers are DEFERRED to commit, because
-- save_product deletes and re-inserts a product's images inside one transaction.
-- The exception message is a stable key the app maps to a field error (supabaseCatalogService DB_RULES).

create function private.assert_publishable(p_product uuid)
returns void
language plpgsql
security definer -- sees every image of the product whatever the caller's RLS view
set search_path = ''
as $$
begin
  if exists (select 1 from public.products p where p.id = p_product and p.status = 'published')
     and not exists (select 1 from public.product_images i where i.product_id = p_product and i.kind = 'gallery') then
    raise exception 'publish_requires_gallery_image' using errcode = 'check_violation';
  end if;
end;
$$;

create function private.products_publish_check()
returns trigger
language plpgsql
security definer -- callers have no access to the private schema
set search_path = ''
as $$
begin
  perform private.assert_publishable(new.id);
  return null;
end;
$$;

-- Fires for images that are removed, re-typed or moved. A deleted product (cascade) is gone by commit,
-- so the check passes and deleting a product is never blocked.
create function private.product_images_publish_check()
returns trigger
language plpgsql
security definer -- callers have no access to the private schema
set search_path = ''
as $$
begin
  perform private.assert_publishable(old.product_id);
  return null;
end;
$$;

create constraint trigger products_publish_requires_image
  after insert or update of status on public.products
  deferrable initially deferred
  for each row when (new.status = 'published')
  execute function private.products_publish_check();

create constraint trigger product_images_publish_requires_image
  after delete or update of kind, product_id on public.product_images
  deferrable initially deferred
  for each row
  execute function private.product_images_publish_check();

-- 2. published_at is set by the server ---------------------------------------------------------------
-- Stamped on the draft -> published transition; kept while a product stays published.
-- Clients can no longer back- or forward-date it.
create function private.products_set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' then
    if tg_op = 'INSERT' or old.status is distinct from 'published' then
      new.published_at := now();
    else
      new.published_at := old.published_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger products_published_at
  before insert or update on public.products
  for each row execute function private.products_set_published_at();

revoke all on function private.assert_publishable(uuid) from public;
revoke all on function private.products_publish_check() from public;
revoke all on function private.product_images_publish_check() from public;
revoke all on function private.products_set_published_at() from public;

-- 3. Owners can only be linked to accounts that confirmed their email ----------------------------------
-- Otherwise a stranger who signed up first with the owner's address would be made owner (audit P1-08).
create or replace function public.admin_add_business_member(p_business_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_confirmed timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can manage business owners' using errcode = '42501';
  end if;
  select id, email_confirmed_at into v_user, v_confirmed
    from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if v_user is null then
    raise exception 'No account uses this email address' using errcode = 'P0002';
  end if;
  if v_confirmed is null then
    raise exception 'This account has not confirmed its email address yet' using errcode = 'P0002';
  end if;
  insert into public.business_members (business_id, user_id)
  values (p_business_id, v_user)
  on conflict (business_id, user_id) do nothing;
  return v_user;
end;
$$;

-- 4. Hygiene: a platform-installed event-trigger helper is executable by API roles (advisor 0028/0029).
-- It cannot be called as an RPC (returns event_trigger); revoke anyway. Absent locally, so guarded.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

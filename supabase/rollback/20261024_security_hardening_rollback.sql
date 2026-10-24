-- =============================================================================
-- ROLLBACK for 20261024065538_security_hardening.
-- NOT a migration: kept outside supabase/migrations so the CLI never runs it.
--
-- Data effects: none. No rows are deleted or changed; audit rows of type business_slug_changed stay
-- (append-only history). Restores the pre-hardening grants, policies and function bodies.
-- After running it, remove the version from supabase_migrations.schema_migrations
-- (or `supabase migration repair --status reverted 20261024065538`).
-- =============================================================================

begin;

-- 1. Owner column limit, timestamps, https-only URLs
create or replace function public.guard_business_admin_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.slug is distinct from old.slug or new.status is distinct from old.status)
     and current_user in ('anon', 'authenticated')
     and not public.is_platform_admin() then
    raise exception 'Only platform admins can change a catalog address or status'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_business_admin_fields() from public, anon, authenticated;

grant update on public.businesses, public.products to authenticated;

create or replace function private.products_set_published_at()
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
revoke all on function private.products_set_published_at() from public;

alter table public.businesses     drop constraint if exists businesses_logo_url_https;
alter table public.product_images drop constraint if exists product_images_url_https;
alter table public.product_models drop constraint if exists product_models_url_https;

-- 2. Storage path: back to the first-segment check
alter policy "Members and admins write images" on public.product_images
  with check (exists (select 1 from public.products p where p.id = product_id
                      and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))
                      and (storage_path is null or split_part(storage_path, '/', 1) = p.business_id::text)));
alter policy "Members and admins write models" on public.product_models
  with check (exists (select 1 from public.products p where p.id = product_id
                      and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))
                      and (storage_path is null or split_part(storage_path, '/', 1) = p.business_id::text)));

-- 3. Integrity rules
alter table public.products         drop constraint if exists products_name_en_not_blank;
alter table public.product_variants drop constraint if exists product_variants_price_delta_nonneg;
drop index if exists public.product_images_one_primary_idx;
drop index if exists public.product_variant_images_one_primary_idx;

-- 4. Analytics recorder without the model check (20261012200810)
create or replace function public.record_event_limited(
  p_visitor_key text,
  p_product_id  uuid,
  p_business_id uuid,
  p_event_type  text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit  constant integer := 30;
  v_window timestamptz := date_trunc('minute', now());
  v_hits   integer;
begin
  if p_visitor_key is null or p_visitor_key !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;
  insert into private.analytics_hits as h (visitor_key, window_start)
  values (p_visitor_key, v_window)
  on conflict (visitor_key, window_start) do update set hits = h.hits + 1
  returning h.hits into v_hits;
  if random() < 0.02 then
    delete from private.analytics_hits where window_start < now() - interval '1 hour';
  end if;
  if v_hits > v_limit then
    return 'rate_limited';
  end if;
  if p_event_type is null or p_event_type not in ('view', 'ar_activation', 'model_interaction')
     or not exists (
       select 1 from public.products p
       join public.businesses b on b.id = p.business_id
       where p.id = p_product_id
         and p.business_id = p_business_id
         and p.status = 'published'
         and b.status = 'active'
     ) then
    return 'invalid';
  end if;
  insert into public.product_analytics (business_id, product_id, event_type)
  values (p_business_id, p_product_id, p_event_type);
  return 'recorded';
end;
$$;
revoke execute on function public.record_event_limited(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_event_limited(text, uuid, uuid, text) to service_role;

-- 5. Audit trigger without the slug event (20261020091428)
create or replace function private.audit_business_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.audit_events (event_type, actor_id, business_id, from_status, to_status)
    values ('business_status_changed', auth.uid(), new.id, old.status, new.status);
  elsif tg_op = 'DELETE' then
    insert into public.audit_events (event_type, actor_id, metadata)
    values ('business_deleted', auth.uid(), jsonb_build_object('business_id', old.id, 'name', old.name));
  end if;
  return null;
end;
$$;
revoke all on function private.audit_business_change() from public;

-- 6. Onboarding (20261020091428; single pending membership only)
create or replace function public.complete_owner_onboarding()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  if auth.uid() is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;
  update public.business_members
     set accepted_at = now()
   where user_id = auth.uid() and accepted_at is null
  returning business_id into v_business;
  if v_business is not null then
    insert into public.audit_events (event_type, actor_id, business_id)
    values ('owner_onboarding_completed', auth.uid(), v_business);
  else
    select business_id into v_business from public.business_members where user_id = auth.uid() limit 1;
  end if;
  return v_business;
end;
$$;
revoke execute on function public.complete_owner_onboarding() from public, anon;
grant execute on function public.complete_owner_onboarding() to authenticated;

delete from supabase_migrations.schema_migrations where version = '20261024065538';

commit;

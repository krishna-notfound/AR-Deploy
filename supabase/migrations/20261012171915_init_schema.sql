-- =============================================================================
-- init_schema: multi-tenant catalog schema, RLS policies and Data API grants.
--
-- Safe to review before applying: it only creates new objects in `public`
-- (no drops, no data changes). Apply with `supabase db push` or the SQL editor.
--
-- Access model
--   * anon             reads active businesses and their published products only,
--                      and may record view / AR events for published products.
--   * business owners  (rows in business_members) manage their own business data.
--   * platform admins  (rows in platform_admins) manage everything.
--     platform_admins has NO write policies: add admins manually, e.g.
--       insert into public.platform_admins (user_id)
--       select id from auth.users where email = 'you@example.com';
--   Never derive roles from user_metadata (user-editable).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.businesses (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(btrim(name)) between 1 and 80),
  slug             text not null unique
                   check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 63),
  -- URLs are rendered as href/src on public pages: only http(s) (blocks javascript:/data:).
  logo_url         text check (logo_url ~* '^https?://' and char_length(logo_url) <= 2048),
  description      text not null default '' check (char_length(description) <= 5000),
  contact_email    text check (char_length(contact_email) <= 320),
  contact_phone    text check (char_length(contact_phone) <= 50),
  contact_website  text check (contact_website ~* '^https?://' and char_length(contact_website) <= 2048),
  contact_address  text check (char_length(contact_address) <= 500),
  status           text not null default 'draft' check (status in ('active', 'inactive', 'draft')),
  accent_color     text not null default '#B4441A' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  default_currency text not null default 'EUR' check (default_currency in ('EUR', 'BRL', 'USD')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Super Admin source of truth. Managed only via SQL editor / service role.
create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner')),
  created_at  timestamptz not null default now(),
  unique (business_id, user_id)
);
create index business_members_user_id_idx on public.business_members (user_id);

create table public.products (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  slug              text not null
                    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 70),
  -- Localized text: {"en": "...", "pt": "..."}; pt optional (ADR-0004).
  -- Size caps (bytes of the JSON text) stop oversized payloads through the public API.
  name              jsonb not null check (jsonb_typeof(name) = 'object' and name ? 'en'
                                          and octet_length(name::text) <= 1000),
  short_description jsonb not null default '{"en":""}'
                    check (jsonb_typeof(short_description) = 'object' and short_description ? 'en'
                           and octet_length(short_description::text) <= 2000),
  description       jsonb not null default '{"en":""}'
                    check (jsonb_typeof(description) = 'object' and description ? 'en'
                           and octet_length(description::text) <= 20000),
  material          jsonb not null default '{"en":""}'
                    check (jsonb_typeof(material) = 'object' and material ? 'en'
                           and octet_length(material::text) <= 2000),
  cta_label         jsonb not null default '{"en":""}'
                    check (jsonb_typeof(cta_label) = 'object' and cta_label ? 'en'
                           and octet_length(cta_label::text) <= 500),
  category          text not null
                    check (category in ('sofa', 'chair', 'table', 'bed', 'storage', 'lighting', 'decor')),
  price             integer not null check (price >= 0), -- minor units (ADR-0003)
  currency          text not null check (currency in ('EUR', 'BRL', 'USD')),
  status            text not null default 'draft' check (status in ('draft', 'published')),
  width             numeric(8, 2) not null check (width >= 0),
  height            numeric(8, 2) not null check (height >= 0),
  depth             numeric(8, 2) not null check (depth >= 0),
  dimension_unit    text not null check (dimension_unit in ('cm', 'in')),
  weight_value      numeric(8, 2) check (weight_value > 0),
  weight_unit       text check (weight_unit in ('kg', 'lb')),
  cta_url           text check (cta_url ~* '^https?://' and char_length(cta_url) <= 2048),
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((weight_value is null) = (weight_unit is null)),
  -- Publishing invariants (mirrors validateForPublish in the app).
  check (status <> 'published'
         or (price > 0 and width > 0 and height > 0 and depth > 0 and name ->> 'en' <> '')),
  unique (business_id, slug),
  unique (id, business_id) -- target of the composite FK from product_analytics
);
create index products_business_id_status_idx on public.products (business_id, status);

-- Exactly one of url (external) or storage_path (object in the product-media bucket).
create table public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  url          text check (url ~* '^(https?://|/[^/])' and char_length(url) <= 2048),
  storage_path text check (char_length(storage_path) <= 512),
  alt          text check (char_length(alt) <= 300),
  is_primary   boolean not null default false,
  kind         text not null default 'gallery' check (kind in ('gallery', 'additional')),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  check ((url is null) <> (storage_path is null))
);
create index product_images_product_id_sort_idx on public.product_images (product_id, sort_order);
create index product_images_storage_path_idx on public.product_images (storage_path);

create table public.product_models (
  product_id   uuid not null references public.products (id) on delete cascade,
  format       text not null check (format in ('glb', 'usdz')),
  url          text check (url ~* '^(https?://|/[^/])' and char_length(url) <= 2048),
  storage_path text check (char_length(storage_path) <= 512),
  file_name    text not null check (char_length(file_name) <= 255),
  size_bytes   bigint check (size_bytes >= 0),
  created_at   timestamptz not null default now(),
  primary key (product_id, format),
  check ((url is null) <> (storage_path is null))
);
create index product_models_storage_path_idx on public.product_models (storage_path);

create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  name        jsonb not null check (jsonb_typeof(name) = 'object' and name ? 'en'
                                    and octet_length(name::text) <= 500),
  color_hex   text check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  sku         text check (char_length(sku) <= 100),
  price_delta integer, -- minor units, added to the base price
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index product_variants_product_id_sort_idx on public.product_variants (product_id, sort_order);

-- Raw events. No personal data (no user id, IP or user agent).
create table public.product_analytics (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  product_id  uuid not null,
  event_type  text not null check (event_type in ('view', 'ar_activation')),
  created_at  timestamptz not null default now(),
  foreign key (product_id, business_id) references public.products (id, business_id) on delete cascade
);
create index product_analytics_business_created_idx on public.product_analytics (business_id, created_at);
create index product_analytics_product_created_idx on public.product_analytics (product_id, created_at);

-- Daily aggregates. security_invoker: callers only see rows RLS lets them see.
create view public.product_analytics_daily
with (security_invoker = true) as
select
  business_id,
  product_id,
  (created_at at time zone 'utc')::date as day,
  count(*) filter (where event_type = 'view') as views,
  count(*) filter (where event_type = 'ar_activation') as ar_activations
from public.product_analytics
group by business_id, product_id, (created_at at time zone 'utc')::date;

-- ---------------------------------------------------------------------------
-- Helper functions (security invoker: they read only the caller's own rows)
-- ---------------------------------------------------------------------------

create function public.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

create function public.is_business_member(bid uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members
    where business_id = bid and user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.is_business_member(uuid) from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.is_business_member(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger businesses_set_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- Owners may edit their business profile, but not its catalog address or status.
-- Applies to Data API roles only; trusted roles (postgres, service_role) are not blocked.
create function public.guard_business_admin_fields()
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

create trigger businesses_guard_admin_fields before update on public.businesses
  for each row execute function public.guard_business_admin_fields();

-- Trigger functions are not part of the API.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.guard_business_admin_fields() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.businesses        enable row level security;
alter table public.platform_admins   enable row level security;
alter table public.business_members  enable row level security;
alter table public.products          enable row level security;
alter table public.product_images    enable row level security;
alter table public.product_models    enable row level security;
alter table public.product_variants  enable row level security;
alter table public.product_analytics enable row level security;

-- businesses
create policy "Active businesses are public" on public.businesses
  for select to anon, authenticated
  using (status = 'active');
create policy "Members and admins read their businesses" on public.businesses
  for select to authenticated
  using ((select public.is_platform_admin()) or public.is_business_member(id));
create policy "Admins create businesses" on public.businesses
  for insert to authenticated
  with check ((select public.is_platform_admin()));
create policy "Members and admins update businesses" on public.businesses
  for update to authenticated
  using ((select public.is_platform_admin()) or public.is_business_member(id))
  with check ((select public.is_platform_admin()) or public.is_business_member(id));
create policy "Admins delete businesses" on public.businesses
  for delete to authenticated
  using ((select public.is_platform_admin()));

-- platform_admins: users can only see whether they themselves are an admin.
create policy "Users read own admin row" on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- business_members
create policy "Users read own memberships" on public.business_members
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_admin()));
create policy "Admins add members" on public.business_members
  for insert to authenticated
  with check ((select public.is_platform_admin()));
create policy "Admins update members" on public.business_members
  for update to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
create policy "Admins remove members" on public.business_members
  for delete to authenticated
  using ((select public.is_platform_admin()));

-- products
create policy "Published products of active businesses are public" on public.products
  for select to anon, authenticated
  using (
    status = 'published'
    and exists (select 1 from public.businesses b where b.id = business_id and b.status = 'active')
  );
create policy "Members and admins read products" on public.products
  for select to authenticated
  using ((select public.is_platform_admin()) or public.is_business_member(business_id));
create policy "Members and admins create products" on public.products
  for insert to authenticated
  with check ((select public.is_platform_admin()) or public.is_business_member(business_id));
create policy "Members and admins update products" on public.products
  for update to authenticated
  using ((select public.is_platform_admin()) or public.is_business_member(business_id))
  with check ((select public.is_platform_admin()) or public.is_business_member(business_id));
create policy "Members and admins delete products" on public.products
  for delete to authenticated
  using ((select public.is_platform_admin()) or public.is_business_member(business_id));

-- product children: visible when the parent product is visible (products RLS applies
-- inside the subquery); writable by the product's members and platform admins.
create policy "Images follow product visibility" on public.product_images
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy "Members and admins write images" on public.product_images
  for all to authenticated
  using (exists (select 1 from public.products p where p.id = product_id
                 and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))))
  -- A stored file must sit in the product's own business folder; otherwise a product
  -- could reference (and so publish) another business's private upload.
  with check (exists (select 1 from public.products p where p.id = product_id
                      and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))
                      and (storage_path is null or split_part(storage_path, '/', 1) = p.business_id::text)));

create policy "Models follow product visibility" on public.product_models
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy "Members and admins write models" on public.product_models
  for all to authenticated
  using (exists (select 1 from public.products p where p.id = product_id
                 and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))))
  -- A stored file must sit in the product's own business folder; otherwise a product
  -- could reference (and so publish) another business's private upload.
  with check (exists (select 1 from public.products p where p.id = product_id
                      and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))
                      and (storage_path is null or split_part(storage_path, '/', 1) = p.business_id::text)));

create policy "Variants follow product visibility" on public.product_variants
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy "Members and admins write variants" on public.product_variants
  for all to authenticated
  using (exists (select 1 from public.products p where p.id = product_id
                 and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))))
  with check (exists (select 1 from public.products p where p.id = product_id
                      and ((select public.is_platform_admin()) or public.is_business_member(p.business_id))));

-- product_analytics: anyone may record an event for a visible published product;
-- only members and admins can read. No update/delete policies.
create policy "Record events for published products" on public.product_analytics
  for insert to anon, authenticated
  with check (exists (select 1 from public.products p
                      where p.id = product_id
                        and p.business_id = product_analytics.business_id
                        and p.status = 'published'));
create policy "Members and admins read analytics" on public.product_analytics
  for select to authenticated
  using ((select public.is_platform_admin()) or public.is_business_member(business_id));

-- ---------------------------------------------------------------------------
-- Data API grants (tables are not exposed automatically; revoke first so older
-- projects with permissive default privileges end up in the same state).
-- ---------------------------------------------------------------------------

revoke all on public.businesses, public.platform_admins, public.business_members,
  public.products, public.product_images, public.product_models, public.product_variants,
  public.product_analytics, public.product_analytics_daily
  from anon, authenticated;

grant select on public.businesses to anon;
grant select, insert, update, delete on public.businesses to authenticated;

grant select on public.platform_admins to authenticated;

grant select, insert, update, delete on public.business_members to authenticated;

grant select on public.products, public.product_images, public.product_models, public.product_variants to anon;
grant select, insert, update, delete
  on public.products, public.product_images, public.product_models, public.product_variants
  to authenticated;

-- Column-level insert: callers cannot set id or created_at (no back-dated or future events).
grant insert (business_id, product_id, event_type) on public.product_analytics to anon, authenticated;
grant select on public.product_analytics to authenticated;

grant select on public.product_analytics_daily to authenticated;

grant all on public.businesses, public.platform_admins, public.business_members,
  public.products, public.product_images, public.product_models, public.product_variants,
  public.product_analytics, public.product_analytics_daily
  to service_role;

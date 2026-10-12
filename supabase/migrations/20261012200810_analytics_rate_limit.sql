-- =============================================================================
-- analytics_rate_limit: public view / AR events go through the `track-event` Edge
-- Function, which rate-limits per hashed visitor key. Direct inserts from the
-- browser are removed so the limiter cannot be bypassed.
--
-- Safe to review before applying: adds the model_interaction event type (constraint + view column),
-- creates a private schema, one table, one function;
-- revokes anon/authenticated INSERT on product_analytics and drops its insert policy.
-- No data is deleted. Deploy the Edge Function together with this migration
-- (design/20 "Analytics protection"); until it is deployed, events are not recorded.
--
-- Privacy: only a SHA-256 hex digest of (ip | utc date | secret salt) is stored, for at
-- most ~1 hour. No IP address, user agent or user id is stored anywhere.
-- =============================================================================

-- 3D-viewer interaction is a third event type (first rotate/zoom per product page view).
alter table public.product_analytics
  drop constraint product_analytics_event_type_check,
  add constraint product_analytics_event_type_check
    check (event_type in ('view', 'ar_activation', 'model_interaction'));

-- Same view plus one appended column (create or replace keeps grants and existing columns).
create or replace view public.product_analytics_daily
with (security_invoker = true) as
select
  business_id,
  product_id,
  (created_at at time zone 'utc')::date as day,
  count(*) filter (where event_type = 'view') as views,
  count(*) filter (where event_type = 'ar_activation') as ar_activations,
  count(*) filter (where event_type = 'model_interaction') as model_interactions
from public.product_analytics
group by business_id, product_id, (created_at at time zone 'utc')::date;

-- Covers the composite FK (product_id, business_id) → products; flagged by the performance advisor.
create index product_analytics_product_business_idx on public.product_analytics (product_id, business_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.analytics_hits (
  visitor_key  text        not null check (visitor_key ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits         integer     not null default 1,
  primary key (visitor_key, window_start)
);
create index analytics_hits_window_start_idx on private.analytics_hits (window_start);
-- Not exposed through the Data API (private schema); RLS as defence in depth, no policies.
alter table private.analytics_hits enable row level security;

-- Records one event if the visitor is under the limit and the product is public.
-- Returns 'recorded', 'rate_limited' or 'invalid'. Every call, valid or not, counts
-- against the visitor's limit, so invalid spam is throttled too.
-- SECURITY DEFINER because callers (service_role via the Edge Function) need to write
-- into the private schema; EXECUTE is granted to service_role only.
create function public.record_event_limited(
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
  v_limit  constant integer := 30; -- events per visitor key per minute
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

  -- Opportunistic cleanup keeps the table to roughly the last hour.
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

-- Close the direct path: browsers can no longer insert events themselves.
-- (Revoking the table privilege also revokes the earlier column-level INSERT grants.)
drop policy "Record events for published products" on public.product_analytics;
revoke insert on public.product_analytics from anon, authenticated;

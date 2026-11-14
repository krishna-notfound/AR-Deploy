-- QA round of 2026-11-14, edge functions (docs/qa/2026-11-14-edge-functions.md). Two small changes; nothing is deleted.
--
-- 1. EF-3: one decision email per rejection. admin_review_application answers a second, concurrent reject with the unchanged
--    row, so both requests saw "rejected" and both emailed the applicant. service_claim_decision_email lets exactly one
--    request claim the rejection (application id + the moment it was reviewed); a reopen and a new rejection is a new claim.
-- 2. EF-4: a push subscription endpoint must be a known push service host (FCM, Mozilla, Apple, Windows). The Edge Function
--    sends to the stored endpoint, so an endpoint of the user's choosing would make it request any address. The constraint is
--    NOT VALID: it is enforced for every new row and every changed row, and existing rows are left alone (the sender and
--    notify() refuse and drop a bad one too). The hosts are the same list as isAllowedPushEndpoint in _shared/notify.ts.

-- ---------------------------------------------------------------------------
-- 1. One claim per rejection
-- ---------------------------------------------------------------------------

create table private.application_decision_emails (
  application_id uuid        not null references public.business_applications (id) on delete cascade,
  reviewed_at    timestamptz not null,
  claimed_at     timestamptz not null default now(),
  primary key (application_id, reviewed_at)
);
alter table private.application_decision_emails enable row level security;
revoke all on private.application_decision_emails from public, anon, authenticated;

-- True for the one caller that may send the decision email of the application's current rejection. False when the
-- application is not rejected, or when the email of this rejection (same reviewed_at) was already claimed.
create function public.service_claim_decision_email(p_application_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
  v_n  integer;
begin
  select a.reviewed_at into v_at
    from public.business_applications a
   where a.id = p_application_id and a.status = 'rejected';
  if v_at is null then
    return false;
  end if;
  -- The primary key decides: a concurrent claim waits for this transaction, then inserts nothing.
  insert into private.application_decision_emails (application_id, reviewed_at)
  values (p_application_id, v_at)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;
revoke execute on function public.service_claim_decision_email(uuid) from public, anon, authenticated;
grant execute on function public.service_claim_decision_email(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Push endpoints on known push services only
-- ---------------------------------------------------------------------------

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_host_check
  check (endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.notify\.windows\.com)(/|$)')
  not valid;

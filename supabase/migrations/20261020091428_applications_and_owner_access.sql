-- Phase 2: business applications, admin review, one owner per business, audit trail (ADR-0024).
-- Supersedes ADR-0022: removes self-registration and claim links; owners are provisioned by platform admins only.
--
-- Lifecycle: application submitted (public, through the submit-application Edge Function)
--   → under_review → approved (a draft business is created, not public) / rejected (reason kept)
--   → admin provisions the single owner (provision-owner Edge Function, Supabase Auth invite link)
--   → owner sets a password and completes onboarding (complete_owner_onboarding).
-- Pending and rejected applications never become businesses, so they can never appear in a public catalogue.

-- 1. Remove self-service registration and claim links (ADR-0022), and the old link-by-email path.
drop function if exists public.register_business(text, text);
drop function if exists public.redeem_business_claim(text);
drop function if exists public.admin_create_business_claim(uuid);
drop function if exists public.admin_add_business_member(uuid, text);
drop table if exists private.business_claims;
drop function if exists private.caller_email_confirmed();

-- 2. Exactly one owner per business; invitation state on the membership.
create unique index business_members_one_owner_idx on public.business_members (business_id);
alter table public.business_members
  add column invited_at  timestamptz,
  add column accepted_at timestamptz;
update public.business_members set accepted_at = created_at where accepted_at is null;

-- 3. Applications.
create table public.business_applications (
  id              uuid primary key default gen_random_uuid(),
  -- Short reference shown to the applicant and searchable by admins.
  reference       text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  status          text not null default 'submitted' check (status in ('submitted', 'under_review', 'approved', 'rejected')),
  business_name   text not null check (char_length(btrim(business_name)) between 2 and 80),
  applicant_name  text not null check (char_length(btrim(applicant_name)) between 2 and 120),
  applicant_email text not null check (char_length(applicant_email) <= 320 and applicant_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  applicant_phone text check (char_length(applicant_phone) <= 50),
  website         text check (char_length(website) <= 2048 and website ~* '^https?://'),
  country         text not null check (char_length(btrim(country)) between 2 and 80),
  city            text not null check (char_length(btrim(city)) between 1 and 80),
  category        text not null check (char_length(btrim(category)) between 2 and 80),
  language        text not null default 'en' check (language in ('en', 'pt')),
  -- Remaining answers (description, catalogue readiness, notes); validated by the Edge Function.
  answers         jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 16384),
  -- Idempotency: the same wizard submission (double click, retry after a network error) creates one row.
  submission_key  uuid not null unique,
  -- Salted daily hash of the submitter's IP, used only for rate limiting (raw IPs are never stored).
  submitter_hash  text,
  decision_reason text check (char_length(decision_reason) <= 1000),
  reviewed_by     uuid references auth.users (id) on delete set null,
  reviewed_at     timestamptz,
  business_id     uuid unique references public.businesses (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index business_applications_status_created_idx on public.business_applications (status, created_at desc);
create index business_applications_created_idx on public.business_applications (created_at desc);
create index business_applications_email_idx on public.business_applications (lower(applicant_email));
create index business_applications_submitter_idx on public.business_applications (submitter_hash, created_at);
create index business_applications_reviewed_by_idx on public.business_applications (reviewed_by);
create trigger business_applications_set_updated_at before update on public.business_applications
  for each row execute function public.set_updated_at();

alter table public.business_applications enable row level security;
revoke all on public.business_applications from public, anon, authenticated;
grant select on public.business_applications to authenticated;
grant select, insert on public.business_applications to service_role;
create policy "Platform admins read applications"
  on public.business_applications for select to authenticated
  using ((select public.is_platform_admin()));

-- 4. Audit trail: append-only, written only by the definer functions below and the Edge Functions.
create table public.audit_events (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  event_type     text not null check (event_type ~ '^[a-z_]{3,60}$'),
  -- null = the system (e.g. a public submission); otherwise the signed-in user who acted.
  actor_id       uuid references auth.users (id) on delete set null,
  application_id uuid references public.business_applications (id) on delete cascade,
  business_id    uuid references public.businesses (id) on delete set null,
  from_status    text check (char_length(from_status) <= 40),
  to_status      text check (char_length(to_status) <= 40),
  metadata       jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096)
);
create index audit_events_created_idx on public.audit_events (created_at desc);
create index audit_events_application_idx on public.audit_events (application_id, created_at);
create index audit_events_business_idx on public.audit_events (business_id, created_at);
create index audit_events_actor_idx on public.audit_events (actor_id);
create index audit_events_type_idx on public.audit_events (event_type);

alter table public.audit_events enable row level security;
revoke all on public.audit_events from public, anon, authenticated, service_role;
grant select on public.audit_events to authenticated;
grant select, insert on public.audit_events to service_role;
create policy "Platform admins read audit events"
  on public.audit_events for select to authenticated
  using ((select public.is_platform_admin()));

-- 5. Email log: link attempts to applications and group them per logical email ("workflow").
alter table public.email_log
  add column application_id uuid references public.business_applications (id) on delete set null,
  add column workflow       text check (char_length(workflow) <= 120),
  add column attempt        integer not null default 1 check (attempt between 1 and 100);
alter table public.email_log drop constraint email_log_status_check;
alter table public.email_log add constraint email_log_status_check
  check (status in ('blocked', 'failed', 'accepted', 'sent', 'delivered', 'delayed', 'bounced', 'complained'));
create index email_log_application_idx on public.email_log (application_id);
create index email_log_workflow_idx on public.email_log (workflow, created_at);

-- Resend webhook events already processed (svix message id), so redeliveries change nothing.
create table private.email_provider_events (
  svix_id             text primary key check (char_length(svix_id) <= 200),
  received_at         timestamptz not null default now(),
  provider_message_id text,
  event_type          text not null
);
alter table private.email_provider_events enable row level security;
revoke all on private.email_provider_events from public, anon, authenticated;

-- 6. Helpers.
-- Catalogue address from a business name: lower-case ASCII, hyphens, unique, not reserved.
create function private.unique_business_slug(p_name text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_base text;
  v_slug text;
  v_n    integer := 1;
begin
  v_base := lower(translate(btrim(p_name),
    'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝýÿ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyy'));
  v_base := btrim(regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'), '-');
  v_base := btrim(left(v_base, 55), '-');
  if v_base = '' or v_base in ('www', 'admin', 'app', 'api', 'demo', 'login', 'mail', 'assets', 'static', 'cdn') then
    v_base := 'business-' || v_base;
    v_base := btrim(v_base, '-');
  end if;
  v_slug := v_base;
  while exists (select 1 from public.businesses where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;
revoke all on function private.unique_business_slug(text) from public;

-- 7. Admin review: one transaction for the status change, the business it creates and the audit entries.
-- Repeating the same action is a no-op (double clicks, retries).
create function public.admin_review_application(p_application_id uuid, p_action text, p_reason text default null)
returns public.business_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app    public.business_applications;
  v_new    text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_biz    uuid;
  v_old    text;
begin
  if not public.is_platform_admin() then
    raise exception 'platform_admin_only' using errcode = '42501';
  end if;
  select * into v_app from public.business_applications where id = p_application_id for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;
  v_new := case p_action when 'start_review' then 'under_review' when 'approve' then 'approved' when 'reject' then 'rejected' end;
  if v_new is null then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  if v_app.status = v_new then
    return v_app;
  end if;
  v_old := v_app.status;
  if not ((v_app.status = 'submitted' and v_new in ('under_review', 'approved', 'rejected'))
       or (v_app.status = 'under_review' and v_new in ('approved', 'rejected'))
       or (v_app.status = 'rejected' and v_new = 'under_review')) then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  if v_new = 'rejected' and v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  if v_new = 'approved' then
    -- A draft business: not public until the catalogue is activated. Contact fields stay empty on purpose:
    -- the applicant's private email/phone must not become public catalogue contacts.
    insert into public.businesses (name, slug, description, status)
    values (btrim(v_app.business_name), private.unique_business_slug(v_app.business_name),
            left(coalesce(v_app.answers ->> 'description', ''), 5000), 'draft')
    returning id into v_biz;
    insert into public.audit_events (event_type, actor_id, application_id, business_id, metadata)
    values ('business_created', auth.uid(), v_app.id, v_biz, jsonb_build_object('source', 'application'));
  end if;

  update public.business_applications
     set status = v_new,
         decision_reason = case when v_new in ('approved', 'rejected') then v_reason else decision_reason end,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         business_id = coalesce(v_biz, business_id)
   where id = v_app.id
  returning * into v_app;

  insert into public.audit_events (event_type, actor_id, application_id, business_id, from_status, to_status, metadata)
  values ('application_status_changed', auth.uid(), v_app.id, v_app.business_id, v_old, v_new,
          case when v_reason is not null then jsonb_build_object('reason', v_reason) else '{}'::jsonb end);
  return v_app;
end;
$$;
revoke execute on function public.admin_review_application(uuid, text, text) from public, anon;
grant execute on function public.admin_review_application(uuid, text, text) to authenticated;

-- Owners of a business with their invitation state (platform admins only).
drop function public.admin_list_business_members(uuid);
create function public.admin_list_business_members(p_business_id uuid)
returns table (user_id uuid, email text, created_at timestamptz, invited_at timestamptz, accepted_at timestamptz, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform_admin_only' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.created_at, m.invited_at, m.accepted_at, u.last_sign_in_at
    from public.business_members m
    join auth.users u on u.id = m.user_id
    where m.business_id = p_business_id
    order by m.created_at;
end;
$$;
revoke execute on function public.admin_list_business_members(uuid) from public, anon;
grant execute on function public.admin_list_business_members(uuid) to authenticated, service_role;

-- 8. Server-only helpers for the provision-owner Edge Function (service role only; never callable by browsers).
create function public.service_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
$$;
revoke execute on function public.service_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.service_user_id_by_email(text) to service_role;

-- Links the single owner. Returns 'linked' or 'already_linked'; raises when another account owns the business.
create function public.service_link_owner(p_business_id uuid, p_user_id uuid, p_actor uuid, p_application_id uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
begin
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'business_not_found' using errcode = 'P0002';
  end if;
  select user_id into v_existing from public.business_members where business_id = p_business_id for update;
  if v_existing is not null then
    if v_existing = p_user_id then
      return 'already_linked';
    end if;
    raise exception 'business_has_owner' using errcode = '23505';
  end if;
  insert into public.business_members (business_id, user_id, invited_at) values (p_business_id, p_user_id, now());
  insert into public.audit_events (event_type, actor_id, application_id, business_id, metadata)
  values ('owner_provisioned', p_actor, p_application_id, p_business_id, '{}'::jsonb);
  return 'linked';
end;
$$;
revoke execute on function public.service_link_owner(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.service_link_owner(uuid, uuid, uuid, uuid) to service_role;

-- Records one Resend webhook event exactly once and moves the email_log row forward (never backwards).
create function public.service_record_email_event(p_svix_id text, p_provider_message_id text, p_event_type text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new  text;
  v_rank constant jsonb := '{"blocked":0,"failed":1,"accepted":1,"sent":2,"delayed":3,"delivered":4,"bounced":4,"complained":5}';
begin
  insert into private.email_provider_events (svix_id, provider_message_id, event_type)
  values (p_svix_id, p_provider_message_id, p_event_type)
  on conflict (svix_id) do nothing;
  if not found then
    return false;
  end if;
  v_new := case p_event_type
    when 'email.sent' then 'sent'
    when 'email.delivered' then 'delivered'
    when 'email.delivery_delayed' then 'delayed'
    when 'email.bounced' then 'bounced'
    when 'email.complained' then 'complained'
    when 'email.failed' then 'failed'
  end;
  if v_new is not null then
    update public.email_log
       set status = v_new, updated_at = now()
     where provider_message_id = p_provider_message_id
       and (v_rank ->> v_new)::int >= (v_rank ->> status)::int;
  end if;
  return true;
end;
$$;
revoke execute on function public.service_record_email_event(text, text, text) from public, anon, authenticated;
grant execute on function public.service_record_email_event(text, text, text) to service_role;

-- 9. The invited owner finishes onboarding (after setting a password from the invitation link).
create function public.complete_owner_onboarding()
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

-- 10. Administrative changes made directly through the Data API are audited too.
create function private.audit_business_change()
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
create trigger businesses_audit after update or delete on public.businesses
  for each row execute function private.audit_business_change();

create function private.audit_owner_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (event_type, actor_id, business_id, metadata)
  values ('owner_removed', auth.uid(),
          case when exists (select 1 from public.businesses where id = old.business_id) then old.business_id end,
          jsonb_build_object('user_id', old.user_id));
  return null;
end;
$$;
revoke all on function private.audit_owner_removed() from public;
create trigger business_members_audit_delete after delete on public.business_members
  for each row execute function private.audit_owner_removed();

-- 11. Emails of the users named in audit entries (actor ids), for the admin activity views.
create function public.admin_user_emails(p_ids uuid[])
returns table (id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform_admin_only' using errcode = '42501';
  end if;
  return query select u.id, u.email::text from auth.users u where u.id = any (p_ids[1:200]);
end;
$$;
revoke execute on function public.admin_user_emails(uuid[]) from public, anon;
grant execute on function public.admin_user_emails(uuid[]) to authenticated;

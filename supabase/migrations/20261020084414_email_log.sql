-- Email log (design/23-email.md). One row per email the platform tries to send through Resend.
-- Written only by Edge Functions with the service role; platform admins can read it; nobody else can see it.
--
-- status records provider evidence only, never an assumption:
--   blocked   the platform refused to send (e.g. recipient not allowed with the Resend test sender)
--   failed    Resend rejected the request (error holds Resend's message)
--   accepted  Resend returned a message id; this is NOT delivery
--   delivered / delayed / bounced / complained   only from Resend's own event data for that message id
-- recipient is personal data: keep it only as long as needed (retention to be set with the client, see the compliance checklist).

create table public.email_log (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  kind                text not null
                      check (kind in ('owner_invitation', 'invitation_resend', 'application_confirmation', 'admin_notification', 'test')),
  recipient           text not null check (length(recipient) between 3 and 320),
  subject             text not null check (length(subject) between 1 and 300),
  status              text not null
                      check (status in ('blocked', 'failed', 'accepted', 'delivered', 'delayed', 'bounced', 'complained')),
  provider            text not null default 'resend',
  provider_message_id text unique,
  error               text,
  business_id         uuid references public.businesses (id) on delete set null,
  triggered_by        uuid references auth.users (id) on delete set null
);

create index email_log_created_at_idx on public.email_log (created_at desc);
create index email_log_business_id_idx on public.email_log (business_id);
create index email_log_triggered_by_idx on public.email_log (triggered_by);

alter table public.email_log enable row level security;

-- Explicit grants: the API roles can read (RLS then limits rows to platform admins) and never write.
revoke all on public.email_log from public, anon, authenticated;
grant select on public.email_log to authenticated;
grant select, insert, update on public.email_log to service_role;

create policy "Platform admins read the email log"
  on public.email_log for select
  to authenticated
  using ((select public.is_platform_admin()));

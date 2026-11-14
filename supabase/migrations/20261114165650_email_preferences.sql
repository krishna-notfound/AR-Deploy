-- Email preferences (ADR-0078): which optional emails a person gets.
-- Rollback: supabase/rollback/20261114_email_preferences_rollback.sql
--
--   1. notification_prefs gets one boolean per optional email type, all on by default. A person with no row has everything
--      on (the Edge Functions treat a missing row that way). The table's own security stays as it is: row-level security
--      limits each person to their own row, and the grants are on the table, so the new columns follow them.
--   2. People who had switched "new application" alerts off in their profile (profiles.notify_new_applications = false)
--      keep that choice: the same switch is now the Email switch of the "New applications" row, so their row says off.
--   3. email_log accepts the new staff email kind model_request_staff.
-- Security codes and notices, invitations, applicant emails, closure requests and test emails are not optional and have no column.

-- ---------------------------------------------------------------------------
-- 1. The five switches
-- ---------------------------------------------------------------------------

alter table public.notification_prefs
  add column email_new_application      boolean not null default true,
  add column email_new_model_request    boolean not null default true,
  add column email_company_updates      boolean not null default true,
  add column email_model_request_updates boolean not null default true,
  add column email_business_notices     boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Carry over the profile switch
-- ---------------------------------------------------------------------------

insert into public.notification_prefs (user_id, email_new_application)
select p.user_id, false
  from public.profiles p
 where p.notify_new_applications = false
on conflict (user_id) do update set email_new_application = false;

-- ---------------------------------------------------------------------------
-- 3. The staff email for a new 3D model request
-- ---------------------------------------------------------------------------

alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('owner_invitation', 'invitation_resend', 'application_confirmation', 'admin_notification', 'team_invitation', 'test',
                  'security_code', 'security_notice', 'closure_request',
                  'application_decision', 'business_notice', 'team_notice',
                  'model_request_update', 'model_request_staff'));

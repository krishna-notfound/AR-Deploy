-- Rollback of 20261114165650_email_preferences.sql (ADR-0078). Run only with the owner's go-ahead, after the Edge Functions
-- of this release are rolled back (the old ones do not read these columns, and a function that still reads them would fail).
--
-- Drops the five email switches (people lose those choices; the other notification switches and the phone and language
-- settings are untouched). profiles.notify_new_applications was never changed by the migration, so the old switch is exactly
-- what it was. email_log rows are kept: the kind check goes back to the 13 earlier kinds unless a model_request_staff row
-- exists, in which case the wider check stays (the function that wrote them is gone with the release).

alter table public.notification_prefs
  drop column if exists email_new_application,
  drop column if exists email_new_model_request,
  drop column if exists email_company_updates,
  drop column if exists email_model_request_updates,
  drop column if exists email_business_notices;

do $$
begin
  if not exists (select 1 from public.email_log where kind = 'model_request_staff') then
    alter table public.email_log drop constraint email_log_kind_check;
    alter table public.email_log add constraint email_log_kind_check
      check (kind in ('owner_invitation', 'invitation_resend', 'application_confirmation', 'admin_notification', 'team_invitation', 'test',
                      'security_code', 'security_notice', 'closure_request',
                      'application_decision', 'business_notice', 'team_notice',
                      'model_request_update'));
  end if;
end;
$$;

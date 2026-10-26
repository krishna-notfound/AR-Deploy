# MAIL audit (emails, email log, webhook, audit/history trail)
Scope read: `supabase/functions/_shared/{email,email-templates,application,team,http}.ts`, every `supabase/functions/*/handler.ts` + `index.ts` that sends or audits (submit-application, provision-owner, invite-member, manage-member, account-security, resend-webhook, send-test-email); migrations `20261020084414_email_log`, `20261020091428_applications_and_owner_access`, `20261024065538_security_hardening` (§5-6), `20261025070915_platform_team_roles` (policies, invites, member functions, kinds), `20261025163627_account_settings` (audit, action codes, closure), `20261025180600_account_settings_optin_2fa`; `src/features/applications/{EmailActivity,AuditTimeline,labels}.tsx`, `src/features/admin/{AuditLogPage,ApplicationDetailPage,BusinessDetailPage}.tsx`, `src/features/team/{AccessHistory,InviteMemberDialog,teamLabels}.tsx`, `src/features/businesses/BusinessOwnersPanel.tsx`, `src/features/settings/sections/{ActivitySection,NotificationsSection}.tsx`, `src/services/supabase/{supabaseCatalogService,supabaseTeam}.ts`, `src/services/mock/{mockCatalogService,mockAccount}.ts`, `src/i18n/dictionaries/en.ts` (apply copy), design/23, design/24, ADR-0024/0030/0032, S1 spec §7-8, RBAC spec §4. Ran `npx vitest run supabase/functions/resend-webhook supabase/functions/_shared supabase/functions/submit-application`: 25/25 pass. That suite does not cover the gaps below.

## Findings

### MAIL-01 A rejected applicant is never told, but every screen and email promises a decision email — High — CONFIRMED
- Where: `supabase/functions/_shared/email-templates.ts:181` (EN: "We will email you when your application has been reviewed") and `:186` (PT), `src/i18n/dictionaries/en.ts:207` ("replies by email"), `:279`, `:287-288` ("We send our decision by email to {email}"), `src/features/auth/LoginPage.tsx:100`. On the other side, `supabase/migrations/20261020091428_applications_and_owner_access.sql:150-212` (`admin_review_application` only writes status and audit), `src/services/supabase/supabaseCatalogService.ts:923-932` (`reviewApplication` is a bare RPC), and `src/features/admin/ApplicationDetailPage.tsx:102,256` (the reject modal says nothing about telling the applicant). No Edge Function sends on review (grep `reject` in `supabase/functions` finds nothing).
- What happens: an admin rejects an application with a reason. The applicant gets nothing, ever, and the reason stays internal. Approval also sends nothing on its own; the applicant hears only if an admin later provisions the owner. An applicant who is approved but never provisioned is in the same silent state.
- Expected rule: the platform's own copy, in both languages, promises a decision email ("Be honest in the UI", CLAUDE.md).
- Fix sketch: function plus SQL. Add `application_decision` (EN/PT) to the email kinds and the `email_log_kind_check`. Send it from a small Edge Function (or a `review-application` wrapper) after `admin_review_application` returns `rejected`, with an optional "share reason" toggle. Until then, change the copy to "we will contact you" and tell the reviewer in the reject modal that no email is sent.
- Live check: reject a test application whose email is a Resend test recipient. `email_log` gains no row for it.

### MAIL-02 Bounces, complaints and provider failures change only `email_log`; team invitations keep saying "Sent", and team and security emails show nowhere — Medium — CONFIRMED
- Where: `20261020091428_…sql:283-315` (`service_record_email_event` updates only `public.email_log`), `20261025070915_platform_team_roles.sql:708-733` (the invite status is set once from the synchronous `accepted` result), `supabase/functions/invite-member/handler.ts:103-104`, `src/features/team/teamLabels.tsx:25` ("Sent"), `src/features/team/InviteMemberDialog.tsx:173-176` ("Invitation sent to …"). The only email views are `EmailActivity`, scoped to an application or business (`ApplicationDetailPage.tsx:248`, `BusinessDetailPage.tsx:195`). `team_invitation`, `security_code`, `security_notice` and `test` rows have neither id, so no page shows them, even though `src/features/team/permissions.ts:53` describes `records.view` as "View … the email log: every email the platform sent".
- What happens: a team invitation to a mistyped address bounces. Resend's webhook marks the `email_log` row `bounced`, but the Team page and member detail keep showing "Sent" until the invitation expires 7 days later, and the Owner never learns it bounced. The same holds for a `complained` staff alert: the platform keeps emailing that address.
- Expected rule: ADR-0024 "Email truth: a status changes only on evidence". The evidence arrives but never reaches the screens that show the status.
- Fix sketch: SQL plus UI. (1) In `service_record_email_event`, on `bounced`/`complained`/`failed`, also set `private.platform_invites.status = 'email_failed'` (matched via `email_log.workflow = 'team_invite:<member>'` or a stored invite id). (2) Add a plain Email log page (records.view) over `getEmailAttempts({})`, which already supports the unscoped query. (3) Optionally skip later sends to addresses that complained.
- Live check: invite `bounced@resend.dev` as a team member, wait for the webhook, then open the Team page. It still says "Sent".

### MAIL-03 New-application alerts go to a staff member's invited address, not their current sign-in address — Medium — CONFIRMED
- Where: `supabase/functions/submit-application/index.ts:89,94` (the recipients come from `platform_members.email`), `20261025070915_platform_team_roles.sql:21` (that column is written once, at invite time). No trigger syncs `auth.users.email` to it (grep `update of email` finds nothing). S1 lets every role change their email (spec §8, "Email change"). `src/features/settings/sections/NotificationsSection.tsx:68` says "Email me when …".
- What happens: an Admin changes their sign-in email in Settings → My account. New-application alerts keep going to the old mailbox, which may be gone or belong to someone else (applicant names and emails leak there). The Team page also keeps showing the old address.
- Expected rule: consistency. Security emails use the live auth address (`account-security/index.ts:75-78`), so alerts should too.
- Fix sketch: function or SQL. In `staffAlertRecipients`, resolve each member's address with `auth.admin.getUserById(user_id)` (as is already done for Owners). Better still, add a trigger on `auth.users` email update that syncs `platform_members.email` and writes an `access_` audit row.
- Live check: change a test Admin's email, submit an application, and look at the `email_log` recipient.

### MAIL-04 "They were emailed" and "the owner was emailed" toasts are not backed by any send result — Medium — CONFIRMED
- Where: `supabase/functions/account-security/handler.ts:253-254` (reset), `:302-303` (restore) and `:379-391` (`notify` and `sendQuietly` swallow every outcome; `done()` carries no email status). UI: `src/features/businesses/BusinessOwnersPanel.tsx:187` and `src/features/team/MemberDetailPage.tsx:143` ("Their 2FA was reset. They were emailed."), `src/features/admin/BusinessDetailPage.tsx:243` ("… and the owner was emailed.").
- What happens: with today's Resend test sender (`PROJECT_COMPLETION_STATUS.md` B3), every notice to a real person is logged as `blocked`, yet the Owner is told the person was emailed. A provider failure or a missing address ends the same way.
- Expected rule: CLAUDE.md honesty, and the pattern the owner-invite toast already follows (`BusinessOwnersPanel.tsx:48-50` reports the real status).
- Fix sketch: function plus UI. Return `notice: { status, error }` from `owner_reset_2fa`, `restore_closure` and `complete_closure`, and word the toast from it ("…, but the notice email was not sent: …").
- Live check: reset 2FA for a business owner whose address is not a test recipient. The toast says "emailed" while `email_log` shows `blocked`.

### MAIL-05 A blocked action-code email answers "Try again", and each retry burns the 5-per-hour code budget — Medium — CONFIRMED
- Where: `supabase/functions/account-security/handler.ts:141-144` (any status other than `accepted`, `blocked` included, becomes `email_failed`), `src/features/settings/ActionCodeDialog.tsx:23` and `src/services/accountService.ts:74` ("We couldn't send the code. Try again."), `20261025163627_account_settings.sql:609` (5 codes an hour, voided codes included).
- What happens: under the test sender (the current state), every non-test user who tries to disable 2FA, regenerate recovery codes or request closure gets "Try again". Retrying can never work (the reason is `test_sender_recipient_not_allowed`), and after 5 tries they get `rate_limited`. Business owners cannot request closure at all until a domain is verified. That limit is known (design/23 "Real owners … cannot receive email"), but the UI hides it and suggests a fix that cannot work.
- Expected rule: S1 spec §10 "Error handling and honesty"; the UI should say what happened.
- Fix sketch: function plus UI. Return `email_blocked` (permanent, configuration) separately from `email_failed` (transient). Show "Email can't be sent to this address yet; contact the Sanctus team" and do not count blocked attempts against the hourly limit.
- Live check: as a non-test business owner, open Request closure → send code.

### MAIL-06 The owner invitation cap is a lifetime limit per business: a dead end with a useless message, bypassed by remove and re-invite — Medium — CONFIRMED
- Where: `supabase/functions/provision-owner/handler.ts:12,113-114` (`MAX_INVITATION_ATTEMPTS = 10`, checked only on resend), `:69-96` (a fresh `provision` never checks the cap or the cooldown), `provision-owner/index.ts:71-80` (counts every `email_log` row for `invite:<business>`, including `blocked` ones and earlier owners'), `src/services/supabase/supabaseCatalogService.ts:499` ("Too many invitations were sent … Contact the owner directly."). ADR-0024 §13.
- What happens: during the test-sender period an admin presses Resend while the email is `blocked`, and after 10 rows Resend is refused forever for that business, even for a different owner invited later. "Contact the owner directly" does not help: the owner can only get in with a code the platform emails. The working escape is Remove owner → invite again, because provision skips the cap, so the cap protects nothing.
- Expected rule: no dead ends (brief), and a rate limit that holds on every path.
- Fix sketch: function. Count only attempts within a rolling window (for example 10 per 24 h) and only those for the current owner (filter on `recipient` or on attempts after the owner's `invited_at`). Apply the same check in `provision`. Do not count `blocked` rows, and say when the next attempt is allowed.
- Live check: not needed (code path); optionally run 10 resends against a test business.

### MAIL-07 Team members see an incomplete History and Email activity shown as complete ("No history yet") — Medium — CONFIRMED
- Where: `20261025070915_platform_team_roles.sql:259-272` (without `records.view`, a member sees only rows with `application_id` not null), `:51` (the default Team role has `applications.view` but not `records.view`), `src/features/admin/BusinessDetailPage.tsx:189-195` (the Owners tab renders `AuditTimeline` and `EmailActivity` with no permission check), `AuditTimeline.tsx:29-30`, `EmailActivity.tsx:25-26`.
- What happens: a Team member opens a business created in the console. RLS silently filters out every row, so they see "No history yet" and "No emails yet", although status changes, owner removals and invitation resends exist. (Resends carry `applicationId: null`, `provision-owner/handler.ts:100`.) On an application page they see the application rows but not the later business rows. The data is wrong but shown as true.
- Expected rule: CLAUDE.md "Every data view has loading, empty and error states" honestly; the RBAC spec grants these rows only to `records.view`.
- Fix sketch: UI. Render both panels only with `can('records.view')`, or show "You can see only application events (records.view needed for the rest)". Alternatively widen the policy for `businesses.view` on rows that have a `business_id`.
- Live check: sign in as a Team member and open a console-created business → Owner tab.

### MAIL-08 Deleting a business or a user strips the audit trail of its subject and actor, and the rows then show "System" — Medium — CONFIRMED
- Where: `20261020091428_…sql:75-77` (`actor_id`, `business_id` `on delete set null`), `20261024065538_security_hardening.sql:243-245` (only the delete event itself keeps `name`), `src/features/admin/AuditLogPage.tsx:72,123`, `src/features/applications/AuditTimeline.tsx:47` (a null actor is shown as "System").
- What happens: after a closure completes or a business is deleted, every earlier event for it (status changes, slug changes, owner invitations) becomes a row with no business link and no name. After a staff member deletes their own account (S1), all their approvals, rejections and deletions read "· System", as if automated.
- Expected rule: AuditLogPage's "Who did what, recorded by the server. Entries cannot be edited", ADR-0024 "every decision has an actor and an audit row".
- Fix sketch: SQL. Snapshot `actor_email` (or a hash, given privacy) and `business_name` into `metadata` on insert, with a trigger on `audit_events`, and drop the FKs or keep them without set null on these columns. In the UI, show "Deleted user" instead of "System" when the metadata says there was an actor.
- Live check: in the dev project, delete a test business and filter the audit log.

### MAIL-09 Every Admin can read everyone's sign-in user agents and IPs, the Owner's included, and sign-ins flood the audit log — Medium — CONFIRMED
- Where: `20261025070915_platform_team_roles.sql:266-272` (any event not starting with `access` is readable with `records.view`), `:49` (Admin has `records.view` by default), `20261025163627_account_settings.sql:348-349` (`account_signed_in` stores the user agent), `:772-774` (IP on account events), `20261025180600_…sql:12-13` (these events are 2FA-gated for their own subject "because they hold sign-in IPs and devices"), `docs/SECURITY_REVIEW.md:48` ("A person reads their own last 50"), `src/features/admin/AuditLogPage.tsx:35` (lists every type).
- What happens: an Admin (or any Team role the Owner gives `records.view`) can query `audit_events` through the API and get the Owner's and every business owner's devices and IPs. The Audit log page lists a "Account signed in" row for every sign-in on the platform, which buries the administrative events.
- Expected rule: S1 treats this data as the subject's own (spec §4 "Security activity" is per person, and `handler.ts:370-372` hides the Owner's IP from subjects).
- Fix sketch: SQL. Exclude `account\_%` from the staff policy, or allow only the Owner. Filter `account_signed_in` out of `getAuditEvents` by default.
- Live check: as an Admin, `select metadata from audit_events where event_type like 'account_%'` via the API.

### MAIL-10 A team member's self-deletion leaves no Access-history record, so who left cannot be found — Medium — CONFIRMED
- Where: `supabase/functions/account-security/handler.ts:227-240` (logs only `account_deleted` with `email_sha256`, then deletes the user), `20261025163627_account_settings.sql:857-866` (`service_request_closure` deactivates the member and revokes invites without the `access_member_deactivated` row that `admin_deactivate_member` writes, `platform_team_roles.sql:514-516`), `platform_team_roles.sql:20` (the `platform_members` row cascades away with the user). `AccessHistory` reads only `access%`.
- What happens: an Admin deletes their own account. They vanish from the Team page. Access history shows nothing, and the audit log shows "Account deleted · System" with only a hash. No email reaches the Owner or the admin inbox.
- Expected rule: ADR-0029 access audit ("deactivations"). The Owner must be able to see that someone with access left.
- Fix sketch: SQL. Write `access_member_deactivated` (metadata `{member_id, email, reason:'self_closure'}`) in `service_request_closure`. Optionally email the Owner (`closure_request`-style alert).
- Live check: not needed (code path).

### MAIL-11 Platform actions that change a business owner's catalog are silent to the owner, who has no history to look at — Medium — CONFIRMED
- Where: `supabase/functions/manage-member/handler.ts` (no email on deactivate or role change), `20261020091428_…sql:349-368` (a business status change is only audited). Product publish, unpublish and delete by staff have no audit and no email (`products` has no audit trigger). Business owners have no read policy on `audit_events` beyond their own `account_` rows (`…:92-94`, `platform_team_roles.sql:266`, `account_settings_optin_2fa.sql:130-134`).
- What happens: platform staff set a business to `inactive` or unpublish its products. The catalog goes dark with no email to the owner, and the dashboard shows no "changed by the platform" entry, so the owner cannot tell a moderation decision from a bug. A deactivated staff member is also not told.
- Expected rule: brief "dead end / paused business the owner can't understand". PRD/ADRs name no rule, so this is a consistency gap with the closure notices, which do email.
- Fix sketch: function plus SQL. Add a `business_notice` email (EN/PT, from the business status trigger through an Edge Function, or from the admin UI path) and an owner-readable "platform changes" policy on `audit_events` for their `business_id`. Audit staff product publish and delete.
- Live check: set a test business inactive from `/admin`, then check the owner's inbox and dashboard.

### MAIL-12 Webhook gaps: `email.suppressed` is unmapped, `delivered` can overwrite `bounced`, and events that arrive before the log row are lost — Low — SUSPECTED
- Where: `20261020091428_…sql:291` (`delivered` and `bounced` both rank 4, and the update uses `>=`), `:299-306` (no `email.suppressed`; unknown types still mark the svix id as processed), `:308-311` (an update that matches 0 rows is still `return true`). `supabase/functions/_shared/email.ts:48` allows `suppressed@resend.dev`; `design/23-email.md:73` leaves suppressed out of the webhook event list.
- What happens: (a) a message to a suppressed address stays `accepted` forever. (b) An out-of-order `email.delivered` after `email.bounced` turns the badge green. (c) If `email.sent` arrives before `sendAndLog` inserts the row, or the log insert failed after a successful send, the event is consumed and the row never moves.
- Expected rule: ADR-0024 §15 (the status moves forward on evidence only).
- Fix sketch: SQL. Map `email.suppressed` to `bounced`. Give `bounced` rank 5, terminal like `complained`. When no row matched, keep the event in `private.email_provider_events` with `applied = false` and apply it in the log insert path, or return false so Resend retries.
- Live check: send to `suppressed@resend.dev` with the webhook subscribed to suppressed events.

### MAIL-13 `send-test-email` `status` rewrites any email_log row and can move a status backwards — Low — CONFIRMED
- Where: `supabase/functions/send-test-email/handler.ts:47-53`, `send-test-email/index.ts:49-52` (`update … eq('provider_message_id', id)` with no kind filter and no rank rule), `_shared/email.ts:100-117` (`opened`, `clicked`, `scheduled` and unknown events map to `accepted`).
- What happens: an Owner checks the status of an owner invitation whose `last_event` is `opened` (when tracking is on). A `delivered` row drops back to `accepted`, which contradicts the webhook's forward-only rule.
- Expected rule: design/23 table ("a status only moves forward"), ADR-0024 §15.
- Fix sketch: function. Route the update through `service_record_email_event`-style rank logic (or a new `service_apply_provider_status`), and limit it to `kind = 'test'` or apply the rank check.
- Live check: not needed.

### MAIL-14 An application that hits an error after insert never sends its emails, even when retried — Low — CONFIRMED
- Where: `supabase/functions/submit-application/handler.ts:57-58` (the retry returns the stored row early), `:73-74` (the audit insert is not in a try, and its throw becomes a 500 after the row is stored, `index.ts:73-76,106-108`). A function timeout between insert and send ends the same way.
- What happens: the applicant sees an error and presses submit again. They get the success screen with a reference, but there is no `application_submitted` audit row, no confirmation, and no admin or staff alert, so the application sits unseen until someone browses the list.
- Expected rule: design/24 step 2 ("audit … → confirmation … → notification"). Idempotency should complete the work, not skip it.
- Fix sketch: function. On a `findByKey` hit, send any workflow that has no `email_log` row; the Resend idempotency key already prevents duplicates. Put the audit in try/catch, or insert it in the same SQL call as the row.
- Live check: not needed.

### MAIL-15 Two near-simultaneous owner-invitation resends can deliver a code that no longer works — Low — SUSPECTED
- Where: `supabase/functions/provision-owner/handler.ts:113-125` (the cooldown and count are read, not locked), `:141-150` (Idempotency-Key `invite:<business>:<attempt>`; both requests compute the same attempt). Each `generateLink` replaces the previous OTP.
- What happens: two admins (or two tabs) resend at once. Both mint codes. Resend refuses the second body under the same key (409), so the email that is delivered carries the first code, which the second `generateLink` already invalidated. The log shows one `accepted` and one `failed`, and the owner's code fails.
- Expected rule: design/23 (`Idempotency-Key` against double sends).
- Fix sketch: function plus SQL. Take an advisory lock or a "reserve attempt" row in SQL before `generateLink`, and use the reserved attempt number as the key.
- Live check: fire two resend requests in parallel against a test business.

### MAIL-16 Closure events are scattered: the request is missing from the business History, status flips read "System", and some alerts are silent — Low — CONFIRMED
- Where: `account-security/handler.ts:212` (`account_closure_requested` keeps `business_id` only in metadata; `service_log_account_event`, `account_settings.sql:779-780`, never sets the column), `account_settings.sql:880` (the service-role update fires `business_status_changed` with `auth.uid()` null, shown as "System"), `:911-913` (cancel and restore do set `business_id`), `handler.ts:214-223` (no admin inbox means no alert and no `blocked` log row, unlike `submit-application/handler.ts:96-107`). Cancelling sends no notice to the owner or the inbox.
- What happens: on the business History an admin sees "Catalogue status changed Active → Inactive · System" with no closure context, then later "account closure cancelled". The inbox alert from the request ("Review the request … complete or restore") is never followed by a "cancelled" alert.
- Expected rule: consistency with the other audit rows, and design/24 (every email attempt is logged).
- Fix sketch: SQL plus function. Let `service_log_account_event` accept and store `p_business_id`, pass the actor into the closure status update (session setting), and log a `blocked` row when the inbox is unset.
- Live check: not needed.

### MAIL-17 The team invitation email describes default role rights the Owner may have changed, and a resend drops the note — Low — CONFIRMED
- Where: `supabase/functions/_shared/team.ts:16-24` (fixed `ROLE_SUMMARY`), `_shared/email-templates.ts:62-64` ("As Admin you can: …"), `20261025070915_platform_team_roles.sql:582-618` (permissions are editable per role), `invite-member/handler.ts:62` (the note is read only for `invite`).
- What happens: the Owner removes `products.publish` from Admin and invites an Admin. The email still says "Create, publish and manage products". A resent invitation loses the personal note the first email had.
- Expected rule: honesty in copy (CLAUDE.md).
- Fix sketch: function. Build the bullets from `platform_role_permissions` at send time, and store the note on `platform_members` (or the invite) so a resend reuses it.
- Live check: not needed.

### MAIL-18 Smaller label and mock gaps — Low — CONFIRMED
- Where: `src/features/applications/labels.tsx:53` (`EMAIL_KIND_LABEL` lacks `team_invitation`, `security_code`, `security_notice` and `closure_request`; the closure alert shows as raw `closure_request` in a business's Email activity). `src/services/mock/mockAccount.ts:293` records `platform_security_policy_changed` into the demo Security activity, while the real `list_my_security_events` returns only `account\_%` (`account_settings_optin_2fa.sql:119-123`), so the label at `ActivitySection.tsx:27` never shows live. `mockCatalogService.ts:392-412`: a provision for an existing owner skips the cooldown, cap and already-accepted checks the real path applies (`provision-owner/handler.ts:73-74,112-116`). The mock resend subject is "New invitation link", the real one "New invitation code".
- What happens: an admin sees an unlabeled kind. Demo testers see behavior the live site does not have.
- Expected rule: brief "the demo must model the real rules".
- Fix sketch: UI plus mock. Add the four labels, drop the policy event from the mock list (or include it in the SQL filter), and route the mock provision-with-owner through the resend checks.
- Live check: not needed.

### MAIL-19 Turning off "New business applications" does not stop the alert when your address is the admin inbox — Low — SUSPECTED
- Where: `supabase/functions/submit-application/handler.ts:83-92` (`ADMIN_NOTIFICATION_EMAIL` always gets a job; opted-out staff are skipped only from the extra list), `src/features/settings/sections/NotificationsSection.tsx:68` ("Email me when a business applies").
- What happens: the Owner's own address is the configured inbox (the test-inbox setup in `PROJECT_COMPLETION_STATUS.md:26`). They switch the alert off and keep receiving it.
- Expected rule: honesty in the switch.
- Fix sketch: UI. Under the switch, say "The platform inbox (<masked>) always receives these" when the user's address equals it. This needs the server to expose a masked inbox or a boolean.
- Live check: compare `ADMIN_NOTIFICATION_EMAIL` with the Owner's address.

## Ideas (optional, max 5 lines)
- A single "Email log" admin page with filters by kind, status and recipient, and a "Resend" action for failed workflows.
- Set a retention job for `email_log.recipient` and the `access_*` email metadata (design/23 §6 still has no period).
- Show the business owner a read-only "Platform changes" feed (status, unpublish) built on MAIL-11's policy.

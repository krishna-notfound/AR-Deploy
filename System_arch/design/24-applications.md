# 24 · Business applications and owner onboarding
→ ADR-0024. Migration `20261020091428_applications_and_owner_access.sql`. Email details: design/23.

## Flow
1. **Apply** (`/apply`, public, EN/PT): five steps (business → location → contact → catalogue → review). The step fields come from `APPLICATION_STEPS` (`supabase/functions/_shared/application.ts`), and the same validator runs in the wizard, the demo service and the Edge Function. The draft lives in `sessionStorage` (this tab only) together with a random `submissionKey`. A hidden honeypot field catches bots. The confirmation screen appears only after the server stored the row, and it shows the reference.
2. **submit-application** (Edge Function, `verify_jwt = false`): validate → return the existing row for a repeated `submissionKey` → refuse an open duplicate (same business name and email, 409) → rate limit (salted IP hash, 5/hour, 429) → insert with the service role → audit `application_submitted` → confirmation to the applicant and notification to `ADMIN_NOTIFICATION_EMAIL`. Email failures never undo the stored application.
3. **Review** (`/admin/applications`, `/admin/applications/:id`): search (business, applicant, email, reference), status and date filters, pagination. Detail shows the answers, the timeline (audit), the emails (with attempts) and the actions. `admin_review_application(id, action, reason)`:
   | From | start_review | approve | reject (reason required) |
   |---|---|---|---|
   | submitted | under_review | approved | rejected |
   | under_review | — | approved | rejected |
   | rejected | under_review (reopen) | — | — |
   | approved | — | — | — |
   Approval creates a **draft** business (unique slug from the name; description from the answers; contact empty) and links it to the application.
4. **Owner** (business detail "Owner & history" tab, or the application page once approved): the admin enters the email (prefilled with the applicant's), and **provision-owner** links the single owner (`service_link_owner`) and emails the invitation. **Resend invitation** creates a new link (cooldown 60 s, max 10 attempts). Remove the owner to invite someone else.
5. **Accept** (`/accept-invite?lang=`): Supabase signs the visitor in from the link, the owner sets a password (and optionally a name), and `complete_owner_onboarding()` records `accepted_at` → `/dashboard`. Expired links (`#error_code=otp_expired`) show a plain message.

## Data (all RLS on)
| Object | Browser access | Server access |
|---|---|---|
| `business_applications` | admins: select | service_role: select, insert |
| `audit_events` | admins: select | service_role: select, insert (append-only) |
| `email_log` (+ `application_id`, `workflow`, `attempt`) | admins: select | service_role: select, insert, update |
| `private.email_provider_events` | none | webhook idempotency (svix id) |
| `business_members` (one row per business) | members/admins per existing policies | `service_link_owner` |

RPCs: `admin_review_application`, `admin_list_business_members` (with invited/accepted/last sign-in), `admin_user_emails` (audit actor emails), `complete_owner_onboarding` (authenticated) and `service_user_id_by_email`, `service_link_owner`, `service_record_email_event` (service_role only).

## Audit events
`application_submitted`, `application_status_changed` (from/to, reason), `business_created`, `owner_provisioned`, `invitation_requested`, `invitation_resent`, `invitation_failed`, `owner_onboarding_completed`, `owner_removed`, `business_status_changed`, `business_deleted`.

## Configuration
Edge Function secrets: `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`, `EMAIL_TEST_RECIPIENTS`, `ADMIN_NOTIFICATION_EMAIL`, `RESEND_WEBHOOK_SECRET` (and optionally `APPLICATION_SALT`; without it the salt is derived from the service key on the server). Supabase Auth: add `<APP_BASE_URL>/accept-invite` to the redirect allow-list. Resend: a webhook pointing to `https://<project>.supabase.co/functions/v1/resend-webhook` for the `email.*` events.

## Tests
Handler tests (`supabase/functions/*/handler.test.ts`), PGlite (`supabase/tests/migrations.test.ts`: lifecycle, one owner, append-only audit, webhook idempotency, server-only helpers), demo service (`src/services/mock/service.test.ts`), e2e (`tests/e2e/applications.spec.ts`, mobile check in `responsive.mobile.spec.ts`).
## S1.5 changes (ADR-0033, migration `20261026041731_business_logic_fixes.sql`)
These replace the parts of the flow above that they touch.

- **Review goes through `review-application`** (Edge Function, `verify_jwt = true`, 2FA gate first, then the permission for the action). Input `{applicationId, action: 'start_review' | 'approve' | 'reject' | 'reopen', reason?, includeReason?}`, output `{ok, status, businessId?, email?: {status, error?}}`. Errors: `aal2_required` and `forbidden` (403), `reason_required`, `invalid_transition` and `reopen_not_allowed` (422), `application_not_found` (404). It calls `admin_review_application`, and on a rejection it sends one `application_decision` email in the applicant's language. The reason is in the email only when `includeReason` is true. A failed email never undoes the rejection; the result carries its status and the page words the toast from it. A second reject of an already rejected application sends nothing. A direct `admin_review_application` call still works but sends no email.
- **Reopen.** A rejected application reopens to `under_review` (as before). An **approved** application whose business was deleted also reopens: a trigger sets `business_applications.business_deleted_at` when the linked business is deleted, and `reopen_not_allowed` is raised for anything else.
- **Possible duplicates** (`admin_application_duplicates(application_id)`, needs `applications.view`). It lists up to 10 other applications (status `submitted`, `under_review` or `approved`) with the same applicant email or the same normalised business name, and up to 10 businesses with the same normalised name or whose owner has the applicant's email. `private.normalize_business_name` lower-cases, folds Portuguese accents, drops one trailing legal-form word (`lda`, `limitada`, `unipessoal`, `sa`, `ltd`, `limited`, `llc`, `inc`) and keeps only `a-z0-9`; an empty result matches nothing. The panel sits above the review buttons and never blocks them. An owner's email is never returned.
- **Owner invitations are reserved.** `service_reserve_owner_invite(business, recipient, actor)` runs under an advisory lock before the link is made and writes `private.owner_invite_attempts`. It refuses with `cooldown` (an attempt for that business under 60 s old) or `too_many_invitations` (10 or more non-blocked attempts for that business and recipient in 24 h; `retry_at` is the oldest plus 24 h). `service_finish_owner_invite(reservation, outcome)` stores `accepted`, `sent`, `failed` or `blocked`; blocked attempts do not count. The attempt number is monotonic per business and seeded from `max(email_log.attempt)` for `invite:<business>`, and is the Idempotency-Key suffix. `email_log.attempt` may now reach 100000.
- **Concurrent provisioning.** `service_link_owner` locks the business row and raises `business_has_owner` on a race, or `email_is_admin` when the email has any platform-team row (checked by `provision-owner` before it creates a login). A login created by a failed request is deleted.
- **Owner state on every business.** `admin_list_owner_states()` (needs `businesses.view`) returns `needs_owner`, `invite_pending` or `owner_active` per business, the last invitation date, and `email_failed` (newest attempt failed or blocked, or its email bounced or was marked as spam). The businesses list shows it and filters by it.
- **Acceptance on any sign-in.** `record_sign_in` accepts a pending owner membership before its 60 s check and logs `owner_onboarding_completed` with `via: 'sign_in'`. The reset-password page completes onboarding for owners too.
- **Submission limit counts attempts.** `submit-application` order: validate, key replay, rate limit, duplicate lookup, insert. `service_application_attempt(hashes, max = 5)` runs under an advisory lock, deletes attempts older than 2 hours, counts the last hour for the given hashes, and records the attempt (`private.application_attempts`) when it is under the limit. A 409 duplicate counts; a 429 is not recorded. The submitter hash is `sha256('application|' + UTC date + '|' + ip + '|' + salt)`, so it changes daily; across midnight the handler passes both days' hashes so the hourly window holds.
- **Replay completion.** A repeated `submissionKey` is never rate limited. If the stored row is more than 30 s old, the handler writes a missing `application_submitted` audit row and sends each workflow (applicant confirmation, admin inbox, opted-in staff) that has no `email_log` row for that application, using the stored address, name and language. A `failed` or `blocked` row counts as sent, so nothing is retried. An audit failure after the insert is logged and never fatal.
- **Audit event types added:** `account_closure_voided`, `product_created`, `product_published`, `product_unpublished`, `product_slug_changed`, `product_deleted`, `access_member_removed`, `access_member_closed`, `access_member_email_changed`. Reopen reuses `application_status_changed`.

## Configurable form and the Editor (ADR-0043, 2026-10-29; migration `20261029074648_site_content.sql` not applied, `submit-application` not redeployed)
- The form is driven by the published `site_content.applyForm` (steps, field placement, hidden and required, hidden choice options, up to 10 custom questions, text overrides). Nothing published means today's built-in form (`DEFAULT_APPLY_FORM`).
- One validator, `supabase/functions/_shared/application.ts`, `validateApplication(input, rules?)`, used by the page, the demo service and the Edge Function. Rules come from `rulesFromConfig`. Locked fields (business name, contact name, contact email), consent and Terms are required whatever the rules say. A hidden field is ignored and stored as null. An unknown question id, unknown option or hidden option gives `stale` and the function answers 409 `form_changed`; the page reloads the form and keeps the answers.
- `business_applications`: `country`, `city`, `category` are nullable; `answers.custom` holds a snapshot of each question (label, option labels) and the answer, `answers.formVersion` the published version used (0 = built-in). Answers limit 64 KB; `submit-application` body limit 48,000 bytes.
- `submit-application` reads `site_content.published` with the service role. A read error is not "no config": it answers 503 `config_unavailable`. Redeploy it before any form change is published.
- Reviewers see "Extra questions" on the application detail page (snapshot wording, "Not given" for empty), and "Not given" for hidden built-in fields. The list subtitle joins only the parts that exist. Approval needs only `business_name` and the optional description.

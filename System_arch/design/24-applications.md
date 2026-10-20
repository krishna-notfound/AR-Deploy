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

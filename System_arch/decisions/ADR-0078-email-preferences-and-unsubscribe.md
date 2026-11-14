# ADR-0078: Email preferences, a footer on every email and one-click unsubscribe
- **Status:** Accepted
- **Date:** 2026-11-14
- **Affects:** design/23-email.md, design/12-features-admin.md, design/19-supabase.md, design/24-applications.md (Settings → Notifications)

## Context
One client action (five 3D model requests) emailed the platform staff and the business owner once per event. People need to choose which notification emails they get, and every email needs a privacy link and, where the email is optional, an unsubscribe link. Owner decision, 2026-11-14: spec `docs/superpowers/specs/2026-11-14-owner-aliases-and-email-preferences-design.md`, section B.

## Decision
- **Optional types**, each on by default, with an Email switch:

  | Type (`notification_prefs` column) | Who gets it | Email |
  |---|---|---|
  | New applications (`email_new_application`) | staff with `applications.view` (and the Owner) | `admin_notification` to a staff member |
  | New 3D model requests (`email_new_model_request`) | staff with `models.manage` (and the Owner) | `model_request_staff` (new), sent by `notify-model-request` |
  | Company updates (`email_company_updates`) | staff | none yet: the column exists, nothing sends it, so Settings shows no switch for it |
  | 3D model request updates (`email_model_request_updates`) | the business owner | `model_request_update` |
  | Platform notices about their company (`email_business_notices`) | the business owner | `business_notice` |

- **Always sent, never switchable:** security codes and notices, invitations (owner, team, resend), applicant emails (confirmation, decision), closure requests and staff-left notices to the Owner, test emails, and the alert to the shared admin inbox (`ADMIN_NOTIFICATION_EMAIL`, an address, not a person). When the inbox address is also a staff member, that person gets one email, and it is the optional one.
- **Data.** One migration adds the five booleans (not null, default true) to `public.notification_prefs`. The table's row-level security and grants are unchanged (own row only). A person with no row has everything on. People who had turned `profiles.notify_new_applications` off keep that choice (the migration sets `email_new_application = false` for them); the Settings card that wrote the profile flag is replaced by the Email switch on the New applications row. The migration also widens `email_log_kind_check` with `model_request_staff`.
- **Sending rule.** Before an optional email, the function reads the recipient's switch (`_shared/emailPrefs.ts`, `emailWanted`) and skips the email when it is off: nothing goes to Resend and nothing is logged. A switch that cannot be read means no optional email that time (logged), never a guess. In-app and phone push have their own switches and are unaffected.
- **Footer on every email, in the email's language (EN, PT-PT).** Added in `sendAndLog`, so no sender can leave it out: a Privacy Policy link (`APP_BASE_URL/privacy`) and an Email preferences link (`APP_BASE_URL/email/preferences`, which opens the right Settings page for whoever is signed in, or asks them to sign in). Optional emails add an "Unsubscribe" link ("Cancelar subscrição" in PT-PT) and the headers `List-Unsubscribe: <https URL>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Always-sent emails have no unsubscribe link and carry one line on why they are sent.
- **Unsubscribe token.** `v1.<payload>.<signature>`: HMAC-SHA256 over the user id, the type and the issue day, signed with the new Edge Function secret `EMAIL_UNSUBSCRIBE_SECRET`. Valid one year, tampering and expiry are refused. Without the secret an optional email is blocked and logged (`unsubscribe_not_configured`), never sent without its link; always-sent emails are not affected.
- **`email-unsubscribe` Edge Function** (`verify_jwt = false`): POST only, from the mail provider's one-click request or the page's button. It verifies the token, sets that one switch to false (idempotent), and is rate limited per caller (salted daily address hash, 20 attempts an hour, through `service_application_attempt`). It returns fixed reason codes only (`invalid_token`, `expired_token`, `rate_limited`, `unknown`). The `List-Unsubscribe` header points at this function (a POST target); the footer link points at the page.
- **Public page `/email/unsubscribe`** shows "Unsubscribe from <type> emails?" with a button: opening the link changes nothing, so link scanners cannot unsubscribe anyone. After the button: "You are unsubscribed" and a link to the preferences. An invalid or expired link gets a plain message and the same link. EN and PT-PT, `noindex`.
- **Settings → Notifications** gives each row an Email switch next to In-app (staff see their types, business owners theirs); the phone switch stays its own row. Demo mode uses the in-memory notification harness (tokens `demo.<type>`).

## Consequences
- Good: a flood of one type can be switched off by the person it bothers, from the email itself or from Settings; every email links to the privacy policy.
- Good: the gate and the footer live in shared code, so a new email kind needs one line to be optional or to say why it is always sent.
- Trade-off: the staff "new 3D model request" email did not exist before this change (staff had only the bell and the phone); it is new, default on, and goes to the same people as the bell.
- Trade-off: the Company updates (staff) type has a column but no email behind it, so it has no switch. The only staff notice of that kind, "X left the Sanctus team", is sent from `account-security` and stays always-sent for now.
- Trade-off: the Email preferences link shows the sign-in page to someone who is not signed in (applicants have no account and no preferences).
- Deploy: set `EMAIL_UNSUBSCRIBE_SECRET` before deploying the senders, or optional emails are blocked until it is set.

## Alternatives rejected
- A global "no marketing" switch: nothing here is marketing, and people want to keep some types (security) and drop others.
- A GET unsubscribe link that acts on open: mail scanners open links and would unsubscribe people.
- A per-email token stored in a table: the signed token needs no storage and no cleanup.
- Footer text added by each sender: easy to forget on a new email; one place (`sendAndLog`) cannot be forgotten.

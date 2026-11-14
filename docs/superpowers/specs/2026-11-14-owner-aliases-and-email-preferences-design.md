# Owner sign-in aliases and email preferences: design

Date: 2026-11-14. Owner-approved in chat the same day. Records: ADR-0077 (aliases), ADR-0078 (email preferences).

## Why
- **Handover.** The platform Owner account has to pass from the developer to the client without creating a new Owner. Microsoft-style aliases do that: add the client's email, make it primary, the client takes over and removes the old one.
- **Email floods and cost.** One client action (five 3D model requests) emailed the platform staff and the business owner once per event. People need to choose which notification emails they get, and every email needs a privacy link and, where optional, an unsubscribe link.

## A. Owner sign-in aliases (ADR-0077)

**Who:** the platform Owner only (`platform_admins`). Admin, Team and business owners do not get this.

**Model:** one Supabase Auth user. Its Auth email is the **primary**: sign-in, password reset codes and every email go there. Up to 3 **aliases**: sign-in only, never emailed.

**Data:** a new table `private.account_aliases`:
- columns `user_id` (auth.users, cascade), `email` (lower-case, unique), `created_at`, `verified_at`;
- RLS on with no policies; only the service role and security-definer functions touch it;
- an alias may not equal any `auth.users.email` or another alias;
- at most 3 aliases per user.

**Settings → Account → "Sign-in emails"** (Owner only, EN/PT-PT):
- Lists the primary (labelled Primary) and the aliases.
- **Add alias:**
  1. Type an email.
  2. `account-security` action `alias_send_code` emails a one-time code (purpose `add_alias`) to that address.
  3. `alias_add` with the code stores the alias, verified.
  4. Audit event `account_alias_added`.
- **Make primary** (needs aal2, plus a fresh TOTP within 5 minutes, same rule as `change_password`):
  1. The Auth email is swapped to the alias with the service role (`email_confirm: true`), and the old primary becomes an alias, in one transaction-like sequence that restores the old state on failure.
  2. Every other session ends.
  3. A security notice goes to both addresses.
  4. Audit event `account_primary_email_changed`.
- **Remove alias:** needs aal2. The primary cannot be removed. Audit event `account_alias_removed`.

**Sign-in with an alias:**
- The login form sends `email` + `password` to `account-security` action `alias_sign_in` only when a normal sign-in returns `invalid_credentials`.
- The function resolves the alias to its user server-side and signs in with the primary email and the given password.
  - **Success:** it returns the session tokens, and the browser sets the session.
  - **Failure:** it gives the same neutral "Wrong email or password" as a normal failure. It never reveals that an alias exists or what the primary is.
  - **Rate limits:** per IP and per email, like other anonymous endpoints.

**Forgot password with an alias:**
- The reset request (`alias_reset_request`) resolves the alias server-side and sends the reset code to the primary.
- The response stays neutral, as it is today.

**Account closure alerts:**
- They go to the Owner's primary email (read from Auth at send time), so they follow the swap.
- The `ADMIN_NOTIFICATION_EMAIL` secret is no longer read.

**Handover steps** (written into docs/CLIENT_HANDOVER.md):
1. The Owner adds the client's email as an alias (the client reads out the code).
2. The Owner makes it primary.
3. The client uses "Forgot password" and sets their own password.
4. The client sets up their own authenticator (the Owner removes the old factor first).
5. The client removes the developer's alias.

## B. Email preferences (ADR-0078)

**Who:**
- Platform staff (Owner, Admin, Team), for the staff emails their permissions already give them.
- Business owners, for their company emails.

**Optional email types** (on by default, each with an Email on/off):

| Type | Who gets it | Today's email kind |
|---|---|---|
| New applications | staff with the applications permission | `admin_notification` (new application) |
| New 3D model requests | staff with the model-request permission | the staff email for a new model request |
| Company updates | staff | company/business update emails to staff |
| 3D model request updates | business owner | `model_request_update` |
| Platform notices about their company | business owner | `business_notice` |

**Always sent, never switchable:** security codes and notices, invitations (owner, team, resend), applicant emails (confirmation, decision), closure requests to the Owner, test emails.

**Data:** extend `public.notification_prefs` with one boolean per optional email type (default true): `email_new_application`, `email_new_model_request`, `email_company_updates`, `email_model_request_updates`, `email_business_notices`. Existing RLS (own row) stays.

**Sending rule:**
- Before sending an optional email, the function reads the recipient's pref and skips it when off, logging nothing to Resend.
- In-app and push keep their own switches.
- A missing prefs row means everything is on.

**Footer on every email (EN/PT-PT):**
- **Every email:** a **Privacy Policy** link (`APP_BASE_URL` + `/privacy`) and an **Email preferences** link to the settings page.
- **Optional emails:**
  - an **"Unsubscribe"** link (PT-PT "Cancelar subscrição");
  - the headers `List-Unsubscribe: <https URL>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- **Always-sent emails:** no unsubscribe, and one line saying why they are sent.

**One-click unsubscribe:**
- The URL is `APP_BASE_URL/email/unsubscribe?t=<token>`.
- The token is an HMAC-SHA256 over `user_id`, `type` and an issue date. It uses a new Edge Function secret `EMAIL_UNSUBSCRIBE_SECRET` and is valid for 1 year.
- A new public Edge Function `email-unsubscribe` (`verify_jwt = false`):
  - accepts POST (the one-click header, or the page's button);
  - verifies the token and sets that one pref to false;
  - is idempotent and rate limited.
- The public page `/email/unsubscribe`:
  - shows "Unsubscribe from <type> emails?" with a button, so link scanners do not unsubscribe people by GET;
  - then shows "You are unsubscribed" and a link to preferences.
  - **Errors:** an invalid or expired token gets a plain message with the preferences link.

**Settings → Notifications:** each row gets an **Email** switch next to In-app and Phone. Business owners see their two types; staff see theirs.

## C. Also in this change
- **Portuguese by default:** the language order becomes `?lang=` → the saved choice → **pt**, so the browser language no longer decides. This is an owner decision; ADR-0044 is amended.
- Tests for each part; demo mode keeps working (mock services for aliases and prefs).

## Out of scope
- Aliases for non-Owner accounts.
- Daily digests.
- Marketing emails.
- Changing which people are recipients.

## Testing
- **DB (PGlite):** alias table rules (uniqueness against auth emails, the 3 limit, RLS closed) and the new pref columns with their defaults.
- **Edge functions (vitest):**
  - alias send/add/primary swap (aal2 and TOTP checks, rollback on failure), remove, sign-in resolution (neutral errors, rate limit), reset resolution;
  - prefs gate per type;
  - footer and headers present per type;
  - unsubscribe token sign/verify/expiry/tamper and idempotent update.
- **UI:** Sign-in emails section (Owner only), Email switches, the unsubscribe page, PT default. Each at 1440 and 390.

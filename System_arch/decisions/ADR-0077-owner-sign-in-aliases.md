# ADR-0077: Owner sign-in aliases
- **Status:** Accepted
- **Date:** 2026-11-14
- **Affects:** design/19-supabase.md, design/12-features-admin.md, docs/CLIENT_HANDOVER.md, docs/superpowers/specs/2026-11-14-owner-aliases-and-email-preferences-design.md (part A)

## Context
The platform Owner account has to pass from the developer to the client without creating a second Owner (ADR-0029: the Owner is `platform_admins`, and there is one). The Owner needs a way to add the client's address, let the client take over, and then drop the developer's address, all on the same Supabase Auth user. Owner decision, 2026-11-14.

## Decision
- **Model.** One Auth user. Its Auth email is the **primary**: password reset codes, every security code and notice, and the closure alerts go there. Up to **3 aliases** (`private.account_aliases`) only sign in and are never emailed. The Owner only: Admin, Team and business owners get nothing new.
- **Table.** `private.account_aliases (email primary key, user_id, created_at, verified_at)`. RLS on, no policies, no grants to any API role (only security-definer `service_alias_*` functions reach it, and they are service-role only). A trigger refuses, for any write: a non-Owner `user_id`, an address equal to any `auth.users.email`, an upper-case address, and a fourth verified alias.
- **Add.** `alias_send_code` holds the address as one unverified row (a new address replaces the earlier one, so the code always belongs to the pending address) and emails a 6-digit code (purpose `add_alias`) to the alias, never to the primary. `alias_add` checks the code and verifies the row. Both need the Owner and, for an account with 2FA, aal2. Audit `account_alias_added`.
- **Make primary** (`alias_make_primary`): aal2 and an authenticator code from the last 5 minutes (the browser verifies the TOTP first, as for `change_password`). The Auth email is changed first with the service role (`email_confirm: true`), then `service_alias_swap` makes the old primary an alias and drops the new one from the aliases. If the swap fails, the old Auth email is put back. Then every other session ends (`service_end_other_sessions`, keeping the current one by the JWT `session_id`), both addresses get a notice, and `account_primary_email_changed` is written. Audit events hold SHA-256 hashes of the addresses, not the addresses.
- **Remove** (`alias_remove`): aal2. The primary is not in the table, so it cannot be removed. Audit `account_alias_removed`.
- **Sign in with an alias** (`alias_sign_in`, anonymous). The browser calls it only after a normal sign-in answered `invalid_credentials`. The function resolves the alias, signs in with the primary and the typed password on a throwaway client, and returns the session tokens, which the browser sets. Every failure is the same `invalid_credentials` (an unknown address does the same sign-in on a probe address, so timing says nothing). Rate limited per IP (20 per hour) and per address (6 per hour), counted for every typed address whether or not it is an alias. The limits reuse `service_application_attempt` with salted hashed keys (the salt is `APPLICATION_SALT` or derived from the service key), so no new table.
- **Reset with an alias.** `alias_reset_request` (anonymous) sends the reset code to the primary and always answers `ok`. Because Auth only knows the primary, the reset page's code check falls back to `alias_reset_verify` (anonymous, rate limited), which verifies the code against the primary and returns the recovery session. The spec lists the request only; the verify step is what makes it complete.
- **Closure alerts** go to each platform Owner's Auth email, read when the alert is sent, so they follow "Make primary". `ADMIN_NOTIFICATION_EMAIL` is no longer read by `account-security`. `submit-application` still reads it for new-application alerts (out of scope here).
- **`verify_jwt = false` for `account-security`.** The anonymous actions run before sign-in, and the app's publishable key is not a JWT, so the gateway check cannot stay. The handler already authenticated every other action itself with `getUser()` on the caller's token (no token: 401); that check now carries the whole load. The anonymous actions are an explicit allow-list.
- **UI.** Settings → My account → "Sign-in emails" (Owner only): the primary with a label, the aliases each with Make primary and Remove, and Add alias. EN and PT-PT through `t()`. Demo mode: the mock account service follows the same rules with the demo code 123456.
- **Records.** Migration `20261114164820_owner_sign_in_aliases.sql` (rollback in `supabase/rollback/`); new audit events `account_alias_added`, `account_alias_removed`, `account_primary_email_changed`; new emails: the alias code and a "main email changed" notice.

## Consequences
- Good: the handover needs no second Owner and no database edit; the developer's address can be removed by the client.
- Good: an alias never receives anything but its one-time code, and no answer reveals whether an address is an alias or what the primary is.
- Trade-off: `account-security` is now reachable without a JWT at the gateway. Its anonymous actions are rate limited and neutral, and Supabase Auth's own sign-in limits (shared by the function's IP) also apply, so a burst of alias attempts can make real sign-ins from the function answer `rate_limited` for a while.
- Trade-off: an Auth email chosen later that equals an alias (for example a new invitation to that address) is not blocked: `auth.users` is Supabase's table. A normal sign-in always wins; the alias is then shadowed.
- Trade-off: an Owner without 2FA cannot make a primary or remove an alias (aal2 is required); they turn on 2FA first. The platform policy already asks staff for it.
- Trade-off: the current session's token still carries the old email until it refreshes; the app refreshes it right after the swap.
- Deploy (needs the owner's go-ahead, not done here): apply the migration, then deploy `account-security` (its `config.toml` setting is now `verify_jwt = false`). Auth Site URL and redirect URLs are unchanged (`/reset-password` is already allowed).

## Alternatives rejected
- A second Owner row for the client: breaks "there is one Owner" (ADR-0029) and leaves the developer's account with Owner rights.
- Changing the Auth email directly with Supabase's own email change: it needs both inboxes and the old password, and gives no way to keep the old address as a sign-in only alias.
- A separate public Edge Function for the anonymous actions: the spec names `account-security` and its actions; it would also duplicate the Auth and email wiring.
- Sending security notices to aliases: an alias is a sign-in convenience, not a mailbox the platform promises to keep.

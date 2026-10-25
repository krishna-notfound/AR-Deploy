# Security review

Scope: multi-business catalog with Supabase (Postgres + RLS, Auth, Storage, one Edge Function) and a static Vite frontend on Vercel. Findings with IDs, severity and status: [PRODUCTION_READINESS.md §4](PRODUCTION_READINESS.md). Last updated 2026-10-26 (S1 section added).

## Trust boundaries

| Boundary | Enforced by | Evidence |
|---|---|---|
| Public visitor (anon) → catalog data | RLS: only `active` businesses and `published` products and their children; anon has SELECT on 5 tables only | PGlite RLS tests; live suite; live anon read check |
| Owner → own business only | RLS via `is_business_member()`; storage policies on the first folder = business id; image/model rows must reference the product's own business folder | PGlite isolation tests; live suite ("isolates businesses", "refuses to reference another business's private file") |
| Owner → catalog address/status | `guard_business_admin_fields` trigger (admins only) | PGlite + live suite |
| Becoming an owner | Admin-only `admin_add_business_member` (confirmed emails only); single-use hashed 7-day claim links (admin-issued); `register_business` creates drafts only, one pending per account, confirmed email required, serialised per account. A matching name/contact email grants nothing | PGlite (10 tests) + live suite (2 tests); ADR-0022 |
| Platform admin | `platform_admins` table, writable only by the service role / SQL editor | Live suite ("resolves roles … not from the client") |
| Analytics endpoint (public) | `track-event`: UUID/type validation, 1 KB body, product must be published in an active business, 30 events/min per visitor key, stores a salted hash, not the IP | Live suite (rate limit, insert-only) |
| Frontend role guard | UX only, not a boundary (CLAUDE.md) | — |

## Secrets

- Browser bundle: publishable key only; production build refuses `sb_secret_`/`service_role` keys and demo mode (`src/services/backendConfig.ts`).
- No secret keys in source or git history (Phase 0 scan).
- Service-role use in this programme: local, in-memory only, to create and delete QA users (2026-10-13); never printed, stored or committed.

## Open items (owner decisions)

- Leaked-password protection is off (advisor WARN; may need a paid plan). Minimum password length is 8 on production; 12 recommended before sign-ups open.
- Production sign-ups off. Before enabling: custom SMTP (e.g. Resend, needs DNS records), password minimum 12, redirect URL allowlist incl. `/reset-password`.
- `track-event` rate-limit key uses the first `X-Forwarded-For` entry (SEC-03); confirm the header layout before relying on the limit against a determined attacker.
- CSP is report-only (`vercel.json`); enforce after a live check including Scene Viewer / Quick Look launches.
- Privacy: analytics store no IP and no personal data; the business contact details are public by design. A privacy policy/consent decision for the client's jurisdiction is the client's call, not claimed here.

## S1: Account settings, 2FA and closure (ADR-0032)

Status: built and reviewed on a branch, not yet applied to Supabase. Migrations `20261025163627_account_settings` and `20261025180600_account_settings_optin_2fa`, Edge Function `account-security`.

### What is enforced, and where

| Control | Enforced by |
|---|---|
| 2FA for staff and business owners | The database access helpers (`private.mfa_satisfied`, `is_platform_admin`, `is_platform_member`, `platform_can`, `is_business_member`) answer false unless the JWT is `aal2`, when the policy switch for the group is on. Every RLS policy and admin function that uses them refuses an `aal1` session. The app's `SecurityGate` is UX only. |
| Opt-in 2FA | The same helpers also demand `aal2` whenever the caller has a verified factor, even with the policy off (`public.caller_has_verified_factor()`). A half-enrolled factor does not count. |
| Who can change the policy | Only the Owner, only at `aal2` (RLS on `platform_settings`). The change is audited (`platform_security_policy_changed`). The UI refuses the staff switch until the Owner has 2FA, so the Owner cannot lock themselves out. |
| Own profile and photo | RLS on `profiles` (own row); the avatar path must sit in the user's own folder of the `avatars` bucket. Size, type and 256 px resize are checked in the browser, the bucket limits the type and size. |
| Action codes (risky actions) | `account-security` and `service_*` functions callable only by `service_role`. 6 digits, 10 minutes, 5 attempts, 5 codes per user per hour, a newer code voids older ones, stored as sha256(salt + code) in `private.action_codes` (no API role access). Checked on the server, never in the browser. A code whose email failed is voided. |
| Recovery codes | 8 per set, about 49.5 bits each from a CSPRNG, stored only as sha256(salt + code) in `private.recovery_codes`, single use, regenerated with an emailed code. Redeeming one removes the second factor and the other codes. Redeeming needs an `aal1` session (a signed-in `aal2` person turns 2FA off with an emailed code instead). |
| Disabling 2FA | Needs `aal2` and an emailed code, and is refused while the policy requires 2FA for the person's group. |
| Account closure | A business owner's request takes the business offline (the previous status is kept) and emails the platform; only the Owner at `aal2`, with an emailed code, completes it. The Owner account cannot be closed. Admin and Team members end their own access at once. |
| Email and password change | Supabase Auth: current password required, secure email change (both addresses confirm), security notification emails (runbook has the dashboard steps). The app logs the request in the audit log. |
| Audit | `account_*` events in `audit_events` (sign-in, password, email request, 2FA on and off, recovery, reset, closure steps, deletion). A person reads their own last 50. Codes and secrets are never logged; the deleted user's address is stored as a hash. |

### Hardened during review

- **Storage policies gated.** The eight `business-logos` and `product-media` owner policies read `business_members` directly, which skipped the business 2FA rule (reproduced in a test). They now go through the gated helper, and the migration was swept for any other direct `business_members` policy.
- **Opt-in 2FA.** Found in review: with the policy off, a person who had turned 2FA on was still readable with only a password. Fixed by the second migration, with tests for policy off, policy on, half-enrolled factors and staff.
- **Retry-safe closure.** `account_closure_requests.business_id` is `on delete set null` and `service_closure_target` does not inner-join `businesses`, so a retry after a failed login delete does not delete the business twice or lose the request. The Owner account is refused as a target. Cancelling a request restores the previous business status, not "active".
- **Action-code limits.** The per-hour cap counts replaced and voided codes too, so a failing mail provider cannot be used to send more. Creating a code and replacing a recovery set take per-user advisory locks, and checking a code or redeeming a recovery code locks the row (no races on attempts or on single use).
- **Other:** the sign-up trigger never blocks a sign-up; `record_sign_in` is limited to 1 per 60 s per user and the user agent is cut to 200 characters; `log_account_event` allows only two client events.

### Accepted risks and open items

- **Leaked-password check and session time-boxes** are Pro plan only, so they stay off. The minimum password length in the app is 12.
- **Sign-ins started from an invite or a password reset are not recorded** in the security activity (only the normal sign-in screen records one).
- **Recovery-code redemption has no failed-attempt audit and no throttle.** A wrong code is refused but not logged. Brute force is impractical at about 49.5 bits per code, but a failed-attempt event would help detection.
- **A failed staff delete leaves an orphan login.** If `deleteUser` fails after a team member's access was ended, the login remains without a membership. The Owner removes it in Authentication → Users. The failure is audited (`delete_failed`).
- **Retry after a crash between deleting the business and the storage sweep** skips the sweep (best effort). Leftover files are noted in the audit event when the sweep itself fails.
- **The client IP from `X-Forwarded-For` is client-controlled.** The function stores it with security events as a log aid only. No decision, limit or lockout depends on it (the limits are per user).
- **A lost authenticator plus lost recovery codes for the Owner** is recovered from the SQL editor (runbook). Anyone with database access can do this, which is by design.
- **Closure flag hardening (minor):** the `app.account_closure` setting is not cleared right after the closure's own update.

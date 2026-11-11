# Security review

Scope: multi-business catalog with Supabase (Postgres + RLS, Auth, Storage, one Edge Function) and a static Vite frontend on Vercel. Findings with IDs, severity and status: [PRODUCTION_READINESS.md §4](PRODUCTION_READINESS.md). Last updated 2026-11-11 (ADR-0066 section added: password change and forgot-password audit).

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

Status: applied to `zggylkbgajamhriebdrg` on 2026-10-26 and checked live (31 of 31 API checks, `docs/PROJECT_COMPLETION_STATUS.md`). Migrations `20261025163627_account_settings` and `20261025180600_account_settings_optin_2fa`, Edge Function `account-security`.

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
| Email and password change | Email: Supabase Auth, current password required, secure email change (both addresses confirm), security notification emails (runbook has the dashboard steps); the app logs the request. Password: since ADR-0066 the `account-security` action `change_password` (current password, emailed code and, with 2FA, a fresh authenticator code; see the ADR-0066 section below). |
| Audit | `account_*` events in `audit_events` (sign-in, password, email request, 2FA on and off, recovery, reset, closure steps, deletion). A person reads their own last 50. Codes and secrets are never logged; the deleted user's address is stored as a hash. |

### Hardened during review

- **Storage policies gated.** The eight `business-logos` and `product-media` owner policies read `business_members` directly, which skipped the business 2FA rule (reproduced in a test). They now go through the gated helper, and the migration was swept for any other direct `business_members` policy.
- **Opt-in 2FA.** Found in review: with the policy off, a person who had turned 2FA on was still readable with only a password. Fixed by the second migration, with tests for policy off, policy on, half-enrolled factors and staff.
- **Retry-safe closure.** `account_closure_requests.business_id` is `on delete set null` and `service_closure_target` does not inner-join `businesses`, so a retry after a failed login delete does not delete the business twice or lose the request. The Owner account is refused as a target. Cancelling a request restores the previous business status, not "active".
- **Action-code limits.** The per-hour cap counts replaced and voided codes too, so a failing mail provider cannot be used to send more. Creating a code and replacing a recovery set take per-user advisory locks, and checking a code or redeeming a recovery code locks the row (no races on attempts or on single use).
- **Final review (whole branch):**
  - **Closure needs the second factor.** A closure request now needs `aal2` when the person has a verified factor or the policy covers them. Without this, someone who controlled only the inbox could reset the password and close a 2FA-protected account with an emailed code.
  - **Security activity needs the second factor.** `list_my_security_events` and the own-events policy now follow the caller's 2FA rule, so a password-only session can't read sign-in times, devices or IPs.
  - **No actor IP on someone else's events.** Events about another person (an Owner's 2FA reset, closure steps) no longer store the actor's IP.
  - **Mid-session checks.** The app re-checks the security state on focus, visibility and route changes (at most every 30 s) and every 3 minutes at `aal1`. A policy switched on mid-session therefore reaches people already signed in, instead of leaving them on empty tables.
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
## S1.5: Business-logic fixes (ADR-0033)

Status: built on the branch; to be applied to `zggylkbgajamhriebdrg` after the pre-flight in `docs/OPERATIONS_RUNBOOK.md` ("Business-logic fixes (S1.5)"). Migration `20261026041731_business_logic_fixes`. Source: the 2026-10-26 audit (`docs/audits/2026-10-26-business-logic/`) and `docs/superpowers/specs/2026-10-26-business-logic-fixes-design.md`.

### What is enforced, and where

| Control | Enforced by |
|---|---|
| 2FA before permission on Edge Functions (R-W1-1) | `_shared/gate.ts` builds a caller client from the caller's token, checks `caller_mfa_satisfied()`, then the gated helper (`platform_can('owners.manage')` or `is_platform_admin()`). It covers `provision-owner`, `invite-member`, `send-test-email`, `review-application` and `notify-business-owner`. An `aal1` caller gets 403 `aal2_required` before anything is created or sent. `service_user_can` is no longer used for caller checks (it is not 2FA-aware). `manage-member` is not wrapped by the gate: its permission checks run in SQL through the gated helpers, so the rule still applies. |
| Other people's security activity (R-W1-4) | The audit read policy for platform members excludes `account_%` events. Only the Owner reads other people's sign-ins, 2FA changes and closure steps. The Audit log hides sign-ins unless the Owner ticks "Show sign-ins". |
| Profile visibility (R-W1-5) | A row is readable by its owner, the platform Owner, staff with `access.view` or `records.view` (staff profiles), and staff with `businesses.view` (business owners' profiles). It uses `public.platform_can_read_profile(uuid)`, a definer function that is not in the spec's function list. It exposes one fact: whether a given user id is staff or an owner. Only callers who can already list those people can use it that way. |
| Owner permissions (R-W1-6) | `my_platform_access()` returns all 15 permissions for the Owner, whatever the Admin and Team sets hold. The Owner test stays ungated (`exists platform_admins`), so an Owner at `aal1` can still reach 2FA setup. It reports a role only, and every data path stays gated. |
| Permission prerequisites (R-W3-3) | `private.permission_prerequisites()` and `admin_set_role_permissions` store a role set with everything it needs. The storage delete policies follow the permission that deletes the row. The one-off backfill can widen an existing role; the runbook pre-flight shows it first and each change is audited. |
| Staff passwords, invitations (R-W1-7 to R-W1-9) | Staff passwords are 12 to 72 characters. An email with any platform-team row cannot be invited as a business owner (`email_is_admin`). `/accept-invite` never sets the password of whoever is signed in. |
| Closure integrity (R-W1-2, R-W1-3) | A closure request belongs to the owner's membership: removing the owner voids it. A trigger refuses `status = 'active'` while a request is open (`closure_pending`), even for the Owner; only cancel or restore (which set `app.account_closure`) bring the business back. |
| History survives deletion (R-W7-1) | `audit_events.business_id` is no longer a foreign key. A `BEFORE INSERT` trigger stores the business name and the actor's role label (never an email or name) in the metadata. Business owners can read a fixed list of platform changes to their own business. |
| Submission limit (R-W2-10) | `submit-application` counts **attempts**, not stored rows (`private.application_attempts`, 5 per submitter per hour, checked before the duplicate lookup), so a probe that only gets 409 is limited too. The submitter hash includes the UTC date, so it changes daily and cannot link a person across days. A key replay is never rate limited. |
| Owner-invitation limit (R-W2-4) | `private.owner_invite_attempts`: 60 s between sends and 10 per business and recipient in a rolling 24 h, reserved under an advisory lock before the code is made. Removing and re-inviting the same address counts in the same window. |
| Email status integrity (R-W7-3 to R-W7-5) | Provider events apply by rank (a late `delivered` never replaces `bounced`); `email.suppressed` maps to `bounced`; an event that arrives before its log row is stored and applied later. |
| Analytics | Deleted products keep their events (`product_id` set to null) and show as "Deleted products". Deleting a business still removes its events. Embed loads are recorded as `embed_view`. |

### Documented as is (TEAM-20)

Team members with "Create and edit products" change published products directly; there is no review step. Remove that permission if Team should only prepare drafts.

### Accepted risks and open items

- **The backfill can widen access.** The pre-flight lists the roles and the permissions they would gain. The owner approves or narrows the sets first.
- **The Owner cannot Activate a closing business directly** (by design). Restore stays available.
- **Owner notices are best effort.** The dashboard calls `notify-business-owner` after the change, so a closed tab means no email. The "Changes by the platform team" list is the durable record.
- **Review function ordering.** `review-application` loads the application with the service role before it checks the per-action permission, so a staff member without approve or reject can tell a missing application (404) from a forbidden one (403). They can already see the application list with `applications.view`. Minor.
- **Midnight race on the submission limit.** The advisory lock is per hash, so two requests at the UTC date change can admit one extra attempt. Replays are not limited by age. Both are minor.
- **Concurrent invitations.** The "account created by this request" test in `provision-owner` can misfire in a narrow same-email race. Accepted as specified. Real two-connection races are checked in the live checks (`docs/TEST_PLAN.md`), because the test database runs sequentially.
- **The `auth.users` email-sync trigger** runs inside Supabase Auth's update. It never raises, and a test asserts that an exception inside it does not block an email change.
- **Rolling back the analytics foreign key** deletes the rows kept for deleted products (stated in the rollback script header and the runbook).
- **Embed views before the release** were stored as page views and cannot be split. The analytics page says so.
- **Moved out of this release:** address history and redirects (BIZ-04, PUB-03), the not-found window (PUB-04), the stale-product-save check and the Email log page. They are tracked in S2 and S4.

## S4: 3D model requests (ADR-0034)

Status: built on the branch `s4/integration`; to be applied to `zggylkbgajamhriebdrg` after the pre-flight in `docs/OPERATIONS_RUNBOOK.md` ("S4 3D model requests"). Migration `20261026120000_s4_model_requests`. Source: `docs/superpowers/specs/2026-10-26-s4-3d-model-requests-design.md`.

### What is enforced, and where

| Control | Enforced by |
|---|---|
| Who handles requests (R-S4-1) | The 16th permission, `models.manage`, through `platform_can()`, which is 2FA-aware. Each `admin_*` request function checks it (`aal2_required` before `forbidden`). The role editor and the nav item are UX only. |
| Own 3D uploads (R-S4-2, R-S4-3) | `businesses.allow_own_models` is changed only by `admin_set_own_models` (a `BEFORE UPDATE OF` trigger refuses direct updates, for staff and owners alike). With the switch off, `can_write_own_models()` is false and triggers on `product_models` and `product_variant_models`, `save_product` and the `product-media` storage policy refuse GLB and USDZ writes with `own_models_not_allowed`. The editor hiding the controls is not the boundary. |
| Request privacy (R-S4-5, R-S4-6) | Request photos are in the private `model-request-photos` bucket. `anon` cannot read them. A member reads and adds only under their own business folder, and cannot add to a request already sent. Staff read them only with `models.manage`; a Team member with `products.view` alone cannot. Photos are shown through signed URLs (1 hour). They are never copied into a catalog gallery. |
| Request rows | Reads are plain selects under RLS (members of the business and `models.manage` staff); writes only through the definer functions. No API write grants on the three request tables, and `anon` cannot execute any new function. |
| Hidden until ready (R-S4-16) | Public pages read only product and option model rows. Request rows, request photos and staged files are not readable by `anon` (RLS and storage). A model file is publicly readable only when a model row points at it, which only delivery writes. |
| Delivery (R-S4-13) | One transaction replaces the target's whole model set (`app.model_delivery` lets the trigger pass only inside it). A GLB is required. Replaced paths are returned only when no product row still uses them. |
| Stale model saves (R-S4-17) | `save_product` refuses a changed model set when `models_changed_at` is newer than the editor's copy (`models_changed_elsewhere`). Unchanged sets and `keep_models` skip the check, so a business with the switch off is never blocked. |
| Email (R-S4-15) | `review-model-request` (`verify_jwt = true`) uses the shared 2FA gate, runs the SQL as the caller, and emails the business owner once per workflow. The staff reason is escaped and limited to 1000 characters. An email failure does not roll the status back. |
| Clean-up (R-S4-18) | Product, option and business deletes and the closure sweep remove request photos and staged files; cancelling a request deletes its photos. |

### Accepted risks and open items

- **Staged files are readable by the business before delivery.** Staged GLB and USDZ files sit in the business's own `product-media` folder, so its owner could list that folder through the API and download a staged file. They are files of the owner's own product, never public, and not served by any public policy. Staging in the private bucket would need a cross-bucket copy at delivery. Accepted and documented.
- **A direct SQL call of an `admin_*` request function sends no email.** Only `review-model-request` emails. This matches `admin_review_application` (S1.5). The status and the owner's "Changes by the platform team" list are the durable record.
- **Request photos are kept after a request ends** (delivered or declined) so the team can revise a model; they are deleted on cancel and with the product, business or closure. They are customer data: the rollback refuses to drop the bucket while it holds objects.
- **Orphan files.** A tab closed mid-send leaves photos under an unused request id, and a failed clean-up after delivery leaves replaced files. Partial clean-up is reported to the person who acted; there is no sweeper.
- **Delivery replaces the whole set.** A business's own USDZ is removed when staff deliver only a GLB. The deliver dialog says so.
- **No limit on open requests per business** (owner decision, 2026-10-26). Staff decline abusive requests with a reason; there is no cost per request.
- **The backfills decide who keeps what.** Admin gains `models.manage`, and every business with a 3D file starts with own uploads on. The pre-flight shows both before anything is applied.
- **Mixed versions:** the old role editor would drop `models.manage` from a role it saves. The runbook says to keep the gap before the frontend release short and to leave roles alone during it.
- **Demo mode** keeps request photos and staged models in the browser session only, labelled as such. It is not a security boundary.

## ADR-0066: Password change verification and forgot-password audit (2026-11-11)

Status: built on `feature/sanctus-brand-design-system`; **nothing applied or deployed**. Migration `20261111160021_password_change_codes` (rollback `supabase/rollback/20261111_password_change_codes_rollback.sql`), Edge Function `account-security` (redeploy), frontend. Release order: migration → `account-security` → frontend (before the function is redeployed, the new buttons answer "invalid request").

### What is enforced, and where

| Control | Enforced by |
|---|---|
| Changing the password needs the current password | `account-security` `change_password`: a throwaway anon sign-in, after the emailed code (so the endpoint is no password oracle without the inbox). The browser checks it once before a code is sent (no code wasted on a typo); that check is UX. |
| ...and an emailed code | Purpose `change_password`: 6 digits, 10 minutes, 5 attempts, 5 codes per hour, newer replaces older, hashed (the S1 rules). |
| ...and, with 2FA on, the authenticator code | The session must be aal2 and its JWT `amr` must hold a `totp` verification from the last 5 minutes (`totp_required` otherwise). The browser verifies the typed code with `mfa.challengeAndVerify` just before the call. A group that requires 2FA needs aal2 even without a factor. |
| New password rules | 12 to 128 characters and not the current one, on the server (both actions) and in the browser. |
| After a change or reset | Set with the service role (`auth.admin.updateUserById`), then `service_end_sessions` ends every session (this one too); `account_password_changed` / `account_password_reset` audit events with the IP; a `password_changed` / `password_reset` security notice email. Passwords are never logged, audited or emailed (handler tests check this). |
| Reset sets a password without the current one only for a fresh reset session | `reset_password`: the JWT `amr` must show a sign-in with an emailed code (`otp`, `recovery` or `magiclink`) in the last 15 minutes (`reset_expired` otherwise), and aal2 when the account has a verified factor (`aal2_required`). |
| Reset page | Not a boundary (the actions above are). Shows the new-password form only after its own code step; asks 2FA accounts for the authenticator (or a recovery code) first; dashboards send a mid-reset tab back to it (sessionStorage deadline, 15 minutes). |

### Forgot-password audit

Checked end to end on 2026-11-11 (request page, email code, `ResetPasswordPage.tsx`, `services/supabase/auth.ts`, the new `reset_password` action). The hosted Auth behaviour marked "per Supabase Auth source" was read from the open-source Auth server, not tested on the client project.

| # | Finding | Severity | Status |
|---|---|---|---|
| PW-1 | `/reset-password` showed "Choose a new password" to **any** signed-in session (SEC-12): someone at an unlocked, signed-in browser could set a new password without the current one, a code or 2FA. | High | **Fixed.** The form appears only after this page's code step; another session gets "You are signed in" with Settings or "Sign out and reset". The server action refuses a session without a recent emailed-code sign-in. |
| PW-2 | A 2FA account went from the reset code (an aal1 session) straight to the new password. Per Supabase Auth source, `updateUser({ password })` then fails (`insufficient_aal`), so the reset could not finish and said so unclearly; had Auth accepted it, the reset would have skipped 2FA. | High | **Fixed.** After the code, `TwoFactorStep` (authenticator, or a recovery code, which removes 2FA as at sign-in); `reset_password` needs aal2 when a verified factor exists. |
| PW-3 | A recovery session could leave the reset page and use the dashboards. | Medium | **Fixed (UX).** `RequireRole` sends the tab back while a reset is in progress. Not a boundary: for an account without 2FA the code holder controls the inbox, which already equals a sign-in; a 2FA account stays aal1, which the database refuses. |
| PW-4 | Other sessions after a reset were ended only by a best-effort browser call. | Medium | **Fixed.** The server ends every session (`service_end_sessions`). Access tokens already issued stay valid until they expire (at most the JWT lifetime, 1 hour by default), as with every Supabase sign-out. |
| PW-5 | No audit event after a reset; the notice email depended on Supabase's "Password changed" notification setting (not checked). | Medium | **Fixed.** `account_password_reset` event (shown in Security activity) and a `password_reset` notice from `account-security`. |
| PW-6 | Password rules: the reset page checked only the 12-character minimum, in the browser; the server-side minimum is the Auth setting (last known 8 on production, PRODUCTION_READINESS, not checked). | Medium | **Fixed for the app's path** (12 to 128 on the server in both actions). The direct Auth path follows the dashboard minimum: the owner sets it to 12 (below). |
| PW-7 | Account enumeration: the copy was already neutral, but Supabase's per-address resend limit (`over_email_send_rate_limit`) only fires for an existing account and was shown as an error. | Low | **Fixed in the app** (answered like a send; 60 s wait before a resend). **Open at the API**: a direct call to `/auth/v1/recover` still shows the 429 and a timing difference (an email is sent only for a real account). Supabase behaviour; accepted. |
| PW-8 | "Send a new code" had no cooldown. | Low | **Fixed.** 60 seconds (Supabase's default per-address frequency). |
| PW-9 | An expired, used or malformed link (old emails, Supabase's `#error=…` redirect) had no clear page, and its parameters stayed in the address bar. | Low | **Fixed.** A notice ("no longer valid, ask for a code below") and the token or error parameters are removed from the URL (`history.replaceState`). |
| PW-10 | The reset redirect URL was built in the page (`window.location.origin`). | Low | **Fixed.** `passwordResetRedirectUrl()` in `src/lib/urls.ts`. |
| PW-11 | Token leaks (logs, analytics, Referer). | Info | Checked: reset emails carry a code, not a link (ADR-0027), so no token is in a URL; the page loads only Google Fonts CSS, and `Referrer-Policy: strict-origin-when-cross-origin` (vercel.json) sends the origin only; no analytics script runs on it; the services log no codes or passwords. |
| PW-12 | Guessing the 8-digit reset code. | Info | Supabase's verify rate limit (30 per 5 minutes per IP by default; the hosted value is not checked) and the 1-hour expiry (ADR-0027). Unchanged. |
| PW-13 | An invited owner who resets the password before accepting. | Info | The reset no longer calls `complete_owner_onboarding` (its session ends at once); the sign-in that follows accepts the membership (`record_sign_in`), as before for a failed call. |

### Supabase Auth settings the owner must switch (dashboard; cannot be read or changed from here)

The app's own paths are enforced on the server. **Supabase Auth itself still accepts `PUT /auth/v1/user { "password": … }` from any signed-in session** (that is what supabase-js `updateUser` calls). These settings narrow that direct path; **none of them can make it require our emailed code**, so that part stays open (below). Do not use `supabase config push` (it would push the local development Auth config).

1. **Authentication → Sign In / Providers → Email → "Secure password change": on.** Auth then asks for a recent sign-in (session younger than 24 hours) or an emailed reauthentication code before a password change.
2. **Same page → "Require current password when updating": on** (where the dashboard shows it; some versions label switch 1 this way). The direct call then needs the current password (`current_password_mismatch` / `current_password_required`).
3. **Same page → "Minimum password length": 12** (and leaked-password protection where the plan allows), so the direct path uses the same minimum as the app.
4. **Authentication → Emails → Security notifications → "Password changed": on.** A second, Supabase-sent notice for any password change, including one made through the direct path.
5. Built in, nothing to switch: per Supabase Auth source, an account with a verified factor can change its password through Auth only from an aal2 session.

**Open until then, and after:** someone who already holds a signed-in session **and** the current password (and, for a 2FA account, an aal2 session) can still change the password through the direct Auth call without the emailed code; with settings 1 and 2 off, a session alone is enough for an account without 2FA. Detection: setting 4, plus the missing `account_password_changed` event in Security activity. Prevention would need a database trigger on `auth.users` refusing changes that did not come through `account-security` (ADR-0066 "Alternatives rejected"); that is an owner decision.

### Other notes

- Both actions read the JWT `amr` claim with timestamps (Supabase's default). A custom access-token hook that rewrote `amr` to bare names would make them refuse (fail closed): check this if such a hook is ever added.
- A password change now signs out this device too (the admin update ends every session); the person signs in again.
- Demo mode runs both flows on labelled harnesses (code 123456, reset code 12345678, nothing emailed); not a security boundary.

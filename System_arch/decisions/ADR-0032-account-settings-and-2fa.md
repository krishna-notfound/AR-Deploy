# ADR-0032: Account settings hub and authenticator-app 2FA
- **Status:** Accepted
- **Date:** 2026-10-26
- **Affects:** design/19-supabase.md, design/23-email.md, tasks/P12-team-roles-and-addons.md (P13 S1), ADR-0029
- **Spec:** `docs/superpowers/specs/2026-10-25-account-settings-s1-design.md`

## Context
The owner asked for production-level settings: a person can change their email and password, turn on 2FA, and set a name, photo and preferences. 2FA must also protect risky actions such as account deletion. Every role needs it: the platform Owner, Admins, Team members and business owners. The owner chose an authenticator app plus an emailed code before risky actions, a full-screen hub like Discord, and "request closure, then the platform confirms" for deletion.

## Decision
- **Settings hub:**
  - Settings is a full-screen view (× or Esc returns to the previous page), opened from the user menu and the Settings nav item.
  - My account, Profile, Security & 2FA, Notifications, Preferences and Security activity are shared by every role.
  - Business profile shows for business owners. General and Security policy (under Platform) show for the Owner only.
  - The two dashboards stay English-only. (Superseded by ADR-0044, 2026-10-29: the dashboards are now EN and PT-PT.)
  - The hub is the extension point for S2 to S4.
- **Profiles are the single source for name and photo.**
  - `public.profiles` has one row per auth user, created by a trigger on sign-up (a failure there never blocks a sign-up).
  - It holds the display name, the avatar path, timezone, date format, clock and notification choice.
  - The photo lives in the `avatars` bucket under `<user_id>/<uuid>.<ext>`.
  - It is resized to 256 px in the browser, at most 512 KB, as jpeg, png or webp.
  - Team lists, the user menu and the hub read the name and photo from here. Nothing is copied into `platform_members` or the Auth metadata.
- **2FA is an authenticator app (TOTP) through Supabase Auth MFA.**
  - SMS is not used: it costs money per message and is open to SIM-swap attacks.
  - Email is not used as a second factor either. NIST SP 800-63B does not accept it as an independent factor, and the mailbox is already the password-reset channel.
  - Enrolment shows a QR code and the secret, and finishes with a typed code.
- **Emailed action codes for risky actions.**
  - The actions are: turning 2FA off, regenerating recovery codes, requesting closure, the Owner resetting someone's 2FA, and the Owner completing a closure.
  - They sit on top of the second factor. They are step-up proof, not a replacement for 2FA.
  - The `account-security` Edge Function sends a 6-digit code. It is valid 10 minutes and has 5 attempts. The limit is 5 codes per user per hour. A newer code voids the older ones, and the app waits 30 s between sends.
  - Codes are stored as sha256(salt + code) in `private.action_codes`, which the API roles cannot read. They are checked only on the server, in the `service_*` functions.
  - If the email fails to send, the code is voided and the caller gets `email_failed`.
- **Recovery codes are hashed.**
  - A set is 8 codes of 10 characters, shown as `XXXXX-XXXXX`, from a 31-character alphabet (about 49.5 bits each) drawn from a CSPRNG.
  - They are stored as sha256(salt + code) in `private.recovery_codes`. The plain codes are shown once and never stored or logged.
  - The first set comes with enrolment. Regenerating a set needs an emailed code.
  - A pasted code is compared without case, spaces or the dash, and works once.
  - Using one signs in a person who has lost their device. It removes their second factor and the remaining codes, and they then set 2FA up again.
- **2FA is enforced by the database access helpers, not by the UI.**
  - `private.mfa_satisfied(scope)` and the invoker helpers `is_platform_admin()` and `is_business_member()` answer false unless the JWT is `aal2`, when a rule applies. The helpers built on them (`is_platform_member()`, `platform_can()`) follow.
  - The business-logos and product-media storage policies went through the helper too, because they had read `business_members` directly.
  - **Policy switches:** `public.platform_settings` has one row, with `require_2fa_staff` and `require_2fa_business`. Only the Owner can change it, only at `aal2`, and each change is audited.
  - **Opt-in 2FA (second migration):** with a switch off, the rule is still "aal2, or no verified factor". A person who turned 2FA on cannot read their data with a password alone. A half-enrolled factor does not count.
  - **Not gated**, so a person at `aal1` can still finish setup or the code step: the own profile row, `platform_settings`, `my_security_state`, `record_sign_in` and the Auth MFA APIs.
  - The app's `SecurityGate` shows "Set up 2FA" or the code step when RLS would refuse. It is UX only. If the security state fails to load, the gate lets the person through (RLS still decides).
- **Owner lockout guard.**
  - "Require 2FA for staff" cannot be switched on until the Owner's own 2FA is on and the session is at `aal2`.
  - The `platform_settings` update policy also demands `aal2`.
  - An Owner who loses both the device and the recovery codes is recovered from the SQL editor (see the runbook).
- **Closure request flow.**
  - A business owner asks with an emailed code. The business goes `inactive`, its previous status is remembered in `account_closure_requests`, and the platform is emailed.
  - The owner can cancel from the app, which restores the previous status.
  - The platform Owner completes it with an emailed code. That deletes the business (storage swept best-effort) and then the login. The Owner can also restore the account instead.
  - An Admin or Team member's request takes effect at once, since there is no business to review. Access ends, sessions end and the login is deleted.
  - The Owner account cannot be closed this way.
  - Retries are safe: `account_closure_requests.business_id` is `on delete set null`, so a retry after a half-finished delete still finds the request.
- **Audit.** Sign-ins, password and email changes, 2FA on and off, recovery use, resets, closure steps and policy changes write `account_*` rows to `audit_events`. A person reads their own last 50. Emails to the account holder announce each credential or 2FA change. The audit log never holds codes or secrets.

## Consequences
- Good: 2FA holds even if the browser is tampered with. Risky actions need a second proof from the mailbox. Nothing secret is stored in plain text.
- Good: one settings hub for all roles, and S2 to S4 add sections without new navigation.
- Trade-off: both migrations must go live together with a frontend that has the 2FA gate (a person with 2FA would otherwise see refused requests). See the runbook release order.
- Trade-off: a lost authenticator plus lost recovery codes cannot be fixed in the app for the Owner. Recovery is a SQL step.
- Trade-off: the leaked-password check and session time-boxes need the Supabase Pro plan, so they stay off. Open items are in `docs/SECURITY_REVIEW.md`.
- Trade-off: the client IP comes from `X-Forwarded-For`, which a caller can set. It is a log aid, not a control.

## Alternatives rejected
- SMS codes: per-message cost and SIM-swap exposure.
- Email as the second factor: not an independent factor (NIST), and the same mailbox resets the password.
- Enforcing 2FA only in the UI: the role guard is not a security boundary, so the database has to refuse.
- Policy-only enforcement (2FA required only when a switch is on): a person who enabled 2FA would still be readable with a password alone. Rejected after review; the opt-in migration fixes it.
- Plain or reversibly encrypted recovery codes: a database read would give account access. Hashing is enough at this entropy.
- Hard-deleting the account at once on request: a mistaken click would destroy a catalog. The platform reviews first.
- Name and photo copied into each table that shows a person: copies drift. `profiles` is the one source.
- A custom backend for the code mail: Supabase Edge Functions are the only backend (ADR-0015).

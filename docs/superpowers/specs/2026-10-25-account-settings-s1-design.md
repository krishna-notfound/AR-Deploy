# S1: Settings hub, account security and 2FA

**Status:** design approved by the owner in conversation (2026-10-25). Sections 1–3 approved; layout B (full screen, like Discord) chosen.
**Source:** the owner's request, recorded verbatim in `System_arch/tasks/P12-team-roles-and-addons.md` → P13.
**Sub-project:** S1 of 4. S2 (platform site controls and the business catalog page), S3 (the application form builder) and S4 (3D model requests) each get their own spec and plug into the hub this spec builds.
**Working rules:**
- Build on `feature/sanctus-brand-design-system`, spec-driven and test-first.
- Build for real Supabase (project `zggylkbgajamhriebdrg`). Demo mode is only the test harness: minimal stand-ins so the app runs with no env vars (CLAUDE.md rule) and Vitest and Playwright can drive the UI. No demo-only features.

## 1. Goal

Every signed-in person can manage their own account and security in one place, to production standards:
- the platform Owner, Admins and Team members;
- business owners.

The Owner can require 2FA, and that requirement is enforced by the database, not only by the UI.

## 2. Research basis (summary)

- **Products studied:** Linear, Vercel, Stripe, GitHub, Notion, Shopify, Figma, Webflow and Supabase. Each has one personal "account" area, kept separate from organisation or business settings.
- **Common patterns these products share:**
  - re-authentication before sensitive changes (GitHub's "sudo mode");
  - email change confirmed at both addresses (Linear);
  - 2FA set up with a QR code, a typed code and recovery codes (GitHub, Vercel);
  - "Sign out all other sessions" (Stripe, Linear);
  - a security activity log (Webflow).
- **Standards:**
  - **OWASP ASVS 5.0** (V6.2.3, V7.5.1, V6.3.7, V6.5.1–3, V16.3.1):
    - check the current password before changing it;
    - re-authenticate before changing email or MFA;
    - notify the user on every credential or MFA change;
    - recovery codes are single-use, CSPRNG-generated and stored hashed;
    - log authentication events.
  - **NIST SP 800-63B-4:**
    - passwords are 8–64+ characters, with no composition rules and paste allowed;
    - email is not an acceptable second factor;
    - recovery must not bypass MFA.
- **What Supabase supports:**
  - Free on every plan: TOTP MFA (`mfa.enroll/challenge/verify/unenroll`, `getAuthenticatorAssuranceLevel`) and the `aal` JWT claim.
  - Secure email change (both addresses) and `user.new_email` for the pending state.
  - `updateUser({ password, current_password })` with the "current password required" setting (supabase-js 2.117.3 in this repo, so ≥2.102 ✓).
  - `signOut({ scope: 'others' })`.
  - Seven built-in security notification email templates.
  - **Not available:** native recovery codes, and a client API to list sessions or devices.
  - **Paid only:** phone MFA, plus leaked-password checks and session time-boxes (Pro plan).
- **The owner's choices:**
  - 2FA uses an authenticator app, with an on/off switch in settings, plus an emailed code before risky actions.
  - Deletion is a request that the platform confirms.
  - Extras: email notifications, profile photo, security activity, timezone and date format.
  - A "complete your profile" setup on first sign-in.
  - A full-screen settings layout, like Discord.

## 3. Scope

### In scope (S1)
1. **Settings hub:** a full-screen view grouped like Discord, with deep links per section and redirects from the old settings URLs.
2. **Your account:**
   - **My account:** email, password and account closure.
   - **Profile:** name and photo.
   - **Security & 2FA:** authenticator, recovery codes and sign out other devices.
   - **Notifications, Preferences and Security activity.**
3. **Your business, for business owners:** Business profile. Today's `BusinessSettingsPage` content moves here unchanged. The S2 sections are not shown until S2 ships.
4. **Platform, Owner only:**
   - **General:** today's `AdminSettingsPage` content, minus its read-only Profile card, which My account and Profile replace.
   - **Security policy:** "Require 2FA for staff" and "Require 2FA for business owners".
5. **2FA at sign-in:** the code step, recovery-code sign-in, and a forced setup when the policy requires 2FA.
6. **Emailed action codes** for risky actions, checked on the server.
7. **Owner support action:** reset a person's 2FA.
8. **Account closure:** the request, cancel, and the Owner's "Complete closure" or "Restore".
9. **"Complete your setup"** onboarding, plus the Overview progress card.
10. **Dashboard date formatting** follows each user's timezone and date-format preference.

### Out of scope (S1)
- SMS or phone 2FA (paid add-on), passkeys, Google identity linking.
- Device and session lists (no Supabase API).
- Leaked-password checks and session time-boxes (Pro plan only). They are documented as dashboard toggles if the project is on Pro.
- The S2, S3 and S4 features.
- A dashboard language preference (the dashboards are English-only by project rule).
- Data export (S2).

## 4. Who sees what

| Section | Business owner | Team | Admin | Owner |
|---|---|---|---|---|
| My account, Profile, Security & 2FA, Notifications, Preferences, Security activity | ✓ | ✓ | ✓ | ✓ |
| Your business → Business profile | ✓ | – | – | – |
| Platform → General, Security policy | – | – | – | ✓ |
| Account closure | request (platform confirms) | self-delete | self-delete | not allowed (explained) |
| Reset someone's 2FA | – | – | – | ✓ (staff and business owners) |

## 5. Routes and layout

### Routes
- **Business owners:** `/dashboard/settings/:section`, where the sections are `account`, `profile`, `security`, `notifications`, `preferences`, `activity` and `business`.
- **Staff:** `/admin/settings/:section`. Staff get the same account sections, plus `platform` and `security-policy` for the Owner.
- **Redirects:**
  - `/dashboard/settings` → `/dashboard/settings/account`;
  - `/admin/settings` → `/admin/settings/account`.
  - Unknown sections redirect to `account`.
  - A section the role can't see redirects to `account`, with no error flash.

### Layout
- A full-screen view outside `DashboardShell`. It still carries `data-surface="dashboard"`, so the ADR-0031 type, Inter and portals all apply.
- A left section list in groups ("Your account", "Your business", "Platform"). The group headings are sentence-case, 13px muted text, never uppercase.
- The content column is at most 720px wide.
- An × button (top right) and **Esc** return to the page that opened settings. If settings was opened directly, they go to `/dashboard` or `/admin`.
- "Sign out" sits at the bottom of the section list.
- **At 390px:** the section list is the first screen, and tapping a section opens it with a "‹ Settings" back link (Discord mobile pattern). There is no horizontal scroll.

### Entry points
- The sidebar user block (avatar, name and email) becomes a menu button opening a menu with "Account settings", "Security & 2FA" and "Sign out". The switch-account and sign-out icons keep working.
- The "Settings" nav items (Business Settings and the Owner's Settings) open the hub.

## 6. Data model (one new migration, made with `npx supabase migration new account_settings`)

### Tables

**`public.profiles`**
- **Columns:**
  - `user_id uuid primary key references auth.users on delete cascade`
  - `display_name text check (char_length(display_name) between 1 and 80)`
  - `avatar_path text`
  - `timezone text not null default 'Europe/Lisbon'`
  - `date_format text not null default 'd MMM yyyy' check (date_format in ('d MMM yyyy','dd/MM/yyyy','yyyy-MM-dd'))`
  - `clock text not null default '24h' check (clock in ('24h','12h'))`
  - `notify_new_applications boolean not null default true`
  - `onboarding_completed_at timestamptz`
  - `onboarding_dismissed_at timestamptz`
  - `updated_at` (trigger `set_updated_at`)
- **Row-level security:**
  - **select:** `user_id = auth.uid()`, or the caller is a platform member or Owner. Staff need names and photos for team lists and audit.
  - **insert and update:** `user_id = auth.uid()` only.
  - **delete:** none.
- **Backfill:** a migration step backfills a row for every existing auth user. `display_name` comes from `raw_user_meta_data->>'display_name'`, then `platform_members.full_name`.
- **Trigger:** a security definer trigger on `auth.users` insert creates the row.
- **Timezone check:** `timezone` must be a valid IANA zone, checked against `pg_timezone_names` in a validation trigger.

**`public.platform_settings`**
- **Columns:**
  - `id boolean primary key default true check (id)` (one row only)
  - `require_2fa_staff boolean not null default false`
  - `require_2fa_business boolean not null default false`
  - `updated_at`
  - `updated_by uuid`
- **Row-level security:** select for every authenticated user, because the app must know the policy to guide setup. Update only when the Owner is signed in at aal2 (`is_platform_admin()` and `auth.jwt()->>'aal' = 'aal2'`).
- **Change log:** every change writes an audit event, `platform_security_policy_changed`.

**`private.action_codes`** (no API access)
- **Columns:**
  - `id`
  - `user_id`
  - `purpose text check (purpose in ('disable_2fa','regenerate_recovery','request_closure','owner_reset_2fa','complete_closure'))`
  - `code_hash text`, a sha256 of the code plus a per-row salt
  - `expires_at` (now + 10 minutes)
  - `attempts int default 0` (maximum 5)
  - `consumed_at`
  - `created_at`
- **Code generation:** a new code for the same user and purpose invalidates the older ones.
- **Rate limit:** at most 5 codes per user per hour.

**`private.recovery_codes`** (no API access)
- **Columns:** `id`, `user_id`, `code_hash` (sha256 with a per-user salt), `used_at`, `created_at`.
- **Codes:** 8 per set, 10 characters from a 32-character alphabet (about 50 bits each, CSPRNG), shown as `xxxxx-xxxxx`. A new set deletes the old one.

**`public.account_closure_requests`**
- **Columns:**
  - `user_id uuid primary key references auth.users on delete cascade`
  - `business_id uuid references businesses on delete cascade`
  - `requested_at`
  - `previous_business_status text`
- **Row-level security:** select by the user themself, or by platform members with `businesses.view`. There are no direct writes; all writes go through functions.

### Changes to existing tables

**Audit and email log**
- **Audit:** new `audit_events` types:
  - `account_signed_in`
  - `account_password_changed`
  - `account_email_change_requested`
  - `account_2fa_enabled`
  - `account_2fa_disabled`
  - `account_recovery_used`
  - `account_recovery_regenerated`
  - `account_2fa_reset_by_owner`
  - `account_closure_requested`
  - `account_closure_cancelled`
  - `account_closure_completed`
  - `account_closure_restored`
  - `account_deleted`
  - `platform_security_policy_changed`
- **Audit read policy:** a new additive policy lets a user read their own account events: `actor_id = auth.uid()` or `metadata->>'subject_id' = auth.uid()::text`, and `event_type like 'account_%'`.
- **Email log:** `email_log.kind` gains `security_code`, `security_notice` and `closure_request`.

**Storage**
- A new bucket, `avatars`: public read, so `<img>` tags work without signed URLs. The photos are not secret.
- Size limit 512 KB. Types `image/jpeg`, `image/png` and `image/webp`.
- Insert, update and delete only under `avatars/<auth.uid()>/…`.

**Enforcing "require 2FA"**
- A helper, `private.mfa_satisfied(scope text)`. The rule is `aal2 OR (policy off AND no verified factor)`: it returns true when `auth.jwt()->>'aal' = 'aal2'`, or when the policy for that scope (`staff` or `business`) is off and the caller has no verified factor in `auth.mfa_factors` (checked through `public.caller_has_verified_factor()`, security definer). So a user who turned on 2FA themselves needs aal2 even with the policy off (Supabase's opt-in pattern, migration `20261025180600_account_settings_optin_2fa`). An unverified factor does not count.
- `is_platform_admin()`, `is_platform_member()` and `platform_can()` add `and private.mfa_satisfied('staff')`. `is_business_member()` adds `and private.mfa_satisfied('business')`.
- Public catalog reads do not use these helpers, so they are unaffected.
- `service_*` functions (service role) are unaffected.
- **Guard:** `profiles` (own row), the auth MFA APIs and `my_security_state()` are not gated, so a user who is required to set up 2FA can still do it.

### RPC functions
- `public.my_security_state()` returns JSON:
  - `{ policy_requires_2fa: bool, aal: text, has_closure_request: bool, onboarding: { completed, dismissed } }`
- `public.record_sign_in(user_agent text)`:
  - security definer;
  - inserts `account_signed_in` with the user-agent summary (at most 200 characters);
  - rate-limited to 1 per user per 60 seconds through the existing `record_event_limited` pattern.
- `public.cancel_account_closure()`, called by the user themself. It restores `businesses.status` from `previous_business_status`, deletes the request and logs the event.

## 7. Edge Functions

Every function:
- uses `verify_jwt = true`;
- takes the caller's identity from `getUser()` on their JWT, never from the request body;
- keeps the service key in Edge Function secrets only;
- has a `handler.ts` (pure, dependencies injected) and an `index.ts` (wiring), following `invite-member`.

**`account-security`**, with these actions:
- **`send_code {purpose}`:**
  - creates an action code;
  - emails "Your Sanctus security code: 123456 (expires in 10 minutes)" via `_shared/email.ts`;
  - logs `security_code` in `email_log`;
  - always answers `{ ok: true, sentTo: masked-email }`.
- **`generate_recovery_codes {code?}`:**
  - **Gate:** the caller must be at aal2.
  - **The emailed code:** not needed on first enrolment (within 15 minutes of `account_2fa_enabled`, while no set exists). Required for a regenerate (`purpose regenerate_recovery`).
  - **Result:** returns the 8 plain codes once.
- **`redeem_recovery_code {code}`:**
  - the caller is at aal1 and has a verified TOTP factor;
  - checks the code and marks it used;
  - deletes all of the caller's TOTP factors via `auth.admin.mfa.deleteFactor`, and deletes the remaining recovery codes;
  - logs `account_recovery_used` and emails a security notice.
  - The client then refreshes the session and, if the policy requires 2FA, is sent to setup.
- **`disable_2fa {code}`:**
  - the caller is at aal2 and the emailed code is valid (`disable_2fa`);
  - deletes the factors and the recovery codes;
  - logs and notifies.
  - Blocked when the policy requires 2FA for the caller's group, with the error `policy_requires_2fa`.
- **`request_closure {code}`:**
  - **Gate:** a valid emailed code (`request_closure`).
  - **Business owner:**
    - sets `businesses.status = 'inactive'`, remembering the previous status;
    - inserts a closure request;
    - logs the event;
    - emails the owner a confirmation and the admin notification inbox an alert (`closure_request`).
  - **Admin or Team member:**
    - deactivates their `platform_members` row and ends their sessions (`service_end_sessions`);
    - deletes the auth user;
    - logs `account_deleted`, with the subject's email removed and replaced by a hash.
  - **Owner:** refused with `owner_cannot_close`.
- **`owner_reset_2fa {target_user_id, code}`:**
  - **Gate:** the caller is the Owner at aal2 with a valid emailed code (`owner_reset_2fa`).
  - **Target:** a platform member or business owner, never the Owner themself.
  - **Result:** deletes the target's factors and recovery codes, logs the event, and emails the target.
- **`complete_closure {target_user_id, code}`:**
  - **Gate:** the Owner at aal2 with a code (`complete_closure`).
  - **Result:**
    - deletes the business through the existing delete path, including storage objects;
    - deletes the auth user;
    - logs `account_closure_completed` (with the name and email removed);
    - emails a final notice to the person's address, captured before deletion.
- **`restore_closure {target_user_id}`:**
  - **Gate:** the Owner at aal2.
  - **Result:** restores the business status, deletes the request, logs the event and emails the person.

**Error contract:** every answer is `{ ok: true, ... } | { ok: false, error: <code> }`, reusing the `TEAM_ERRORS` pattern. The codes are:
- `invalid_code`
- `code_expired`
- `too_many_attempts`
- `rate_limited`
- `aal2_required`
- `policy_requires_2fa`
- `owner_cannot_close`
- `not_allowed`
- `email_failed`

**Data exposure:** action codes and recovery codes are never logged. The email log stores only the kind and status.

## 8. Client flows (Supabase mode)

- **Profile:**
  - **Name:** edit and save, with optimistic UI and rollback on error. The name is written to `profiles`; `user_metadata.display_name` is also updated for backwards compatibility.
  - **Photo:** upload, crop to a square in the browser (canvas, no new dependency), resize to 256px, then a WebP or JPEG of 512 KB at most. Remove is supported.
  - The avatar shows in the sidebar user block, the team list and member detail. When there is no photo, the initials appear.
- **Email change:**
  1. The user enters the current password, which is checked with `signInWithPassword` against the current email. Failure shows "Password is incorrect".
  2. Then `updateUser({ email }, { emailRedirectTo: <origin>/dashboard/settings/account })`.
  3. A pending banner shows `user.new_email`, with "Resend" (calls `updateUser` again) and "Cancel" (`updateUser({ email: currentEmail })`).
  4. The user is refreshed on `USER_UPDATED` and when the window regains focus.
  5. The event `account_email_change_requested` is logged by RPC.
- **Password change:**
  - fields: current, new and confirm;
  - the minimum is 12 and the maximum 128, with paste allowed;
  - a strength hint only, with no composition rules.
  - The call is `updateUser({ password, current_password })`. The errors `current_password_mismatch` and `same_password` are mapped to messages.
  - It is followed by `signOut({ scope: 'others' })`, a log entry and the Supabase "password changed" notice.
- **2FA setup:**
  1. `mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator' })`.
  2. Show the `qr_code` SVG and the setup key with a copy button.
  3. Run `challengeAndVerify` with the 6-digit code.
  4. On success, call `generate_recovery_codes`, show the codes (Copy, Download .txt) and require the "I saved these" checkbox before Done.
  5. Leftover unverified factors are removed before a new enrolment.
- **Sign-in:**
  1. After the password, call `getAuthenticatorAssuranceLevel()`. If `nextLevel === 'aal2'` and `currentLevel === 'aal1'`, show "Enter the 6-digit code from your authenticator app", with a "Use a recovery code" link.
  2. On success, call `record_sign_in`.
  3. When the policy requires 2FA and the user has no factor, an after-login gate renders a full-screen "Set up 2FA to continue" (the setup flow plus Sign out) instead of the dashboard.
- **Risky actions:** a shared `ActionCodeDialog`:
  1. "We emailed a 6-digit code to m•••@studio.pt";
  2. code entry and Resend (with a 30-second cooldown);
  3. the server error codes are mapped to plain messages;
  4. the action runs only when the server accepts the code.
- **Sign out other devices:** a button with confirmation, `signOut({ scope: 'others' })`, then a toast.
- **Notifications:** the `notify_new_applications` switch shows only for staff with `applications.view`. `submit-application` emails every opted-in staff member, plus `ADMIN_NOTIFICATION_EMAIL` as before, de-duplicated. A security-emails row is shown as always on.
- **Preferences:**
  - a timezone select (IANA list from `Intl.supportedValuesOf('timeZone')`), a date-format radio and a clock radio;
  - `src/lib/format.ts` functions take the preference from a `PreferencesProvider` context and use `Intl.DateTimeFormat` with the user's timezone. The defaults match today's output.
- **Security activity:**
  - the last 50 own `account_%` events, as a list with time (the user's format), event label, device (parsed user agent: browser and OS) and IP, when one of our functions recorded it;
  - an empty state, and loading and error states.
- **Closure (business owner):**
  - "Request closure" opens an explanation of what happens: the catalog goes offline now, the platform completes deletion within 30 days, and you can cancel until then.
  - Then the action code, then `request_closure`.
  - Afterwards, settings and Overview show a "Closure requested on …" banner with "Cancel request".
- **Closure (staff):** after confirmation, the account is deleted and the user is signed out to `/login` with the notice "Your account was deleted".
- **Owner admin:**
  - **Businesses:** a "Closure requested" filter and a banner on business detail, with "Complete closure" (action code) and "Restore".
  - **Member detail and business owner panel:** a "Reset 2FA" action (action code).
- **Onboarding:**
  - The setup checklist shows full screen when the user enters the dashboard and `onboarding.completed` and `onboarding.dismissed` are both null.
  - **Business owner steps:** name (required), photo, 2FA (required if the policy requires it, otherwise recommended), business logo and contact (done when the business has a logo and a contact email), first product (done when the business has at least 1 product).
  - **Staff steps:** name, photo and 2FA.
  - "Finish later" sets `onboarding_dismissed_at` and is not offered while a required step is open.
  - When every step is done, `onboarding_completed_at` is set.
  - Overview shows a "Finish your setup · n of m" card until the setup is completed.

## 9. Supabase dashboard settings (the owner sets these, with exact steps in the runbook)

- **Authentication → Multi-Factor:** TOTP enrolment and verification enabled. Default 10 factors.
- **Authentication → Email:** "Secure email change" on, "Require current password when updating" on, and "Secure password change" on.
- **Authentication → Emails → Security notifications:** turn on "password changed", "email changed", "MFA method added" and "MFA method removed".
- **Authentication → URL Configuration:** add `https://sanctus.warpkit.online/dashboard/settings/account` and `https://sanctus.warpkit.online/admin/settings/account` to the redirect URLs.
- **Never** run `supabase config push`.

## 10. Error handling and honesty

- Every data view has loading, empty and error states.
- There are no dead buttons. A feature switched off in the Supabase dashboard (for example MFA disabled) shows "2FA is not available yet: an administrator must enable it" instead of failing.
- Supabase-mode errors never fall back to demo data.
- Generic messages appear where enumeration matters: action codes always say "sent".
- The role guard is still not a security boundary. The security boundary is RLS, the helper functions and the Edge Function checks.

## 11. Testing (test-first)

- **PGlite (`supabase/tests/accountSettings.test.ts`):**
  - `profiles` own-row read and write; another user is denied; staff can read.
  - The timezone check.
  - `platform_settings`:
    - an Owner at aal1 cannot update;
    - an Owner at aal2 can;
    - other roles cannot.
  - With the policy on:
    - `platform_can` is false at aal1 and true at aal2;
    - `is_business_member` behaves the same for the business policy;
    - `profiles` and `my_security_state` still work at aal1.
  - Audit own-events policy: a user sees their own `account_%` events and nothing else.
  - `record_sign_in` is rate-limited.
  - Closure:
    - `cancel_account_closure` restores the status;
    - the request is readable only by its owner and staff with `businesses.view`.
  - `action_codes` and `recovery_codes` are unreachable from `anon` and `authenticated`.
- **Edge Function handlers (Vitest, dependencies injected):**
  - code expiry, the 5-attempt limit, a newer code invalidating an older one and the hourly rate limit;
  - recovery codes are single-use and the set is replaced on regenerate;
  - `redeem` deletes the factors;
  - `disable_2fa` is refused under the policy;
  - the Owner can't close their own account;
  - an Admin closing their account ends sessions and deletes the user;
  - `owner_reset_2fa` refuses a non-Owner and refuses the Owner as target;
  - no secrets appear in logs;
  - the email failure path.
- **Components (Vitest + Testing Library):**
  - every section's states;
  - the action-code dialog;
  - the 2FA setup steps;
  - the recovery-codes "saved" gate;
  - the sign-in code step and the recovery link;
  - the policy gate;
  - the onboarding checklist logic (required steps block "Finish later");
  - preference-aware date formatting.
- **Playwright:**
  - the settings hub at 1440 and 390 (section list to section, Esc closes, deep links, redirects);
  - the a11y spec extended to settings routes;
  - the pixel guard stays 14/14.
- **Live checks on `sanctus.warpkit.online` (with the owner's OK, using QA accounts labelled "QA"):**
  - 2FA on, sign out, sign in with a code, then a recovery code;
  - password change;
  - email change pending state;
  - action-code email received;
  - business closure request, cancel, then request again, then Owner restore;
  - policy on, then a staff user without 2FA is gated and the API returns no rows.

## 12. Rollout and rollback

- **Order:** migration first (with the owner's go-ahead), then the Edge Functions deploy, the Supabase dashboard toggles, and the frontend (feature branch to Preview and `sanctus.warpkit.online`).
- **Rollback:** a SQL script `supabase/rollback/<date>_account_settings_rollback.sql`:
  - restores the four helper functions without the MFA clause;
  - drops the new tables and policies;
  - keeps the audit rows.
- **Safety:** policy switches default off, so nothing changes for existing users until the Owner switches them on.

## 13. Risks

- **Locking out the Owner.** Turning the policy on without 2FA set up yourself would lock you out of staff data. Prevented: the UI refuses to save "Require 2FA for staff" until the Owner has a verified factor and is at aal2, and the RLS update also requires aal2.
- **Hidden permission failures.** A gated helper used by a definer function could fail without explanation. Mitigation: the PGlite tests cover the main admin RPCs under the policy, and `my_security_state` lets the UI explain.
- **Lost recovery codes.** A user who loses both the device and the codes can be helped by the Owner's "Reset 2FA", which is logged and notified.

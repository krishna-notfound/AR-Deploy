# S1 Settings Hub, Account Security and 2FA: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a full-screen, Discord-style settings hub where every user manages their own profile, email, password, authenticator 2FA (with recovery codes and emailed codes for risky actions), notifications, preferences, security activity and account closure, plus an Owner security policy that the database enforces.

**Architecture:**
- **Database:** one new migration adds `profiles`, `platform_settings`, private code tables, closure requests and an `avatars` bucket. It gates the four access helpers on the 2FA policy through `private.mfa_satisfied()`.
- **Edge Function:** a new `account-security` function (handler with injected dependencies) carries every server-checked action.
- **Client services:** a new `AccountService` in `src/services` wraps Supabase Auth, the RPCs and the function. The UI uses only that service.
- **UI:** the settings UI is a full-screen route outside `DashboardShell` that still carries `data-surface="dashboard"`.

**Tech stack:** React 19, React Router 8, Tailwind 4, TypeScript 6, Vitest + Testing Library, PGlite, Playwright, Supabase (supabase-js 2.117.3, Deno Edge Functions), Resend.

**Spec:** `docs/superpowers/specs/2026-10-25-account-settings-s1-design.md`. Read it before your task; section numbers below refer to it.

## Global Constraints

- Work on branch `feature/sanctus-brand-design-system`. Commit as `krishna <krishnagtkr@gmail.com>`, with no co-author line. Never push `main`.
- Never run `supabase config push`. Never apply migrations to the linked project or deploy functions without the owner's go-ahead (Task 14 asks).
- **Supabase rules:**
  - New schema goes in one new file created with `npx supabase migration new account_settings`, with RLS on every new table and explicit grants.
  - The service/secret key lives only in Edge Function secrets, never in `VITE_*`.
- **UI data access:**
  - The UI gets data only through `src/services` (`service`, `auth`, the new `account`). Never import `services/mock/*` or `services/supabase/*` into the UI.
  - URLs are built only in `src/lib/urls.ts`. Add `settingsPath(scope: 'admin' | 'business', section?: SettingsSection): string` there.
- **Demo mode:**
  - It is a test harness only. The app must run with no env vars, and every `AccountService` method needs a minimal mock that keeps state in memory and is labelled "Demo".
  - Never fall back to demo data after a Supabase error.
- **Dashboard look (ADR-0031):** Inter, the `text-ui-*` tokens, no text under 12px, no uppercase, no horizontal scroll at 390px. Use the existing UI components (`Button`, `FormField`, `Input`, `Card`, `Modal`, `ConfirmProvider`, `ToastProvider`, `States`, `Switch`, `Skeleton`, `Badge`). `cn()` has no tailwind-merge, so overrides use the Tailwind 4 `x!` suffix.
- **Quality bar:**
  - Every data view has loading, empty and error states.
  - No dead buttons. A feature that Supabase has disabled shows a clear "not available yet" message.
  - No new npm dependency.
- **Copy:** English only, plain, sentence case. Errors from the server map to fixed messages (spec §7 error codes). Never show raw provider text.
- **Exact values (from the spec):**
  - Action codes: 6 digits, valid 10 minutes, 5 attempts, 5 codes per user per hour. A newer code invalidates the older ones. Resend cooldown is 30 s.
  - Recovery codes: 8 per set, 10 characters from the alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (32 characters), shown as `XXXXX-XXXXX`, compared case-insensitively with the dash ignored, stored as sha256(salt + code).
  - Passwords: minimum 12, maximum 128 characters.
  - Avatar: at most 512 KB, jpeg/png/webp only, resized to 256 px square.
  - Display name: 1 to 80 characters.
  - `record_sign_in`: at most 1 per 60 s per user. The user-agent string is cut to 200 characters.
  - Security activity: the last 50 events.
  - Date formats: `'d MMM yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd'`. Clock: `'24h' | '12h'`. Default timezone `Europe/Lisbon`.

## Shared contract (every task builds against these names)

### SQL (Tasks 1–2 produce; Tasks 3, 4, 11 consume)

**Tables and storage:**
- `public.profiles(user_id, display_name, avatar_path, timezone, date_format, clock, notify_new_applications, onboarding_completed_at, onboarding_dismissed_at, updated_at)`
- `public.platform_settings(id, require_2fa_staff, require_2fa_business, updated_at, updated_by)`
- `public.account_closure_requests(user_id, business_id, requested_at, previous_business_status)`
- `private.action_codes`, `private.recovery_codes` (spec §6)
- Storage bucket `avatars`, with paths `<user_id>/<uuid>.<ext>`.

**Functions:**
- `private.mfa_satisfied(p_scope text) returns boolean`, where `p_scope` is `'staff' | 'business'`.
- `public.my_security_state() returns jsonb`. Shape: `{ "requires_2fa": bool, "aal": "aal1"|"aal2", "closure": { "requested_at": text, "business_id": text } | null, "onboarding": { "completed_at": text|null, "dismissed_at": text|null } }`. `requires_2fa` covers the caller's group: staff if they are a platform member or Owner, business if they own a business.
- `public.record_sign_in(p_user_agent text) returns text`, one of `'recorded' | 'rate_limited'`.
- `public.log_account_event(p_event text) returns void`. Only the client-side events are allowed here: `account_email_change_requested` and `account_password_changed`. Anything else raises.
- `public.cancel_account_closure() returns jsonb`, one of `{ok:true} | {error:'not_found'}`.
- `public.list_my_security_events() returns setof public.audit_events`. Own `account_%` events, newest first, limit 50.
- `public.my_recovery_codes_left() returns integer`. The caller's unused recovery codes (0 when none). Security definer, own rows only.
- `public.admin_list_closure_requests() returns jsonb`. Requires `platform_can('businesses.view')`. Returns `[{ user_id, email, business_id, business_name, requested_at }]`.

**Service-role functions** (callable only by `service_role`; each returns jsonb `{ok:true,...}` or `{error:<code>}`):
- `service_create_action_code(p_user uuid, p_purpose text, p_code_hash text, p_salt text) → {ok, id} | {error:'rate_limited'}`
- `service_check_action_code(p_user uuid, p_purpose text, p_code text) → {ok} | {error:'invalid_code'|'code_expired'|'too_many_attempts'}`. Consumes the code on success.
- `service_set_recovery_codes(p_user uuid, p_hashes text[], p_salt text) → {ok}`. Replaces the set.
- `service_use_recovery_code(p_user uuid, p_code text) → {ok, remaining} | {error:'invalid_code'}`
- `service_clear_recovery_codes(p_user uuid) → {ok}`
- `service_has_recovery_codes(p_user uuid) → {ok, count}`
- `service_log_account_event(p_user uuid, p_event text, p_metadata jsonb, p_ip text) → {ok}`
- `service_requires_2fa(p_user uuid) → {ok, requires: bool, group: 'staff'|'business'|'none'}`
- `service_request_closure(p_user uuid) → {ok, kind: 'business'|'staff', business_id?} | {error:'owner_cannot_close'|'already_requested'}`. For a business owner it sets the business `inactive` and inserts the request. For staff it deactivates `platform_members` and ends sessions via `service_end_sessions`.
- `service_restore_closure(p_user uuid, p_actor uuid) → {ok} | {error:'not_found'}`
- `service_closure_target(p_user uuid) → {ok, business_id, email} | {error:'not_found'}`
- `service_classify_user(p_user uuid) → {ok, kind: 'owner'|'staff'|'business'|'none'}`

**Audit event types** (spec §6): `account_signed_in`, `account_password_changed`, `account_email_change_requested`, `account_2fa_enabled`, `account_2fa_disabled`, `account_recovery_used`, `account_recovery_regenerated`, `account_2fa_reset_by_owner`, `account_closure_requested`, `account_closure_cancelled`, `account_closure_completed`, `account_closure_restored`, `account_deleted`, `platform_security_policy_changed`.

**`email_log.kind`** adds `security_code`, `security_notice` and `closure_request`.

### Edge Function `account-security` (Task 3 produces; Task 4 consumes)

- **Request:** `POST` with `{ action, ...args }` and the caller's `Authorization: Bearer <jwt>`.
- **Response:** `{ ok: true, ... }` or `{ ok: false, error }`. The HTTP status is 200 for `ok`, 400/401/403/429 otherwise, but the body always carries `error`.
- **Actions:**

| action | args | returns |
|---|---|---|
| `send_code` | `purpose: ActionPurpose` | `{ ok, sentTo }` (masked, for example `m•••@studio.pt`) |
| `generate_recovery_codes` | `code?` | `{ ok, codes: string[8] }` |
| `redeem_recovery_code` | `code` | `{ ok }` |
| `disable_2fa` | `code` | `{ ok }` |
| `request_closure` | `code` | `{ ok, kind }` |
| `owner_reset_2fa` | `target_user_id, code` | `{ ok }` |
| `complete_closure` | `target_user_id, code` | `{ ok }` |
| `restore_closure` | `target_user_id` | `{ ok }` |

- **Error codes:** `not_signed_in`, `invalid_request`, `invalid_code`, `code_expired`, `too_many_attempts`, `rate_limited`, `aal2_required`, `policy_requires_2fa`, `owner_cannot_close`, `already_requested`, `not_allowed`, `not_found`, `email_failed`, `unknown`.

### TypeScript (Task 4 produces in `src/domain/types.ts` and `src/services/accountService.ts`; UI tasks consume)

```ts
export type SettingsSection = 'account' | 'profile' | 'security' | 'notifications' | 'preferences' | 'activity' | 'business' | 'platform' | 'security-policy'
export type ActionPurpose = 'disable_2fa' | 'regenerate_recovery' | 'request_closure' | 'owner_reset_2fa' | 'complete_closure'
export type DateFormatPref = 'd MMM yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd'
export interface Profile { userId: ID; displayName: string | null; avatarUrl: string | null; timezone: string; dateFormat: DateFormatPref; clock: '24h' | '12h'; notifyNewApplications: boolean; onboardingCompletedAt: string | null; onboardingDismissedAt: string | null }
export interface SecurityState { requires2fa: boolean; aal: 'aal1' | 'aal2'; hasVerifiedFactor: boolean; recoveryCodesLeft: number | null; pendingEmail: string | null; closure: { requestedAt: string; businessId: ID | null } | null; onboarding: { completedAt: string | null; dismissedAt: string | null } }
export interface TotpEnrollment { factorId: string; qrSvg: string; secret: string }
export interface SecurityEvent { id: ID; type: string; at: string; userAgent: string | null; ip: string | null }
export interface PlatformSettings { require2faStaff: boolean; require2faBusiness: boolean; updatedAt: string | null }
export interface ClosureRequest { userId: ID; email: string; businessId: ID | null; businessName: string | null; requestedAt: string }

export interface AccountService {
  getProfile(): Promise<Result<Profile>>
  updateProfile(patch: Partial<Pick<Profile, 'displayName' | 'timezone' | 'dateFormat' | 'clock' | 'notifyNewApplications'>>): Promise<Result<Profile>>
  uploadAvatar(file: Blob): Promise<Result<Profile>>          // caller passes the already-resized 256px image
  removeAvatar(): Promise<Result<Profile>>
  setOnboarding(state: 'completed' | 'dismissed'): Promise<Result<void>>
  getSecurityState(): Promise<Result<SecurityState>>
  recordSignIn(): Promise<Result<void>>
  listSecurityEvents(): Promise<Result<SecurityEvent[]>>
  changePassword(current: string, next: string): Promise<Result<void>>       // reasons: current_password_mismatch | same_password | weak_password
  requestEmailChange(currentPassword: string, newEmail: string): Promise<Result<void>> // reasons: password_incorrect | email_taken | invalid_email
  cancelEmailChange(): Promise<Result<void>>
  signOutOtherDevices(): Promise<Result<void>>
  startTotpEnrollment(): Promise<Result<TotpEnrollment>>
  confirmTotpEnrollment(factorId: string, code: string): Promise<Result<void>> // reason: invalid_code
  verifyTotpForSignIn(code: string): Promise<Result<void>>                     // reason: invalid_code
  sendActionCode(purpose: ActionPurpose): Promise<Result<{ sentTo: string }>>
  generateRecoveryCodes(code?: string): Promise<Result<string[]>>
  redeemRecoveryCode(code: string): Promise<Result<void>>
  disable2fa(code: string): Promise<Result<void>>
  requestClosure(code: string): Promise<Result<{ kind: 'business' | 'staff' }>>
  cancelClosure(): Promise<Result<void>>
  getPlatformSettings(): Promise<Result<PlatformSettings>>
  updatePlatformSettings(patch: Partial<Pick<PlatformSettings, 'require2faStaff' | 'require2faBusiness'>>): Promise<Result<PlatformSettings>> // reason: aal2_required
  ownerReset2fa(targetUserId: ID, code: string): Promise<Result<void>>
  listClosureRequests(): Promise<Result<ClosureRequest[]>>
  completeClosure(targetUserId: ID, code: string): Promise<Result<void>>
  restoreClosure(targetUserId: ID): Promise<Result<void>>
}
```

`ServiceError.reason` carries the spec §7 error code for every function-backed failure. `src/services/index.ts` exports `account: AccountService`: the Supabase implementation in a Supabase build, `mockAccountService` in demo.

## Review Focus

1. **An Owner turns on "Require 2FA for staff" while signed in without 2FA.** Expected: the switch can't be saved and explains why; the Owner is never locked out (Task 11 test: "refuses to enable the staff policy without aal2").
2. **A staff member or business owner already signed in when the policy turns on.** Expected: the next data request is refused by RLS, and the app shows the "Set up 2FA to continue" gate, not empty tables or a crash (Task 9 test: "shows the 2FA gate when my_security_state requires 2FA at aal1").
3. **A pasted recovery code in lower case or with spaces or a dash** (`abcde-fghjk `). Expected: it is accepted once, refused the second time (Task 3 test: "accepts a recovery code regardless of case, spaces and dash, once").
4. **The action-code email fails to send (Resend error).** Expected: the dialog says the code couldn't be sent and offers Resend; no action runs; the error is logged (Task 3 test: "email failure returns email_failed and keeps no usable code"; Task 6 test: "shows the send failure with a resend option").
5. **A business owner cancels a closure request after the catalog went offline.** Expected: the catalog is back at its previous status, not forced active (Task 2 test: "cancel restores the previous business status").

---

## Task 1: Migration, part 1: profiles, platform policy and 2FA enforcement

**Files:**
- Create: `supabase/migrations/<timestamp>_account_settings.sql` (via `npx supabase migration new account_settings`), sections 1–4 of the file.
- Create: `supabase/tests/accountSettings.test.ts`
- Modify: `supabase/tests/platformTeam.test.ts` and `supabase/tests/migrations.test.ts`. Add to their `SUPABASE_STUBS`: `create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb $$;` and the `raw_user_meta_data jsonb default '{}'` column on the `auth.users` stub if it is missing. The existing tests must still pass.

**Interfaces:**
- Produces: `public.profiles`, `public.platform_settings`, `private.mfa_satisfied`, the four gated helpers, `public.my_security_state`, `public.record_sign_in`, `public.log_account_event`, `public.list_my_security_events`, the own-events audit policy, the `avatars` bucket and its policies, the extended `email_log.kind` check (shared contract).

**Steps:**
- [ ] **Step 1: Write the failing tests** in `accountSettings.test.ts`. Use the same stubs and helpers as `platformTeam.test.ts`, with `as(uid, fn, role, jwt?)` also setting `test.jwt` to `{"aal":"aal1"|"aal2"}`. Tests (`describe('account settings: profiles and policy (Task 1)')`):
  - "creates a profile row for a new auth user and backfills existing users from display_name, then platform_members.full_name"
  - "a user reads and updates only their own profile; staff can read other profiles; a stranger cannot"
  - "rejects an unknown timezone and an unknown date_format"
  - "platform_settings: readable by any signed-in user; only the Owner at aal2 can update; Owner at aal1 and Admin are refused"
  - "staff policy on: platform_can, is_platform_member and is_platform_admin are false at aal1 and true at aal2; profiles and my_security_state still work at aal1"
  - "business policy on: is_business_member is false at aal1 and true at aal2; public catalog reads are unaffected"
  - "my_security_state reports requires_2fa for the caller's group only"
  - "staff policy on: admin_list_members and admin_review_application return forbidden or no rows at aal1 and work at aal2"
  - "record_sign_in records once, then returns rate_limited within 60 seconds"
  - "log_account_event accepts only the two client events"
  - "list_my_security_events returns only the caller's account_ events, newest first, at most 50"
  - "avatars bucket: a user may write only under their own folder"
  - "a platform_security_policy_changed audit event is written when platform_settings changes"
- [ ] **Step 2: Run and see them fail.** `npx vitest run supabase/tests/accountSettings.test.ts`. Expected: FAIL (relation "public.profiles" does not exist).
- [ ] **Step 3: Write the migration sections:**
  - **Tables:** `profiles` (with `set_updated_at` and the timezone validation trigger against `pg_timezone_names`), the `auth.users` insert trigger (security definer, `set search_path = ''`), and the backfill. Then `platform_settings`: seed one row, add the audit trigger, grant select to `authenticated`, and add an update policy requiring `is_platform_admin()` and `(auth.jwt()->>'aal') = 'aal2'`.
  - **2FA gate:** `private.mfa_satisfied` (security definer). Redefine `is_platform_admin` (security invoker, init schema), `is_platform_member` and `platform_can` (security definer, platform team roles migration) with `and private.mfa_satisfied('staff')`, and `is_business_member` with `and private.mfa_satisfied('business')`. Keep each function's current security mode, search_path and grants. Recreate them with `create or replace`, so the existing policies keep pointing at them.
  - **RPCs:** `my_security_state`, `record_sign_in` (rate-limited by checking the last `account_signed_in` row for the user within 60 s), `log_account_event` and `list_my_security_events`, each `security definer` with `set search_path = ''`, `revoke ... from public, anon` and `grant execute ... to authenticated`.
  - **Audit and storage:**
    - an additive select policy on `audit_events` for own `account_%` events (spec §6);
    - the `avatars` bucket (public, 524288 bytes, `{image/jpeg,image/png,image/webp}`) with insert, update and delete policies on `(storage.foldername(name))[1] = auth.uid()::text`;
    - the `email_log_kind_check` recreated with the three new kinds.
- [ ] **Step 4: Run.** Run `npx vitest run supabase/tests` and expect every DB test file to pass, including the old ones.
- [ ] **Step 5: Commit** with the message "Account settings migration: profiles, platform 2FA policy enforced in access helpers".

## Task 2: Migration, part 2: codes, recovery codes and closure

**Files:**
- Modify: the same migration file, sections 5–7.
- Create: `supabase/rollback/20261025_account_settings_rollback.sql`.
- Test: `supabase/tests/accountSettings.test.ts` (new describe).

**Interfaces:**
- Consumes: Task 1 tables.
- Produces: `private.action_codes`, `private.recovery_codes`, `public.account_closure_requests`, every `service_*` function in the shared contract, `public.cancel_account_closure`, `public.my_recovery_codes_left` and `public.admin_list_closure_requests`.

**Steps:**
- [ ] **Step 1: Write the failing tests** (`describe('account settings: codes and closure (Task 2)')`):
  - "action code: correct code passes once, then invalid_code; expired code gives code_expired; the 6th wrong attempt gives too_many_attempts; a newer code invalidates an older one; the 6th code within an hour gives rate_limited"
  - "recovery codes: a set replaces the previous set; each code works once (case-insensitive, dash ignored); service_has_recovery_codes and my_recovery_codes_left count unused codes (own only)"
  - "private tables and service_* functions are not reachable from anon or authenticated"
  - "service_request_closure: a business owner's business goes inactive and a request row exists; staff are deactivated; the Owner gets owner_cannot_close; a second request gets already_requested"
  - "cancel restores the previous business status" (draft stays draft)
  - "account_closure_requests: readable by the requester and staff with businesses.view only"
  - "admin_list_closure_requests requires businesses.view"
  - "service_restore_closure restores the status and logs account_closure_restored"
  - "rollback script restores the four helpers without the 2FA clause and drops the new objects" (run the migration, then the rollback, in a fresh PGlite, in the same way as the existing rollback test).
- [ ] **Step 2: Run them and watch them fail.** `npx vitest run supabase/tests/accountSettings.test.ts -t "Task 2"`
- [ ] **Step 3: Implement the sections and the rollback script.**
  - Code comparison: `sha256(salt || code)` via `extensions.digest` or `pgcrypto`. Use whichever the earlier migrations already use: grep `digest(` / `sha256(`.
  - Every `service_*` function: `security definer`, `set search_path = ''`, `revoke execute ... from public, anon, authenticated`, `grant ... to service_role`.
- [ ] **Step 4: Run.** `npx vitest run supabase/tests` passes.
- [ ] **Step 5: Commit** with the message "Account settings migration: action codes, recovery codes, closure requests, rollback".

## Task 3: Edge Function `account-security`, and staff new-application alerts

**Files:**
- Create: `supabase/functions/account-security/handler.ts`, `index.ts`, `handler.test.ts`.
- Modify:
  - `supabase/functions/_shared/email.ts`: `EmailKind` gains the 3 kinds.
  - `supabase/functions/_shared/email-templates.ts`: add `securityCodeEmail`, `securityNoticeEmail` and `closureRequestEmail`. All are plain, English, with no links other than the app URL.
  - `supabase/config.toml`: add `[functions.account-security] verify_jwt = true`.
  - `supabase/functions/submit-application/handler.ts` and its test: also email every staff member with `applications.view` and `profiles.notify_new_applications = true`, de-duplicated against `ADMIN_NOTIFICATION_EMAIL`.

**Interfaces:**
- Consumes: the SQL service functions (shared contract), `_shared/http.ts` (`reply`, `bearerToken`, `readJsonObject`, `sha256Hex`, `clientIp`, `serviceKeyFrom`), `_shared/email.ts` `sendAndLog`.
- Produces: the action table in the shared contract.
- `AccountSecurityDeps`:
  - `userIdFromToken`
  - `aalFromToken(token): 'aal1'|'aal2'` (decodes the payload after `getUser` succeeds)
  - `rpc(fn, args)` (service role)
  - `listFactors(userId)`
  - `deleteFactor(userId, factorId)`
  - `deleteUser(userId)`
  - `deleteBusiness(businessId)` (service-role delete plus a storage folder sweep of `product-media` and `business-logos`, the same as `supabaseCatalogService.deleteBusiness`)
  - `userEmail(userId)`
  - `send(email)` (`sendAndLog`)
  - `random(n)` (CSPRNG bytes)
  - `now()`

**Steps:**
- [ ] **Step 1: Write the failing handler tests** (fake dependencies, `// @vitest-environment node`):
  - "rejects a request with no token (401 not_signed_in) and an unknown action (400 invalid_request)"
  - "send_code: creates a hashed code, emails it, returns a masked address; rate_limited from SQL becomes 429"
  - "email failure returns email_failed and keeps no usable code"
  - "generate_recovery_codes: needs aal2; first set within 15 minutes of enrolling needs no code; a regenerate needs a valid regenerate_recovery code; returns 8 codes in XXXXX-XXXXX form and stores only hashes"
  - "accepts a recovery code regardless of case, spaces and dash, once"
  - "redeem_recovery_code deletes every TOTP factor, logs account_recovery_used and emails a notice"
  - "disable_2fa: needs aal2 and a valid disable_2fa code; refused with policy_requires_2fa when the caller's group requires 2FA"
  - "request_closure: refuses the Owner; a business owner gets kind business and the admin inbox is emailed; staff get kind staff, sessions ended and the user deleted"
  - "owner_reset_2fa: only the Owner at aal2 with a valid code; never on the Owner; deletes the target's factors and codes; emails the target"
  - "complete_closure: Owner at aal2 with a code; deletes the business, then the user; logs with email removed"
  - "restore_closure: Owner at aal2 only"
  - "never logs a code or a recovery code" (assert the fake `log` and `rpc` metadata contain no 6-digit code or recovery code)
  - submit-application: "emails opted-in staff with applications.view once each, without duplicating the admin inbox"
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run supabase/functions/account-security supabase/functions/submit-application`
- [ ] **Step 3: Implement `handleAccountSecurity(req: Request, deps: AccountSecurityDeps): Promise<Response>`** following `invite-member/handler.ts`. Then `index.ts`, wired like `invite-member/index.ts`, using the admin client: `admin.auth.admin.mfa.listFactors({ userId })`, `admin.auth.admin.mfa.deleteFactor({ id, userId })` and `admin.auth.admin.deleteUser`.
  - Code generation: 6 digits from CSPRNG (no modulo bias).
  - Recovery codes: 8 × 10 characters from the 32-character alphabet.
- [ ] **Step 4: Run.** The same command passes. `npm test` stays green.
- [ ] **Step 5: Commit** with the message "account-security Edge Function: action codes, recovery codes, 2FA off, closure, owner reset".

## Task 4: AccountService (types, Supabase implementation, minimal mock)

**Files:**
- Create: `src/services/accountService.ts` (the interface and types re-export), `src/services/supabase/supabaseAccount.ts` with `supabaseAccount.test.ts`, and `src/services/mock/mockAccount.ts` with `mockAccount.test.ts`.
- Modify: `src/domain/types.ts` (the shared contract types), `src/services/index.ts` (export `account`), `src/services/supabase/database.types.ts` (hand-add the new tables and RPCs; it is regenerated after Task 14 applies the migration), and `src/lib/urls.ts` (`settingsPath`).

**Interfaces:**
- Consumes: the SQL contract and the Edge Function contract.
- Produces: `account: AccountService` and `settingsPath()`.

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - **`supabaseAccount.test.ts`:** use a fake `SupabaseClient` that records calls.
    - "changePassword calls updateUser with current_password and then signOut scope others; maps current_password_mismatch and same_password"
    - "requestEmailChange verifies the password with signInWithPassword first and maps a failure to password_incorrect; then calls updateUser({ email }, { emailRedirectTo: origin + settingsPath('business'|'admin','account') }) and logs account_email_change_requested"
    - "getSecurityState combines my_security_state, mfa.listFactors (verified totp), my_recovery_codes_left and user.new_email"
    - "startTotpEnrollment removes stale unverified factors before mfa.enroll; confirmTotpEnrollment uses challengeAndVerify and maps a wrong code to invalid_code"
    - "function-backed methods post { action, ... } to account-security and map { ok:false, error } to ServiceError.reason"
    - "uploadAvatar writes avatars/<uid>/<uuid>.webp, updates avatar_path, deletes the previous object"
    - "updatePlatformSettings maps an RLS refusal at aal1 to aal2_required"
  - **`mockAccount.test.ts`:** "the mock keeps profile, factors, recovery codes and closure state in memory and accepts the demo code 123456".
  - **`src/lib/urls.test.ts`:** "settingsPath('business') is /dashboard/settings/account; settingsPath('admin','security') is /admin/settings/security".
- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/services src/lib/urls.test.ts`
- [ ] **Step 3: Implement it.** Call the Edge Function with `sb.functions.invoke('account-security', { body })`, handling `FunctionsHttpError` by reading the JSON `error`.
- [ ] **Step 4: Run.** The same command passes. Then `npm run typecheck`.
- [ ] **Step 5: Commit** with the message "AccountService: Supabase implementation and test mock".

## Task 5: Settings hub (full-screen layout, routes, sections registry, entry points)

**Files:**
- Create:
  - `src/features/settings/SettingsLayout.tsx`
  - `src/features/settings/sections.ts`: the registry `SECTIONS: { id: SettingsSection; label: string; group: 'Your account' | 'Your business' | 'Platform'; visible(ctx): boolean; element: LazyExoticComponent }[]`
  - `src/features/settings/SettingsSectionPage.tsx`
  - `src/features/settings/SettingsLayout.test.tsx`
  - placeholder section components `src/features/settings/sections/{Account,Profile,Security,Notifications,Preferences,Activity}Section.tsx`, each rendering only its `SectionHeader` (title plus one muted line); Tasks 6–10 fill them
  - `src/features/settings/sections/BusinessSection.tsx` (today's `BusinessSettingsPage` body)
  - `src/features/settings/sections/PlatformSection.tsx` (today's `AdminSettingsPage` cards minus the Profile card)
  - `src/components/ui/Avatar.tsx` (photo or initials, sizes 32/40/48)
- Modify:
  - `src/app/router.tsx`: `/dashboard/settings/:section?` and `/admin/settings/:section?` are standalone routes outside `DashboardShell` but inside the same `RequireRole`. Remove the old in-shell `settings` children.
  - `src/components/layout/nav.ts`: settings items point at `settingsPath(...)`. The business label becomes "Settings".
  - `DashboardShell.tsx` `UserBlock`: it becomes a menu button using `DropdownMenu` with "Account settings", "Security & 2FA" and "Sign out". Use `<Avatar>`. Keep the switch-account button.
  - Delete `src/features/admin/AdminSettingsPage.tsx` and `src/features/business/BusinessSettingsPage.tsx` once their content has moved, and update their tests.

**Interfaces:**
- Consumes: `account.getProfile()` and `account.getSecurityState()` (Task 4; use the mock in tests), plus `useAccount`, `useCan` and `settingsPath`.
- Produces:
  - the `SECTIONS` registry;
  - `SectionHeader({ title, description })` and `SettingsCard({ title, description?, children, tone?: 'danger' })` from `src/features/settings/SettingsUi.tsx`;
  - `<Avatar name src size />`;
  - `useSettingsScope(): 'admin' | 'business'`.

**Steps:**
- [ ] **Step 1: Write the failing tests** (`SettingsLayout.test.tsx`, rendering `<App />` as the other page tests do):
  - "/dashboard/settings redirects to /dashboard/settings/account; unknown and hidden sections redirect to account"
  - "business owner sees Your account and Your business groups; Owner sees Your account and Platform; Admin and Team see Your account only"
  - "group headings are sentence case and not uppercase; the root carries data-surface=dashboard"
  - "Esc and the close button return to the page that opened settings, or to /dashboard when opened directly"
  - "below 640px the section list is shown first and choosing a section shows it with a 'Settings' back link"
  - "the sidebar user menu opens Account settings and Security & 2FA"
  - "Business profile section renders the existing BusinessForm"
  - "Platform → General keeps the data backend card"
- [ ] **Step 2: Run them and watch them fail.** `npx vitest run src/features/settings`
- [ ] **Step 3: Implement it.**
  - Layout: section list 240px; content max-w-[720px], padding 32px. The close button is the top-right `IconButton` "Close settings".
  - Set `document.body.dataset.surface = 'dashboard'` while mounted, as `DashboardShell` does.
- [ ] **Step 4: Run.** The same command passes, and so do `npm test`, `npm run typecheck` and `npm run lint`.
- [ ] **Step 5: Commit** with the message "Settings hub: full-screen layout, section registry, entry points".

## Task 6: My account section (email, password, closure) and the action-code dialog

**Files:**
- Create: `src/features/settings/ActionCodeDialog.tsx` with its test, and `src/features/settings/sections/AccountSection.tsx` with its test (replacing the placeholder).
- Modify: `src/features/business/BusinessOverviewPage.tsx`, adding the closure banner: "Closure requested on <date> · Your catalog is offline. Cancel request".

**Interfaces:**
- Consumes: `account.*`, `SettingsCard`, `useConfirm`, `useToast`.
- Produces: `ActionCodeDialog({ open, purpose, title, description, confirmLabel, destructive?, onClose, onConfirm: (code: string) => Promise<Result<unknown>> })`. Tasks 8 and 11 reuse it.

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - **ActionCodeDialog:**
    - "sends a code on open and shows the masked address"
    - "Resend is disabled for 30 seconds"
    - "maps invalid_code, code_expired, too_many_attempts and rate_limited to plain messages"
    - "shows the send failure with a resend option"
    - "runs onConfirm only with a 6-digit code"
  - **AccountSection:**
    - "change email: wrong password shows 'Password is incorrect'; success shows the pending banner with the new address, Resend and Cancel"
    - "change password: under 12 characters is refused before sending; mismatch confirm is refused; success toasts 'Password changed. Other devices were signed out.'"
    - "business owner: Request closure explains the effect, then opens the action-code dialog; afterwards shows 'Closure requested' with Cancel request"
    - "Admin and Team: Delete account confirms, then signs out to /login with 'Your account was deleted'"
    - "Owner: no delete button; explains the platform needs its Owner"
- [ ] **Step 2: Run them and watch them fail.** `npx vitest run src/features/settings/ActionCodeDialog.test.tsx src/features/settings/sections/AccountSection.test.tsx`
- [ ] **Step 3: Implement it.**
  - The email field uses `type="email"`. The password fields use `autoComplete="current-password"` and `"new-password"`.
  - A strength hint (length only) shows under the new password.
- [ ] **Step 4: Run.** The same command passes, then `npm test`.
- [ ] **Step 5: Commit** with the message "My account: email change, password change, closure, action-code dialog".

## Task 7: Profile section (name and photo) and avatar display

**Files:**
- Create: `src/features/settings/sections/ProfileSection.tsx` with its test, and `src/lib/image.ts` with `src/lib/image.test.ts`.
- Modify: `src/features/team/MembersTable.tsx` and `src/features/team/MemberDetailPage.tsx` (use `<Avatar>` with the member's `avatarUrl`), and `src/domain/types.ts` (`PlatformMember.avatarUrl?: string | null`).
- Modify: `supabaseTeam.ts` and `mockTeam.ts`, so that `listMembers` joins `profiles.avatar_path`. If `admin_list_members` can't return it, read `profiles` separately.

**Interfaces:**
- Consumes: `account.updateProfile`, `uploadAvatar`, `removeAvatar`, and `<Avatar>` (Task 5).
- Produces: `squareResize(file: File, size = 256): Promise<Blob>` (canvas, center crop, `image/webp` at quality 0.9, falling back to `image/jpeg`).

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - "name: empty and 81-character names are refused; save updates the sidebar name"
  - "photo: a non-image or a file over 5 MB before resize is refused with a message; a valid image is resized and uploaded; Remove returns to initials"
  - "squareResize crops to a square of the requested size" (mock canvas)
  - "MembersTable shows a member's photo when present"
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run.** The tests pass, then `npm test`.
- [ ] **Step 5: Commit** with the message "Profile: name and photo; avatars in sidebar and team".

## Task 8: Security & 2FA section

**Files:**
- Create: `src/features/settings/sections/SecuritySection.tsx`, `src/features/settings/TotpSetup.tsx` and `src/features/settings/RecoveryCodes.tsx`, with tests.

**Interfaces:**
- Consumes: `account.getSecurityState`, `startTotpEnrollment`, `confirmTotpEnrollment`, `generateRecoveryCodes`, `disable2fa`, `signOutOtherDevices`, and `ActionCodeDialog` (Task 6).
- Produces: `TotpSetup({ onDone })`. Task 9's policy gate and Task 12's onboarding reuse it.

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - "2FA off: Turn on shows the QR image, the setup key with Copy, and a 6-digit code field; a wrong code shows 'That code didn't match'"
  - "after a correct code, shows 8 recovery codes with Copy and Download; Done is disabled until 'I saved these codes' is ticked"
  - "2FA on: shows 'On', recovery codes left, Regenerate (action code), Turn off (action code)"
  - "Turn off when the policy requires 2FA shows 'Your organisation requires 2FA' and no button"
  - "MFA disabled in Supabase (enroll error mfa_disabled or similar) shows '2FA is not available yet: an administrator must enable it'"
  - "Sign out other devices confirms, then toasts"
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement it.**
  - Render the QR from the returned SVG with `<img src={'data:image/svg+xml;utf8,' + encodeURIComponent(svg)}>` and alt text "QR code for your authenticator app".
  - Download creates a `.txt` file through a Blob URL.
- [ ] **Step 4: Run.** The tests pass, then `npm test`.
- [ ] **Step 5: Commit** with the message "Security & 2FA: authenticator setup, recovery codes, turn off, sign out others".

## Task 9: Sign-in with 2FA, recovery sign-in, the policy gate and sign-in recording

**Files:**
- Modify: `src/features/auth/LoginPage.tsx` (the code step after the password) and `src/auth/AccountProvider.tsx` (expose `securityState` and `refreshSecurity()`; call `account.recordSignIn()` once per `SIGNED_IN` event).
- Create: `src/features/auth/TwoFactorStep.tsx` and `src/auth/SecurityGate.tsx` (wraps the `/admin` and `/dashboard` trees and the settings routes in `router.tsx`), with tests.

**Interfaces:**
- Consumes: `auth.signInWithPassword`, `account.verifyTotpForSignIn`, `redeemRecoveryCode`, `getSecurityState`, `recordSignIn`, and `TotpSetup` (Task 8).
- Produces: `useSecurityState(): { state: SecurityState | undefined; refresh(): Promise<void> }`.

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - "after the password, a user with a verified factor sees 'Enter the 6-digit code from your authenticator app'; the right code continues to the dashboard"
  - "Use a recovery code: a valid code signs in and lands on Security & 2FA with 'Your authenticator was removed. Set it up again.'"
  - "shows the 2FA gate when my_security_state requires 2FA at aal1" (the gate shows `TotpSetup` and Sign out, not the dashboard)
  - "records the sign-in once per sign-in"
  - "the LoginPage outside Supabase mode is unchanged". The pixel guard covers `/login` too; run it.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement it.** The code field uses `inputMode="numeric"`, `autoComplete="one-time-code"` and `maxLength=6`, and auto-submits at 6 digits.
- [ ] **Step 4: Run.** The tests pass, then `npm test`, then `E2E_PORT=5291 npx playwright test --project=guard --workers=1` (14/14).
- [ ] **Step 5: Commit** with the message "Sign-in with 2FA, recovery codes, 2FA policy gate".

## Task 10: Notifications, Preferences (preference-aware dates) and Security activity

**Files:**
- Create: `src/features/settings/sections/{Notifications,Preferences,Activity}Section.tsx` with tests, `src/lib/preferences.tsx` (`PreferencesProvider` and `usePreferences()`) and `src/lib/userAgent.ts` (`describeUserAgent(ua): string`, for example "Chrome on Windows").
- Modify: `src/lib/format.ts` and `src/lib/format.test.ts`. `formatDate`, `formatDateTime` and `formatRelative` gain an optional `prefs?: { timezone: string; dateFormat: DateFormatPref; clock: '24h'|'12h' }`. The defaults give exactly today's output.
- Modify: `src/app/App.tsx` (mount `PreferencesProvider` inside the account provider), plus the dashboard date callers that render user-visible times: AuditLog, AccessHistory, ApplicationsPage, MembersTable, MemberDetailPage and the Security activity section. They pass `usePreferences()`.

**Interfaces:**
- Consumes: `account.getProfile`, `updateProfile` and `listSecurityEvents`.
- Produces: `usePreferences()` and the extended `format.ts` signatures.

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - format: "formats 2026-10-25T13:05Z as 25 Oct 2026 / 25/10/2026 / 2026-10-25 and 14:05 or 2:05 pm in Europe/Lisbon; defaults are unchanged"
  - "Notifications: staff with applications.view see the new-applications switch; business owners do not; security emails are shown as always on"
  - "Preferences: timezone select lists IANA zones with the browser zone suggested; saving changes dates shown elsewhere"
  - "Activity: lists events with label, time and device; empty and error states"
  - "describeUserAgent returns 'Safari on iPhone' and 'Chrome on Windows'"
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement it** with `Intl.DateTimeFormat` and the `timeZone` option. No date library.
- [ ] **Step 4: Run.** The tests pass, then `npm test`.
- [ ] **Step 5: Commit** with the message "Notifications, preferences and security activity".

## Task 11: Owner tools: security policy, Reset 2FA and closure requests

**Files:**
- Create: `src/features/settings/sections/SecurityPolicySection.tsx` with its test.
- Modify:
  - `src/features/team/MemberDetailPage.tsx`: add a "Reset 2FA" action, Owner only, for non-Owner members.
  - `src/features/businesses/BusinessOwnersPanel.tsx`: add "Reset 2FA" next to Remove, Owner only.
  - `src/features/admin/BusinessesListPage.tsx`: add a "Closure requested" filter chip with a count.
  - `src/features/admin/BusinessDetailPage.tsx`: add a closure banner with "Complete closure" (action code, destructive) and "Restore".
- Tests: the existing page tests for those files.

**Interfaces:**
- Consumes: `account.getPlatformSettings`, `updatePlatformSettings`, `ownerReset2fa`, `listClosureRequests`, `completeClosure`, `restoreClosure`, `getSecurityState`, and `ActionCodeDialog`.

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - "refuses to enable the staff policy without aal2": the switch is disabled with "Turn on your own 2FA first", and a save that returns `aal2_required` shows the same message.
  - "with aal2, enabling the staff policy confirms 'Staff without 2FA will be asked to set it up at their next request' and saves"
  - "Reset 2FA on a member opens the action-code dialog and toasts 'Their 2FA was reset. They were emailed.'"
  - "Businesses: Closure requested filter lists requested businesses"
  - "Business detail with a closure request shows the banner; Complete closure needs the code and returns to the list; Restore removes the banner"
  - "none of these appear for Admin or Team"
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run.** The tests pass, then `npm test`.
- [ ] **Step 5: Commit** with the message "Owner tools: 2FA policy, reset 2FA, closure requests".

## Task 12: "Complete your setup" onboarding and the Overview card

**Files:**
- Create: `src/features/settings/OnboardingChecklist.tsx` with its test, and `src/features/settings/onboardingSteps.ts` with its test: a pure `onboardingSteps(ctx): Step[]`, where `ctx` is `{ scope; profile; security; business?; productCount? }` and `Step = { id; label; done: boolean; required: boolean; to?: string }`.
- Modify: `src/auth/SecurityGate.tsx` (Task 9) to render the checklist full screen when onboarding is neither completed nor dismissed (after the 2FA gate). Also `BusinessOverviewPage.tsx` and `AdminOverviewPage.tsx`, which get the "Finish your setup · n of m" card.

**Interfaces:**
- Consumes: `account.getProfile`, `setOnboarding`, `getSecurityState`, `TotpSetup`, `service.getProducts({ businessId })` and `useCurrentBusiness()`.

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - "business owner steps: name (required), photo, 2FA (required when the policy requires it, otherwise recommended), logo and contact email, first product"
  - "staff steps: name, photo, 2FA"
  - "Finish later is hidden while a required step is open; it sets dismissed and shows the Overview card"
  - "all steps done sets completed and the card disappears"
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run.** The tests pass, then `npm test`.
- [ ] **Step 5: Commit** with the message "Complete your setup: onboarding checklist and Overview card".

## Task 13: Browser tests, ADR and docs

**Files:**
- Create: `tests/e2e/settings.spec.ts`, and the ADR `System_arch/decisions/ADR-0032-account-settings-and-2fa.md`, with a row in `System_arch/decisions/README.md`.
- Modify:
  - `tests/e2e/a11y-dashboard.spec.ts`: add the settings routes, every section, at 1280 and 390.
  - `docs/OPERATIONS_RUNBOOK.md`: an "Account settings and 2FA" section listing the spec §9 dashboard toggles step by step, the function deploy, the migration, and the rollback.
  - `docs/SECURITY_REVIEW.md`: the 2FA policy, action codes, recovery codes, and what is still open (leaked-password check on Pro, session time-boxes).
  - `System_arch/tasks/P12-team-roles-and-addons.md`: mark S1 progress.

**Steps:**
- [ ] **Step 1: Write `settings.spec.ts`.**
  - "opens settings from the user menu, moves between sections by deep link, Esc closes to the previous page"
  - "at 390 the section list comes first and the back link returns to it"
  - "2FA setup in demo: turn on with code 123456, recovery codes gate, turn off with the action code"
  - "change password validation messages"
  - Run it, confirm it fails where the features are missing, then confirm it passes.
- [ ] **Step 2: Run the a11y spec and the guard.** Run `npx playwright test tests/e2e/a11y-dashboard.spec.ts tests/e2e/settings.spec.ts` (PASS), then `npx playwright test --project=guard --workers=1` (14/14).
- [ ] **Step 3: Write the ADR and update the docs.**
- [ ] **Step 4: Commit** with the message "Settings: browser tests, ADR-0032, runbook and security notes".

## Task 14: Full checks, go-live on the real project, live verification

- [ ] **Step 1: Run the full checks**, with logs in the scratchpad: `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test --project=desktop --project=mobile && npx playwright test --project=guard --workers=1`. Expected: all PASS.
- [ ] **Step 2: Ask the owner for the go-ahead (STOP until yes)** to apply the migration to `zggylkbgajamhriebdrg` (`npx supabase db push --linked` dry run first), and to deploy `account-security` and `submit-application` (`npx supabase functions deploy <name> --project-ref zggylkbgajamhriebdrg`). Give the owner the exact spec §9 dashboard toggles to switch on.
- [ ] **Step 3: After the go-ahead,** apply the migration, deploy the functions and regenerate `database.types.ts` (`npx supabase gen types typescript --project-id zggylkbgajamhriebdrg` to a scratch file, then copy it with the header). Run typecheck again, push the branch, and wait for the Preview / `sanctus.warpkit.online`.
- [ ] **Step 4: Run the live checks (QA accounts labelled QA, with the owner's OK)** in the order of spec §11: 2FA on, sign in with a code, recovery code, password change, email-change pending, action-code email received, closure request/cancel/restore, policy on gating a QA staff user (the API returns no rows), policy off. Record the results in `docs/PROJECT_COMPLETION_STATUS.md`.
- [ ] **Step 5: Commit and push** with the message "S1 account settings: live verification and status".

## Parallel waves (for the controller)

- **Wave 1 (parallel):** Task 1 → Task 2 (one agent, the database), Task 3 (the function), Task 4 (services) and Task 5 (the hub). Tasks 3, 4 and 5 build against the shared contract and do not need Tasks 1–2 merged.
- **Wave 2 (parallel, after Wave 1 is merged):** Tasks 6, 7, 8 and 10. Then Tasks 9, 11 and 12, which reuse `ActionCodeDialog` (6) and `TotpSetup` (8).
- **Wave 3:** Task 13, then Task 14.
- **File ownership in Wave 2:** `DashboardShell.tsx` belongs to Task 5 only. `format.ts` belongs to Task 10 only. `MemberDetailPage.tsx` belongs to Task 7 (avatar), and Task 11 then adds its action after Task 7 is merged.

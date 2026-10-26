# S1.5 Business-logic fixes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make every platform rule kept in the slimmed S1.5 hold in the database and the Edge Functions, not only in the UI, and make every screen and email in those areas say what is really true.

**Architecture:**
- **Database:** one new migration (`business_logic_fixes`). Task 1 creates it, and every later task appends its own delimited section. It adds triggers, policies, a handful of definer functions and one invoker function, all on top of the S1 2FA-gated helpers.
- **Edge Functions:** one shared, pure 2FA gate (`_shared/gate.ts`) used by every function a person calls. Two new functions, `review-application` and `notify-business-owner`. Small changes to six existing ones. Every function keeps the pure `handler.ts` plus `index.ts` layout and gets Vitest handler tests with injected fakes.
- **Client:** service-layer changes in `src/services` (Supabase and mock together), then the dashboard UI that reads them. Demo mode follows each new rule in the same task. W8 (Task 14) fixes the demo divergences that already existed.

**Tech stack:** React 19, React Router 8, Tailwind 4, TypeScript 6, Vitest + Testing Library, PGlite (`@electric-sql/pglite`), Playwright, Supabase (supabase-js 2.117.3, Deno Edge Functions), Resend.

**Spec:** `docs/superpowers/specs/2026-10-26-business-logic-fixes-design.md`. Read it before your task; `§` and `R-Wn-k` references below point into it. Evidence with file:line is in `docs/audits/2026-10-26-business-logic/*.md`, and the binding rulings are in `RULINGS.md`. **The owner slimmed S1.5 on 2026-10-26.** Only the requirements in the coverage table are built here. Everything in "Moved out of S1.5" (end of this plan) is out of scope: it gets no code, no test and no SQL in this plan.

## Global Constraints

- **Branches and worktrees:**
  - Each task runs in its own git worktree, on a branch cut from `feature/sanctus-brand-design-system` **after the previous task was merged**. It is merged back in task order.
  - Run `npm ci` in a fresh worktree if `node_modules` is missing. Set `E2E_PORT` to a free port before you run Playwright in a worktree.
  - Never push `main`. Never push at all unless the owner asks.
- **Commits:**
  - Commit with `git -c user.name=krishna -c user.email=krishnagtkr@gmail.com commit`, with **no co-author line**.
  - Use the message `S1.5 Task N: <title>`. When the task changes an existing assertion, the body names the R-ID that changed it.
- **Nothing remote:**
  - No task applies a migration, deploys a function, runs `supabase db push`, `supabase config push` or `npm run db:types`, or calls a hosted project.
  - Release happens later, from the runbook that Task 15 writes, and only with the owner's go-ahead.
- **One migration, appended by section:**
  - Task 1 runs `npx supabase migration new business_logic_fixes`, which gives `supabase/migrations/<ts>_business_logic_fixes.sql`. No other task creates a migration.
  - Each later task **appends** one section at the end of that file, in exactly this format:
    ```sql
    -- =============================================================================
    -- S1.5 Task N: <title> (R-Wn-k, ...)
    -- =============================================================================
    ...statements...
    -- ---- end S1.5 Task N ----
    ```
  - A task never edits another task's section. When a function that an earlier section already redefined has to change again, the new section `create or replace`s it, **starting from the earlier section's body** (not from the original migration's body), and keeps that section's behaviour. `my_platform_access` (Tasks 1 and 9) and `service_closure_target` (Task 3) are the known cases.
- **One rollback script, in reverse:**
  - Task 1 creates `supabase/rollback/20261026_business_logic_fixes_rollback.sql`. Its header states the data loss of rolling back the analytics FK (§10.1).
  - Each later task **inserts** its rollback section directly below the header, using the same marker format, so the script undoes the newest task first.
  - Rollback restores the earlier function bodies, policies and constraints, and drops the new tables, triggers, views and functions. It keeps every audit and email row.
- **PGlite tests:**
  - All new database tests go in `supabase/tests/businessLogicFixes.test.ts`, one `describe('S1.5 Task N: …')` per task, on the shared harness from Task 1 (`supabase/tests/harness.ts`).
  - Each task uses its own fixture ids from `ids(task)` and seeds its own businesses and users, so the describes don't depend on each other.
  - Each task adds the names of its new objects to `GONE_AFTER_ROLLBACK` in that file.
  - If an existing suite (`accountSettings`, `platformTeam`, `migrations`) asserts behaviour that this spec deliberately changes, update that one assertion in the same task. Never weaken or delete an unrelated assertion.
- **SQL rules:**
  - RLS is on for every new table, with `revoke all … from public, anon, authenticated` and then explicit grants.
  - Every new function is `security definer` (except `analytics_daily`, which is `security invoker`), with `set search_path = ''`, `revoke execute … from public` and explicit grants as listed in §10.1.
  - Every `service_*` function and private trigger function is revoked from `anon` and `authenticated`.
- **The 2FA gate:**
  - The S1 helpers (`private.mfa_satisfied`, `public.caller_mfa_satisfied()`, and the gated `platform_can`, `is_platform_admin`, `is_platform_member` and `is_business_member`) are the only access checks. They are never re-implemented, copied or bypassed.
  - `service_user_can` is no longer called by any function (R-W1-1).
- **Edge Functions:**
  - Each function has `handler.ts` (pure, with injected dependencies) and `index.ts` (wiring).
  - The caller comes from `getUser()`. 2FA is checked before any permission through `_shared/gate.ts` (Task 2).
  - No secret, code or token is ever logged.
  - `verify_jwt = true` for every function a person calls. `accept-member-invite`, `track-event` and `resend-webhook` stay `false`.
  - No new secrets.
- **Client:**
  - Components get data only through `src/services` (`service`, `auth`, `account`, hooks). Never import `services/mock/*` or `services/supabase/*` into UI code.
  - URLs are built only in `src/lib/urls.ts`.
  - Each service change lands in the Supabase implementation **and** the mock in the same task. When you add an RPC or column, add it by hand to `src/services/supabase/database.types.ts`; it is regenerated at release.
- **Demo mode:**
  - It works with no env vars.
  - It never falls back to demo data after a Supabase error.
  - No `VITE_*` secret.
  - Sample data, demo URLs and session-only actions stay labelled.
- **Copy:**
  - Dashboards are English only, using the exact strings in §11.1 and in each requirement.
  - Applicant-facing and public copy is EN and PT, through `t()` / `localized()` and `src/i18n/dictionaries/{en,pt}.ts`, using the exact strings in §11.2.
  - Server errors map to the fixed copy in §10.2. Never show raw provider text.
- **Owner's design files:**
  - Never edit `src/features/marketing/LandingPage.tsx`.
  - Don't change the landing, apply or sign-in page designs. Only the logic and dictionary strings that a requirement names may change (the `apply.done.next2` string in Task 4, the deactivated message in Task 9).
- **Quality bar:**
  - No dead buttons: a hidden action is hidden, not disabled without a reason.
  - Every data view has loading, empty and error states, and its component test covers all three.
  - No new dependency (otherwise an ADR is needed, and none is planned).
  - Design tokens come from `src/index.css`.
- **Per-task gates:** `npm run typecheck`, `npm run lint` (0 errors), `npm test` and `npm run build` all pass. A touched route is checked at 1440 and 390 px (Playwright screenshot or the demo dev server).
- **Test commands:**
  - PGlite: `npx vitest run supabase/tests/businessLogicFixes.test.ts -t "Task N"`
  - all DB suites: `npx vitest run supabase/tests`
  - a handler: `npx vitest run supabase/functions/<fn>`
  - unit or component: `npx vitest run <path>`
  - e2e (demo, dev server on `E2E_PORT` or 5199): `npx playwright test <spec> --project=desktop` (and `--project=mobile` for `*.mobile.spec.ts`)
  - pixel guard: `npx playwright test --project=guard`

## Review Focus

1. **A business is deleted while its owner has an open closure request.** This happens when the Owner completes a closure or an Admin deletes the business. The `business_members` delete cascades into the R-W1-2 void trigger, whose audit insert names a business that no longer exists. Until Task 11 drops it, the `audit_events` FK would make the whole delete fail. Expected: the delete succeeds, and no `account_closure_voided` row is written for a business that is gone. (Task 3 test: "deleting a business whose owner has an open closure request succeeds and writes no account_closure_voided".)
2. **A staff action succeeds, but the follow-up owner notice fails or is refused.** Examples: `notify-business-owner` is down, or returns 403 `aal2_required`. Expected: the pause, activate, unpublish or delete toast still reports success. No error toast for the notice, and no retry loop. (Task 11 test: "setBusinessStatus succeeds and resolves ok when notify-business-owner rejects".)
3. **A rejection reason with HTML, line breaks or the maximum length.** Expected: the HTML email escapes it, the text email keeps the line breaks, and nothing is cut silently. A reason over the SQL limit is refused before any email is sent. (Task 4 test: "reason with markup and newlines is escaped in html and kept in text".)
4. **A day-bucket boundary on a DST change.** 2026-10-25 is the day Lisbon leaves summer time, and the "last 30 local days" window crosses it. Expected: an event at 2026-10-25 00:30 UTC counts on 25 Oct for `Europe/Lisbon` (01:30 WEST), and the series has exactly `p_days` distinct local dates. (Task 7 test: "analytics_daily buckets across the Lisbon DST change and returns p_days local dates".)
5. **Resend sends the same webhook event twice, or out of order.** Expected: a duplicate `delivered` changes nothing. A pending event is applied once (`applied` becomes true and is never applied again). `delivered` after `bounced` stays `bounced`. (Task 12 test: "a duplicate and a late event are idempotent; a pending event is applied exactly once".)

---

### Task 1: Migration scaffold, PGlite harness, rollback; security-activity privacy, profile visibility and Owner permissions

Closes **R-W1-4** (MAIL-09), **R-W1-5** (TEAM-17), **R-W1-6** (TEAM-18). It also sets up the shared email kinds (§10.4).

**Files:**
- Create:
  - `supabase/migrations/<ts>_business_logic_fixes.sql` (made with `npx supabase migration new business_logic_fixes`; the header comment cites the spec and the section convention);
  - `supabase/rollback/20261026_business_logic_fixes_rollback.sql`;
  - `supabase/tests/harness.ts`;
  - `supabase/tests/businessLogicFixes.test.ts`.
- Modify:
  - `supabase/functions/_shared/email.ts`: `EmailKind` gains `'application_decision' | 'business_notice' | 'team_notice'`;
  - `src/services/catalogService.ts`: `AuditQuery.includeSignIns?: boolean`;
  - `src/services/supabase/supabaseCatalogService.ts` (`getAuditEvents`) and `src/services/mock/mockCatalogService.ts`;
  - `src/features/admin/AuditLogPage.tsx` and `AuditLogPage.test.tsx`;
  - `supabase/tests/accountSettings.test.ts`: the "staff can read other profiles" assertion now follows R-W1-5.

**Interfaces:**
- Produces (harness, `supabase/tests/harness.ts`; copied from `accountSettings.test.ts` and not collected by Vitest):
  - `SUPABASE_STUBS: string`
  - `MIGRATIONS: string`, `S15_MIGRATION: string` (the file name ending `_business_logic_fixes.sql`), `ROLLBACK_SQL: string` (the path of the new rollback script)
  - `applyAll(db: PGlite, filter?: (name: string) => boolean): Promise<void>`
  - `freshDb(filter?): Promise<PGlite>`
  - `makeHelpers(db: PGlite): { as, probe, count, call, flag, svc, withPolicy }`, with the same signatures as in `accountSettings.test.ts`
  - `ids(task: number): (n: number) => string`, which gives UUID `00000000-0000-0000-00TT-0000000000NN` (TT = task, NN = n; it renders as hex digits, so any task number from 1 to 15 is valid).
- Produces (test file): `const GONE_AFTER_ROLLBACK: string[]`, the regclass/regprocedure names checked after the rollback; later tasks push their own names onto it.
- Produces (SQL):
  - `email_log_kind_check` = the existing 9 kinds plus `application_decision`, `business_notice` and `team_notice`;
  - the recreated "Platform members read audit events" policy;
  - the replaced "Platform members read profiles" policy;
  - `my_platform_access()`, which returns the fixed list of 15 keys for an Owner.
- Produces (TS): `getAuditEvents({ includeSignIns })`. It leaves out `account_signed_in` unless `includeSignIns === true`.

- [ ] **Step 1: Write the failing tests** in `businessLogicFixes.test.ts` (`describe('S1.5 Task 1: scaffold and privacy')`):
  - "the S1.5 migration applies after every earlier migration" (`S15_MIGRATION` exists, and `applyAll` passes).
  - "anon cannot execute any public.service_* function". Loop over `pg_proc` where `proname like 'service\_%'`: `has_function_privilege('anon', oid, 'execute')` is false for every one. This guards every later task as well.
  - "an Admin with records.view reads 0 account_% events of other users and still reads their own; the Owner reads all" (seed `account_signed_in` for Owner, Admin and Team).
  - "profiles: a zero-permission Team member reads only their own; default Team (businesses.view) reads business owners' profiles but not staff; default Admin reads both; the Owner reads all".
  - "after Admin and Team permission sets are both {}, the Owner's my_platform_access().permissions has length 15".
  - "email_log accepts application_decision, business_notice and team_notice and still rejects 'nope'".
  - Rollback (`describe('S1.5 rollback')`): "apply → rollback → re-apply succeeds; every GONE_AFTER_ROLLBACK name is null after rollback; the audit and profiles policies are back to their pre-S1.5 definitions (compare `pg_policies.qual` with a fresh DB at `n < S15_MIGRATION`)".
- [ ] **Step 2: Write the failing component test** in `AuditLogPage.test.tsx`:
  - "lists no 'Account signed in' rows by default";
  - "the Owner sees a 'Show sign-ins' checkbox that adds them; an Admin never sees the checkbox";
  - plus loading, empty and error states.
- [ ] **Step 3: Run them and confirm they fail.**
  - `npx vitest run supabase/tests/businessLogicFixes.test.ts src/features/admin/AuditLogPage.test.tsx`
  - Expected: FAIL (migration file missing; checkbox not found).
- [ ] **Step 4: Create the migration and write the Task 1 section.**
  - The policies follow R-W1-4 (the `else` branch adds `event_type not like 'account\_%'`) and R-W1-5 (four row cases; `members.view` doesn't exist, so use `access.view` / `records.view`, per §16).
  - `my_platform_access` returns the 15 keys as a literal array for `is_platform_admin()`.
  - Also write the rollback header and the Task 1 rollback section, and `harness.ts`.
- [ ] **Step 5: Implement `includeSignIns`** in both services, and the Owner-only checkbox. Use `usePermission`/`PlatformAccess.role === 'owner'` to decide who sees it.
- [ ] **Step 6: Update the one `accountSettings.test.ts` assertion** that R-W1-5 changes. Then run `npx vitest run supabase/tests`. Expected: every DB suite passes.
- [ ] **Step 7: Run the gates.** `npm run typecheck && npm run lint && npm test && npm run build` all pass.
- [ ] **Step 8: Commit.** Message "S1.5 Task 1: migration scaffold, privacy of security activity and profiles, Owner permissions".

### Task 2: Staff 2FA gate on Edge Functions, staff password length, owner email conflict

Closes **R-W1-1** (TEAM-01), **R-W1-7** (TEAM-09), **R-W1-8** (TEAM-11).

**Files:**
- Create:
  - `supabase/functions/_shared/gate.ts` and `gate.test.ts`;
  - `supabase/functions/_shared/caller.ts`: `callerRpc(url, anonKey, token)`, built on supabase-js. Only `index.ts` files import it.
- Modify:
  - `provision-owner/{handler,index,handler.test}.ts`, `invite-member/{handler,index,handler.test}.ts` and `send-test-email/{handler,index,handler.test}.ts`;
  - `accept-member-invite/{handler,handler.test}.ts`;
  - `_shared/team.ts`: `STAFF_PASSWORD_MIN = 12`, `STAFF_PASSWORD_MAX = 72`;
  - `src/features/join/JoinPage.tsx` and `JoinPage.test.tsx`.
- Migration: append the Task 2 section (`comment on function public.service_user_can` with "not 2FA-aware; do not use for caller checks"; `service_link_owner` raises `email_is_admin`, errcode 23514).

**Interfaces:**
- Produces (`_shared/gate.ts`):
  ```ts
  export type GateResult = 'ok' | 'aal2_required' | 'forbidden'
  export type GateCheck = { permission: string } | 'owner' | 'staff'
  export type CallerRpc = (fn: string, args?: Record<string, unknown>) => Promise<unknown>
  export async function gateCaller(rpc: CallerRpc, check: GateCheck): Promise<GateResult>
  export function gateReply(g: Exclude<GateResult, 'ok'>): Response   // 403 {error:g}
  ```
  The order is `caller_mfa_satisfied()`, then `platform_can({p_permission})` for `{permission}`, `is_platform_admin()` for `'owner'`, or `is_platform_admin() || is_platform_member()` for `'staff'`. An RPC error throws, and `index.ts` turns it into 500 `unknown`.
- Produces (deps):
  - `ProvisionDeps.gate(token: string): Promise<GateResult>` replaces `isPlatformAdmin(userId)`. It is wired with `{permission:'owners.manage'}`.
  - New `ProvisionDeps.isTeamEmail(email: string): Promise<boolean>`: true when there is a `platform_members` row with `email = lower(email)`, any status.
  - `InviteDeps.gate` replaces `isOwner` (`'owner'`) on **every** action.
  - `TestEmailDeps.gate` replaces its owner check (`'owner'`).
- Consumed later by Tasks 4 (`'staff'`) and 11 (`'staff'`).

- [ ] **Step 1: Write the failing tests:**
  - `gate.test.ts`:
    - "returns aal2_required when caller_mfa_satisfied is false and never asks the permission";
    - "returns forbidden when the helper is false";
    - "staff = admin or member";
    - "propagates an rpc error".
  - provision-owner:
    - "aal1 caller under the staff policy gets 403 aal2_required; no linkOwner, generateCode or email";
    - "aal2 without owners.manage gets 403 forbidden";
    - "an email with a pending platform_members row gets 409 email_is_admin before generateCode is called".
  - invite-member: "invite and resend both return 403 aal2_required at aal1".
  - send-test-email: "403 aal2_required at aal1; works at aal2 for the Owner".
  - accept-member-invite: "an 11-character password gets 422 invalid_request; 12 passes; 73 gets 422".
  - `JoinPage.test.tsx`: "shows 'Use at least 12 characters.' for 11 characters and does not submit".
  - PGlite (`describe('S1.5 Task 2')`): "service_link_owner raises email_is_admin for a user whose email has a platform_members row (any status, case-insensitive: 'Rita@X.pt' vs 'rita@x.pt')".
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run supabase/functions/_shared supabase/functions/provision-owner supabase/functions/invite-member supabase/functions/send-test-email supabase/functions/accept-member-invite src/features/join supabase/tests/businessLogicFixes.test.ts -t "gate|Task 2|provision|invite|test-email|accept|Join"`
- [ ] **Step 3: Implement `gateCaller`**, then wire `gate` in the three `index.ts` files through `callerRpc` (the anon key plus the caller's `Authorization` header, as `manage-member/index.ts` does). Remove every `service_user_can` and direct `platform_admins` read used for the caller.
- [ ] **Step 4: Implement the password limits and the `isTeamEmail` check.**
  - Apply `STAFF_PASSWORD_MIN`/`MAX` in `accept-member-invite`.
  - In `JoinPage`, use `PASSWORD_MIN` from `@/services` and a 72 cap. A comment says Supabase Auth hashes only 72 bytes.
  - Add `isTeamEmail` to provision-owner before `accountByEmail`, plus the SQL section and its rollback section.
- [ ] **Step 5: Run the tests again.** Same command; expected PASS. Then run the gates.
- [ ] **Step 6: Commit.** Message "S1.5 Task 2: 2FA gate on staff Edge Functions, 12-character staff passwords, team email can't be an owner".

### Task 3: Closure integrity (database, account-security, dashboards)

Closes **R-W1-2** (BIZ-01), **R-W1-3** (BIZ-02 = TEAM-07), and the BIZ-02 derived-copy part of **R-W3-6**.

**Files:**
- Migration: append the Task 3 section:
  - `private.void_closure_on_owner_removed` (an `AFTER DELETE` trigger on `business_members`);
  - `private.guard_activate_during_closure` (a `BEFORE UPDATE OF status` trigger on `businesses`);
  - redefined `service_closure_target` and `private.undo_closure`;
  - and the rollback section.
- Modify:
  - `supabase/functions/account-security/handler.ts` and its test (`complete_closure` refuses `not_found` before deleting anything);
  - `src/services/supabase/supabaseCatalogService.ts` (`ACCOUNT_RULES.closure_pending`);
  - `src/services/mock/mockCatalogService.ts` (the new rules: `removeBusinessMember` voids the mock request; `setBusinessStatus(…, 'active')` refuses with `closure_pending` while a request is open);
  - `src/features/businesses/BusinessOwnersPanel.tsx`;
  - `src/features/admin/BusinessesListPage.tsx` and `src/features/admin/BusinessDetailPage.tsx` (+ tests);
  - `src/features/businesses/useBusinessActions.ts`;
  - `src/features/applications/labels.tsx` (`account_closure_voided` label).

**Interfaces:**
- Consumes: `account.listClosureRequests(): Promise<Result<ClosureRequest[]>>` (S1; allowed for `businesses.view`).
- Produces:
  - SQL error `closure_pending` (P0001), mapped to "This business has an open closure request. Only the platform Owner can restore it or complete it.";
  - audit type `account_closure_voided` `{subject_id, business_id, reason:'owner_removed'}`.
- Produces (UI helper): `closureByBusiness(list: ClosureRequest[]): Map<ID, ClosureRequest>` in `src/features/businesses/closure.ts`.

- [ ] **Step 1: Write the failing PGlite tests** (`describe('S1.5 Task 3')`):
  - "owner A requests closure, A's membership is deleted: the request row is gone, account_closure_voided exists with business_id, the business stays inactive";
  - "after removal: service_closure_target(A) → not_found; cancel_account_closure() as A → not_found and the status is unchanged; after owner B is linked nothing A does changes the status";
  - "deleting a business whose owner has an open closure request succeeds and writes no account_closure_voided" (Review Focus 1: skip when the business row no longer exists);
  - "an Admin and the Owner PATCHing status 'active' while a request is open both get closure_pending; setting draft or inactive is allowed and closure_follow_status records it; cancel_account_closure and service_restore_closure still bring it back".
- [ ] **Step 2: Write the failing handler test.** "complete_closure returns not_found and deletes nothing when service_closure_target is not_found".
- [ ] **Step 3: Write the failing component tests:**
  - owner-removal dialog: "shows 'This owner asked to close their account on {date}. Removing them cancels that request. The catalog stays {status label}.' only when a request is open";
  - list and detail:
    - "'Closure requested on {date}' badge for a businesses.view user";
    - "Activate is hidden while a request is open, with the closure_pending copy as its tooltip";
    - "Complete and Restore show for the Owner only";
  - "the offline sentence is chosen from the real status (draft vs inactive)";
  - plus loading and error states of the closure list.
- [ ] **Step 4: Run them and confirm they fail.** `npx vitest run supabase/tests/businessLogicFixes.test.ts -t "Task 3" supabase/functions/account-security src/features/admin src/features/businesses`
- [ ] **Step 5: Implement the SQL section and its rollback, the handler change, the mapping and the mock rules.**
  - The guard applies when `current_user in ('anon','authenticated')` and `coalesce(current_setting('app.account_closure', true), '') <> 'on'`.
  - The void trigger returns early when `not exists (select 1 from public.businesses where id = old.business_id)`.
- [ ] **Step 6: Implement the UI.**
- [ ] **Step 7: Run the tests and the gates.** Check `/admin/businesses` and the detail page at 1440 and 390 px.
- [ ] **Step 8: Commit.** Message "S1.5 Task 3: closure follows the owner's membership; no activation around an open closure".

### Task 4: Rejection email through `review-application`

Closes **R-W2-1** (APP-01 = MAIL-01).

**Files:**
- Create: `supabase/functions/review-application/{handler,index,handler.test}.ts`.
- Modify:
  - `supabase/config.toml`: `[functions.review-application] verify_jwt = true`;
  - `supabase/functions/_shared/email-templates.ts` and `email-templates.test.ts`: `applicationDecisionEmail` (EN and PT, §11.2), and the application-confirmation line replaced (§11.2);
  - `src/i18n/dictionaries/en.ts` and `pt.ts`: `apply.done.next2` (§11.2);
  - `src/domain/types.ts`: `BusinessApplication` result extension;
  - `src/services/catalogService.ts`, `supabaseCatalogService.ts` and `mockCatalogService.ts`: `reviewApplication`;
  - `src/features/admin/ApplicationDetailPage.tsx` and its test.

**Interfaces:**
- Consumes: `gateCaller(…, 'staff')` from Task 2. The per-action permission stays in SQL.
- Produces (function): `POST {applicationId, action:'start_review'|'approve'|'reject', reason?, includeReason?}` → `{ok:true, status, businessId?, email?:{status, error?}}`.
  - Errors: 403 `aal2_required`/`forbidden`; 422 `reason_required`/`invalid_transition`; 404 `application_not_found`; 400 `invalid_request`.
  - `reopen` is moved to S3, so it returns 400 `invalid_request`.
- Produces (deps):
  ```ts
  export interface ReviewDeps {
    config: ConfigResult; fetch: typeof fetch; now?: () => Date
    userIdFromToken(token: string): Promise<string | null>
    gate(token: string): Promise<GateResult>
    reviewAsCaller(token: string, applicationId: string, action: 'start_review' | 'approve' | 'reject', reason: string | null): Promise<{ ok: true; status: string; businessId?: string } | { error: string }>
    getApplicant(applicationId: string): Promise<{ businessName: string; email: string; language: 'en' | 'pt' } | null>
    log(entry: LogEntry): Promise<string>
  }
  export async function handleReviewApplication(req: Request, deps: ReviewDeps): Promise<Response>
  ```
- Produces (service): `reviewApplication(id: ID, action: ReviewAction, reason?: string, opts?: { includeReason?: boolean }): Promise<Result<BusinessApplication & { decisionEmail?: { status: EmailAttemptStatus; error?: string } }>>`. The mock records an `application_decision` email attempt, labelled demo.

- [ ] **Step 1: Write the failing handler tests:**
  - "reject unticked → one email_log row (kind application_decision, workflow application:<id>:decision, application_id set) and no 'Reason:' in text or html";
  - "reject ticked → text includes 'Reason: {reason}'";
  - "PT application → PT subject 'A sua candidatura à Sanctus para {businessName}' and 'Motivo:'";
  - "approve and start_review send nothing";
  - "an email failure keeps the rejection (200 ok:true, email.status failed)";
  - "aal2_required at aal1";
  - "reopen → 400 invalid_request";
  - "reason with markup and newlines is escaped in html and kept in text" (Review Focus 3).
- [ ] **Step 2: Write the failing template tests and component tests:**
  - templates: "the confirmation email says 'If we approve it, you will receive an invitation to set up your catalog. If we can't, we will tell you by email.' (EN) and the PT line".
  - ApplicationDetailPage:
    - "the reject modal has 'Include the reason in the email', off by default, with the hint";
    - "toast 'Application rejected. The applicant was emailed.' when the status is accepted, else 'Application rejected, but the email was not sent: {reason}.'".
- [ ] **Step 3: Run them and confirm they fail.** `npx vitest run supabase/functions/review-application supabase/functions/_shared src/features/admin/ApplicationDetailPage`
- [ ] **Step 4: Implement the handler and `index.ts`** (the caller client for `admin_review_application`, the service role for `getApplicant` and `log`), the templates, the config entry and the dictionary strings.
- [ ] **Step 5: Implement the service in both modes and the UI.** In Supabase mode, every review action calls the function.
- [ ] **Step 6: Run the tests and the gates.** Check the application detail page at 1440 and 390 px.
- [ ] **Step 7: Commit.** Message "S1.5 Task 4: review-application function and the rejection email".

### Task 5: Permission prerequisites and storage deletes

Closes **R-W3-3** (TEAM-02 = PROD-04, TEAM-03, and the storage part of BIZ-06).

**Files:**
- Migration: append the Task 5 section:
  - `admin_set_role_permissions` closes over the prerequisites and returns `{ok, added}`;
  - backfill of the existing role sets, with an `access_permissions_changed {reason:'prerequisites'}` audit row per changed role;
  - recreated "Platform members delete media" and "Platform members delete logos";
  - and the rollback section.
- Modify:
  - `src/domain/permissions.ts`;
  - `src/services/catalogService.ts`, `supabaseTeam.ts` (or wherever `setRolePermissions` lives) and `mockTeam.ts`;
  - `src/features/team/RolePermissionsPage.tsx` and its test;
  - `src/features/admin/BusinessesListPage.tsx`, `src/features/admin/BusinessCreatePage.tsx` and `src/features/businesses/BusinessForm.tsx`;
  - `supabase/tests/platformTeam.test.ts`, only where it asserts `{ok:true}` from `admin_set_role_permissions`.

**Interfaces:**
- Produces (`src/domain/permissions.ts`):
  ```ts
  export const PERMISSION_PREREQUISITES: Readonly<Record<Permission, readonly Permission[]>>
  export function withPrerequisites(set: readonly Permission[]): Permission[]   // transitive closure, stable order of PERMISSIONS
  ```
  The values are the §4 R-W3-3 list:
  - products.edit→view; publish and delete→edit;
  - businesses.edit→view; status→edit; delete→edit + products.delete;
  - owners.manage→businesses.view;
  - applications.approve and reject→view.
- Produces (service): `setRolePermissions(role: MemberRole, permissions: Permission[]): Promise<Result<{ added: Permission[] }>>` (it was `Result<void>`).

- [ ] **Step 1: Write the failing tests:**
  - unit, `src/domain/permissions.test.ts`: "withPrerequisites({products.publish}) = {products.view, products.edit, products.publish}"; "businesses.delete pulls businesses.edit, businesses.view, products.delete, products.edit, products.view".
  - PGlite (`describe('S1.5 Task 5')`):
    - "saving Team = {products.publish} stores the three and returns added [products.view, products.edit]; the audit row lists them";
    - "the backfill normalises a pre-seeded {products.publish} set and audits reason prerequisites" (seed it in a fresh DB at `n < S15_MIGRATION`, then apply);
    - "SQL closure equals withPrerequisites for every single permission" (the 15 keys as a table-driven case);
    - "a member whose role is {businesses.view, businesses.delete} saved through the RPC can delete storage objects in business-logos and product-media of that business; with only businesses.view they can't".
  - RolePermissionsPage:
    - "shows 'Includes: {labels}' under each permission";
    - "ticking products.publish ticks and locks products.edit and products.view";
    - "toast 'Saved. Also added: View products, which it needs.'". Use 'it needs' when exactly one newly ticked permission caused the additions, else 'they need'.
  - BusinessesListPage: "'View products' and 'View QR code' hidden without products.view". BusinessCreatePage: "'Create business (active)' only with businesses.status; otherwise only 'Save as draft'".
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/domain supabase/tests/businessLogicFixes.test.ts -t "Task 5" src/features/team src/features/admin`
- [ ] **Step 3: Implement the SQL section and its rollback.** Keep the SQL prerequisite map in one `private.permission_prerequisites()` set-returning function that the RPC and the backfill both use. The mirrored TS map is pinned by the table-driven test.
- [ ] **Step 4: Implement the service (both modes) and the UI.**
- [ ] **Step 5: Run the tests and the gates.** Check `/admin/team/roles` and `/admin/businesses` at 1440 and 390 px.
- [ ] **Step 6: Commit.** Message "S1.5 Task 5: a permission includes the permissions it needs; storage deletes follow permission".

### Task 6: One preview helper, and the preview banner by cause

Closes **R-W4-1** (PUB-01 = PROD-01, L3) and **R-W3-8** (PUB-06 = BIZ-11).

**Files:**
- Modify:
  - `src/lib/urls.ts` and its test (`src/lib/urls.test.ts`; create it if missing);
  - `src/features/products/ProductTable.tsx`;
  - `src/features/products/editor/ProductEditorForm.tsx` (the Preview link only);
  - `src/features/public/ProductPage.tsx` (the banner choice only);
  - `src/features/admin/BusinessesListPage.tsx` and `src/features/admin/BusinessDetailPage.tsx`;
  - their tests.

**Interfaces:**
- Produces: `export function needsPreview(product: { status: ProductStatus }, business: { status: BusinessStatus }): boolean`, true when `product.status !== 'published' || business.status !== 'active'`.
- Consumes: the existing `productLocalPath(b, p, { preview })` and `catalogLocalPath(b, { preview })`.

- [ ] **Step 1: Write the failing tests:**
  - urls: "needsPreview is false only for a published product in an active business".
  - ProductTable: "'Open product page' for a published product in a draft business links with ?preview".
  - ProductPage:
    - "a published product in a draft business shows 'Preview. Customers cannot see this catalog until it is activated.'";
    - "a draft product in an active business shows 'Draft preview. Customers cannot see this page until it is published.'".
  - Businesses list and detail: "a non-active business shows 'Preview catalog' linking with preview; an active one shows 'Open catalog'".
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/lib src/features/products src/features/public src/features/admin`
- [ ] **Step 3: Implement `needsPreview`.** Use it in the editor Preview and in "Open product page". Choose the banner by cause (business first), and set the admin link labels.
- [ ] **Step 4: Run the tests and the gates.** Check a product page in preview at 1440 and 390 px.
- [ ] **Step 5: Commit.** Message "S1.5 Task 6: owner and admin previews use one helper; banner says why".

### Task 7: Analytics data: embed views, deleted products, exact counts, time zones, Most viewed

Closes **R-W5-2** (ANA-02), **R-W5-3** (ANA-04), **R-W5-4** (ANA-11), **R-W5-6** (ANA-06 = BIZ-12), **R-W5-7** (ANA-07).

**Files:**
- Migration: append the Task 7 section:
  - `product_analytics_event_type_check` adds `embed_view`, and `record_event_limited` accepts it;
  - `product_analytics_daily` appends `embed_views`;
  - `product_id` becomes nullable; the composite FK becomes `on delete set null (product_id)`; a new FK `business_id → businesses on delete cascade`;
  - `public.business_product_counts` (security invoker; `grant select to authenticated`);
  - `public.analytics_daily`;
  - and the rollback section (its header already states the data loss).
- Modify:
  - `supabase/functions/track-event/{handler,handler.test}.ts` (`EVENT_TYPES` + `embed_view`);
  - `src/features/public/EmbedProductPage.tsx` (sends `embed_view`);
  - `src/domain/types.ts`;
  - `src/services/analytics.ts` and its test;
  - `src/services/catalogService.ts`, `supabaseCatalogService.ts` and `mockCatalogService.ts`;
  - `src/features/analytics/AnalyticsView.tsx` and `AnalyticsView.test.tsx`;
  - `src/features/analytics/MostViewedList.tsx`;
  - `src/features/products/useProductActions.tsx` (the delete dialog line).

**Interfaces:**
- Produces (SQL): `public.analytics_daily(p_tz text, p_days int default 30, p_business uuid default null) returns table (business_id uuid, product_id uuid, day date, views bigint, embed_views bigint, ar_activations bigint, model_interactions bigint)`.
  - It is security invoker; `grant execute to authenticated`.
  - It raises `invalid_timezone` (22023) when `p_tz` is not in `pg_timezone_names`, and `invalid_request` (22023) when `p_days` is not within 1–366.
- Produces (TS):
  - `AnalyticsEventType` adds `'embed_view'`.
  - `DailyStat.productId: ID | null` and `DailyStat.embedViews: number`.
  - `ProductAnalytics.embedViews: number`, with `arRate = ar / (views + embedViews)` (0 when the divisor is 0).
  - `AnalyticsSummary.totals.embedViews: number`.
  - `AnalyticsSummary.deletedProducts: { views: number; embedViews: number; arActivations: number; modelInteractions: number } | null`.
  - `summarize(db, businessId?, now?, isSample?, timeZone = 'UTC')`, where the series days are local dates in `timeZone`.
  - `getAnalytics(opts?: { timeZone?: string })` and `getBusinessAnalytics(businessId: ID, opts?: { timeZone?: string })`. Callers pass `usePreferences().timezone` (demo: the browser zone).
  - `export const EMBED_VIEWS_SINCE = '<migration date, YYYY-MM-DD>'` in `src/services/analytics.ts`. The release step in the runbook sets it to the apply date.

- [ ] **Step 1: Write the failing PGlite tests** (`describe('S1.5 Task 7')`):
  - "an event at 2026-10-26 01:30 UTC lands on 25 Oct for America/Sao_Paulo and on 26 Oct for Europe/Lisbon";
  - "analytics_daily buckets across the Lisbon DST change and returns p_days local dates" (Review Focus 4);
  - "unknown tz → invalid_timezone; p_days 0 and 367 refused";
  - "analytics_daily applies RLS: an owner sees only their business";
  - "record_event_limited accepts embed_view; one embed load → embed_views +1, views +0";
  - "deleting a product with 500 views keeps 500 rows with product_id null, and the 30-day total is unchanged";
  - "deleting the business deletes its analytics rows";
  - "business_product_counts is exact for 1,200 products".
- [ ] **Step 2: Write the failing unit and component tests:**
  - `analytics.test.ts`: "summarize adds null-product rows to totals and the series and returns them as deletedProducts"; "series keys follow timeZone".
  - Service: "getAnalytics pages products, businesses and analytics_daily with range until fewer than 1000 rows" (a fake client returning 1000 + 200).
  - track-event: "accepts embed_view".
  - AnalyticsView:
    - "labels 'Product page views' and 'Embed views'";
    - "AR rate reads '{n.nn} AR launches per view' and never contains '%'";
    - "notes 'Embed loads before {date} are counted as page views.'";
    - "a 'Deleted product' row";
    - "the chart axis and tooltip use formatDate(iso, 'en', prefs)".
  - MostViewedList: "omits products with views + embedViews = 0".
  - Product delete dialog: "adds 'Its past views stay in your totals as 'Deleted product'.'".
- [ ] **Step 3: Run them and confirm they fail.** `npx vitest run supabase/tests/businessLogicFixes.test.ts -t "Task 7" supabase/functions/track-event src/services src/features/analytics src/features/products`
- [ ] **Step 4: Implement the SQL section and its rollback.** Update any `migrations.test.ts` assertion that expects the old analytics cascade (name R-W5-4 in the commit body).
- [ ] **Step 5: Implement the services (both modes), `summarize`, the embed event and the UI.**
- [ ] **Step 6: Run the tests and the gates.** Check both analytics pages at 1440 and 390 px.
- [ ] **Step 7: Commit.** Message "S1.5 Task 7: embed views, deleted-product history, exact counts, local-day analytics".

### Task 8: Dashboard numbers and activity

Closes **R-W5-1** (ANA-01 = TEAM-10), **R-W5-5** (ANA-10), **R-W5-8** (ANA-12).

**Files:**
- Migration: append the Task 8 section:
  - `private.audit_product_change` (`AFTER INSERT OR UPDATE OR DELETE` on `products`). It writes `product_created`, `product_published`, `product_unpublished`, `product_slug_changed` and `product_deleted` with `{name}` and `business_id`. It skips a delete when the business row is no longer visible.
  - The new policy "Platform members read catalogue activity".
  - **Also the R-W7-2 policy** "Business owners read platform changes to their business", with the full whitelist from R-W7-2, because the owner's Overview needs it now (Task 11 relies on it).
  - The rollback section.
- Modify:
  - `src/services/analytics.ts` (`deriveActivity` from audit rows);
  - `supabaseCatalogService.ts` and `mockCatalogService.ts` (`getRecentActivity`);
  - `src/features/applications/labels.tsx` (the five product types);
  - `src/features/admin/AdminOverviewPage.tsx`;
  - `src/features/business/BusinessOverviewPage.tsx`;
  - tests in `src/features/admin/adminPages.test.tsx` and `src/features/business/ownerDashboard.test.tsx`.

**Interfaces:**
- Produces: audit types `product_created`, `product_published`, `product_unpublished`, `product_slug_changed` and `product_deleted`, with `metadata.name`. The owner-read policy exists (consumed by Task 11).
- Consumes: `usePermission(permission: Permission): boolean` (existing).

- [ ] **Step 1: Write the failing PGlite tests** (`describe('S1.5 Task 8')`):
  - "insert, publish, unpublish, slug change and delete each write one event with name and business_id";
  - "a business delete writes no product_deleted rows";
  - "staff read product_% only with products.view, and business_% only with businesses.view";
  - "an owner reads only their business's whitelisted events".
- [ ] **Step 2: Write the failing component tests:**
  - "unpublishing shows '{name} was unpublished'; a draft is never 'was published'; a paused catalog and a deleted product appear";
  - Overview gating:
    - "without analytics.view: 'You don't have access to analytics.'";
    - "product counts need products.view, business counts need businesses.view";
    - "Team without applications.view never sees 'No applications awaiting review'";
    - "Most viewed rows link to edit only with products.edit";
  - Published hint: "'In your catalog' active, 'Catalog not public yet' draft, 'Catalog paused' inactive";
  - plus loading, empty and error for the activity feed.
- [ ] **Step 3: Run them and confirm they fail.** `npx vitest run supabase/tests/businessLogicFixes.test.ts -t "Task 8" src/features/admin src/features/business src/services`
- [ ] **Step 4: Implement the SQL section and its rollback, the services (both modes) and the UI.**
- [ ] **Step 5: Run the tests and the gates.** Check both Overviews at 1440 and 390 px.
- [ ] **Step 6: Commit.** Message "S1.5 Task 8: Overview follows permissions; activity from audit events".

### Task 9: Team membership lifecycle: remove, email sync, deactivated access, fresh access

Closes **R-W6-1** (TEAM-04), **R-W6-2** (TEAM-05 = MAIL-03), **R-W6-7** (TEAM-16), **R-W6-8** (TEAM-12).

**Files:**
- Migration: append the Task 9 section:
  - `admin_remove_member(p_member uuid) → jsonb` (through `owner_or_deny`);
  - `private.sync_member_email` (`AFTER UPDATE OF email ON auth.users`, never raises) and its backfill;
  - `my_platform_access` redefined from Task 1's body: a deactivated member gets `{role:null, status:'deactivated'}`;
  - the rollback section.
- Modify:
  - `supabase/functions/manage-member/{handler,index,handler.test}.ts`;
  - `src/domain/types.ts`;
  - `src/services/catalogService.ts`, `supabaseTeam.ts` and `mockTeam.ts`;
  - `src/auth/AccountProvider.tsx`;
  - `src/features/auth/LoginPage.tsx` (the message only);
  - `src/features/team/MemberDetailPage.tsx` and `src/features/team/useMemberActions.tsx` (+ tests);
  - `src/features/team/teamLabels.tsx`.

**Interfaces:**
- Produces (SQL): `admin_remove_member` → `{ok, user_id}` | `{error:'forbidden'|'not_found'|'not_deactivated'|'self'}`; audit `access_member_removed {member_id, email_sha256, role}` and `access_member_email_changed {member_id, from, to, conflict?}`.
- Produces (function): `manage-member {action:'remove', memberId}` → `{ok, loginDeleted}`. New dep `deleteLoginIfUnused(userId: string): Promise<boolean>` (service role: when there is no `business_members` row and no `platform_admins` row, end the sessions and delete the auth user).
- Produces (TS):
  - `PlatformAccess = { role: PlatformRole | null; permissions: Permission[]; status: 'active' | 'deactivated' }`;
  - `removeMember(id: ID): Promise<Result<{ loginDeleted: boolean }>>`.
- Produces (AccountProvider): it refetches `getMyAccess` on the same focus, visibility and interval cadence as the security state, and after any `PERMISSION` error. A change shows "Your access changed. This page was updated."

- [ ] **Step 1: Write the failing PGlite tests** (`describe('S1.5 Task 9')`):
  - "admin_remove_member: Owner only, refuses an active member (not_deactivated) and self, deletes the invites and the row, writes access_member_removed";
  - "after removal the email can be provisioned as an owner (service_link_owner) and invited again";
  - "updating auth.users.email to 'New@X.pt' sets platform_members.email 'new@x.pt' and audits from/to";
  - "an address already used by another member changes nothing and audits conflict:true";
  - "an exception inside sync_member_email doesn't block the auth.users update" (a temporary raising trigger on `platform_members`);
  - "the backfill syncs drifted rows";
  - "my_platform_access for a deactivated member → role null, status deactivated; the Owner still gets 15".
- [ ] **Step 2: Write the failing handler and component tests:**
  - manage-member: "remove calls admin_remove_member with the caller token, then deletes the login only when unused; loginDeleted reported".
  - MemberDetailPage: "Remove shows only on a deactivated member, with the §11.1 title, body and button; toast '{email} was removed.'".
  - LoginPage: "a deactivated member sees 'Your platform access was turned off by the Owner. Contact them if you need it back.'".
  - AccountProvider: "a changed permission set on focus updates the nav and shows 'Your access changed. This page was updated.'"; "a PERMISSION error triggers a refetch".
- [ ] **Step 3: Run them and confirm they fail.** `npx vitest run supabase/tests/businessLogicFixes.test.ts -t "Task 9" supabase/functions/manage-member src/auth src/features/team src/features/auth`
- [ ] **Step 4: Implement the SQL section and its rollback, the function, the services (both modes) and the UI.**
- [ ] **Step 5: Run the tests and the gates.** Check the member page and the login page at 1440 and 390 px.
- [ ] **Step 6: Commit.** Message "S1.5 Task 9: remove deactivated members, sync staff email, deactivated access state, access refresh".

### Task 10: Team invitations, Access history and the 2FA reset

Closes **R-W6-4** (TEAM-06), **R-W6-5** (TEAM-14 = MAIL-17), **R-W6-6** (TEAM-15), **R-W6-9** (TEAM-13).

**Files:**
- Migration: append the Task 10 section:
  - `private.platform_invites.note text check (char_length(note) <= 500)`;
  - `service_accept_invite` adds `member_id` to `access_invite_expired_attempt`;
  - `admin_list_members` and `admin_get_member` gain `has_2fa` (a verified factor, or stored recovery codes);
  - the rollback section.
- Modify:
  - `supabase/functions/invite-member/{handler,index,handler.test}.ts`;
  - `supabase/functions/_shared/team.ts` and `team.test.ts`;
  - `supabase/functions/account-security/{handler,handler.test}.ts` (`nothing_to_reset`);
  - `src/domain/types.ts`;
  - `supabaseTeam.ts` and `mockTeam.ts`;
  - `src/features/team/{AccessHistory,InviteMemberDialog,InvitationsTable,TeamPage,MemberDetailPage}.tsx` and tests.

**Interfaces:**
- Produces (`_shared/team.ts`): `export const PERMISSION_LABELS: Record<string, string>`, mirrored from `src/features/team/permissions.ts`. `team.test.ts` asserts the two sets of labels are equal.
- Produces (invite deps):
  - `rolePermissions(role: MemberRole): Promise<string[]>` (`platform_role_permissions` at send time);
  - `createInvite(memberId, tokenHash, expiresAt, actorId, note: string | null)`;
  - `latestNote(memberId: string): Promise<string | null>`.
- Produces (TS):
  - `PlatformMember.has2fa: boolean`;
  - `AccessQuery.memberId?: ID` and `AccessQuery.userId?: ID`. The filter is `metadata->>member_id = memberId`, or `event_type = 'access_denied' and actor_id = userId`, with no `ilike`.

- [ ] **Step 1: Write the failing tests:**
  - PGlite (`describe('S1.5 Task 10')`): "note > 500 refused"; "an expired-invite attempt carries member_id"; "has_2fa true for a verified factor or recovery codes, else false".
  - invite-member: "with products.publish removed from Admin, the email bullets don't mention publishing"; "resend reuses the latest note".
  - account-security: "owner_reset_2fa on a member with no factor and no codes → 409 nothing_to_reset, no email, no event".
  - Services: "access history for delivered+a_b@resend.dev shows its events; an@x.pt doesn't show jan@x.pt's".
  - InviteMemberDialog `already_member` mapping:
    - invited → "This person already has an invitation. Use Resend on their row.";
    - deactivated → "This person was deactivated. Reactivate them, or remove them to start over.";
    - active → the existing copy.
  - Revoke toast: "Invitation revoked. Use Resend to send them a new link."
  - "'Pending invitations' counts only sent or pending, unexpired invites".
  - MemberDetailPage: "Reset 2FA only when has2fa".
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run supabase/tests/businessLogicFixes.test.ts -t "Task 10" supabase/functions/invite-member supabase/functions/_shared supabase/functions/account-security src/features/team src/services`
- [ ] **Step 3: Implement the SQL section and its rollback, the functions, the services (both modes) and the UI.**
- [ ] **Step 4: Run the tests and the gates.** Check the Team page and the member page at 1440 and 390 px.
- [ ] **Step 5: Commit.** Message "S1.5 Task 10: invitation bullets from the role, stored note, exact access history, 2FA reset only when set".

### Task 11: History that survives deletion, owner notices, history gating

Closes **R-W7-1** (MAIL-08), **R-W7-2** (MAIL-11), **R-W7-8** (MAIL-07).

**Files:**
- Migration: append the Task 11 section:
  - `private.snapshot_audit_event` (`BEFORE INSERT` on `audit_events`). It adds `metadata.business_name` when `business_id` is set and the name is missing, and `metadata.actor_label` ∈ Owner | Admin | Team | Business owner | User;
  - drop the FK on `audit_events.business_id`;
  - `private.audit_business_change` sets `business_id` and `business_name` on `business_deleted`;
  - the rollback section (re-adds the FK `not valid`).
- Create: `supabase/functions/notify-business-owner/{handler,index,handler.test}.ts`.
- Modify:
  - `supabase/config.toml` (`[functions.notify-business-owner] verify_jwt = true`);
  - `_shared/email-templates.ts` and its test (`businessNoticeEmail`: four events in EN and PT, plus the §11.2 footer);
  - `supabaseCatalogService.ts` and `mockCatalogService.ts`;
  - `src/services/catalogService.ts` (`AuditEntry` fields and `getPlatformChanges`);
  - `src/features/applications/AuditTimeline.tsx` and `EmailActivity.tsx`;
  - `src/features/admin/BusinessDetailPage.tsx` and `ApplicationDetailPage.tsx` (gating);
  - `src/features/business/BusinessOverviewPage.tsx` (the "Changes by the platform team" card);
  - tests.

**Interfaces:**
- Consumes: `gateCaller(…, 'staff')` (Task 2), the owner-read policy (Task 8), and the product audit types (Task 8).
- Produces (TS):
  - `AuditEntry` gains `actorLabel?: 'Owner' | 'Admin' | 'Team' | 'Business owner' | 'User'`, `businessName?: string` and `businessDeleted?: boolean`;
  - `getPlatformChanges(businessId: ID): Promise<Result<AuditEntry[]>>` (the last 20 rows with `actorLabel` in Owner, Admin or Team).
- Produces (function): `POST {businessId}` → `{ok:true, sent:n, skipped:n}`. Deps:
  ```ts
  export interface NotifyDeps {
    config: ConfigResult; fetch: typeof fetch; now?: () => Date
    userIdFromToken(token: string): Promise<string | null>
    gate(token: string): Promise<GateResult>
    recentRows(businessId: string, actorId: string, sinceIso: string): Promise<{ id: string; eventType: string; metadata: Record<string, unknown> }[]>
    recipient(businessId: string): Promise<{ email: string; language: 'en' | 'pt'; businessName: string } | null>
    alreadySent(workflow: string): Promise<boolean>
    log(entry: LogEntry): Promise<string>
  }
  ```
  - `recentRows` covers the last 10 minutes: `business_status_changed` to inactive or active, `product_unpublished` and `product_deleted`, with `actor_label` in Owner, Admin or Team.
  - The workflow is `business_notice:<audit_id>`.
  - The language is the source application's language, else `en`.
- Produces (service): after a **staff** caller's `setBusinessStatus` (to active or inactive), `unpublishProduct` or `deleteProduct`, the Supabase service calls the function fire-and-forget. A failure never changes the action's result. The mock records a demo `business_notice` attempt.

- [ ] **Step 1: Write the failing PGlite tests** (`describe('S1.5 Task 11')`):
  - "after a business is deleted, its earlier rows still filter by business_id and carry business_name";
  - "actor_label is Owner, Admin, Team, Business owner or User, and no email or name is stored";
  - "the owner reads their business's whitelisted platform rows and not another business's".
- [ ] **Step 2: Write the failing handler tests:**
  - "an Admin pause → one business_notice to the owner; a second call sends 0 (skipped 1)";
  - "only the caller's own rows from the last 10 minutes";
  - "PT application → PT subject 'O seu catálogo Sanctus foi pausado'";
  - "aal2_required at aal1";
  - "an owner (non-staff) → 403 forbidden".
- [ ] **Step 3: Write the failing component and service tests:**
  - AuditTimeline: "a null actor with a label → 'Deleted user ({label})', with no label → 'System'; a missing business → '{business_name} (deleted)' with no link".
  - Business History and Email activity: without `records.view`, "This business's history needs 'View the audit log and email log'." Application: "Showing application events only."
  - Owner card "Changes by the platform team": loading, empty ("No changes by the platform team."), error and rows.
  - Service: "setBusinessStatus succeeds and resolves ok when notify-business-owner rejects" (Review Focus 2).
- [ ] **Step 4: Run them and confirm they fail.** `npx vitest run supabase/tests/businessLogicFixes.test.ts -t "Task 11" supabase/functions/notify-business-owner supabase/functions/_shared src/features/applications src/features/admin src/features/business src/services`
- [ ] **Step 5: Implement the SQL section and its rollback, the function, the templates, the services (both modes) and the UI.**
- [ ] **Step 6: Run the tests and the gates.** Check the owner Overview and the business detail page at 1440 and 390 px.
- [ ] **Step 7: Commit.** Message "S1.5 Task 11: history keeps deleted businesses and people; owners are told about platform changes".

### Task 12: Email status integrity

Closes **R-W7-3** (MAIL-02 part 1), **R-W7-4** (MAIL-12), **R-W7-5** (MAIL-13).

**Files:**
- Migration: append the Task 12 section:
  - `private.email_provider_events.applied boolean not null default true`;
  - `service_record_email_event` redefined with the ranks (blocked 0, failed 1, accepted 1, sent 2, delayed 3, delivered 4, bounced 5, complained 5); an unmatched event is stored with `applied = false`; a `team_invitation` row that bounces, complains or fails moves the member's newest `sent` invite (created no later than the log row) to `email_failed` and sets `last_email_result`;
  - `private.apply_pending_email_events` (`AFTER INSERT OR UPDATE OF provider_message_id` on `email_log`, in `received_at` order);
  - `service_apply_provider_status(p_message_id text, p_status text) → boolean`;
  - the rollback section.
- Modify:
  - `supabase/functions/resend-webhook/{handler,handler.test}.ts` (forwards `email.suppressed` as `bounced` with `error = 'suppressed'`);
  - `supabase/functions/send-test-email/{handler,index,handler.test}.ts` (status only through `service_apply_provider_status`; `opened`, `clicked`, `scheduled` and unknown events write nothing);
  - `src/features/team/{TeamPage,MemberDetailPage}.tsx` tests (the "Email failed" label shows).

**Interfaces:**
- Produces: `service_apply_provider_status` (service_role only). It returns true when it wrote.

- [ ] **Step 1: Write the failing PGlite tests** (`describe('S1.5 Task 12')`):
  - "delivered after bounced stays bounced";
  - "sent before the log row is stored applied=false and applied when the row's provider_message_id arrives";
  - "a duplicate and a late event are idempotent; a pending event is applied exactly once" (Review Focus 5);
  - "a bounce webhook for team_invite:<member> sets the newest sent invite to email_failed";
  - "service_apply_provider_status follows the ranks and ignores opened/clicked/scheduled/unknown".
- [ ] **Step 2: Write the failing handler and component tests:**
  - resend-webhook: "email.suppressed → bounced, error suppressed".
  - send-test-email: "never writes a lower-ranked status".
  - Team: "an email_failed invite shows 'Email failed' on the Team page and the member page".
- [ ] **Step 3: Run them and confirm they fail.** `npx vitest run supabase/tests/businessLogicFixes.test.ts -t "Task 12" supabase/functions/resend-webhook supabase/functions/send-test-email src/features/team`
- [ ] **Step 4: Implement the SQL section and its rollback, and the two functions.**
- [ ] **Step 5: Run the tests and the gates.**
- [ ] **Step 6: Commit.** Message "S1.5 Task 12: email status ranks, suppressed, pending events, failed team invitations".

### Task 13: account-security notices, blocked codes, closure attribution, staff self-closure

Closes **R-W6-3** (TEAM-08 = MAIL-10), **R-W7-6** (MAIL-04), **R-W7-7** (MAIL-05), **R-W7-9** (MAIL-16).

**Files:**
- Migration: append the Task 13 section:
  - `service_request_closure` writes `access_member_closed {member_id, email_sha256, role, reason:'self_closure'}` for staff before the account is deleted;
  - `service_log_account_event` is dropped and recreated with `p_business_id uuid default null` (grants restated);
  - `private.audit_business_change` honours `app.actor_id` (its body starts from Task 11's version);
  - the rollback section.
- Modify:
  - `supabase/functions/account-security/{handler,index,handler.test}.ts`;
  - `_shared/email-templates.ts` and its test (`teamNoticeEmail`; the inbox "Closure request cancelled" email, §11.3);
  - `src/services/accountService.ts`, `supabaseAccount.ts` and `mockAccount.ts`;
  - `src/features/settings/ActionCodeDialog.tsx` and `useCancelClosure.ts` (+ tests);
  - the toasts in `src/features/team/useMemberActions.tsx` and the closure actions from Task 3;
  - `src/features/team/teamLabels.tsx` ("{Role} closed their own account").

**Interfaces:**
- Produces (function responses):
  - `owner_reset_2fa`, `restore_closure` and `complete_closure` return `{ok, notice:{status: EmailStatus, error?}}`;
  - a `blocked` send returns `email_blocked` (the code is voided);
  - the new action `cancel_closure` runs `cancel_account_closure` with the caller's JWT and then alerts the inbox;
  - staff self-closure emails each Owner a `team_notice`;
  - with no admin inbox set, a `blocked` `closure_request` row is logged.
- Produces (TS):
  - `export interface NoticeOutcome { status: EmailAttemptStatus; error?: string }`;
  - `ownerReset2fa(targetUserId, code): Promise<Result<{ notice: NoticeOutcome }>>`, and the same shape for `restoreClosure` and `completeClosure`;
  - `cancelClosure(): Promise<Result<void>>` now goes through the function.

- [ ] **Step 1: Write the failing PGlite tests** (`describe('S1.5 Task 13')`):
  - "staff self-closure writes access_member_closed before the user is deleted";
  - "account_closure_requested stores business_id, and the closure's status change is attributed to the requester via app.actor_id".
- [ ] **Step 2: Write the failing handler tests:**
  - "notice.status accepted vs failed in the three responses";
  - "a blocked send → email_blocked, code voided; transient → email_failed";
  - "cancel_closure calls cancel_account_closure as the caller and emails the inbox 'Closure request cancelled: {businessName}'";
  - "no inbox → a blocked closure_request row";
  - "staff self-closure → one team_notice per Owner with subject '{email} left the Sanctus team'".
- [ ] **Step 3: Write the failing component tests:**
  - "toasts end '…. They were emailed.' only for accepted, else '…, but the notice email was not sent: {reason}.'";
  - ActionCodeDialog: "email_blocked shows 'Email can't be sent to this address yet. Contact the Sanctus team.' and disables Resend for the session".
  - Access history: "'Admin closed their own account'".
- [ ] **Step 4: Run them and confirm they fail.** `npx vitest run supabase/tests/businessLogicFixes.test.ts -t "Task 13" supabase/functions/account-security supabase/functions/_shared src/features/settings src/features/team src/services`
- [ ] **Step 5: Implement the SQL section and its rollback, the function, the services (both modes) and the UI.**
- [ ] **Step 6: Run the tests and the gates.** Check Settings → Account and the member page at 1440 and 390 px.
- [ ] **Step 7: Commit.** Message "S1.5 Task 13: honest notice toasts, blocked codes, closure attribution and cancel through the function, staff leave notice".

### Task 14: Demo parity for the kept areas

Closes **R-W8-3** (ANA-08), **R-W8-4** (ANA-09), **R-W8-5** (TEAM-19), **R-W8-6** (MAIL-18), and the closure bullets of **R-W8-2** (BIZ-10): the mock closure sets `inactive`, remembers the previous status and restores it; Complete deletes the business; the seed request points at an existing business.

**Files:**
- Modify:
  - `src/services/analytics.ts`;
  - `src/services/mock/{mockCatalogService,mockTeam,mockAccount,seed,teamSeed}.ts`;
  - `src/features/applications/labels.tsx` (`EMAIL_KIND_LABEL`);
  - `src/services/mock/service.test.ts`, `team.test.ts` and `mockAccount.test.ts`.

**Interfaces:**
- Consumes: the rules from Tasks 3, 7, 9, 10 and 13, for the mock to mirror.

- [ ] **Step 1: Write the failing tests:**
  - "summarize skips rows whose day isn't in the series".
  - Mock `recordEvent`: "refuses an unpublished product, an inactive business, an AR event with no model (VALIDATION), and the 31st event in a minute (RATE_LIMITED)".
  - Mock team:
    - "checks real owner memberships";
    - "the 6th resend in an hour is rate_limited";
    - "self refusal";
    - "access history filtered as R-W6-4".
  - "EMAIL_KIND_LABEL has team_invitation 'Team invitation', security_code 'Security code', security_notice 'Security notice', closure_request 'Closure request', application_decision 'Application decision', business_notice 'Business notice', team_notice 'Team notice'".
  - "the mock leaves platform_security_policy_changed out of Security activity".
  - "the mock resend subject is 'New invitation code'".
  - Mock closure: "sets inactive and restores the previous status; Complete deletes the business; the seed request's business exists".
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/services`
- [ ] **Step 3: Implement the mock and label changes.**
- [ ] **Step 4: Run the tests and the gates.** Run the demo app with no env vars and check `/admin`, `/dashboard` and a catalog page.
- [ ] **Step 5: Commit.** Message "S1.5 Task 14: demo follows the real rules for analytics, team, labels and closure".

### Task 15: E2E journeys, docs, ADR and release runbook

Closes the §13.2 documentation and the §14 Playwright journeys for the kept scope. It also writes down TEAM-20 as it is (§12), and records the owner's slim.

**Files:**
- Modify (e2e, demo mode):
  - `tests/e2e/applications.spec.ts`: reject with and without the reason (toast, and the reason shown only when ticked);
  - `tests/e2e/business-crud.spec.ts`: the seeded closure badge and the hidden Activate; the "Preview catalog" label on a draft business;
  - `tests/e2e/public.spec.ts`: a draft-business preview banner from "Open product page";
  - `tests/e2e/team.spec.ts`: remove a deactivated member; role editor prerequisites, ticked and locked;
  - `tests/e2e/settings.spec.ts`: cancel a closure through the function path.
- Create: `System_arch/decisions/ADR-0033-business-logic-fixes.md`, covering permission prerequisites, audit snapshots and the dropped business FK, embed views, and deleted-product analytics. Add its row to `System_arch/decisions/README.md`.
- Modify (docs):
  - `System_arch/design/19-supabase.md` (storage delete policies, analytics, audit, access map), `23-*.md` (kinds, ranks, suppressed) and `24-*.md` (the review function);
  - `docs/SECURITY_REVIEW.md` (R-W1-1, R-W1-4, R-W1-5, and the §12 TEAM-20 sentence);
  - `docs/OPERATIONS_RUNBOOK.md` (below);
  - `docs/TEST_PLAN.md` (the §14 live checks for the kept scope);
  - `docs/PRD.md` (the R-28/R-30 analytics labels);
  - `docs/CLIENT_HANDOVER.md` (the TEAM-20 sentence and owner notices);
  - `docs/PRODUCTION_READINESS.md`, `System_arch/Task.md` and `System_arch/HANDOFF.md`;
  - `System_arch/tasks/P12-team-roles-and-addons.md` (the S1.5 line in the P13 section; the moved R-IDs added to the S2, S3 and S4 lines);
  - the spec's status line: "Slimmed by the owner on 2026-10-26; see the plan's 'Moved out of S1.5'".

**Interfaces:**
- Consumes: every earlier task.

- [ ] **Step 1: Write the e2e journeys** at 1440 (`--project=desktop`). Add a `*.mobile.spec.ts` case for the closure badge and the team Remove dialog at 390.
- [ ] **Step 2: Run them.**
  - `npx playwright test tests/e2e/applications.spec.ts tests/e2e/business-crud.spec.ts tests/e2e/public.spec.ts tests/e2e/team.spec.ts tests/e2e/settings.spec.ts --project=desktop`, then `--project=mobile`, then `npx playwright test tests/e2e/a11y-dashboard.spec.ts --project=desktop` and `npx playwright test --project=guard`.
  - Expected: all pass, and the pixel guard stays 14/14.
- [ ] **Step 3: Write the runbook section "S1.5 release"** in `docs/OPERATIONS_RUNBOOK.md`:
  1. The owner's go-ahead for `zggylkbgajamhriebdrg`.
  2. The **read-only pre-flight**, with the owner shown the results before anything is applied. Write the exact `select` statements into the runbook:
     - the role sets missing prerequisites, and what `private.permission_prerequisites()` will add (it widens access, §13.3);
     - the `platform_members` rows whose email differs from `auth.users`.
  3. Set `EMBED_VIEWS_SINCE` to the apply date.
  4. `supabase db push`. Never `config push`.
  5. `npm run db:types`.
  6. Deploy `review-application` and `notify-business-owner`, then `provision-owner`, `invite-member`, `manage-member`, `send-test-email`, `account-security`, `accept-member-invite`, `track-event` and `resend-webhook`. No new secrets.
  7. Subscribe the Resend webhook to `email.suppressed`.
  8. Release the frontend to the Preview, then to production only when the owner asks.
  9. Mixed-version notes (§13.1).
  10. Rollback with the script, including its analytics data-loss warning.
- [ ] **Step 4: Write the remaining docs listed above.** No personal names or Gmail addresses in client material.
- [ ] **Step 5: Run the full gates.** `npm run typecheck && npm run lint && npm test && npm run build` all pass.
- [ ] **Step 6: Tick and commit.** Tick S1.5 in the task file with a note, and update the phase row in `Task.md`. Commit with the message "S1.5 Task 15: e2e journeys, ADR-0033, runbook, security and client docs".

---

## Coverage (kept scope)

| Requirement | Findings | Task |
|---|---|---|
| R-W1-1 | TEAM-01 | 2 (gate); 4 and 11 use it |
| R-W1-2 | BIZ-01 | 3 |
| R-W1-3 | BIZ-02 = TEAM-07 | 3 |
| R-W1-4 | MAIL-09 | 1 |
| R-W1-5 | TEAM-17 | 1 |
| R-W1-6 | TEAM-18 | 1 |
| R-W1-7 | TEAM-09 | 2 |
| R-W1-8 | TEAM-11 | 2 |
| R-W2-1 | APP-01 = MAIL-01 | 4 |
| R-W3-3 | TEAM-02 = PROD-04, TEAM-03, BIZ-06 (storage part) | 5 |
| R-W3-6 (BIZ-02 derived-copy part) | BIZ-02 | 3 |
| R-W3-8 | PUB-06 = BIZ-11 | 6 |
| R-W4-1 | PUB-01 = PROD-01, L3 | 6 |
| R-W5-1 | ANA-01 = TEAM-10 | 8 |
| R-W5-2 | ANA-02 | 7 |
| R-W5-3 | ANA-04 | 7 |
| R-W5-4 | ANA-11 | 7 |
| R-W5-5 | ANA-10 | 8 |
| R-W5-6 | ANA-06 = BIZ-12 | 7 |
| R-W5-7 | ANA-07 | 7 |
| R-W5-8 | ANA-12 | 8 |
| R-W6-1 | TEAM-04 | 9 |
| R-W6-2 | TEAM-05 = MAIL-03 | 9 |
| R-W6-3 | TEAM-08 = MAIL-10 | 13 |
| R-W6-4 | TEAM-06 | 10 |
| R-W6-5 | TEAM-14 = MAIL-17 | 10 |
| R-W6-6 | TEAM-15 | 10 |
| R-W6-7 | TEAM-16 | 9 |
| R-W6-8 | TEAM-12 | 9 |
| R-W6-9 | TEAM-13 | 10 |
| R-W7-1 | MAIL-08 | 11 |
| R-W7-2 | MAIL-11 | 11 (owner-read policy created in 8) |
| R-W7-3 | MAIL-02 (part 1) | 12 |
| R-W7-4 | MAIL-12 | 12 |
| R-W7-5 | MAIL-13 | 12 |
| R-W7-6 | MAIL-04 | 13 |
| R-W7-7 | MAIL-05 | 13 |
| R-W7-8 | MAIL-07 | 11 |
| R-W7-9 | MAIL-16 | 13 |
| R-W8-2 (closure bullets) | BIZ-10 (part) | 14 |
| R-W8-3 | ANA-08 | 14 |
| R-W8-4 | ANA-09 | 14 |
| R-W8-5 | TEAM-19 | 14 |
| R-W8-6 | MAIL-18 | 14 |
| §12 documented as is | TEAM-20 | 15 |
| §13.2 docs, §14 e2e | — | 15 |

Kept: 42 whole requirements plus 2 partial ones (R-W3-6, R-W8-2). Still deferred as in the spec §1.3: PROD-13, ANA-05, TEAM-20 (documented, Task 15), and the PUB-09/PUB-04 parts.

## Moved out of S1.5 (owner decision, 2026-10-26; no tasks here)

| R-ID | Findings | Target |
|---|---|---|
| R-W1-9 | APP-10 (accept-invite with a session) | S3 |
| R-W2-2 | APP-03 = BIZ-07, L1 (reopen a deleted-business application; business delete dialog line) | S3 |
| R-W2-3 | APP-02 (acceptance on any sign-in) | S3 |
| R-W2-4 | APP-05 = MAIL-06, MAIL-15 (invitation limit and reservations) | S3 |
| R-W2-5 | APP-06 = L5, L2 (owner-state column) | S3 |
| R-W2-6 | APP-07 (approval result by permission) | S3 |
| R-W2-7 | APP-08 (concurrent provisioning, orphan login) | S3 |
| R-W2-8 | APP-12 (PRD X-01) | S3 |
| R-W8-1 | APP-13 (demo provisionOwner) | S3 |
| R-W3-1 | BIZ-04 (business slug history and redirect) | S2 |
| R-W3-2 | PUB-03 = PROD-06 (product slug history and redirect) | S2 (its published-slug confirmation: S4) |
| R-W3-4 | BIZ-06 (logo move, partial sweep reporting) | S2 |
| R-W3-5 | BIZ-05 (read-only BusinessForm) | S2 |
| R-W3-6 (BIZ-08 part) | BIZ-08 (owner's own-closure notice wording) | S2 |
| R-W3-7 | BIZ-09 (field limits) | S2 |
| R-W8-2 (non-closure bullets) | BIZ-10 (delete clears owners and application link; signed-out visibility) | S2 |
| R-W4-8 | PUB-04 (the built part: not-found replaces a stale page) | S2 |
| R-W4-9 | PUB-05 | S2 |
| R-W4-10 | PUB-07 | S2 |
| R-W4-11 | PUB-08 | S2 |
| R-W4-12 | PUB-09 (noindex header) | S2 |
| R-W4-13 | PUB-10 | S2 |
| R-W4-2 | PROD-02 (stale save) | S4 |
| R-W4-3 | PROD-08 | S4 |
| R-W4-4 | PROD-07 | S4 |
| R-W4-5 | PROD-10 | S4 |
| R-W4-6 | PROD-11 | S4 |
| R-W4-7 | PROD-09 | S4 |
| R-W4-14 | PROD-05 (docs) | S4 |

Pre-flight items that belonged to moved work (slug reservation from `business_slug_changed`, and the `email_log.attempt` maxima) are left out of the Task 15 runbook.

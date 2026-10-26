# S4 3D model requests: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a business asks the platform team for a product's (or an option's) 3D model with 2 to 10 private photos; staff with the new `models.manage` permission make it elsewhere, stage the GLB/USDZ, and deliver or decline it with an email; a per-business switch decides whether the business may upload its own 3D files, and the database enforces every rule.

**Architecture:**
- **Database:** one new migration (`s4_model_requests`) with one marked section per SQL task: a new permission, three tables, a private bucket, a switch column with its guard, definer functions on top of the S1 2FA-gated helpers, and a redefined `save_product`. One rollback script, sections newest first.
- **Edge Functions:** one new function, `review-model-request` (start, deliver, decline; emails the owner on deliver and decline), on `_shared/gate.ts`. `account-security` sweeps the new bucket.
- **Client:** the service contract is fixed in wave 1, with each wave-2 task owning its own new service file (Supabase and mock) and its own UI files, so parallel worktrees rarely touch the same file. Demo mode follows every rule in the same task that builds it.

**Tech stack:** React 19, React Router 8, Tailwind 4, TypeScript 6, Vitest + Testing Library, PGlite (`@electric-sql/pglite`), Playwright, Supabase (supabase-js 2.117.3, Deno Edge Functions), Resend.

**Spec:** `docs/superpowers/specs/2026-10-26-s4-3d-model-requests-design.md` (R-S4-1 … R-S4-19). Read it before your task; `§` and `R-S4-n` references below point into it. **Its last section, "Owner decisions (2026-10-26)", overrides the body.** In particular there is **no limit on open requests**: check 5 of R-S4-6, the `model_request_limit` key, the "25 cap" in R-S4-19 and §10.4, and §1.3's "abuse is limited by the open-request cap" are all void. No task builds them. The other resolved conflicts are listed under "Spec decisions" at the end of this plan; they are binding.

## Global Constraints

- **Waves, branches and worktrees:**
  - **Wave 1** (Tasks 1 and 2) runs in parallel, each on a branch `s4/tN` cut from `feature/sanctus-brand-design-system`. **Wave 2** (Tasks 3 to 8) runs in parallel, each cut after both wave-1 branches are merged. **Final** (Task 9) is cut after every wave-2 branch is merged.
  - Merge back into `feature/sanctus-brand-design-system` with `git merge --no-ff s4/tN -m "Merge s4/tN (S4 Task N: <title>)"`. After each wave the controller runs the full gates on the merged branch and fixes merge fallout in a commit named `S4: merge fixes after wave N`.
  - Run `npm ci` in a fresh worktree if `node_modules` is missing. Set `E2E_PORT` to a free port before Playwright in a worktree.
  - Never push `main`. Never push at all unless the owner asks.
  - Never use `git stash`, `git reset --hard`, `git clean`, or `git checkout -- <file>` outside your worktree: the main tree holds the owner's uncommitted work. Use a temporary commit or a patch file.
  - Do not depend on code from a task that is not merged into your base. If your Interfaces block consumes something missing from your worktree, stop and report NEEDS_CONTEXT.
- **Commits:**
  - Commit with `git -c user.name=krishna -c user.email=krishnagtkr@gmail.com commit`, with **no co-author line**. Stage only your task's files.
  - Message `S4 Task N: <title>`. When a task changes an existing assertion, the body names the R-ID that changed it.
- **Nothing remote:** no task applies a migration, deploys a function, runs `supabase db push`, `supabase config push` or `npm run db:types`, or calls a hosted project. Release follows the runbook that Task 9 writes, with the owner's go-ahead.
- **One migration, filled by slot:**
  - Task 1 runs `npx supabase migration new s4_model_requests` (giving `supabase/migrations/<ts>_s4_model_requests.sql`), writes its own section, and writes an **empty slot** for each later SQL task (3, 4, 6, 7, 8), in that order, in exactly this format:
    ```sql
    -- =============================================================================
    -- S4 Task N: <title> (R-S4-n, ...)
    -- =============================================================================
    -- ---- end S4 Task N ----
    ```
  - A task writes **only between its own two markers** and never edits another section. Pre-made slots make the parallel merges ordinary three-way merges (S1.5's union driver interleaved sections). No other task creates a migration.
  - Wave-2 sections depend only on Task 1's section, never on each other.
- **One rollback script, by slot:** Task 1 creates `supabase/rollback/20261026_s4_model_requests_rollback.sql` with, directly below `begin;`, empty slots for Tasks 8, 7, 6, 4, 3 (newest first) and then its own section, then `commit;`. Rollback restores the earlier function bodies, policies and constraints, drops the new objects, keeps every audit and email row, and keeps delivered model rows (they are ordinary product rows).
- **PGlite tests:**
  - All new database tests go in `supabase/tests/s4ModelRequests.test.ts` on `supabase/tests/harness.ts`. Task 1 writes the shared fixtures at the top, its own `describe('S4 Task 1: …')`, the `describe('S4 rollback')`, and then comment slots `// ---- S4 Task N tests ----` / `// ---- end S4 Task N tests ----` for Tasks 3, 4, 6, 7, 8. Each task puts its whole `describe('S4 Task N: …')` inside its own slot.
  - Each describe uses `ids(N)` fixture ids and seeds its own rows through `seedS4` (Task 1), so describes don't depend on each other.
  - Each task calls `GONE_AFTER_ROLLBACK.push(...)` **at its describe's body level** (not in a test or hook), so the rollback describe sees every name at collection time. Never edit the array literal.
  - If an existing suite (`migrations`, `platformTeam`, `businessLogicFixes`, `accountSettings`) asserts behaviour this spec changes, update that one assertion or fixture in the same task. Never weaken or delete an unrelated assertion.
- **SQL rules:**
  - RLS on every new table; `revoke all … from public, anon, authenticated`, then explicit grants (§8.1).
  - Every new function is `security definer` with `set search_path = ''`, `revoke execute … from public, anon`, and the grants of §8.1. Private trigger functions are revoked from `public, anon, authenticated`.
  - Refusals `raise exception '<key>' using errcode = '<code>'` with the key and code of §8.3, so supabase-js gets the key as `error.message`.
  - A policy that reads `(storage.foldername(name))[n]` as a uuid compares it as text, or casts only after a `~ '^[0-9a-f-]{36}$'` check. A malformed name must be refused, never raise a cast error.
- **The 2FA gate:** the S1 helpers (`caller_mfa_satisfied`, `platform_can`, `is_platform_admin`, `is_business_member`) are the only access checks. Every staff function starts with `private.require_models_manage()` and every business function with `private.require_business_member(p_business)` (Task 1). Edge Functions use `gateCaller(rpc, { permission: 'models.manage' })`. Nothing is re-implemented.
- **Edge Functions:** `handler.ts` (pure, injected dependencies) plus `index.ts` (wiring); the caller comes from `getUser()`; the SQL runs **as the caller**; `verify_jwt = true`; no new secrets; no secret, token or provider text in logs.
- **Client:**
  - Components get data only through `src/services` (`service`, hooks). Never import `services/mock/*` or `services/supabase/*` into UI code.
  - URLs only in `src/lib/urls.ts`.
  - A service change lands in the Supabase implementation **and** the mock in the same task. New RPCs, tables and columns are added by hand to `src/services/supabase/database.types.ts` (Task 2 adds all of them; it is regenerated at release).
  - Model-request calls map errors with `mapModelRequestError` (Task 2), which knows S4's `invalid_transition` and `reason_required` copy. These two keys are **not** added to the shared `mapDbError` maps, where they already mean application review.
  - Shared files edited by two wave-2 tasks (only `supabaseCatalogService.ts` and `mockCatalogService.ts`, in different functions; see "File ownership") get minimal, local edits: no reordering, reformatting or renaming.
- **Demo mode:** works with no env vars; never falls back to demo data after a Supabase error; no `VITE_*` secret. Request photos, staged and delivered demo models are session-only and labelled (R-S4-19); seeded requests use labelled sample photos; deliver and decline toasts say "Demo: no email was sent."
- **Copy:** dashboards English only, with the exact strings of §8.3 and §9.1. Emails EN and PT with the exact strings of §9.2. Server errors map to fixed copy; never show raw provider text. Strings this plan adds where the spec is silent are quoted in the owning task and are binding.
- **AR and models:** AR stays native only (ADR-0021). No GLB→USDZ conversion, no AI 3D. AR scale is marked verified only where the editor already does it. The staff upload reuses `ModelSection` and `validateModelFile`; the request panel is one component in the shared `ProductEditor`.
- **Owner's files:** never edit or stage `src/features/marketing/LandingPage.tsx`, `.claude/`, `skills-lock.json`, `AR-attachment/` or `design/stitch/`.
- **Quality bar:** no dead buttons (hidden, not disabled without a stated reason); every data view has loading, empty and error states and its component test covers all three; no new dependency; design tokens from `src/index.css`.
- **Per-task gates (parallel waves, low-memory machine):** run only the focused tests for the files you change plus your `-t "S4 Task N"` describe and any existing suite whose assertion you change; then `npm run typecheck` and `npm run lint` (0 errors) once at the end, plus the Edge Function type check if you touched functions. The controller runs `npm test`, `npm run build` and Playwright after merging each wave. A touched route is checked at 1440 and 390 px in the demo dev server.
- **Test commands:**
  - PGlite: `npx vitest run supabase/tests/s4ModelRequests.test.ts -t "S4 Task N"`
  - all DB suites: `npx vitest run supabase/tests`
  - a handler: `npx vitest run supabase/functions/<fn>`
  - unit or component: `npx vitest run <path>`
  - e2e (demo, dev server on `E2E_PORT` or 5199): `npx playwright test <spec> --project=desktop` (and `--project=mobile` for `*.mobile.spec.ts`); pixel guard `npx playwright test --project=guard`.

## File ownership

| Task | Wave | Owns (creates or is the only wave-2 editor of) |
|---|---|---|
| 1 | 1 | migration (scaffold + section 1), rollback (scaffold + section 1), `supabase/tests/s4ModelRequests.test.ts` (scaffold + describe 1), `harness.ts`, `src/domain/permissions.ts`, `src/features/team/permissions.ts`, `supabase/functions/_shared/team.ts`, `src/services/mock/mockTeam.ts`, the permission-count assertions in existing tests |
| 2 | 1 | `src/domain/modelRequests.ts`, `src/services/catalogService.ts`, `src/services/modelRequestRules.ts`, `database.types.ts`, the three `supabase/modelRequests*.ts` and three `mock/mockModelRequests*.ts` files (creates; 4 and 6 then own theirs), `mock/db.ts`, `mock/seed.ts`, `src/lib/urls.ts`, `src/lib/files.ts`, `src/app/router.tsx`, `src/features/applications/labels.tsx`, `src/features/modelRequests/*` (shared bits), the three placeholders |
| 3 | 2 | migration section 3; `ProductEditorForm.tsx`, `VariantsEditor.tsx`, new `ModelFilesReadOnly.tsx`, `useProductActions.tsx`; in `supabaseCatalogService.ts`: `toSaveProductArgs`, `duplicateProduct`; in `mockCatalogService.ts`: product save, `duplicateProduct`, `uploadAsset` |
| 4 | 2 | section 4; `ModelRequestPanel.tsx`; `supabase/modelRequestsBusiness.ts`, `mock/mockModelRequestsBusiness.ts`; `src/lib/image.ts` (`imageSize`) |
| 5 | 2 | `ProductTable.tsx`, `ProductFilters.tsx`, `MyProductsPage.tsx`, `ModelRequestsPage.tsx`, new `BusinessModelsCard.tsx`, `BusinessDetailPage.tsx`, `nav.ts`, `DashboardShell.tsx`, `dashboardContext.ts`, new `src/features/modelRequests/badge.ts` |
| 6 | 2 | section 6; `ModelRequestDetailPage.tsx`, new `PhotoViewer.tsx`, new `DeliverDialog.tsx`/`DeclineDialog.tsx`, `ModelSection.tsx`, `src/lib/download.ts`; `supabase/modelRequestsStaff.ts`, `mock/mockModelRequestsStaff.ts` |
| 7 | 2 | section 7; `supabase/functions/review-model-request/*`, `_shared/email.ts`, `_shared/email-templates.ts` (+ test), new `_shared/owner.ts`, `notify-business-owner/index.ts` (import only), `supabase/config.toml` |
| 8 | 2 | section 8; `account-security/{handler,index,handler.test}.ts`; in `supabaseCatalogService.ts`: `deleteProduct`, `deleteBusiness`, `updateProduct`; in `mockCatalogService.ts`: `deleteProduct`, `deleteBusiness`, option removal |
| 9 | final | `tests/e2e/model-requests*.spec.ts`, `a11y-dashboard.spec.ts`, ADR-0034, docs, runbook |

## Review Focus

1. **An owner whose switch is off duplicates a product that has a delivered model.** The copy would insert model rows, which the guard refuses, so today's "Duplicate" would fail outright. Expected: the copy is created photo-only (no 3D rows on it or its options), the original keeps its model, and the toast says so. (Task 3 tests: "duplicateProduct for a switch-off business copies no 3D rows and the original keeps its GLB" (service, both modes) and "the duplicate toast says the copy has no 3D files".)
2. **A deliver or decline is retried after the status already changed** (a lost response, a double click, a second tab). Expected: the retry answers success with the current status and the business gets exactly one email, even when the first call died between the SQL and the email. (Task 7 test: "deliver retried after the request is already delivered: 200 ok, status delivered, one email_log row for the workflow".)
3. **The business deletes an option that has requests.** The rows cascade away, but their photos would stay in the private bucket for ever. Expected: the photos of requests whose option was removed are deleted from storage after the save, like a product delete. (Task 8 test: "updateProduct that removes an option deletes that option's request photos after the save succeeds".)
4. **Staff upload a GLB, but the request is gone or final before staging** (the product was deleted, or another staff member declined it). Expected: the mapped "This request doesn't exist or was removed with its product." / "This request has changed. Reload to see its current status." message, and the just-uploaded object is removed from `product-media`, not left as an orphan. (Task 6 test: "stageModelFile removes the uploaded object when admin_stage_model_file fails".)
5. **Staff turn the switch off while the owner has the editor open with a newly uploaded GLB.** Expected: the save is refused with the `own_models_not_allowed` copy, nothing is written, the form keeps the owner's other edits, and the uploaded file is not attached anywhere. (Task 3 test: "a save refused with own_models_not_allowed shows the copy and keeps the form values".)

---

### Task 1: Foundation database: migration scaffold, `models.manage`, the switch and its row guard, tables, bucket

Wave 1 (parallel with Task 2). Closes **R-S4-1**, the database parts of **R-S4-2**, the row guard of **R-S4-3** (`can_write_own_models`, `guard_own_models`), **R-S4-5** (bucket and policies), and the §8.1 tables and columns.

**Files:**
- Create: `supabase/migrations/<ts>_s4_model_requests.sql` (header cites the spec and the slot convention), `supabase/rollback/20261026_s4_model_requests_rollback.sql`, `supabase/tests/s4ModelRequests.test.ts`.
- Modify:
  - `supabase/tests/harness.ts`: `S4_MIGRATION`, `S4_ROLLBACK_SQL`;
  - `src/domain/permissions.ts` (+ `permissions.test.ts`), `src/domain/types.ts` (the `Permission` union line only), `src/features/team/permissions.ts` (+ test), `src/features/team/RolePermissionsPage.test.tsx` (the "Includes:" count), `supabase/functions/_shared/team.ts` (+ `team.test.ts`);
  - `src/services/mock/mockTeam.ts`: a stored demo Admin set that predates S4 gains `models.manage` once on load (mirrors the SQL backfill);
  - existing suites, only as R-S4-1/R-S4-3 require: `businessLogicFixes.test.ts` (Owner length 15 → 16), `platformTeam.test.ts` (the `ALL` list gains `models.manage`), `migrations.test.ts` (fixture businesses whose owners write model rows get `allow_own_models = true`).

**Interfaces:**
- Produces (harness): `S4_MIGRATION: string` (file name ending `_s4_model_requests.sql`), `S4_ROLLBACK_SQL: string`.
- Produces (test file, top level):
  ```ts
  export const GONE_AFTER_ROLLBACK: string[]
  /** Seeds, as the database owner: business A (switch off) with owner, business B (switch on) with owner, the Owner,
   *  an Admin, Team with {models.manage + prerequisites}, Team with defaults; product P (dims > 0, draft) and its option V
   *  in A, product Q (depth 0) in A, product R in B. Returns their ids from ids(task). */
  async function seedS4(db: PGlite, task: number): Promise<S4Fixture>
  async function putObject(db: PGlite, bucket: string, name: string): Promise<void>   // storage.objects row
  async function insertRequest(db: PGlite, r: { id: string; business: string; product: string; variant?: string; status: ModelRequestStatus; photos?: string[] }): Promise<void>
  /** Asserts `sql` (run with `params`) raises forbidden for Team-without-key and aal2_required for Admin at aal1 with the staff policy on. */
  async function expectStaffGate(h: Helpers, f: S4Fixture, sql: string, params: unknown[]): Promise<void>
  ```
- Produces (SQL, all in section 1):
  - permission key `models.manage` in the check constraint, `private.permission_prerequisites()` (`models.manage` → `products.view`, `businesses.view`), `my_platform_access()` (16 keys, from S1.5 Task 9's body), `admin_set_role_permissions` (`v_known` 16, from S1.5 Task 5's body), the Admin backfill;
  - `private.require_models_manage()` (raises `aal2_required` 42501 when `not caller_mfa_satisfied()`, then `forbidden` 42501 when `not platform_can('models.manage')`) and `private.require_business_member(p_business uuid)` (same order with `is_business_member`);
  - `businesses.allow_own_models`, `products.models_changed_at`, `private.guard_own_models_flag` (trigger), `admin_set_own_models(p_business uuid, p_allow boolean) → jsonb {allow_own_models, changed}`;
  - `public.can_write_own_models(p_business uuid) → boolean`, `private.guard_own_models` on `product_models` and `product_variant_models`;
  - tables `model_requests`, `model_request_photos`, `model_request_files` exactly as §8.1;
  - bucket `model-request-photos` and its insert/select/delete policies (R-S4-5);
  - audit: policy "Model staff read request events" (`event_type in` the five `model_request_*` types `and platform_can('models.manage')`); "Business owners read platform changes to their business" recreated from S1.5 Task 8's list plus `model_request_delivered`, `model_request_rejected`, `business_own_models_changed`.
- Produces (TS): `ALL_PERMISSIONS` with `'models.manage'` placed right after `'products.delete'` (same position in `_shared/team.ts` `PERMISSIONS` and in SQL `v_known`); `PERMISSION_PREREQUISITES['models.manage'] = ['businesses.view', 'products.view']`; label "Handle 3D model requests" with the §9.1 hint as its description, in the "Products & catalogues" group, mirrored in `PERMISSION_LABELS`.
- Produces (`src/domain/types.ts`, the identical one-line edit Task 2 also makes):
  ```ts
    | 'products.view' | 'products.edit' | 'products.publish' | 'products.delete' | 'models.manage'
  ```

- [ ] **Step 1: Write the failing PGlite tests** (`describe('S4 Task 1: permission, switch, tables, bucket')`):
  - "the S4 migration applies after every earlier migration".
  - "the Owner's my_platform_access().permissions has length 16 after Admin and Team sets are both {}".
  - "the backfill adds models.manage to a stored Admin set and writes one access_permissions_changed row {role:'admin', added:['models.manage'], removed:[], reason:'model_requests_backfill'}; Team's set is unchanged" (seed a fresh DB at `n < S4_MIGRATION`, then apply S4).
  - "admin_set_role_permissions accepts models.manage and returns added [businesses.view, products.view] for Team = {models.manage}".
  - "an owner PATCHing allow_own_models → 42501; an Admin PATCHing it → own_models_admin_only; admin_set_own_models as Team-with-key → changed and one business_own_models_changed {from:false,to:true}; same value again → changed false and no audit row"; `expectStaffGate` on `admin_set_own_models`.
  - "backfill: a business with only a variant GLB gets true; a business with photos only gets false".
  - "switch off, owner: a direct insert into product_models → own_models_not_allowed; switch on → allowed; Admin with products.edit and switch off → allowed; deleting a product or an option with a GLB → allowed (cascade)".
  - "model_requests rows: owner reads own business only; other business owner, Team without the key and anon read 0; Team with the key reads all; no role can insert, update or delete through the API"; the same for `model_request_photos`; `model_request_files` readable only with the key.
  - "the partial unique index refuses a second open row for the same target (23505) and allows one with another option or after the first is cancelled" (PGlite is single-connection, so the parallel case of §11 is pinned by the index itself).
  - "model-request-photos: anon can't read; another business's member can't read or insert; Team with only products.view can't read; Team with the key can; a member can insert `{own}/{uuid}/{uuid}.jpg` but not under the id of an existing request, nor with a non-uuid second folder; a member can delete while the request is cancelled or absent, not while requested".
  - "the migration refuses when model-request-photos exists and is public" (seed the bucket public at `n < S4_MIGRATION`).
  - "a business owner reads model_request_delivered, model_request_rejected and business_own_models_changed of their business only; Team with the key reads model_request_* events, Team without it doesn't".
  - "anon can't execute any function this migration creates" (loop over the new names).
  - Rollback (`describe('S4 rollback')`): "apply → rollback → re-apply succeeds; every GONE_AFTER_ROLLBACK name is gone after rollback; the policies, `my_platform_access`, `admin_set_role_permissions`, `permission_prerequisites` and `save_product` definitions equal a fresh DB at `n < S4_MIGRATION`"; "rollback raises `model_request_photos_not_empty` while the bucket has objects".
- [ ] **Step 2: Update the TS tests:** `permissions.test.ts` and `team/permissions.test.ts` expect 16 keys; `RolePermissionsPage.test.tsx` expects 10 "Includes:" lines and "Includes: View businesses, View products and catalogues" under "Handle 3D model requests"; `_shared/team.test.ts` keeps the labels equal.
- [ ] **Step 3: Run them and confirm they fail.** `npx vitest run supabase/tests/s4ModelRequests.test.ts src/domain src/features/team supabase/functions/_shared`. Expected: FAIL (migration file missing; 15 keys).
- [ ] **Step 4: Create the migration, section 1 and the slots.** Notes the body and tests don't fix:
  - The Admin backfill and the switch backfill run in one `do` block each. The pre-flight `select`s for both (businesses that get `true`/`false`; stored Admin and Team sets; bucket absence) go in a `-- PRE-FLIGHT (S4) BEGIN … END` comment, as S1.5 did, for Task 9's runbook.
  - `guard_own_models_flag` applies when `current_user in ('anon','authenticated')` and `coalesce(current_setting('app.own_models', true), '') <> 'on'`; `admin_set_own_models` sets `app.own_models` with `set_config(…, true)`.
  - `can_write_own_models` returns true for `coalesce(current_setting('app.model_delivery', true), '') = 'on'` (set only by Task 6's deliver).
  - `guard_own_models` passes a `DELETE` when `pg_trigger_depth() > 1` (FK cascade).
  - Audit rows of this feature carry `business_id` and `metadata {request_id, product_id, variant_id}` (Tasks 4 and 6 follow this).
  - Rollback section 1: remove `models.manage` from role sets with an `access_permissions_changed {reason:'model_requests_rollback'}` row, then restore the S1.5 bodies; refuse when the bucket has objects; delete the bucket only when empty; drop the rest.
- [ ] **Step 5: Write the TS permission changes and the mock Admin upgrade;** update the three existing suites' assertions or fixtures (commit body names R-S4-1 / R-S4-3).
- [ ] **Step 6: Run the tests again,** then `npx vitest run supabase/tests` (every DB suite passes), then typecheck and lint.
- [ ] **Step 7: Commit.** "S4 Task 1: models.manage, the own-upload switch and its guard, request tables and the private photo bucket".

### Task 2: Client contract, demo store, routes and shared UI bits

Wave 1 (parallel with Task 1). Closes the service-interface part of §8.6, the read side of **R-S4-2** (`Business.allowOwnModels`, `setBusinessOwnModels`), `REQUEST_PHOTO_RULES` of **R-S4-5**, the URL helpers of R-S4-9/R-S4-10, the error copy of §8.3, the audit labels of §9.1, and the seed bullets of **R-S4-19**.

**Files:**
- Create:
  - `src/domain/modelRequests.ts`;
  - `src/services/modelRequestRules.ts` (+ test);
  - `src/services/supabase/modelRequestsRead.ts` (+ test), `modelRequestsBusiness.ts`, `modelRequestsStaff.ts` (the last two as stubs);
  - `src/services/mock/mockModelRequestsRead.ts` (+ test), `mockModelRequestsBusiness.ts`, `mockModelRequestsStaff.ts` (stubs), `mockModelRequestShared.ts`;
  - `src/features/modelRequests/{ModelRequestStatusBadge.tsx, copy.ts, hooks.ts}`;
  - placeholders: `src/features/products/editor/ModelRequestPanel.tsx`, `src/features/admin/ModelRequestsPage.tsx`, `src/features/admin/ModelRequestDetailPage.tsx`.
- Modify:
  - `src/domain/types.ts`: `Business.allowOwnModels: boolean`, `Product.modelsChangedAt?: ISODate`, and the `Permission` line (identical to Task 1);
  - `src/services/catalogService.ts`: the methods below, `ProductInput.keepModels?: boolean`;
  - `src/services/supabase/supabaseCatalogService.ts`: business and product row mapping, the S4-unique keys in `mapDbError`, spreading the three factories; `database.types.ts`;
  - `src/services/mock/{db.ts, seed.ts, mockCatalogService.ts}` (Db shape, seed, `resetDemoData`, spreading the factories);
  - `src/lib/urls.ts` (+ `urls.test.ts`), `src/lib/files.ts` (+ test);
  - `src/app/router.tsx`: `model-requests` and `model-requests/:requestId` under `/admin`, both `RequirePermission need="models.manage"`;
  - `src/features/applications/labels.tsx`, and the three `eventLabel` callers (`AuditLogPage.tsx`, `AuditTimeline.tsx`, `PlatformChangesCard.tsx`) to pass `e.metadata`.

**Interfaces:**
- Produces (`src/domain/modelRequests.ts`):
  ```ts
  export type ModelRequestStatus = 'requested' | 'in_progress' | 'delivered' | 'rejected' | 'cancelled'
  export const OPEN_REQUEST_STATUSES: readonly ModelRequestStatus[]          // ['requested', 'in_progress']
  export const REQUEST_PHOTOS_MIN = 2, REQUEST_PHOTOS_MAX = 10, REQUEST_TEXT_MAX = 1000
  export interface ModelRequest {
    id: ID; businessId: ID; productId: ID; variantId?: ID; status: ModelRequestStatus
    note?: string; reason?: string; requestedBy?: ID; handledBy?: ID
    createdAt: ISODate; updatedAt: ISODate; startedAt?: ISODate; deliveredAt?: ISODate; closedAt?: ISODate
    photoCount: number; productName: LocalizedText; businessName: string; variantName?: LocalizedText; productPhotoUrl?: string
  }
  export interface ModelRequestPhoto { storagePath: string; fileName: string; sizeBytes: number; url?: string; sessionOnly?: boolean; sample?: boolean }
  export interface ModelRequestDetail extends ModelRequest {
    photos: ModelRequestPhoto[]
    staged: Partial<Record<ModelFormat, ModelAsset>>        // {} for a business owner
    product: Pick<Product, 'id' | 'businessId' | 'name' | 'dimensions' | 'material' | 'category' | 'models' | 'status' | 'images' | 'variants'>
    requestedByLabel?: string
    history: { type: string; at: ISODate; actorLabel?: string }[]
  }
  export interface ProductRequestState { open?: 'requested' | 'in_progress'; latestClosed?: 'delivered' | 'rejected' | 'cancelled' }
  export type RequestEmailStatus = 'accepted' | 'failed' | 'blocked' | 'skipped' | 'demo'
  export interface ModelRequestOutcome { status: ModelRequestStatus; email?: { status: RequestEmailStatus; error?: string }; cleanup?: 'partial' }
  export interface ModelRequestQuery { productId?: ID; businessId?: ID; status?: ModelRequestStatus[]; page?: number; pageSize?: number }
  ```
- Produces (`CatalogService`; the owning task implements each in its own files):
  ```ts
  getModelRequests(query?: ModelRequestQuery): Promise<Result<Page<ModelRequest>>>                       // Task 2
  getProductRequestStates(businessId: ID): Promise<Result<Record<ID, ProductRequestState>>>              // Task 2
  setBusinessOwnModels(businessId: ID, allow: boolean): Promise<Result<Business>>                         // Task 2
  requestModel(input: { businessId: ID; productId: ID; variantId?: ID; note?: string; photos: File[] },
               onProgress?: (index: number, state: 'uploading' | 'done') => void): Promise<Result<ModelRequest>>  // Task 4
  cancelModelRequest(id: ID): Promise<Result<ModelRequestOutcome>>                                        // Task 4
  getModelRequest(id: ID): Promise<Result<ModelRequestDetail>>                                            // Task 6
  startModelRequest(id: ID): Promise<Result<ModelRequestOutcome>>                                         // Task 6
  stageModelFile(id: ID, format: ModelFormat, asset: ModelAsset): Promise<Result<void>>                   // Task 6
  unstageModelFile(id: ID, format: ModelFormat): Promise<Result<void>>                                    // Task 6
  deliverModelRequest(id: ID): Promise<Result<ModelRequestOutcome>>                                       // Task 6
  rejectModelRequest(id: ID, reason: string): Promise<Result<ModelRequestOutcome>>                        // Task 6
  ```
  The stubs in the Business and Staff files return `fail('UNSUPPORTED', 'Not available yet.')`.
- Produces (factories, wired once here): `createSupabaseModelRequests{Read,Business,Staff}(sb: SupabaseClient, notify: () => void)` and `createMockModelRequests{Read,Business,Staff}(deps: MockModelRequestDeps)`, where
  ```ts
  /** mockCatalogService's existing module-private `run` and `audit`, passed in the way createMockTeam(run) gets `run`. */
  export interface MockModelRequestDeps { run: <T>(fn: () => Result<T>) => Promise<Result<T>>; audit: typeof audit }
  export type MockActor = { kind: 'staff'; can: (p: Permission) => boolean } | { kind: 'owner'; businessId: ID } | { kind: 'none' }
  export function mockActor(): MockActor                        // mockModelRequestShared.ts, from demoPlatformRole(), the mock team sets and the demo account
  export const sessionRequestMedia: { photos: Map<ID, string[]>; staged: Map<ID, Partial<Record<ModelFormat, ModelAsset>>> }
  ```
- Produces (errors, `modelRequestRules.ts`):
  ```ts
  export const MODEL_REQUEST_ERRORS: Record<string, ServiceError>   // every §8.3 key except model_request_limit, plus model_request_note_too_long
                                                                     // ("Keep the note to 1000 characters.") and model_request_file_invalid
                                                                     // ("Upload the file again. It didn't reach storage."); reason = key
  export function modelRequestError(key: string, ctx?: { option?: boolean }): ServiceError | undefined
  ```
  Codes: `own_models_not_allowed`, `own_models_admin_only`, `forbidden` → PERMISSION; `model_request_open`, `models_changed_elsewhere`, `invalid_transition`, `model_request_not_cancellable` → CONFLICT; `model_request_not_found` → NOT_FOUND; the rest → VALIDATION; `aal2_required` → the existing mapping. `model_request_open` with `{option:true}` reads "This option already has an open 3D model request."
- Produces (Supabase): `export function mapModelRequestError<T>(e: DbError, ctx?: { option?: boolean }): Result<T>` in `modelRequestsRead.ts` (the S4 map first, then `mapDbError`). `mapDbError` itself gains only `own_models_not_allowed`, `own_models_admin_only`, `models_changed_elsewhere` and the `model_request_*` keys.
- Produces (`files.ts`): `REQUEST_PHOTO_RULES = { accept: ['image/jpeg','image/png','image/webp'], extensions: ['.jpg','.jpeg','.png','.webp'], maxBytes: 10 * MB, minLongSide: 1000 }`.
- Produces (`urls.ts`): `modelRequestsAdminPath(filter?: { status?: 'open' | 'delivered' | 'rejected' | 'cancelled' | 'all'; businessId?: string }): string` → `/admin/model-requests?status=…&business=…`; `modelRequestAdminPath(id: string): string` → `/admin/model-requests/{id}`; `myProductsPath` filter gains `model?: 'open'` → `?model=open`.
- Produces (UI): `ModelRequestStatusBadge({ status })` with labels Requested, In progress, Delivered, Declined, Cancelled; `copy.ts` with the §9.1 status lines as functions (`statusLine(r, optionName?)`); hooks `useModelRequests(query)`, `useProductRequestStates(businessId)`; `eventLabel(type: string, metadata?: Record<string, unknown>)` with the §9.1 audit labels (`business_own_models_changed` → "Own 3D uploads allowed" when `metadata.to === true`, else "Own 3D uploads turned off"); `EMAIL_KIND_LABEL.model_request_update = '3D model update'`.
- Produces (placeholders; the owning task replaces the body, never the export):
  ```ts
  export interface ModelRequestPanelProps { product: Product | undefined; onSaveDraft: () => void; onReload: () => void }
  export function ModelRequestPanel(props: ModelRequestPanelProps): JSX.Element | null      // Task 4
  export default function ModelRequestsPage(): JSX.Element                                    // Task 5
  export default function ModelRequestDetailPage(): JSX.Element                               // Task 6
  ```
  Each placeholder renders `<EmptyState title="Not built yet" />` and carries the comment `// S4 placeholder` (Task 9 checks none is left).
- Produces (seed): `biz_casa` switch **off**, `biz_nord` switch **on**, the other businesses off. `biz_casa` has one request in each of `requested`, `in_progress` (photos-only products), `delivered` (on a product with a GLB) and `rejected` (photos-only, reason "The photos are too dark. Please send new ones taken in daylight."), with sample photos labelled `sample: true`. `export const DEMO_REQUEST_TARGET_SLUG` names a published, photos-only `biz_casa` product with dimensions and no request (the e2e target).

- [ ] **Step 1: Write the failing tests:**
  - `modelRequestRules.test.ts`: "every §8.3 key except model_request_limit maps to its exact copy and code"; "model_request_open with option reads 'This option already has…'".
  - `urls.test.ts`: "modelRequestsAdminPath({status:'open', businessId:'b1'}) = '/admin/model-requests?status=open&business=b1'"; "modelRequestAdminPath('r1') = '/admin/model-requests/r1'"; "myProductsPath({model:'open'}) = '/dashboard/products?model=open'".
  - `files` test: "a 10 MB + 1 byte JPEG is refused with the size message; a .gif with the type message; a .heic is refused".
  - `modelRequestsRead.test.ts` (fake client): "getModelRequests orders Open oldest first and other tabs newest first, pages by 50, and maps the embedded product, business and option names"; "mapModelRequestError maps invalid_transition to the S4 copy while mapDbError keeps the application copy"; "a select error is an error, never sample data".
  - `mockModelRequestsRead.test.ts`: "the seed has one request per status for biz_casa"; "a Team actor without models.manage reads no requests"; "an owner reads only their business's"; "setBusinessOwnModels needs models.manage and writes business_own_models_changed"; "resetDemoData restores the four requests and the two switch states".
  - `labels` test: "eventLabel('business_own_models_changed', {to:false}) = 'Own 3D uploads turned off'" and the five model_request labels.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/services src/lib src/features/applications`
- [ ] **Step 3: Implement** the domain file, contract, rules, mapping, both read factories, stubs, Db shape and seed, urls, files, labels, routes, shared UI bits and placeholders. Supabase reads use plain selects under RLS with embedded `products(name, product_images(storage_path, is_primary))`, `businesses(name)`, `product_variants(name)` and `model_request_photos(count)`.
- [ ] **Step 4: Run the tests again,** then typecheck and lint. Open `/admin/model-requests` in demo as the Owner (placeholder renders) and as Team (no-access view).
- [ ] **Step 5: Commit.** "S4 Task 2: model request service contract, demo store and seed, URL helpers, labels and routes".

### Task 3: Own-upload rules in save and storage, the editor's 3D section, stale-save guard

Wave 2. Closes the `save_product` and storage parts of **R-S4-3**, **R-S4-4**, **R-S4-17**, and its own demo bullets of R-S4-19 (switch refusal on save and `uploadAsset`, `models_changed_elsewhere`).

**Files:**
- Migration section 3; rollback section 3 (restore `save_product` from `20261020143507_variant_media.sql` and the two policies from `20261025163627_account_settings.sql`).
- Create: `src/features/products/editor/ModelFilesReadOnly.tsx`.
- Modify: `ProductEditorForm.tsx` (+ `ProductEditorForm.test.tsx`), `VariantsEditor.tsx`, `src/features/products/useProductActions.tsx` (+ test), `supabaseCatalogService.ts` (`toSaveProductArgs`, `duplicateProduct`; + `variantMedia.test.ts` or a new `ownModels.test.ts`), `mockCatalogService.ts` (save, `duplicateProduct`, `uploadAsset`; + `service.test.ts`).

**Interfaces:**
- Consumes: Task 1 `can_write_own_models`, `guard_own_models`, `products.models_changed_at`; Task 2 `ProductInput.keepModels`, `Product.modelsChangedAt`, `Business.allowOwnModels`, `ModelRequestPanel`, `useModelRequests`, `modelRequestAdminPath`, `mapDbError` keys.
- Produces (SQL): `save_product(p_product jsonb, p_images jsonb, p_models jsonb, p_variants jsonb) returns uuid`, same signature, still `security invoker`, grants restated. New `p_product` keys: `keep_models boolean`, `expected_models_changed_at timestamptz`. Raises `models_changed_elsewhere` (P0001).
- Produces (service): `toSaveProductArgs` sends `keep_models: input.keepModels === true` and `expected_models_changed_at: input.modelsChangedAt ?? null`; `duplicateProduct` copies no 3D rows when `rpc('can_write_own_models', { p_business })` is false (mock: the same rule).
- Produces (UI): `ModelFilesReadOnly({ models: ProductModels; label: string })` — the "Current 3D files, managed by the Sanctus team" list with the readiness lines.

- [ ] **Step 1: Write the failing PGlite tests** (`describe('S4 Task 3: save and storage with the switch')`):
  - "switch off, owner: save_product with an extra glb row → own_models_not_allowed and nothing is written; with the stored models unchanged → saved; with keep_models and a changed name → saved and model rows untouched; deleting an option that has a GLB → allowed".
  - "switch on, owner, and Admin with products.edit and the switch off: a changed model set is saved and models_changed_at is set".
  - "unchanged models leave models_changed_at as it was" and "an old client that resends unchanged models (no keep_models, no expected_models_changed_at) saves fine".
  - "expected_models_changed_at older than the stored value and a changed model set → models_changed_elsewhere, nothing written; with keep_models or unchanged models → saved".
  - "storage, switch off: an owner insert of `{business}/{uuid}.glb` and `.usdz` is refused, `.png` allowed; switch on: all allowed; a name whose first folder isn't a uuid is refused without an error".
  - `GONE_AFTER_ROLLBACK` adds nothing (redefinitions only); the rollback describe's `save_product` comparison covers this section.
- [ ] **Step 2: Write the failing service and component tests:**
  - service, both modes: "toSaveProductArgs sends keep_models and expected_models_changed_at"; "mock: an owner of a switch-off business saving a changed model set → own_models_not_allowed; uploadAsset glb/usdz → own_models_not_allowed; png → ok"; "mock: models_changed_elsewhere when the stored modelsChangedAt is newer"; Review Focus 1 "duplicateProduct for a switch-off business copies no 3D rows and the original keeps its GLB".
  - `useProductActions`: "the duplicate toast says '“{name}” was created as a draft, without its 3D files. Request a 3D model for it.' when the source had a model and the copy has none".
  - `ProductEditorForm.test.tsx`:
    - "owner + switch off: no file input with accept .glb or .usdz anywhere (product and options), 'Current 3D files, managed by the Sanctus team' over existing files, '3D models for your products are made by the Sanctus team. Request one below.' with none, and the request panel";
    - "owner + switch on: a Segmented control with 'Request from Sanctus (recommended)' first and 'Upload your own' second; the request choice shows the panel, the upload choice shows ModelSection";
    - "Admin: ModelSection whatever the switch says, plus 'Open 3D request: {status}' linking to modelRequestAdminPath(id) with models.manage, and no line without it";
    - Review Focus 5 "a save refused with own_models_not_allowed shows the copy and keeps the form values"; "models_changed_elsewhere shows its copy with a Reload button".
- [ ] **Step 3: Run them and confirm they fail.** `npx vitest run supabase/tests/s4ModelRequests.test.ts -t "S4 Task 3" src/services src/features/products`
- [ ] **Step 4: Implement section 3 and its rollback section.**
  - Compare model sets as sorted `(format, coalesce(storage_path, url), required_extensions)` tuples, for the product and for each kept option (by id). Only when a set differs: check `expected_models_changed_at`, replace that set, set `models_changed_at = now()`.
  - Recreate "Members and admins upload media" and "Members and admins update media" from the account-settings bodies; the business-member branch adds `(lower(name) !~ '\.(glb|usdz)$' or public.can_write_own_models(<folder uuid>))`.
- [ ] **Step 5: Implement the service and mock rules, then the UI.** The editor sends `keepModels: true` for an owner whose business has the switch off; the staff line reads `useModelRequests({ productId, status: OPEN_REQUEST_STATUSES })`; mount `<ModelRequestPanel product={saved product or undefined} onSaveDraft={…} onReload={…} />` where §R-S4-4 places it. `onReload` refetches the product into the editor.
- [ ] **Step 6: Run the tests and the gates.** Check `/dashboard/products/:id/edit` for `biz_casa` (off) and `biz_nord` (on), and `/admin/products/:id/edit`, at 1440 and 390 px.
- [ ] **Step 7: Commit.** "S4 Task 3: the switch holds in save_product and storage; the editor shows request or upload; stale model saves are refused".

### Task 4: The business request: send, cancel, and the request panel

Wave 2. Closes **R-S4-6** (without check 5), **R-S4-7**, **R-S4-8**, and their demo bullets of R-S4-19 (2 to 10 photos, types and 10 MB, dimensions, one open request per target, session-only labelled photos).

**Files:**
- Migration section 4; rollback section 4.
- Modify (owned): `src/features/products/editor/ModelRequestPanel.tsx` (+ new `ModelRequestPanel.test.tsx`), `src/services/supabase/modelRequestsBusiness.ts` (+ test), `src/services/mock/mockModelRequestsBusiness.ts` (+ test), `src/lib/image.ts` (+ `image.test.ts`).

**Interfaces:**
- Consumes: Task 1 tables, bucket, `private.require_business_member`, audit metadata shape; Task 2 contract, `REQUEST_PHOTO_RULES`, `mapModelRequestError`, `copy.ts`, `ModelRequestStatusBadge`, `useModelRequests`, `mockActor`, `sessionRequestMedia`.
- Produces (SQL):
  - `request_model(p_request_id uuid, p_product uuid, p_variant uuid, p_note text, p_photos jsonb) → jsonb {id, status}`. `p_photos` is `[{storage_path, file_name, size_bytes}]`, `sort_order` = array position. Checks in this order: member (`require_business_member`), target (`model_request_target_invalid`), dimensions (`model_request_needs_dimensions`), open (`model_request_open`), photo count (`model_request_photos_count`), each path `^{business}/{p_request_id}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$` and present in `storage.objects` (`model_request_photo_missing`), note ≤ 1000 (`model_request_note_too_long`, 22023, copy "Keep the note to 1000 characters."). Audit `model_request_created`.
  - `cancel_model_request(p_request uuid) → jsonb {status:'cancelled', photo_paths: text[]}`; only from `requested`, else `model_request_not_cancellable`; unknown or invisible id → `model_request_not_found`. Audit `model_request_cancelled`.
- Produces (lib): `imageSize(file: Blob): Promise<{ width: number; height: number } | null>`.
- Produces (service): `requestModel` and `cancelModelRequest` as in Task 2. `requestModel` makes `crypto.randomUUID()` as the request id, uploads each photo to `model-request-photos/{business}/{id}/{uuid}.{ext}` (`ext` from the type: jpeg → `jpg`), reports `onProgress(i, 'uploading' | 'done')`, sends `file_name` cut to 255 characters, then calls the RPC; on any failure it removes the uploaded photos and returns the mapped error. `cancelModelRequest` removes `photo_paths` after success (`cleanup: 'partial'` if that fails).

- [ ] **Step 1: Write the failing PGlite tests** (`describe('S4 Task 4: request and cancel')`):
  - "1 photo → model_request_photos_count; 11 → the same; a path in another business's folder → model_request_photo_missing; a path under another request id → the same; a path with no object → the same".
  - "a second open request for the same target → model_request_open; the same product with another option → allowed; after the first is cancelled → allowed".
  - "a product with depth 0 → model_request_needs_dimensions; an option of another product → model_request_target_invalid; a 1001-character note → model_request_note_too_long".
  - "a staff caller → forbidden; a member at aal1 with the business 2FA policy on → aal2_required".
  - "the request, its photo rows and one model_request_created audit row are written; nothing is written on any refusal".
  - "cancel when requested → cancelled with closed_at and the photo paths, and the member may then delete those objects; when in_progress → model_request_not_cancellable and nothing changes; another business's member → model_request_not_found".
  - `GONE_AFTER_ROLLBACK.push('public.request_model(uuid,uuid,uuid,text,jsonb)', 'public.cancel_model_request(uuid)')`.
- [ ] **Step 2: Write the failing service and component tests:**
  - Supabase (fake client): "requestModel uploads every photo under {business}/{id}/, then calls request_model with the paths"; "when the RPC fails it removes the uploaded photos and returns the mapped copy"; "a 300-character file name is sent as its first 255 characters"; "cancelModelRequest removes the returned photo paths; a failed removal gives cleanup 'partial'".
  - Mock: the same refusal keys as the PGlite cases (photos 1 and 11, type, 10 MB, dimensions, open target, transitions); "photos are session-only object URLs and the request carries sessionOnly".
  - `ModelRequestPanel.test.tsx`, each state of R-S4-7:
    - unsaved: "'Save this product first, then request its 3D model.' and a Save draft button that calls onSaveDraft";
    - dimensions missing: "the form shows and Send is replaced by 'Add width, height and depth above first. The model is made to that size.' linking to #specs";
    - form: "'Model for' lists 'The product' and the saved options (hidden with no options); the count line '{n} of 10 photos · add at least 2'; Send disabled with 1 photo and 'Add at least 2 photos.' next to it; an 11th photo is refused with 'Up to 10 photos. Remove one to add another.'; a 12 MB photo shows the size message; a .gif the type message; a 900 px photo shows the low-resolution warning";
    - sending: "per-photo progress, the button busy, the form locked";
    - "a service error shows the mapped copy and keeps the picked photos";
    - status lines and actions for requested (Cancel request), in progress (the §R-S4-8 line, no Cancel), delivered ("Ready since…"), declined ("Declined on {date}. Reason: {reason}" and "Send a new request"), cancelled; "Earlier requests (n)" holds the older ones per target;
    - "a request that becomes delivered while open shows 'Ready. Reload to see the 3D model in this editor.' and Reload calls onReload";
    - loading skeleton; error "Couldn't load 3D model requests." with Retry; demo label "Demo: these photos are kept only until you reload." for session-only photos;
    - toasts "Request sent. We'll email you when the model is ready." and "Request cancelled."
- [ ] **Step 3: Run them and confirm they fail.** `npx vitest run supabase/tests/s4ModelRequests.test.ts -t "S4 Task 4" src/services src/features/products/editor src/lib`
- [ ] **Step 4: Implement section 4 and its rollback section, then the service (both modes), `imageSize`, and the panel.** The file input uses `accept="image/jpeg,image/png,image/webp"` and `multiple`; thumbnails are local object URLs revoked on removal and unmount; status refreshes with `useRefreshWhenStale`.
- [ ] **Step 5: Run the tests and the gates.** Check the panel in `/dashboard/products/:id/edit` at 1440 and 390 px.
- [ ] **Step 6: Commit.** "S4 Task 4: request a 3D model with private photos, cancel until work starts".

### Task 5: Request badges in the product list, the staff queue, the nav count and the business card

Wave 2. Closes **R-S4-9**, **R-S4-10**, and the admin UI of **R-S4-2**.

**Files:**
- Create: `src/features/modelRequests/badge.ts` (+ test), `src/features/businesses/BusinessModelsCard.tsx` (+ test).
- Modify (owned): `src/features/admin/ModelRequestsPage.tsx` (+ new test), `src/features/products/ProductTable.tsx` (+ test), `ProductFilters.tsx`, `src/features/business/MyProductsPage.tsx`, `src/features/admin/BusinessDetailPage.tsx` (+ test), `src/components/layout/nav.ts`, `DashboardShell.tsx`, `dashboardContext.ts`.

**Interfaces:**
- Consumes: Task 2 `getModelRequests`, `getProductRequestStates`, `setBusinessOwnModels`, `useModelRequests`, `ModelRequestStatusBadge`, the URL helpers, `Business.allowOwnModels`; `productArReadiness` (existing).
- Produces:
  ```ts
  export type ModelRequestBadge = 'requested' | 'in_progress' | 'rejected'
  export const MODEL_REQUEST_BADGE_LABEL: Record<ModelRequestBadge, string>   // '3D requested' | '3D in progress' | '3D declined'
  /** Open state wins (in_progress over requested); 'rejected' only when the latest closed request was declined and the product is photos-only. */
  export function modelRequestBadge(state: ProductRequestState | undefined, photosOnly: boolean): ModelRequestBadge | null
  ```
  `ProductFilterState.model: '' | 'open'` (URL `?model=open`); `NavItem['badge']` gains `'requestedModelRequests'`; `useRequestedModelRequests(enabled: boolean)` in `dashboardContext.ts` = `getModelRequests({ status: ['requested'], pageSize: 1 }).total`.

- [ ] **Step 1: Write the failing tests:**
  - `badge.test.ts`: "in_progress beats requested; rejected shows only when photos-only and nothing is open; delivered and cancelled show nothing".
  - `ProductTable.test.tsx`: "the three badges render next to the AR readiness label, whose text is unchanged"; "the filter '3D requests: open' keeps only products with an open request and writes ?model=open".
  - `ModelRequestsPage.test.tsx`: "tabs Open (default, oldest first), Delivered, Declined, Cancelled, All (newest first) from ?status"; "columns product (photo and name), business, target ('Product' or the option name), photos, requested (date and age), status"; "a business filter from ?business shows the business name with a clear link"; "50 per page with paging"; "loading skeleton; empty 'No open requests. New requests from businesses appear here.' and 'No {tab} requests.'; error 'Couldn't load 3D model requests.' with Retry"; "rows link to modelRequestAdminPath(id)".
  - nav: "'3D requests' shows with models.manage and its count of requested rows (', {n} waiting to start' for screen readers); hidden without it"; route: "a Team member without models.manage gets the no-access view on /admin/model-requests".
  - `BusinessModelsCard.test.tsx`: "with models.manage: the switch 'Can upload its own 3D files' with the on/off hint, the open-request count linking to modelRequestsAdminPath({status:'open', businessId})"; "turning it off asks 'Stop {businessName} uploading its own 3D files?' with 'Turn off' / 'Cancel'; turning it on doesn't ask"; "without models.manage: 'Own 3D uploads: {allowed | not allowed}. Changing this needs 'Handle 3D model requests'.' and no switch or count"; "saving, saved and error states".
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/features/modelRequests src/features/products src/features/admin src/features/businesses src/components`
- [ ] **Step 3: Implement.** The list reads `useProductRequestStates(businessId)` in the business scope only; the admin products list passes no states and shows no badges. At 390 px the queue rows become cards with the same fields. The card's count is shown only with `models.manage` (without it RLS returns 0, which would be untrue).
- [ ] **Step 4: Run the tests and the gates.** Check `/admin/model-requests`, `/admin/businesses/:id` and `/dashboard/products` at 1440 and 390 px.
- [ ] **Step 5: Commit.** "S4 Task 5: request badges and filter, the 3D requests queue and nav count, the business 3D models card".

### Task 6: Staff detail, staging, deliver and decline

Wave 2. Closes **R-S4-11**, **R-S4-12**, the SQL and UI of **R-S4-13** and **R-S4-14**, **R-S4-16**'s database part, and their demo bullets of R-S4-19 (transitions, `models.manage`, delivery replace rule, session-only staged models, "Demo: no email was sent.").

**Files:**
- Migration section 6; rollback section 6.
- Create: `src/features/modelRequests/PhotoViewer.tsx`, `DeliverDialog.tsx`, `DeclineDialog.tsx` (+ tests).
- Modify (owned): `src/features/admin/ModelRequestDetailPage.tsx` (+ new test), `src/features/products/editor/ModelSection.tsx` (+ test), `src/lib/download.ts`, `src/services/supabase/modelRequestsStaff.ts` (+ test), `src/services/mock/mockModelRequestsStaff.ts` (+ test).

**Interfaces:**
- Consumes: Task 1 tables, `require_models_manage`, `can_write_own_models` (`app.model_delivery`), `guard_own_models`, `products.models_changed_at`; Task 2 contract, `mapModelRequestError`, `copy.ts`, the badge, `mockActor`, `sessionRequestMedia`; Task 7's HTTP contract (below), faked in this task's tests.
- Produces (SQL; each starts with `require_models_manage()`; unknown id → `model_request_not_found`; wrong status → `invalid_transition`):
  - `admin_start_model_request(p_request uuid) → jsonb {status}`: `requested` → `in_progress`, `started_at`, `handled_by`; audit `model_request_started`.
  - `admin_stage_model_file(p_request uuid, p_format text, p_storage_path text, p_file_name text, p_size_bytes bigint, p_required_extensions text[]) → jsonb {status, replaced_path}`: `requested` (moves to `in_progress`, audited as started) or `in_progress`; path `^{business}/[0-9a-f-]{36}\.{format}$` present in `product-media` (`model_request_file_invalid`, 22023, copy "Upload the file again. It didn't reach storage."); upsert by `(request_id, format)`.
  - `admin_unstage_model_file(p_request uuid, p_format text) → jsonb {path}`.
  - `admin_deliver_model_request(p_request uuid) → jsonb {status:'delivered', replaced_paths, product_status, target}`: locks the row; `in_progress` only; staged GLB required (`model_request_needs_glb`); sets `app.model_delivery`; replaces the target's whole set (§R-S4-13); bumps `models_changed_at` and `updated_at`; closes the request; deletes the staged rows; audit `model_request_delivered {formats, target}`. `replaced_paths` lists only paths no `product_images`, `product_models`, `product_variant_images` or `product_variant_models` row still references (duplicated products share files).
  - `admin_reject_model_request(p_request uuid, p_reason text) → jsonb {status:'rejected', staged_paths}`: `requested` or `in_progress`; trimmed reason 1 to 1000 (`reason_required`); audit `model_request_rejected {has_reason:true}`.
  - Storage: new "Model staff upload models" (insert, `product-media`, `.glb`/`.usdz` names, `platform_can('models.manage')`); "Platform members delete media" recreated from S1.5 Task 5's body plus `platform_can('models.manage')` for `.glb`/`.usdz` names.
- Produces (function contract, implemented by Task 7): `POST review-model-request {requestId, action: 'start'|'deliver'|'reject', reason?}` → `200 {ok:true, status, replacedPaths?: string[], stagedPaths?: string[], email?: {status, error?}}`; errors `{error: key}` with 403 `aal2_required`/`forbidden`, 422 `invalid_transition`/`reason_required`/`model_request_needs_glb`, 404 `model_request_not_found`, 400 `invalid_request`, 500 `unknown`.
- Produces (UI): `ModelSection` `context?: 'product' | 'variant' | 'request'` (request: no URL input, the product's readiness and scale check shown); `downloadUrl(url: string, filename: string): Promise<void>` in `download.ts`; `PhotoViewer({ photos: ModelRequestPhoto[]; index: number; onIndex: (i: number) => void; onClose: () => void })`.
- Produces (service, Supabase): `startModelRequest`, `deliverModelRequest`, `rejectModelRequest` invoke the function (the `reviewApplication` pattern for non-2xx bodies) and remove `replacedPaths`/`stagedPaths` from `product-media` after success (`cleanup: 'partial'` on failure); `stageModelFile` calls the RPC with the asset ModelSection already uploaded, removes `replaced_path` after success, and **removes the uploaded object when the RPC fails**; `unstageModelFile` removes the returned path; `getModelRequest` signs photo URLs for 1 hour and staged files for 12 hours and builds `history` from the request's audit rows. Mock: same keys; email `{status:'demo'}`.

- [ ] **Step 1: Write the failing PGlite tests** (`describe('S4 Task 6: staff handling')`):
  - `expectStaffGate` on each of the five functions; "Team with only models.manage (and its prerequisites) can call each".
  - start: "requested → in_progress; from in_progress → invalid_transition".
  - stage: "a requested request moves to in_progress; a path in another business's folder, a .png name, a format/extension mismatch and a missing object → model_request_file_invalid; staging glb twice returns the first path as replaced_path"; unstage: "removes the row and returns the path".
  - deliver: "GLB only → the target has a GLB, its old USDZ row is gone and its path is in replaced_paths"; "both → both rows with the staged required_extensions"; "an option target replaces only that option's set"; "from requested → invalid_transition; without a GLB → model_request_needs_glb"; "a switch-off business is delivered to"; "models_changed_at is bumped"; "a replaced path another product still uses is not in replaced_paths"; R-S4-16 "anon reads the delivered GLB object for a published product of an active business, not before delivery, and never a staged object".
  - reject: "empty or blank reason → reason_required; from delivered → invalid_transition; staged rows are gone and their paths returned; the audit metadata has has_reason and no reason text".
  - storage: "Team with only models.manage can insert `{business}/{uuid}.glb` into product-media and not `.png`, and can delete `.glb` but not `.png`".
  - `GONE_AFTER_ROLLBACK.push(...)` with the five functions and the new policy name.
- [ ] **Step 2: Write the failing service and component tests:**
  - Supabase (fake client and fake `functions.invoke`): "deliver removes replacedPaths and passes the email status through"; "a 422 invalid_transition maps to 'This request has changed. Reload to see its current status.'"; Review Focus 4 "stageModelFile removes the uploaded object when admin_stage_model_file fails"; "a failed removal gives cleanup 'partial'".
  - Mock: the PGlite keys by name; "deliver replaces the whole set on the target, staged models are session-only, and email is {status:'demo'}".
  - `ModelSection.test.tsx`: "context request hides the URL input and shows the scale check".
  - `ModelRequestDetailPage.test.tsx`: "header links to the admin product editor and the business detail, shows target, status, requested by and on"; "Photos ({n}) thumbnails; the viewer opens on click, moves with ArrowLeft/ArrowRight, closes with Escape and returns focus to the thumbnail, shows the file name and size and 'Download original'"; "a photo that fails to load shows 'This photo couldn't be loaded.' with Retry"; "Product facts with width, height and depth and the unit, material, category, the note, current 3D files and readiness"; "History lists the audit events with actor labels"; "loading; not found 'This request doesn't exist or was removed with its product.'; error with Retry"; "Start work shows only for requested; Deliver model only for in_progress with a staged GLB; Decline for requested and in_progress"; demo labels "Sample photos" and "Demo: these photos are kept only until you reload.".
  - Dialogs: "deliver dialog title, body for the product and for an option, and the no-USDZ sentence only without a staged USDZ"; "decline needs a reason, labelled 'Reason (sent to the business)' with the hint, and refuses blank"; toasts for each email status: accepted "Model delivered. The business owner was emailed." / "Request declined. The business owner was emailed."; failed or blocked "Model delivered, but the email was not sent: {reason}." (reason via `emailReason`); skipped "Model delivered. The business has no owner, so no email was sent."; demo "Model delivered. Demo: no email was sent."; "Work started."; and with `cleanup: 'partial'` the toast adds " Some old files couldn't be removed."
- [ ] **Step 3: Run them and confirm they fail.** `npx vitest run supabase/tests/s4ModelRequests.test.ts -t "S4 Task 6" src/services src/features/admin src/features/modelRequests src/features/products/editor`
- [ ] **Step 4: Implement section 6 and its rollback section, the service in both modes, `downloadUrl`, `ModelSection`'s request context, the viewer, dialogs and page.** The page renders `ModelSection` with `context="request"`, `businessId`, the staged assets as `models`, the product's dimensions and first photo as `poster`; `onChange(format, asset)` stages or unstages.
- [ ] **Step 5: Run the tests and the gates.** Check `/admin/model-requests/:id` at 1440 and 390 px, including the viewer.
- [ ] **Step 6: Commit.** "S4 Task 6: request detail with photo viewer, staging through ModelSection, deliver and decline".

### Task 7: `review-model-request` Edge Function and the owner email

Wave 2. Closes **R-S4-15** and §8.5's email kind.

**Files:**
- Migration section 7 (`email_log_kind_check` = the existing 12 + `model_request_update`); rollback section 7 (restores the 12-kind check only when no `model_request_update` row exists, else keeps it).
- Create: `supabase/functions/review-model-request/{handler,index,handler.test}.ts`, `supabase/functions/_shared/owner.ts`.
- Modify: `_shared/email.ts` (`EmailKind` + `'model_request_update'`), `_shared/email-templates.ts` (+ `email-templates.test.ts`), `notify-business-owner/index.ts` (use `ownerRecipient`, no behaviour change), `supabase/config.toml` (`[functions.review-model-request] verify_jwt = true`).

**Interfaces:**
- Consumes: Task 6's SQL functions **by name and return shape** (this task's tests inject them; the end-to-end path is exercised after both merge, in Task 9).
- Produces:
  ```ts
  export type ModelRequestAction = 'start' | 'deliver' | 'reject'
  export type ModelRequestEmailEvent = 'delivered_published' | 'delivered_draft' | 'declined'
  export interface ReviewModelRequestDeps {
    config: ConfigResult; fetch: typeof fetch
    userIdFromToken(token: string): Promise<string | null>
    gate(token: string): Promise<GateResult>                               // gateCaller(callerRpc(...), { permission: 'models.manage' })
    actAsCaller(token: string, requestId: string, action: ModelRequestAction, reason: string | null):
      Promise<{ ok: true; status: string; replacedPaths?: string[]; stagedPaths?: string[]; productStatus?: string } | { error: string }>
    currentStatus(requestId: string): Promise<string | null>               // service role; null = not found
    emailContext(requestId: string): Promise<{ businessId: string; recipient: { email: string; language: 'en' | 'pt' } | null;
      productName: { en: string; pt?: string }; optionName?: { en: string; pt?: string }; productStatus: string; reason?: string } | null>
    alreadySent(workflow: string): Promise<boolean>
    log(entry: LogEntry): Promise<string>
  }
  export async function handleReviewModelRequest(req: Request, deps: ReviewModelRequestDeps): Promise<Response>
  export const modelRequestUpdateEmail: (lang: EmailLang, event: ModelRequestEmailEvent,
    d: { productName: string; optionName?: string; reason?: string }) => RenderedEmail           // _shared/email-templates.ts
  export async function ownerRecipient(admin: SupabaseClient, businessId: string):
    Promise<{ email: string; language: 'en' | 'pt'; businessName: string } | null>              // _shared/owner.ts, moved from notify-business-owner/index.ts
  ```
  The HTTP contract is the one in Task 6's Interfaces. Workflow `model_request:<id>:<delivered|rejected>`; `kind 'model_request_update'`, `businessId` set.

- [ ] **Step 1: Write the failing tests:**
  - PGlite (`describe('S4 Task 7: email kind')`): "email_log accepts model_request_update and still rejects 'nope'".
  - templates: "model_request_update renders delivered_published, delivered_draft and declined in EN and PT, with and without an option (' ({optionName})'), with the §9.2 subjects and bodies and the closing line"; "a reason with markup and newlines is escaped in html and kept in text"; "a reason over REASON_MAX_LENGTH throws".
  - handler:
    - "aal2_required (403) comes before forbidden, and neither calls actAsCaller";
    - "start → 200 {status:'in_progress'} and no email";
    - "deliver for a published product → the published body; for a draft → the draft body; reject → the declined body with 'Reason: {reason}'";
    - "PT recipient → PT subject and body with the PT product and option names, falling back to EN";
    - "email failure → 200 ok with email.status 'failed' and the status unchanged";
    - "no owner → email {status:'skipped'}";
    - "a workflow already in email_log is not sent again";
    - Review Focus 2 "deliver retried after the request is already delivered: 200 ok, status delivered, one email_log row for the workflow" (when `actAsCaller` returns `invalid_transition` and `currentStatus` equals the action's target, answer success and send only if not already sent);
    - "invalid_transition with another status → 422; reason_required and model_request_needs_glb → 422; model_request_not_found → 404; a missing requestId or unknown action → 400 invalid_request; an unexpected error → 500 unknown with nothing secret logged".
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run supabase/functions/review-model-request supabase/functions/_shared supabase/tests/s4ModelRequests.test.ts -t "S4 Task 7"`
- [ ] **Step 3: Implement** the section and its rollback section, the kind, the template (reusing the existing escape and closing helpers), `ownerRecipient` (moved verbatim), the handler and `index.ts` (caller client from the anon key plus the caller's `Authorization` header for `gate` and `actAsCaller`; service role for `currentStatus`, `emailContext`, `alreadySent` and `log`), and the config entry.
- [ ] **Step 4: Run the tests again,** the `notify-business-owner` handler tests, and the Edge Function type check.
- [ ] **Step 5: Commit.** "S4 Task 7: review-model-request function and the 3D model email".

### Task 8: Clean-up with the product, the option, the business and the closure

Wave 2. Closes **R-S4-18**.

**Files:**
- Migration section 8; rollback section 8.
- Modify: `supabaseCatalogService.ts` (`deleteProduct`, `deleteBusiness`, `updateProduct` only; + new `src/services/supabase/requestCleanup.test.ts`), `mockCatalogService.ts` (`deleteProduct`, `deleteBusiness`, option removal on save; + `service.test.ts`), `supabase/functions/account-security/{handler,index,handler.test}.ts`.

**Interfaces:**
- Consumes: Task 1 tables, bucket delete policies; Task 2 `sessionRequestMedia`.
- Produces (SQL): `model_request_storage_paths(p_product uuid) → jsonb` = `[{bucket: 'model-request-photos' | 'product-media', path: text, variant_id: uuid | null}]` (request photos and staged files of the product); allowed for `is_business_member(product's business)` or `platform_can('products.delete')`, else `forbidden`.
- Produces (account-security): `export const SWEEP_BUCKETS = ['product-media', 'business-logos', 'model-request-photos'] as const` in `handler.ts`; `index.ts` sweeps every bucket in it.
- Produces (service): `deleteProduct` reads the paths before the row delete and removes them after it, best-effort like today's media removal (its `Result<void>` is unchanged); `deleteBusiness` also removes the business's `model-request-photos` folder; `updateProduct` reads the paths before a save that drops options and, after a successful save, removes those whose `variant_id` was dropped.

- [ ] **Step 1: Write the failing tests:**
  - PGlite (`describe('S4 Task 8: clean-up paths')`): "the owner and a products.delete staff member get the photo and staged paths; another business's owner and Team without products.delete get forbidden"; "deleting the product cascades its requests, photo rows and staged rows"; "deleting an option cascades only that option's requests"; `GONE_AFTER_ROLLBACK.push('public.model_request_storage_paths(uuid)')`.
  - service (fake client): "deleteProduct removes the request photos from model-request-photos and the staged files from product-media after the delete"; "deleteBusiness removes the business's model-request-photos folder"; Review Focus 3 "updateProduct that removes an option deletes that option's request photos after the save succeeds, and nothing when the save fails".
  - mock: "deleting a product or business removes its requests and revokes their session photo URLs".
  - account-security: "SWEEP_BUCKETS lists product-media, business-logos and model-request-photos" and the existing "a failed storage sweep is noted" case still passes.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run supabase/tests/s4ModelRequests.test.ts -t "S4 Task 8" src/services supabase/functions/account-security`
- [ ] **Step 3: Implement** the section and its rollback section, the three service functions in both modes, and the sweep list.
- [ ] **Step 4: Run the tests again,** then typecheck, lint and the Edge Function type check.
- [ ] **Step 5: Commit.** "S4 Task 8: request files go with their product, option, business and closure".

### Task 9: E2E journeys, docs, ADR-0034 and the release runbook

Final, after Tasks 3 to 8 are merged. Closes the §11 Playwright journeys, the e2e acceptance of **R-S4-16** and **R-S4-17**, the demo journey of **R-S4-19**, and §10.2.

**Files:**
- Create: `tests/e2e/model-requests.spec.ts`, `tests/e2e/model-requests.mobile.spec.ts`, `System_arch/decisions/ADR-0034-3d-model-requests.md`.
- Modify: `tests/e2e/a11y-dashboard.spec.ts` (the two admin routes and the editor with the panel); `System_arch/decisions/README.md`; `System_arch/design/19-supabase.md`, `23-email.md`, `15-product-editor.md`, `12-features-admin.md`; `docs/SECURITY_REVIEW.md`, `docs/OPERATIONS_RUNBOOK.md`, `docs/TEST_PLAN.md`, `docs/PRD.md`, `docs/CLIENT_HANDOVER.md`, `docs/PRODUCTION_READINESS.md`; `System_arch/Task.md`, `System_arch/tasks/P12-team-roles-and-addons.md`, `System_arch/HANDOFF.md`; the spec's status line.

**Interfaces:**
- Consumes: every earlier task; `DEMO_REQUEST_TARGET_SLUG` (Task 2); the fixture GLB and USDZ already used by `model-optimize.spec.ts`.

- [ ] **Step 1: Check no placeholder is left:** `grep -rn "S4 placeholder" src` prints nothing.
- [ ] **Step 2: Write the e2e journeys** (demo, `--project=desktop`), in one serial `describe`:
  - As the `biz_casa` owner (switch off), open the `DEMO_REQUEST_TARGET_SLUG` product: no `.glb` input; add 2 photos (an 11th is refused); Send; the panel says "Requested"; its public page has no "View in 3D" or AR control.
  - As the Admin, open "3D requests", the request, Start work, upload the fixture GLB and USDZ, Deliver; the toast says "Model delivered. Demo: no email was sent."
  - The public page now shows the 3D and AR controls; the owner's editor shows "Ready" and "AR ready"; the business Overview's "with 3D" count is one higher.
  - R-S4-17 with two browser contexts: the owner of `biz_nord` (switch on) opens the editor, the Admin delivers a request for that product, the owner saves a changed model → "The Sanctus team delivered a 3D model while you were editing. Reload to see it." and the delivered files are kept; saving without touching the 3D section succeeds and keeps them.
  - Decline another request with a reason → the owner sees "Declined on {date}. Reason: {reason}" and "Send a new request".
  - The Admin turns the switch on for `biz_casa` → the owner sees "Upload your own".
  - Mobile (390): the queue shows cards; the photo viewer opens and closes with its close button.
- [ ] **Step 3: Run them.** `npx playwright test tests/e2e/model-requests.spec.ts --project=desktop`, `npx playwright test tests/e2e/model-requests.mobile.spec.ts --project=mobile`, `npx playwright test tests/e2e/a11y-dashboard.spec.ts --project=desktop`, `npx playwright test --project=guard`. Expected: all pass; the pixel guard stays green.
- [ ] **Step 4: Write the runbook section "3D model requests (S4)"** in `docs/OPERATIONS_RUNBOOK.md`:
  1. The owner's go-ahead for `zggylkbgajamhriebdrg`.
  2. The read-only pre-flight from the migration's `PRE-FLIGHT (S4)` comment, with the results shown to the owner: businesses that get `allow_own_models = true` and `false`; the stored Admin and Team sets (Admin gains `models.manage`); no `model-request-photos` bucket yet.
  3. `supabase db push`. Never `config push`.
  4. `npm run db:types`.
  5. Deploy `review-model-request`, then `account-security`. No new secrets.
  6. Release the frontend to the Preview; production only when the owner asks.
  7. Mixed versions (§10.1).
  8. Rollback: export the `model-request-photos` objects (customer data), empty the bucket through the Storage API, then run the rollback script; the script refuses while objects remain. Delivered models stay.
  9. The live checks of §11 with QA accounts labelled "QA".
- [ ] **Step 5: Write ADR-0034** (`models.manage` against ADR-0029, the switch and its database enforcement, the lifecycle, the private bucket, delivery replaces the whole set, the owner's no-limit decision) and its README row; update the design and docs files listed above (SECURITY_REVIEW: staged files readable by the business through its folder, the direct-SQL path without email, request photo privacy; PRD: the A3 row and "cost: none"; CLIENT_HANDOVER: how to request, how staff deliver, the switch). No personal names or Gmail addresses in client material.
- [ ] **Step 6: Run the full gates.** `npm run typecheck && npm run lint && npm test && npm run build`, and `npx vitest run supabase/tests`.
- [ ] **Step 7: Tick and commit.** Tick S4 in the P12 task file with a note and update the phase row in `Task.md`. Commit "S4 Task 9: e2e journeys, ADR-0034, runbook and docs".

---

## Coverage

| Requirement | Task(s) |
|---|---|
| R-S4-1 permission | 1 |
| R-S4-2 switch | 1 (database), 2 (service, mock), 5 (business card) |
| R-S4-3 database refuses business 3D writes | 1 (row guard), 3 (`save_product`, storage) |
| R-S4-4 editor controls | 3 |
| R-S4-5 private photos | 1 (bucket, policies), 2 (`REQUEST_PHOTO_RULES`), 4 (upload) |
| R-S4-6 `request_model` | 4 |
| R-S4-7 request panel | 4 (component), 3 (mounting) |
| R-S4-8 cancel | 4 |
| R-S4-9 list badges and filter | 2 (URL), 5 |
| R-S4-10 queue | 2 (route, URL), 5 |
| R-S4-11 detail | 6 |
| R-S4-12 start and stage | 6 |
| R-S4-13 deliver | 6 (SQL, UI), 7 (function) |
| R-S4-14 decline | 6 (SQL, UI), 7 (function) |
| R-S4-15 Edge Function and email | 7 |
| R-S4-16 hidden until ready | 6 (anon reads), 9 (e2e) |
| R-S4-17 stale model save | 1 (column), 3, 6 (bump), 9 (e2e) |
| R-S4-18 clean-up | 4 (cancel), 6 (replaced and staged files), 8 |
| R-S4-19 demo parity | 2 (seed, reads, reset), 3, 4, 6, 8 (each task's own rules), 9 (journey) |

## Spec decisions (binding for every task)

1. **No open-request limit** (owner decision): R-S4-6 check 5, `model_request_limit`, the mock's 25 cap and the §10.4 risk are dropped.
2. **File names:** the brief's `s4_model_requests` migration, `20261026_s4_model_requests_rollback.sql` and `s4ModelRequests.test.ts` replace §8.1's and §11's `model_requests` names.
3. **Backfill audit type:** the spec's `access_role_permissions_changed` doesn't exist; the backfill writes the existing `access_permissions_changed` with `reason: 'model_requests_backfill'`.
4. **`admin_set_role_permissions`** keeps its own list of known keys (`v_known`); the spec doesn't mention it, but without redefining it no role could be given `models.manage`. Task 1 redefines it.
5. **Role editor text:** the spec's "Includes: View businesses, View products" uses an old label; the editor prints the existing labels, "Includes: View businesses, View products and catalogues".
6. **`stageModelFile(id, format, asset)`** takes the asset `ModelSection` has already uploaded and checked, not a raw `File`, so every model check runs once, in the shared component. **`requestModel`** also takes `businessId`, so it doesn't need an extra read to build the path.
7. **Parallel `request_model` on two connections** can't run in PGlite (one connection); the partial unique index is pinned instead (Task 1).
8. **History for model staff:** §8.2 gives `models.manage` no read on audit rows, but R-S4-11 shows them; Task 1 adds "Model staff read request events" for the five `model_request_*` types.
9. **Error keys that already mean something else** (`invalid_transition`, `reason_required`) are mapped only in the model-request service files. `aal2_required` is raised before `forbidden` by the SQL helpers too, so a direct RPC behaves like the function.
10. **Replaced files:** the spec deletes every replaced path, but duplicated products share stored files. Deliver returns only paths that no product row still uses.
11. **Strings the spec leaves open** are fixed in the owning task: the note limit message, the staging message, the 11th-photo message, the "add at least 2" reason, the no-owner and partial clean-up toasts, the duplicate toast, the staff editor's "Open 3D request: {status}" line, and the nav count's screen-reader text.

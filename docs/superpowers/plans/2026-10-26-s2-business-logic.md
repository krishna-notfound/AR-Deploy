# S2 "Working business logic": Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** build the business-logic audit fixes that the owner moved from S1.5 to S2. The public-page fixes land, a stale product page gives way to "not found", and the demo follows the real rules for deleting a business and for what signed-out visitors can see. View-only staff get a read-only business form, and every business field limit is checked on the form. Logos are moved and a partial file clean-up is reported.

**Removed by the owner (2026-10-26):** the old-address redirect and the "catalog unavailable" page are not built. See "Removed by the owner" below.

**Architecture:**
- **Database:** one new migration (`s2_business_logic`) with one marked section. Only Task 2 writes SQL: the 1000-character description in `admin_review_application`. S2 adds no table and no new function.
- **Edge Functions:** none change in S2.
- **Client:** changes go through `src/services` (the Supabase service and the mock together), `src/lib/urls.ts` and the public and dashboard pages.
- **Build order:** Tasks 1–3 are built in parallel in separate worktrees. Their shared-file edits are fenced (see "Parallel build"). Task 4 runs last and adds the e2e journeys and the docs.

**Tech stack:** React 19, React Router 8, Tailwind 4, TypeScript 6, Vitest + Testing Library, PGlite (`@electric-sql/pglite`), Playwright, Supabase (supabase-js 2.117.3).

**Spec:** `docs/superpowers/specs/2026-10-26-business-logic-fixes-design.md`. `R-Wn-k`, `§` and the copy below point into it (§4 W3, §5 W4, §9 W8, §10.2, §14).
- **Scope:** the owner's decision in `docs/superpowers/plans/2026-10-26-next-scope.md` §S2 "Keep" item 2, and the rows that `docs/superpowers/plans/2026-10-26-business-logic-fixes.md` ("Moved out of S1.5") gives to S2, minus the rows removed below.
- **Binding rulings:** in `docs/audits/2026-10-26-business-logic/RULINGS.md`. Ruling 12 is the deletion leftovers. Rulings 9 (unavailable catalog) and 10 (addresses) are not built, by the owner's decision.
- **Evidence:** with file:line, in `docs/audits/2026-10-26-business-logic/{BIZ,PUB}.md`.
- **Not in this plan:** the "To confirm" and "Dropped" items, and R-W3-2's published-slug confirmation (S4).

## Removed by the owner (2026-10-26)

The owner said: "remove this from pages S2 no need". These are dropped from S2 and not built:

| ID | What | Findings |
|---|---|---|
| R-W3-1 | Business slug history and redirect (old catalog addresses and printed QR codes keep working) | BIZ-04 |
| R-W3-2, slug-history part | Product slug history and redirect | PUB-03 = PROD-06 |
| — (ruling 9) | The "catalog unavailable" page for a paused or draft catalog (`public_catalog_state`) | PUB-02 = BIZ-03 |

Consequences:
- A changed catalog or product address stops working. A signed-out visitor to a paused catalog sees the existing "Catalog not found".
- No SQL for these: no history tables, no triggers, no `public_slug_redirect`, no `public_catalog_state`, no `slug_retired` errors.
- The former Task 1 is gone. Its remaining items (R-W4-8, R-W8-2) were folded into the public-page task, which is now Task 1.

## Global Constraints

- **Base and branches:**
  - Start only after S1.5 is fully merged into `feature/sanctus-brand-design-system` (Tasks 1–18 and the Task 15 e2e branch `s15/e2e`) and has passed its final review.
  - The controller makes the wave-setup commit (below) on that branch.
  - Tasks 1–3 each run in their own worktree (`C:/Users/krishna/Desktop/arw-s2-tN`, branch `s2/bl-tN`), cut from the wave-setup commit, in parallel. They are merged in the order 1, 2, 3.
  - Task 4 is cut after all three are merged.
  - Run `npm ci` if `node_modules` is missing. Set `E2E_PORT` to a free port before Playwright.
  - Never push. Never touch `main`.
- **Parallel rules (Tasks 1–3; same as S1.5 `PARALLEL.md`):**
  - Run only the focused tests for the files you change, plus your own `-t "S2 Task N"` PGlite describe (Task 2 only), plus any existing suite whose assertion you change.
  - Run `npm run typecheck` and `npm run lint` once, at the end.
  - Don't run the full `npm test`, `npm run build` or Playwright. The controller runs the full gates after merging the wave, and Task 4 runs them again.
  - Never use `git stash`, `git reset --hard`, `git clean`, or `git checkout -- <file>` outside your worktree.
- **Commits:** `git -c user.name=krishna -c user.email=krishnagtkr@gmail.com commit`, with **no co-author line**. The message is `S2 Task N: <title>`. When a commit changes an existing assertion, its body names the R-ID that changed it.
- **Nothing remote:** no `supabase db push`, no `config push`, no `npm run db:types`, no function deploy, no call to a hosted project. Release follows the runbook that Task 4 writes, and only with the owner's go-ahead.
- **One migration, one section:**
  - The file is `supabase/migrations/<ts>_s2_business_logic.sql`. The wave setup makes it with `npx supabase migration new s2_business_logic`.
  - Task 2 appends exactly one section at the end:
    ```sql
    -- =============================================================================
    -- S2 Task 2: <title> (R-IDs)
    -- =============================================================================
    ...
    -- ---- end S2 Task 2 ----
    ```
  - A function that S1.5 already redefined is `create or replace`d starting from the **latest** body in `supabase/migrations/20261026041731_business_logic_fixes.sql`.
- **One rollback script:**
  - The file is `supabase/rollback/20261026_s2_business_logic_rollback.sql`.
  - Task 2 inserts its section directly below `begin;`, marked `-- S2 Task 2 rollback: …` / `-- ---- end S2 Task 2 rollback ----`.
  - It runs **before** the S1.5 rollback.
  - It restores the S1.5-era body. It drops nothing and loses no data.
- **PGlite tests:**
  - All new database tests go in `supabase/tests/s2BusinessLogic.test.ts`, with one `describe('S2 Task 2: …')`, appended at the end. They use the harness (`freshDb`, `makeHelpers`, `ids(N)`).
  - Names that must be gone after the rollback go onto the list with `GONE_AFTER_ROLLBACK.push(...)` inside your own describe (S2 adds none, so the list may stay empty).
  - Fixture emails are `s2tN-<who>@test`.
  - An existing suite that asserts behaviour S2 deliberately changes gets only that one assertion updated.
- **SQL rules:**
  - Task 2 redefines one existing function and keeps its signature and grants.
  - If a table or function is ever added: every new table has RLS on, `revoke all … from public, anon, authenticated`, then explicit grants; every new function is `security definer` with `set search_path = ''`, `revoke execute … from public`, and explicit grants.
  - Access checks use only the S1 gated helpers (`is_platform_admin`, `platform_can`, `is_business_member`).
- **Client:**
  - UI reads data only through `src/services`.
  - URLs are built only in `src/lib/urls.ts`.
  - Every service change lands in the Supabase service **and** the mock in the same task.
  - `src/services/supabase/database.types.ts` is unchanged (no new tables or RPCs).
  - `unavailableService` is a Proxy and needs no change.
- **Demo mode:**
  - It works with no env vars.
  - It never falls back to demo data after a Supabase error.
  - No `VITE_*` secret.
- **Copy:**
  - Dashboards are English, using the exact strings in the spec (§4, §5, §10.2) and in "Copy decided here" below.
  - Public pages are EN and PT, through `t()` and `src/i18n/dictionaries/{en,pt}.ts`. No S2 task adds a dictionary key.
- **Owner's files:** never edit `src/features/marketing/LandingPage.tsx`. Its `?category=` line stays as it is (§1.6).
- **AR (ADR-0021):** no AR mode or launch change. R-W4-8 only removes the whole product view, AR button included, when the product is gone.
- **Quality bar:**
  - No dead buttons: a hidden action is hidden, not disabled.
  - Every data view has loading, empty and error states.
  - No new dependency.
  - Tokens come from `src/index.css`.
  - A touched route is checked at 1440 and 390 px in the demo.
- **Test commands:**
  - PGlite: `npx vitest run supabase/tests/s2BusinessLogic.test.ts -t "S2 Task 2"`
  - all DB suites: `npx vitest run supabase/tests`
  - unit or component: `npx vitest run <paths>`
  - e2e (Task 4): `npx playwright test <spec> --project=desktop`, then `--project=mobile`, then `--project=guard`

### Copy decided here

| Where | EN |
|---|---|
| Owner closure sentence by real status | `inactive`: "Your catalog is offline." · `draft`: "Your catalog is not public yet." · `active`: "Your catalog is still live." |
| Storage sweep toast with 1 file | "Business deleted, but 1 file could not be removed from storage." (the same for "Product") |
| Field limits (`validateBusiness`) | "Use {n} characters or fewer." |

## Parallel build: who touches which shared file

Every other file in a task's **Files** list belongs to that task alone. For these shared files, each task edits **only** the region named here. It adds new imports as **new lines** (it never rewrites an existing import line, except the one named).

| File | Task 1 | Task 2 | Task 3 |
|---|---|---|---|
| `src/services/supabase/supabaseCatalogService.ts` | — | the `if (error)` line in `uploadAsset`; a new exported `isStorageForbidden` placed directly below the `mapDbError` function | `removeFolder`, `removeUnreferencedMedia`, `createBusiness`, the bodies of `deleteBusiness` and `deleteProduct`; a new exported `stagedLogoPath` next to `ownedLogoPath` |
| `src/services/mock/mockCatalogService.ts` | `getBusinessBySlug`, `getCatalog`, `getPublicProduct`; in `deleteBusiness` **only new lines at the top of the `store.update` callback** | — | only the final `return ok(undefined)` line of `deleteBusiness` and `deleteProduct` |
| `src/services/validation.ts` | `validateProductDraft` (one rule) | `validateBusiness` and a new `BUSINESS_LIMITS` constant | — |
| `src/features/businesses/BusinessForm.tsx` | — | `maxLength` attributes, field `error` props, the status select condition, and `slugInput(…, BUSINESS_SLUG_MAX)` | the `if (!business) { toast… }` block after a create |

**Merge:**
- The controller merges in task order. It uses the S1.5 helpers (`.superpowers/sdd/2026-10-26-business-logic-fixes/merge-task.sh` and `secmerge.py`), copied with the S2 paths and the `S2 Task` marker. Don't use git's union driver.
- If git conflicts in a table row above, it is two edits next to each other: keep both sides.

## Wave setup (controller, one commit, before Tasks 1–3)

S2 still has SQL (Task 2), so the migration, the rollback script and the PGlite scaffold stay.

- [ ] **Step 1: Create the migration and the rollback script.**
  - Run `npx supabase migration new s2_business_logic`.
  - The migration gets a header comment only: spec, scope, the section format, and the SQL rules above.
  - Create `supabase/rollback/20261026_s2_business_logic_rollback.sql`. Its header says:
    - run it as the database owner, **before** `20261026_business_logic_fixes_rollback.sql`;
    - it restores the S1.5 body of `admin_review_application` (the description cap goes back to 5000) and loses no data;
    - the section format.
  - Then `begin;`, an empty line, and `commit;`.
- [ ] **Step 2: Update the harness.** `supabase/tests/harness.ts` gains:
  ```ts
  export const S2_MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_s2_business_logic.sql'))!
  export const S2_ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261026_s2_business_logic_rollback.sql')
  /** Migrations up to and including S1.5: the S1.5 suite and its rollback checks run without S2. */
  export const UP_TO_S15 = (n: string) => n <= S15_MIGRATION
  ```
- [ ] **Step 3: Pin the S1.5 suite to S1.5.** In `supabase/tests/businessLogicFixes.test.ts`, replace every `freshDb()` (11 calls) with `freshDb(UP_TO_S15)` and add the import. No other change.
- [ ] **Step 4: Create `supabase/tests/s2BusinessLogic.test.ts`.**
  - It has `// @vitest-environment node`, the imports, `const GONE_AFTER_ROLLBACK: string[] = []`, and one shared `db`/`h` built with `freshDb()` in `beforeAll` (closed in `afterAll`).
  - It has `describe('S2 scaffold and rollback')` with:
    - "the S2 migration is the last migration and applies after every earlier one";
    - "apply → S2 rollback → re-apply S2 succeeds, and every GONE_AFTER_ROLLBACK name is gone after the rollback". It uses `to_regclass` for `schema.name` and `to_regprocedure` for `schema.name(args)`, on a fresh `freshDb()`, then re-runs the S2 file.
    - "the S2 rollback followed by the S1.5 rollback both succeed".
- [ ] **Step 5: Copy the merge helpers** to `.superpowers/sdd/2026-10-26-s2-business-logic/`, with the S2 file names and the `S2 Task` marker.
- [ ] **Step 6: Verify.** `npx vitest run supabase/tests`: every suite passes. Then `npm run typecheck`.
- [ ] **Step 7: Commit.** Message "S2 wave setup: migration, rollback and PGlite scaffold".

## Review Focus

1. **A product renamed or unpublished while a visitor's tab is open.** The focus refetch returns `NOT_FOUND`. Expected: the stale view is replaced by the existing not-found view. It never keeps showing the old product and its AR button. There is no redirect to a new address. (Task 1 test: "a stale product page whose refetch returns NOT_FOUND after a rename shows 'Product not available', and the AR button is gone".)
2. **A paused catalog opened by its own admin in the demo.** The demo now hides non-active businesses from signed-out visitors. Expected: a `super_admin` and the `business_admin` of that business still read it (preview keeps working), and nobody else does. (Task 1 test: "signed out, getBusinessBySlug('oak-ember') is NOT_FOUND; as super_admin or as the business_admin of biz_oak it is returned".)
3. **An existing business whose description is longer than 1000 characters.** Up to 5000 was allowed before. Expected: saving any field shows "Use 1000 characters or fewer." on the description field, not a generic failure toast. The DB keeps its 5000 cap. (Task 2 test: "a stored 1200-character description gets the description field error on save".)
4. **A create with a staged `new/` logo that the database refuses.** For example, a taken slug. Expected: no storage move is attempted, the field error shows, and there is no "Business created" toast. (Task 3 test: "a refused insert never calls storage.move".)

---

### Task 1: Public page fixes, stale pages give way, the demo follows the real rules

Closes **R-W4-8** (PUB-04, the built part), **R-W4-9** (PUB-05), **R-W4-10** (PUB-07), **R-W4-11** (PUB-08), **R-W4-12** (PUB-09, the noindex header), **R-W4-13** (PUB-10), and the rest of **R-W8-2** (BIZ-10): a mock business delete clears its owners, and signed-out visitors can't read non-active businesses in the demo. Task 16 of S1.5 already did the application-link bullets and the delete-dialog line.

**Files:**
- Create:
  - `src/features/public/LowercaseSlugs.tsx`
  - `src/features/public/publicFixes.test.tsx`
  - `src/services/validation.cta.test.ts`
  - `src/services/mock/demoRules.test.ts`
- Modify:
  - `src/features/public/{CatalogPage,ProductPage,EmbedProductPage}.tsx`
  - `src/app/router.tsx` (wrap the public slug routes)
  - `src/lib/urls.ts` (`catalogLocalPath`) and `src/lib/urls.test.ts`
  - `src/services/validation.ts` (`validateProductDraft`)
  - `src/features/products/editor/ProductEditorForm.tsx`: the field-to-section map gains `'cta.label': 'cta'`, `fieldValue` handles `'cta.label'`, and the "Button label" `LocalizedField` gets `error={err('cta.label')}`
  - `vercel.json`
  - `src/services/mock/mockCatalogService.ts` (regions in the table)
  - `src/services/mock/mockTeam.ts`: `demoViewer()` next to `demoPlatformRole()`
  - `src/features/public/publicPages.test.tsx` and `embed.test.tsx`: only an existing assertion that the demo visibility rule changes; the commit body names R-W8-2

**Interfaces:**
- Produces:
  ```ts
  export function catalogLocalPath(b: Pick<Business, 'slug'>, opts?: { preview?: boolean; category?: string }): string
  // query order: category, then preview: '/catalog/casa?category=sofas&preview=1'
  export function LowercaseSlugs(props: { route: 'catalog' | 'product' | 'embed'; tenant?: boolean; children: ReactNode }): ReactElement
  // when any slug param has upper case: <Navigate replace> to the helper-built lower-case path + location.search + location.hash
  // src/services/mock/mockTeam.ts
  export function demoViewer(): { role: 'super_admin' } | { role: 'business_admin'; businessId: ID } | null
  ```
- Consumes: nothing from the other tasks.
- Behaviour of the stale-page fix (R-W4-8): in `ProductPage` and `EmbedProductPage`, `const gone = res.status === 'error' && res.error.code === 'NOT_FOUND'`. The existing not-found block runs when `!res.data || ownerMismatch || gone`, so a kept-stale product (and its AR button) is replaced by the existing "Product not available" view.

- [ ] **Step 1: Write the failing tests.**
  - `urls.test.ts`:
    - "catalogLocalPath({slug:'casa'}, {category:'sofas'}) is '/catalog/casa?category=sofas'";
    - "with preview too: '/catalog/casa?category=sofas&preview=1'";
    - "with no options: '/catalog/casa'".
  - `validation.cta.test.ts`:
    - "a CTA url with an empty English label gives fieldErrors['cta.label'] = 'Add a button label, or remove the link.'";
    - "a whitespace-only label counts as empty";
    - "a label with no url is valid".
  - `publicFixes.test.tsx`:
    - "/catalog/Casa-Lisboa?q=sofa lands on /catalog/casa-lisboa?q=sofa";
    - "/products/Casa-Lisboa/Glam-Velvet-Sofa?variant=x lands on /products/casa-lisboa/glam-velvet-sofa?variant=x";
    - "/embed/products/Casa-Lisboa/Glam-Velvet-Sofa lands on the lower-case embed path";
    - "a tenant product route /products/Glam-Velvet-Sofa lands on /products/glam-velvet-sofa";
    - "Back to catalog from a preview product page keeps ?preview=1" (R-W4-11);
    - "a product with a CTA url and an empty label shows 'Contact the store' as the link text";
    - "in PT, the catalog is sorted by the Portuguese names" (two products whose EN and PT orders differ);
    - "CatalogPage refetches products on focus once the data is older than MEDIA_REFRESH_MS" (fake `Date`, as `components.test.tsx` does);
    - "signed out, /catalog/oak-ember shows 'Catalog not found'" (R-W8-2);
    - "a stale product page whose refetch returns NOT_FOUND after a rename shows 'Product not available', and the AR button is gone" (R-W4-8; Review Focus 1);
    - "a stale product page whose refetch returns NOT_FOUND after unpublish shows 'Product not available', and the AR button is gone" (R-W4-8);
    - the same R-W4-8 cases for the embed;
    - vercel.json:
      - "/embed/products/a/b gets X-Robots-Tag: noindex";
      - "a rule with has:[{type:'query', key:'preview'}] and source '/(.*)' sets X-Robots-Tag: noindex";
      - "/catalog/casa-lisboa without a query gets no X-Robots-Tag from any rule without a has".
  - The editor (`publicFixes.test.tsx`, through `ProductEditorPage` in the demo): "saving a product with a link and no label shows 'Add a button label, or remove the link.' under Button label".
  - Mock (`demoRules.test.ts`):
    - "signed out, getBusinessBySlug('oak-ember') is NOT_FOUND; as super_admin or as the business_admin of biz_oak it is returned" (Review Focus 2); the same for `getCatalog` and `getPublicProduct`;
    - "deleteBusiness removes owners[id] and the business's ownerInviteAttempts".
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/lib/urls.test.ts src/services/validation.cta.test.ts src/features/public/publicFixes.test.tsx src/services/mock/demoRules.test.ts`
- [ ] **Step 3: Implement.**
  - `catalogLocalPath` with `URLSearchParams`.
  - `LowercaseSlugs`, wrapping `/catalog/:businessSlug`, `/products/:businessSlug/:productSlug` and `/embed/products/:businessSlug/:productSlug`, plus the tenant `/products/:productSlug` and `/embed/products/:productSlug`.
  - `ProductPage`: `catalogHref = tenantSlug ? tenantCatalogPath({ preview: canPreview }) : catalogLocalPath({ slug: businessSlug }, { preview: canPreview })`.
  - The CTA text falls back to `t('product.contactStore')` when `localized(product.cta.label).trim()` is empty.
  - `CatalogPage`:
    - add `const MEDIA_REFRESH_MS = (MEDIA_URL_TTL_SECONDS * 1000) / 2`;
    - add `useRefreshWhenStale(products.refetch, MEDIA_REFRESH_MS, products.data)`;
    - sort with `localized(a.name).localeCompare(localized(b2.name), lang)`.
  - `ProductPage` and `EmbedProductPage`: the `gone` condition in the Interfaces section.
  - The `validateProductDraft` rule and the editor wiring.
  - `vercel.json`: two header rules, `{ "source": "/embed/(.*)", "headers": [{ "key": "X-Robots-Tag", "value": "noindex" }] }` and `{ "source": "/(.*)", "has": [{ "type": "query", "key": "preview" }], "headers": [{ "key": "X-Robots-Tag", "value": "noindex" }] }`.
  - Mock:
    - `demoViewer()`, and `demoCanRead(b)` = `b.status === 'active'` or a `super_admin` viewer or that business's `business_admin`, applied in `getBusinessBySlug`, `getCatalog` and `getPublicProduct`;
    - `deleteBusiness`: `delete d.owners?.[id]` and drop the business's `ownerInviteAttempts` (as the cascade does).
- [ ] **Step 4: Run the tests again** (expected PASS). Then run `npx vitest run src/features/public src/features/products src/services`. Update only the existing assertions that R-W8-2 changes. Then `npm run typecheck` and `npm run lint`. Check `/catalog/Casa-Lisboa`, a product page in PT, and `/catalog/oak-ember` signed out, at 1440 and 390.
- [ ] **Step 5: Commit.** Message "S2 Task 1: public page fixes, stale pages give way, the demo follows the real rules".

### Task 2: Read-only business form, field limits, the owner's closure notice

Closes **R-W3-5** (BIZ-05), **R-W3-7** (BIZ-09) and the BIZ-08 part of **R-W3-6**. S1.5 Task 3 did the BIZ-02 part.

**Files:**
- Migration, Task 2 section: `create or replace public.admin_review_application(uuid, text, text)`.
  - Copy the **latest** body: the S1.5 Task 16 section. Grep the S1.5 migration to make sure no later section redefines it.
  - Change only `left(coalesce(v_app.answers ->> 'description', ''), 5000)` to `…, 1000)`.
  - The signature, grants and everything else stay the same.
  - Rollback, Task 2 section: restore the S1.5 Task 16 body, with its grants.
- Create:
  - `src/features/businesses/BusinessReadOnly.tsx` and `BusinessReadOnly.test.tsx`
  - `src/services/validation.business.test.ts`
  - `src/components/layout/CatalogStatusNotice.test.tsx`
  - `src/services/supabase/uploadForbidden.test.ts`
- Modify:
  - `src/services/validation.ts` (`validateBusiness`, `BUSINESS_LIMITS`)
  - `src/lib/slug.ts` (`BUSINESS_SLUG_MAX`, `slugInput(input, max?)`) and `src/lib/lib.test.ts`
  - `src/features/businesses/BusinessForm.tsx` (regions in the table) and `BusinessForm.test.tsx`
  - `src/features/admin/BusinessDetailPage.tsx` (the details tab) and `BusinessDetailPage.test.tsx`
  - `src/services/supabase/supabaseCatalogService.ts` (`uploadAsset` error line, `isStorageForbidden`)
  - `src/components/layout/DashboardShell.tsx` (`CatalogStatusNotice`)
  - `src/features/businesses/closure.ts` (`OWNER_CLOSURE_LINE`)
  - `src/features/business/BusinessOverviewPage.tsx` (`ClosureBanner` line) and `ownerDashboard.test.tsx`
  - `src/features/settings/sections/AccountSection.tsx` (the closure status line) and `AccountSection.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export const BUSINESS_LIMITS = { name: 80, slug: 63, description: 1000, email: 320, phone: 50, address: 500 } as const  // validation.ts
  export const BUSINESS_SLUG_MAX = 63                                   // slug.ts
  export function slugInput(input: string, max?: number): string        // cuts to max when given
  export function BusinessReadOnly(props: { business: Business }): ReactElement
  export const OWNER_CLOSURE_LINE: Record<BusinessStatus, string>      // closure.ts; values in "Copy decided here"
  export function isStorageForbidden(e: { statusCode?: string | number; message?: string }): boolean  // 403, or a message containing 'row-level security'
  ```
- Consumes: `useCan()`, `account.getSecurityState()`, `settingsPath('business', 'account')`.

- [ ] **Step 1: Write the failing PGlite test** (`describe('S2 Task 2: one description limit')`, with `ids(2)`):
  - "approving an application whose answers.description has 1200 characters creates a business whose description has 1000";
  - "after the S2 rollback, pg_get_functiondef(admin_review_application) equals the one on freshDb(UP_TO_S15)".
- [ ] **Step 2: Write the failing unit and component tests.**
  - `validation.business.test.ts`:
    - "a 501-character address gives fieldErrors['contact.address'] = 'Use 500 characters or fewer.'";
    - the same at the limits for slug 64 → `slug`, email 321 → `contact.email`, phone 51 → `contact.phone`, description 1001 → `description`;
    - "exactly at each limit is valid".
  - `lib.test.ts`: "slugInput('a'.repeat(70), 63) has length 63; slugInput without max is unchanged".
  - `BusinessForm.test.tsx`:
    - "inputs carry maxLength name 80, slug 63, description 1000, email 320, phone 50, address 500";
    - "a 501-character address shows 'Use 500 characters or fewer.' and makes no service call";
    - "the status select shows only with businesses.status";
    - "a stored 1200-character description gets the description field error on save, not only a toast" (Review Focus 3).
  - `BusinessReadOnly.test.tsx`:
    - "renders the name, catalog address, contact and status as text, with no input, textbox, select or button";
    - "shows 'You can view this business. Editing needs 'Create and edit businesses'.'".
  - `BusinessDetailPage.test.tsx`: "a default Team member (businesses.view only) sees no editable inputs on the details tab"; "an Admin with businesses.edit sees the form".
  - `uploadForbidden.test.ts`: "an upload refused with statusCode 403 / 'new row violates row-level security policy' maps to teamFail('forbidden')"; "another storage error stays STORAGE".
  - `CatalogStatusNotice.test.tsx`:
    - "with an open closure and status inactive: 'Your catalog is offline because you asked to close your account. To keep it, cancel the request in My account.', and 'My account' links to settingsPath('business','account'); the 'Your catalog is paused' notice is absent";
    - "without a closure: today's paused and draft notices";
    - "while the security state loads, nothing shows; on its error, the status notice shows".
  - `ownerDashboard.test.tsx` and `AccountSection.test.tsx`: "the closure line reads 'Closure requested on {date} · ' + OWNER_CLOSURE_LINE[status]"; "a draft status reads 'Your catalog is not public yet.'".
- [ ] **Step 3: Run them and confirm they fail.** `npx vitest run supabase/tests/s2BusinessLogic.test.ts -t "S2 Task 2" src/services/validation.business.test.ts src/lib/lib.test.ts src/features/businesses src/features/admin/BusinessDetailPage.test.tsx src/services/supabase/uploadForbidden.test.ts src/components/layout/CatalogStatusNotice.test.tsx src/features/business/ownerDashboard.test.tsx src/features/settings/sections/AccountSection.test.tsx`
- [ ] **Step 4: Write the SQL section and its rollback section.**
- [ ] **Step 5: Implement.**
  - `validateBusiness` uses `BUSINESS_LIMITS` (trimmed lengths; the existing name rule keeps its message).
  - `BusinessForm`:
    - `maxLength` from `BUSINESS_LIMITS`;
    - `error` props for `description`, `contact.phone` and `contact.address`;
    - the status select shows only when `mode === 'edit' && can('businesses.status')`;
    - `slugInput(…, BUSINESS_SLUG_MAX)`.
  - `BusinessDetailPage`: `can('businesses.edit') ? <BusinessForm …/> : <BusinessReadOnly business={b} />`.
  - `uploadAsset`: `if (error) return isStorageForbidden(error) ? teamFail('forbidden') : fail('STORAGE', …)`.
  - `CatalogStatusNotice`: reads `account.getSecurityState()`. The owner closure notice replaces the status notice only when `security.data.closure` is set and `business.status !== 'active'`.
  - `ClosureBanner` and `AccountSection`: use `OWNER_CLOSURE_LINE[business.status]` from `useAccount()`.
- [ ] **Step 6: Run the tests again** (expected PASS). Then run `npx vitest run supabase/tests` and the existing `src/features/admin` and `src/features/settings` suites, then `npm run typecheck` and `npm run lint`. Check `/admin/businesses/:id` as the demo Team member and Owner, and `/dashboard` as the owner of `biz_oak` (the seeded closure), at 1440 and 390.
- [ ] **Step 7: Commit.** Message "S2 Task 2: read-only business form, field limits, the owner's closure notice".

### Task 3: No logo left behind, and a partial file clean-up is reported

Closes **R-W3-4** (BIZ-06, ruling 12).

**Files:**
- Create:
  - `src/features/shared/storageSweep.ts` and `storageSweep.test.ts`
  - `src/services/supabase/storageSweep.test.ts` (fake client, as `variantMedia.test.ts` builds one)
  - `src/features/businesses/useBusinessActions.test.tsx`
  - `src/features/businesses/logoMove.test.tsx`
- Modify, in the regions in the table:
  - `src/services/catalogService.ts` (`StorageSweep` and `CreatedBusiness` next to `UploadedAsset`; the `createBusiness`, `deleteBusiness` and `deleteProduct` signatures)
  - `src/services/supabase/supabaseCatalogService.ts`
  - `src/services/mock/mockCatalogService.ts`
  - `src/features/businesses/useBusinessActions.ts`
  - `src/features/products/useProductActions.tsx` and `useProductActions.test.tsx`
  - `src/features/businesses/BusinessForm.tsx` (the create toast block)
  - any test that asserts `deleteBusiness` or `deleteProduct` resolves `undefined`

**Interfaces:**
- Produces:
  ```ts
  export interface StorageSweep { removedFiles: number; failedFiles: number }   // catalogService.ts
  export type CreatedBusiness = Business & { logoMoveFailed?: true }
  createBusiness(data: BusinessInput): Promise<Result<CreatedBusiness>>
  deleteBusiness(id: ID): Promise<Result<StorageSweep>>
  deleteProduct(id: ID): Promise<Result<StorageSweep>>
  export function stagedLogoPath(url: string | undefined): string | null      // supabaseCatalogService.ts: 'new/<file>' for a logo-bucket URL in new/, else null
  export function deletedToast(subject: 'Business' | 'Product', s: StorageSweep): string  // storageSweep.ts
  ```
- Rules:
  - `removeFolder(bucket, folder): Promise<{ removed: number; failed: number }>`.
    - It lists pages of 1000 with `offset` until a short page.
    - It removes each page.
    - A failed `remove` adds that page's count to `failed`.
    - A page that can't be listed adds 1 to `failed` and stops (the real number is unknown, and the toast must never claim zero).
  - `removeUnreferencedMedia` returns `{ removed, failed }`.
    - A failed reference check keeps the files and counts them as `failed`.
    - A failed `remove` counts the orphans as `failed`.
    - `updateProduct` ignores the result.
  - `deleteBusiness` sums the media folder, the logo folder and the owned logo.
  - `createBusiness`: when `stagedLogoPath(input.logoUrl)` is set after a **successful** insert:
    - it moves the logo to `<id>/<file>`;
    - it updates `logo_url` to the new public URL;
    - if the move or the update fails, it returns the business with `logoMoveFailed: true`.
  - The mock resolves `{ removedFiles: 0, failedFiles: 0 }` and never sets `logoMoveFailed` (demo logos are data URLs).
  - Toasts:
    - `deletedToast('Business', {failedFiles: 0})` is "Business deleted".
    - With 2 it is "Business deleted, but 2 files could not be removed from storage." (with 1 the word is "file"). The same for "Product".
    - A sweep with failures uses `toast.info(…)`, otherwise `toast.success(…)`.
    - A create with `logoMoveFailed` uses `toast.info('Business created', "The logo couldn't be moved into the business folder; upload it again.")`.

- [ ] **Step 1: Write the failing tests.**
  - `storageSweep.test.ts` (unit): the three toast strings above.
  - Supabase `storageSweep.test.ts`:
    - "removeFolder pages past 1000 objects (1001 files: two list calls, removedFiles 1001)";
    - "deleteBusiness returns failedFiles 2 when remove fails for a page of 2";
    - "an unlistable folder counts as 1 failed file";
    - "deleteProduct returns the orphan count as removedFiles; a failed reference check keeps the files and counts them as failedFiles";
    - "createBusiness with a new/ logo moves it to <id>/ and updates logo_url to the new public URL";
    - "a failed move keeps the business and returns logoMoveFailed: true";
    - "a logo outside new/ is not moved";
    - "a refused insert never calls storage.move" (Review Focus 4).
  - `useBusinessActions.test.tsx`: "the toast reads 'Business deleted, but 2 files could not be removed from storage.' when failedFiles is 2, and 'Business deleted' when 0".
  - `useProductActions.test.tsx`: "'Product deleted, but 1 file could not be removed from storage.'".
  - `logoMove.test.tsx` (spy on `service.createBusiness`): "a create that returns logoMoveFailed shows 'Business created' with \"The logo couldn't be moved into the business folder; upload it again.\"".
  - Mock (in `storageSweep.test.ts` or `useBusinessActions.test.tsx`): "mock deleteBusiness and deleteProduct resolve { removedFiles: 0, failedFiles: 0 }".
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/features/shared/storageSweep.test.ts src/services/supabase/storageSweep.test.ts src/features/businesses/useBusinessActions.test.tsx src/features/businesses/logoMove.test.tsx src/features/products/useProductActions.test.tsx`
- [ ] **Step 3: Implement** the types, the services (Supabase and mock), `deletedToast`, the two hooks and the create toast.
- [ ] **Step 4: Run the tests again** (expected PASS). Then run `npx vitest run src/services src/features/admin src/features/businesses src/features/products` and update any existing assertion of `ok(undefined)` (the commit body names R-W3-4). Then `npm run typecheck` and `npm run lint`. In the demo, check business create with a logo, and business and product delete, at 1440 and 390.
- [ ] **Step 5: Commit.** Message "S2 Task 3: move the staged logo, report a partial file clean-up".

### Task 4: E2E journeys, docs and the S2 release runbook

Runs after Tasks 1–3 are merged. It covers all of them.

**Files:**
- Modify (e2e, demo mode):
  - `tests/e2e/public.spec.ts`:
    - signed out, `/catalog/oak-ember` shows "Catalog not found";
    - `/catalog/Casa-Lisboa?q=sofa` → `/catalog/casa-lisboa?q=sofa`.
  - `tests/e2e/business-crud.spec.ts`:
    - the demo Team member sees the read-only form note;
    - a 501-character address gets "Use 500 characters or fewer.".
  - `tests/e2e/product-crud.spec.ts`: a link with no label gets "Add a button label, or remove the link.".
  - `tests/e2e/settings.spec.ts`: as the owner of `biz_oak` (seeded closure), the dashboard shows the closure notice and not "Your catalog is paused.".
  - `tests/e2e/responsive.mobile.spec.ts`: the read-only business form at 390.
- Modify (docs):
  - `System_arch/design/14-features-public.md`: lower-case addresses, noindex, refresh, CTA fallback, PT order, and the stale product page replaced by "not available" (R-W4-8).
  - `System_arch/design/19-supabase.md`: the 1000-character description in `admin_review_application`.
  - `System_arch/design/08-tenancy-urls.md`: the `category` option of `catalogLocalPath`.
  - `System_arch/design/13-features-business.md`: the owner closure notice.
  - `docs/SECURITY_REVIEW.md`:
    - the PUB-04 window: signed URLs stay valid for up to 12 h in pages already open (§1.3);
    - storage-RLS errors mapped to "no permission".
  - `docs/OPERATIONS_RUNBOOK.md`: a new section "S2 business-logic release", below the S1.5 one:
    1. the owner's go-ahead for `zggylkbgajamhriebdrg`;
    2. `supabase db push` (never `config push`). The only schema change is the 1000-character description in `admin_review_application`;
    3. `npm run db:types` (expected: no diff);
    4. no Edge Function deploy and no new secrets;
    5. the frontend to the Preview, then to production only when the owner asks (the `vercel.json` headers ship with it);
    6. mixed versions: an old frontend works against the new database, and a new frontend works against the old one (the description is cut to 1000 on the form, and the database still allows 5000);
    7. rollback: the S2 script before the S1.5 one. It loses no data.
  - `docs/TEST_PLAN.md`, live checks:
    - `curl -sI <preview>/embed/products/<b>/<p>` and `curl -sI '<preview>/catalog/<b>?preview=1'` show `x-robots-tag: noindex`;
    - deleting a QA business with a logo leaves `business-logos/new/` empty.
  - `docs/CLIENT_HANDOVER.md`:
    - §2/§3: view-only staff see a read-only form; the field limits;
    - §4: the button label rule;
    - §10: the 12-hour signed-URL window.
  - Where `docs/PRD.md`, `docs/PRODUCTION_READINESS.md` or `System_arch/HANDOFF.md` list BIZ-04, PUB-03/PROD-06 (history part) or PUB-02/BIZ-03 as planned for S2, mark them "dropped by the owner (2026-10-26)". Also update `System_arch/Task.md` and these three for the built items.
  - `System_arch/tasks/P12-team-roles-and-addons.md`: the S2 line marks these R-IDs built, with this plan's path, and lists the dropped ones.
  - `docs/superpowers/plans/2026-10-26-next-scope.md`: S2 "Keep" item 2 marked as built (release pending).
  - `docs/superpowers/plans/2026-10-26-business-logic-fixes.md` ("Moved out" table): the rows R-W3-1, the slug-history part of R-W3-2 and PUB-02/BIZ-03 get the Target "Dropped (owner, 2026-10-26)"; each other S2 row's Target becomes "S2 plan Task N".

**Interfaces:**
- Consumes: every earlier task.

- [ ] **Step 1: Write the e2e journeys** above, at 1440 (`--project=desktop`), plus the `*.mobile.spec.ts` case at 390.
- [ ] **Step 2: Run them.**
  - Run `npx playwright test tests/e2e/public.spec.ts tests/e2e/business-crud.spec.ts tests/e2e/product-crud.spec.ts tests/e2e/settings.spec.ts --project=desktop`, then `npx playwright test tests/e2e/responsive.mobile.spec.ts --project=mobile`, then `npx playwright test tests/e2e/a11y-dashboard.spec.ts --project=desktop` and `npx playwright test --project=guard`.
  - Expected: all pass, and the pixel guard stays 14/14.
  - If the guard fails only on a page whose copy an S2 requirement changed, stop and report the diff. Never update a baseline without the owner's OK.
- [ ] **Step 3: Write the docs above.** No personal name or Gmail address in client material.
- [ ] **Step 4: Run the full gates.** `npm run typecheck && npm run lint && npm test && npm run build` all pass, and so does `npx vitest run supabase/tests`.
- [ ] **Step 5: Tick and commit.**
  - Tick S2 "Working business logic" in the P12 task file with a note, and update the phase row in `Task.md`.
  - Message "S2 Task 4: e2e journeys, runbook, security and client docs".

## Coverage

| R-ID | Finding | Task |
|---|---|---|
| R-W4-8 | PUB-04 (built part) | 1 (the 12 h window documented in Task 4) |
| R-W8-2 (owners cleared on delete; signed-out visibility) | BIZ-10 | 1 (application-link bullets: S1.5 Task 16; closure bullets: S1.5 Task 14) |
| R-W4-9 | PUB-05 | 1 |
| R-W4-10 | PUB-07 | 1 |
| R-W4-11 | PUB-08 | 1 |
| R-W4-12 | PUB-09 (noindex) | 1 |
| R-W4-13 | PUB-10 | 1 |
| R-W3-5 | BIZ-05 | 2 |
| R-W3-6 (BIZ-08 part) | BIZ-08 | 2 |
| R-W3-7 | BIZ-09 | 2 |
| R-W3-4 | BIZ-06 | 3 |
| e2e, runbook, docs | — | 4 |
| R-W3-1, R-W3-2 (slug-history part), ruling 9 | BIZ-04, PUB-03 = PROD-06, PUB-02 = BIZ-03 | removed by the owner (2026-10-26) |

**Not in this plan:**
- the online/offline switch and platform suspend;
- the platform inbox setting;
- the privacy must-haves;
- the product-editor fixes (R-W4-2 to R-W4-7, R-W4-14), and R-W3-2's published-slug confirmation;
- everything in the "Dropped" list of the next-scope plan;
- PUB-09's per-page title and description;
- the address redirect and the unavailable-catalog page (see "Removed by the owner").

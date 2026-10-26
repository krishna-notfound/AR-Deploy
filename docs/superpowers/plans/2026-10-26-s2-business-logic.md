# S2 "Working business logic": Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** build the business-logic audit fixes that the owner moved from S1.5 to S2. Old catalog and product addresses redirect, so printed QR codes keep working. A paused catalog says "unavailable" instead of "not found". View-only staff get a read-only business form, and every business field limit is checked on the form. Logos are moved and a partial file clean-up is reported. The public-page fixes land, and the demo follows the real rules for deleting a business and for what signed-out visitors can see.

**Architecture:**
- **Database:** one new migration (`s2_business_logic`) with a marked section per task. Only Task 1 (address history, `public_slug_redirect`, `public_catalog_state`) and Task 3 (the 1000-character description in `admin_review_application`) write SQL.
- **Edge Functions:** none change in S2.
- **Client:** changes go through `src/services` (the Supabase service and the mock together), `src/lib/urls.ts` and the public and dashboard pages.
- **Redirects:** they happen in the browser. When a public read returns `NOT_FOUND`, one new component asks the service how to resolve the address: redirect, unavailable or not found.
- **Build order:** Tasks 1–4 are built in parallel in separate worktrees. Their shared-file edits are fenced (see "Parallel build"). Task 5 runs last and adds the e2e journeys and the docs.

**Tech stack:** React 19, React Router 8, Tailwind 4, TypeScript 6, Vitest + Testing Library, PGlite (`@electric-sql/pglite`), Playwright, Supabase (supabase-js 2.117.3).

**Spec:** `docs/superpowers/specs/2026-10-26-business-logic-fixes-design.md`. `R-Wn-k`, `§` and the copy below point into it (§4 W3, §5 W4, §9 W8, §10.1, §10.2, §14).
- **Scope:** the owner's decision in `docs/superpowers/plans/2026-10-26-next-scope.md` §S2 "Keep" item 2, and the rows that `docs/superpowers/plans/2026-10-26-business-logic-fixes.md` ("Moved out of S1.5") gives to S2.
- **Binding rulings:** in `docs/audits/2026-10-26-business-logic/RULINGS.md`. Ruling 9 is the unavailable catalog, ruling 10 the addresses and ruling 12 the deletion leftovers.
- **Evidence:** with file:line, in `docs/audits/2026-10-26-business-logic/{BIZ,PUB}.md`.
- **Not in this plan:** the "To confirm" and "Dropped" items, and R-W3-2's published-slug confirmation (S4).

## Global Constraints

- **Base and branches:**
  - Start only after S1.5 is fully merged into `feature/sanctus-brand-design-system` (Tasks 1–18 and the Task 15 e2e branch `s15/e2e`) and has passed its final review.
  - The controller makes the wave-setup commit (below) on that branch.
  - Tasks 1–4 each run in their own worktree (`C:/Users/krishna/Desktop/arw-s2-tN`, branch `s2/bl-tN`), cut from the wave-setup commit, in parallel. They are merged in the order 1, 2, 3, 4.
  - Task 5 is cut after all four are merged.
  - Run `npm ci` if `node_modules` is missing. Set `E2E_PORT` to a free port before Playwright.
  - Never push. Never touch `main`.
- **Parallel rules (Tasks 1–4; same as S1.5 `PARALLEL.md`):**
  - Run only the focused tests for the files you change, plus your own `-t "S2 Task N"` PGlite describe, plus any existing suite whose assertion you change.
  - Run `npm run typecheck` and `npm run lint` once, at the end.
  - Don't run the full `npm test`, `npm run build` or Playwright. The controller runs the full gates after merging the wave, and Task 5 runs them again.
  - Never use `git stash`, `git reset --hard`, `git clean`, or `git checkout -- <file>` outside your worktree.
- **Commits:** `git -c user.name=krishna -c user.email=krishnagtkr@gmail.com commit`, with **no co-author line**. The message is `S2 Task N: <title>`. When a commit changes an existing assertion, its body names the R-ID that changed it.
- **Nothing remote:** no `supabase db push`, no `config push`, no `npm run db:types`, no function deploy, no call to a hosted project. Release follows the runbook that Task 5 writes, and only with the owner's go-ahead.
- **One migration, by section:**
  - The file is `supabase/migrations/<ts>_s2_business_logic.sql`. The wave setup makes it with `npx supabase migration new s2_business_logic`.
  - A task appends exactly one section at the end:
    ```sql
    -- =============================================================================
    -- S2 Task N: <title> (R-IDs)
    -- =============================================================================
    ...
    -- ---- end S2 Task N ----
    ```
  - A task never edits another section.
  - A function that S1.5 already redefined is `create or replace`d starting from the **latest** body in `supabase/migrations/20261026041731_business_logic_fixes.sql`.
- **One rollback script:**
  - The file is `supabase/rollback/20261026_s2_business_logic_rollback.sql`.
  - Each task inserts its section directly below `begin;`, marked `-- S2 Task N rollback: …` / `-- ---- end S2 Task N rollback ----`.
  - It runs **before** the S1.5 rollback.
  - It restores the S1.5-era bodies and drops what S2 added.
- **PGlite tests:**
  - All new database tests go in `supabase/tests/s2BusinessLogic.test.ts`, one `describe('S2 Task N: …')` per task, appended at the end. They use the harness (`freshDb`, `makeHelpers`, `ids(N)`).
  - Names go onto the list with `GONE_AFTER_ROLLBACK.push(...)` inside your own describe.
  - Fixture emails are `s2tN-<who>@test`.
  - An existing suite that asserts behaviour S2 deliberately changes gets only that one assertion updated.
- **SQL rules:**
  - Every new table has RLS on, `revoke all … from public, anon, authenticated`, then explicit grants.
  - Every new function is `security definer` with `set search_path = ''`, `revoke execute … from public`, and explicit grants.
  - Private trigger functions are revoked from `anon` and `authenticated`.
  - Access checks use only the S1 gated helpers (`is_platform_admin`, `platform_can`, `is_business_member`).
- **Client:**
  - UI reads data only through `src/services`.
  - URLs are built only in `src/lib/urls.ts`.
  - Every service change lands in the Supabase service **and** the mock in the same task.
  - New RPCs and tables go by hand into `src/services/supabase/database.types.ts` (Task 1 only).
  - `unavailableService` is a Proxy and needs no change.
- **Demo mode:**
  - It works with no env vars.
  - It never falls back to demo data after a Supabase error.
  - No `VITE_*` secret.
- **Copy:**
  - Dashboards are English, using the exact strings in the spec (§4, §5, §10.2) and in "Copy decided here" below.
  - Public pages are EN and PT, through `t()` and `src/i18n/dictionaries/{en,pt}.ts` (Task 1 is the only task that edits the dictionaries).
- **Owner's files:** never edit `src/features/marketing/LandingPage.tsx`. Its `?category=` line stays as it is (§1.6).
- **AR (ADR-0021):** no AR mode or launch change. R-W4-8 only removes the whole product view, AR button included, when the product is gone.
- **Quality bar:**
  - No dead buttons: a hidden action is hidden, not disabled.
  - Every data view has loading, empty and error states.
  - No new dependency.
  - Tokens come from `src/index.css`.
  - A touched route is checked at 1440 and 390 px in the demo.
- **Test commands:**
  - PGlite: `npx vitest run supabase/tests/s2BusinessLogic.test.ts -t "S2 Task N"`
  - all DB suites: `npx vitest run supabase/tests`
  - unit or component: `npx vitest run <paths>`
  - e2e (Task 5): `npx playwright test <spec> --project=desktop`, then `--project=mobile`, then `--project=guard`

### Copy decided here (the spec folds PUB-02 into S2 without copy)

| Where | EN | PT |
|---|---|---|
| `catalog.inactiveBodyNamed` (inactive catalog, name known) | {name} has paused its online catalog. Please contact the store directly. | {name} suspendeu o catálogo online. Contacte a loja diretamente. |
| `catalog.notOpenBody` (draft catalog, no name) | This catalog is not open to the public yet. Please check back later. | Este catálogo ainda não está aberto ao público. Volte mais tarde. |
| Business slug hint, edit mode (English) | Old links and printed QR codes redirect to the new address while the catalog is live. (The demo suffix is kept.) | — |
| Owner closure sentence by real status (English) | `inactive`: "Your catalog is offline." · `draft`: "Your catalog is not public yet." · `active`: "Your catalog is still live." | — |
| Storage sweep toast with 1 file | "Business deleted, but 1 file could not be removed from storage." (the same for "Product") | — |
| Field limits (`validateBusiness`) | "Use {n} characters or fewer." | — |

The title stays the existing `catalog.inactiveTitle`. Remove `catalog.inactiveBody` from both dictionaries if nothing uses it afterwards.

## Parallel build: who touches which shared file

Every other file in a task's **Files** list belongs to that task alone. For these shared files, each task edits **only** the region named here. It adds new imports as **new lines** (it never rewrites an existing import line, except the one named).

| File | Task 1 | Task 2 | Task 3 | Task 4 |
|---|---|---|---|---|
| `src/features/public/CatalogPage.tsx` | the `if (!b)` and `if (!showCatalog)` branches; one new import line below `./PublicShell` | the `useRefreshWhenStale` call right after the `products` query; the `all` sort line; extends the `@/services/hooks` import | — | — |
| `src/features/public/ProductPage.tsx` | the `if (!res.data \|\| ownerMismatch)` block and its condition; one new import line | the `catalogHref` line; the CTA label in `ProductView`; extends the `@/lib/urls` import | — | — |
| `src/lib/urls.ts` | appends `addressRedirectTarget` at the end of the file | `catalogLocalPath` only | — | — |
| `src/services/catalogService.ts` | `AddressResolution` and the two message constants next to `REOPEN_NOT_ALLOWED_ERROR`; `resolvePublicAddress` directly above `uploadAsset(` | — | — | `StorageSweep` and `CreatedBusiness` next to `UploadedAsset`; the `createBusiness`, `deleteBusiness` and `deleteProduct` signatures |
| `src/services/supabase/supabaseCatalogService.ts` | `DB_RULES` entries; `duplicateProduct`'s taken-slug list; `resolvePublicAddress` directly above the `// ---------------- files` comment | — | the `if (error)` line in `uploadAsset`; a new exported `isStorageForbidden` placed directly below the `mapDbError` function | `removeFolder`, `removeUnreferencedMedia`, `createBusiness`, the bodies of `deleteBusiness` and `deleteProduct`; a new exported `stagedLogoPath` next to `ownedLogoPath` |
| `src/services/mock/mockCatalogService.ts` | `getBusinessBySlug`, `getCatalog`, `getPublicProduct`, the history checks in `createBusiness`/`updateBusiness`/`createProduct`/`updateProduct`/`duplicateProduct`; in `deleteBusiness` and `deleteProduct` **only new lines at the top of the `store.update` callback**; `resolvePublicAddress` | — | — | only the final `return ok(undefined)` line of `deleteBusiness` and `deleteProduct` |
| `src/services/validation.ts` | — | `validateProductDraft` (one rule) | `validateBusiness` and a new `BUSINESS_LIMITS` constant | — |
| `src/features/businesses/BusinessForm.tsx` | the slug confirm body (the "Printed QR codes…" paragraph) and the edit-mode slug hint string | — | `maxLength` attributes, field `error` props, the status select condition, and `slugInput(…, BUSINESS_SLUG_MAX)` | the `if (!business) { toast… }` block after a create |

**Merge:**
- The controller merges in task order. It uses the S1.5 helpers (`.superpowers/sdd/2026-10-26-business-logic-fixes/merge-task.sh` and `secmerge.py`), copied with the S2 paths and the `S2 Task` marker. Don't use git's union driver.
- If git conflicts in a table row above, it is two edits next to each other: keep both sides.

## Wave setup (controller, one commit, before Tasks 1–4)

- [ ] **Step 1: Create the migration and the rollback script.**
  - Run `npx supabase migration new s2_business_logic`.
  - The migration gets a header comment only: spec, scope, the section format, and the SQL rules above.
  - Create `supabase/rollback/20261026_s2_business_logic_rollback.sql`. Its header says:
    - run it as the database owner, **before** `20261026_business_logic_fixes_rollback.sql`;
    - DATA LOSS: the address history is dropped, so old addresses stop redirecting and are no longer reserved;
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

1. **A redirect that points at the address already open.** This happens when a read fails for another reason while the slugs are current. Expected: `public_slug_redirect` returns null when the result equals the input, and `UnresolvedAddress` never navigates to the current location (no loop). It shows the not-found view instead. (Task 1 tests: "a current slug of an active business returns null", and "a redirect to the current location renders the not-found view".)
2. **An old QR code of a paused store.** A retired slug of an `inactive` business. Expected: "This catalog is currently unavailable" with the store's name, not "not found" and not a redirect. (Task 1 SQL test: "a retired slug of an inactive business is unavailable with its name". Component test: "/catalog/<retired slug of a paused store> shows the named unavailable message".)
3. **A product renamed while a visitor's tab is open.** The focus refetch returns `NOT_FOUND`. Expected: the stale view is replaced, and the tab lands on the new address with `?variant=` kept. It never keeps showing the old product and its AR button. (Task 1 test: "a stale product page whose refetch returns NOT_FOUND after a rename lands on the new slug with ?variant kept".)
4. **An existing business whose description is longer than 1000 characters.** Up to 5000 was allowed before. Expected: saving any field shows "Use 1000 characters or fewer." on the description field, not a generic failure toast. The DB keeps its 5000 cap. (Task 3 test: "a stored 1200-character description gets the description field error on save".)
5. **A create with a staged `new/` logo that the database refuses.** For example, a retired or taken slug. Expected: no storage move is attempted, the field error shows, and there is no "Business created" toast. (Task 4 test: "a refused insert never calls storage.move".)

---

### Task 1: Old addresses redirect, paused catalogs say "unavailable", stale pages give way

Closes **R-W3-1** (BIZ-04), **R-W3-2** (PUB-03 = PROD-06; the history and redirect part, not the published-slug confirmation, which goes to S4), **PUB-02 = BIZ-03** (ruling 9), **R-W4-8** (PUB-04, the built part), and the rest of **R-W8-2** (BIZ-10): a mock business delete clears its owners, and signed-out visitors can't read non-active businesses in the demo. Task 16 of S1.5 already did the application-link bullets and the delete-dialog line.

**Files:**
- Migration, Task 1 section:
  - Tables:
    - `public.business_slug_history`: `slug text primary key` (the `businesses.slug` format check, ≤ 63), `business_id uuid null references public.businesses on delete set null`, `retired_at timestamptz not null default now()`.
    - `public.product_slug_history`: `business_id uuid not null references public.businesses on delete cascade`, `slug text not null` (the product slug format check, ≤ 70), `product_id uuid not null references public.products on delete cascade`, `retired_at timestamptz not null default now()`, `primary key (business_id, slug)`.
    - Both: RLS on, `grant select to authenticated` only.
    - Select policies (§10.1): business history `is_platform_admin() or platform_can('businesses.view') or is_business_member(business_id)`; product history the same with `products.view`.
  - Triggers:
    - `private.guard_retired_business_slug()`: `BEFORE INSERT OR UPDATE OF slug` on `businesses`. It raises `slug_retired` (P0001) when the slug is in history with `business_id is distinct from new.id`. When the history row is this business's own, it deletes the row (reclaim).
    - `private.retire_business_slug()`: `AFTER UPDATE OF slug OR DELETE` on `businesses`.
      - A changed slug inserts `(old.slug, new.id)`.
      - A delete upserts `(old.slug, null)`.
    - `private.guard_retired_product_slug()`: `BEFORE INSERT OR UPDATE OF slug` on `products`. It raises `product_slug_retired` (P0001) when `(new.business_id, new.slug)` is in history for another product. A product's own row is deleted.
    - `private.retire_product_slug()`: `AFTER UPDATE OF slug` on `products`. It upserts `(new.business_id, old.slug, new.id)`.
  - Redefined: `private.unique_business_slug(text)`. Start from the `20261020091428` body (S1.5 never redefined it). The loop also skips slugs in `business_slug_history`.
  - `public.public_slug_redirect(p_business_slug text, p_product_slug text default null) returns jsonb` (stable, definer, `grant execute … to anon, authenticated`).
    - Business: resolve it by its current slug, else by history with `business_id is not null`. It must be `active`.
    - Product (when asked for): resolve it in that business by its current slug, else by `product_slug_history`. It must be `published`.
    - It returns `{business_slug}` or `{business_slug, product_slug}` with the **current** slugs.
    - It returns null when anything is missing or not live, and null when the result equals the input.
  - `public.public_catalog_state(p_slug text) returns jsonb` (stable, definer, anon and authenticated).
    - It resolves the business by its current slug, else by history with `business_id is not null`.
    - It returns `{"unavailable": true}` for `draft`, and `{"unavailable": true, "name": <name>}` for `inactive`.
    - It returns null for `active`, unknown or deleted. Nothing else is ever returned (no id, no status).
  - Backfill: insert into `business_slug_history` every `audit_events.metadata->>'from'` of `business_slug_changed` that:
    - matches the slug format;
    - is not a current slug.

    Use the newest row per slug. `business_id` is the event's business only if it still exists, else null. `on conflict do nothing`.
- Rollback, Task 1 section:
  - drop the four triggers, the two RPCs, the four trigger functions and the two tables;
  - restore `private.unique_business_slug` from `20261020091428`, including `revoke all … from public`.
- Create:
  - `src/features/public/UnresolvedAddress.tsx`
  - `src/features/public/unresolvedAddress.test.tsx`
  - `src/services/supabase/addresses.test.ts`
  - `src/services/mock/addresses.test.ts`
  - `src/lib/urls.redirect.test.ts`
  - `src/features/businesses/slugConfirm.test.tsx`
- Modify, in the regions in the "Parallel build" table:
  - `src/services/catalogService.ts`
  - `src/services/supabase/supabaseCatalogService.ts`
  - `src/services/supabase/database.types.ts` (the two tables, by hand, and the two functions)
  - `src/services/mock/mockCatalogService.ts`
  - `src/services/mock/db.ts`: optional `slugHistory`; the stored-data check accepts it missing
  - `src/services/mock/mockTeam.ts`: `demoViewer()` next to `demoPlatformRole()`
  - `src/lib/urls.ts`
  - `src/features/public/{CatalogPage,ProductPage,EmbedProductPage}.tsx`
  - `src/i18n/dictionaries/{en,pt}.ts` (the two keys in "Copy decided here")
  - `src/features/businesses/BusinessForm.tsx` (two copy strings)
  - `src/features/public/publicPages.test.tsx` and `embed.test.tsx`: only an existing assertion that the demo visibility rule changes; the commit body names R-W8-2

**Interfaces:**
- Produces (SQL): the two tables, `public_slug_redirect(text, text)`, `public_catalog_state(text)`, and the error keys `slug_retired` and `product_slug_retired` (P0001).
- Produces (TS):
  ```ts
  // src/services/catalogService.ts
  export type AddressResolution =
    | { kind: 'redirect'; businessSlug: string; productSlug?: string }
    | { kind: 'unavailable'; businessName?: string }
    | { kind: 'not_found' }
  resolvePublicAddress(businessSlug: string, productSlug?: string): Promise<Result<AddressResolution>>  // CatalogService member
  export const SLUG_RETIRED_MESSAGE = 'This address was used before and still belongs to another catalog. Choose another address.'
  export const PRODUCT_SLUG_RETIRED_MESSAGE = 'Another product in this catalog used this address before, and its old links still lead there. Choose another address.'
  // src/lib/urls.ts
  export function addressRedirectTarget(
    to: { businessSlug: string; productSlug?: string },
    from: { businessSlug: string; surface: 'catalog' | 'product' | 'embed'; tenant: boolean; search: string },
  ): { href: string; external: boolean }
  // src/features/public/UnresolvedAddress.tsx
  export function UnresolvedAddress(props: { businessSlug: string; productSlug?: string; surface: 'catalog' | 'product' | 'embed'; tenant: boolean; notFound: ReactNode }): ReactElement
  // src/services/mock/mockTeam.ts
  export function demoViewer(): { role: 'super_admin' } | { role: 'business_admin'; businessId: ID } | null
  ```
- Behaviour of `addressRedirectTarget`:
  - Not tenant: the local path through `catalogLocalPath` / `productLocalPath` / `productEmbedLocalPath`, plus `search`, with `external: false`.
  - Tenant with the same business slug: `tenantCatalogPath()` / `tenantProductPath` / `tenantProductEmbedPath`, plus `search`, with `external: false`.
  - Tenant with a changed business slug: `catalogPublicUrl` / `productPublicUrl` / `productEmbedUrl(b, p)`, plus `search`, with `external: true`.
- Behaviour of `UnresolvedAddress`:
  - While resolving: the loading spinner.
  - `redirect` → `<Navigate replace>`, or `window.location.replace` when external.
    - A target equal to the current location renders `notFound` instead (no loop).
  - `unavailable` on the `catalog` and `product` surfaces → `PublicMessage` with `PauseCircle` and `catalog.inactiveTitle`.
    - The body is `catalog.inactiveBodyNamed` when the name is known, else `catalog.notOpenBody`.
    - On `embed`, it renders `notFound`.
  - `not_found`, or a failed resolution → `notFound`.

- [ ] **Step 1: Write the failing PGlite tests.** Use `describe('S2 Task 1: address history, redirects and the unavailable catalog')` with `GONE_AFTER_ROLLBACK.push('public.business_slug_history', 'public.product_slug_history', 'public.public_slug_redirect(text, text)', 'public.public_catalog_state(text)', 'private.guard_retired_business_slug()', 'private.retire_business_slug()', 'private.guard_retired_product_slug()', 'private.retire_product_slug()')`. Seed with `ids(1)`: an Owner, a Team member (businesses.view and products.view), a stranger, and businesses `casa` (active), `paused` (inactive) and `fresh` (draft).
  - "changing casa to casa-lisboa writes casa to business_slug_history for that business".
  - "another business inserting or renaming to casa raises slug_retired; casa-lisboa taking casa back deletes the history row".
  - "deleting the business keeps casa reserved with business_id null, and a new business named casa raises slug_retired".
  - "unique_business_slug('Casa') skips the retired casa (returns casa-2)".
  - "public_slug_redirect as anon":
    - `('casa')` → `{"business_slug":"casa-lisboa"}`;
    - the same after `casa-lisboa` is set inactive → null;
    - a retired slug of the draft business → null;
    - `('casa-lisboa')` (current) → null;
    - `('nope')` → null.
  - "product history through save_product":
    - renaming `sofa` to `sofa-oslo` while published writes the history row;
    - `public_slug_redirect('casa', 'sofa')` as anon → `{"business_slug":"casa-lisboa","product_slug":"sofa-oslo"}`;
    - after unpublishing → null.
  - "a second product taking sofa raises product_slug_retired; sofa-oslo taking sofa back deletes the row; after the product is deleted, sofa is free".
  - "public_catalog_state as anon":
    - `paused` → `{"unavailable":true,"name":"Paused Co"}`;
    - `fresh` → exactly `{"unavailable":true}` (no `name` key);
    - an active slug, `nope` and a deleted business's slug → null;
    - a retired slug of `paused` → unavailable with its name.
  - "history RLS":
    - the stranger reads 0 rows;
    - a business member reads their own business's rows;
    - the Team member reads all;
    - insert, update and delete by `authenticated` and `anon` raise permission denied.
  - "backfill": on `freshDb((n) => n < S2_MIGRATION)`:
    - rename a business twice;
    - rename and then delete another;
    - apply the S2 file.

    Then:
    - both from-slugs of the first are reserved for it;
    - the deleted one's from-slug has `business_id` null;
    - a from-slug that is someone's current slug is not inserted.
- [ ] **Step 2: Write the failing service and URL tests.**
  - `addresses.test.ts` (fake `sb.rpc`):
    - "calls public_slug_redirect first and returns {kind:'redirect'}";
    - "calls public_catalog_state only when the redirect is null; {unavailable:true,name:'X'} → {kind:'unavailable', businessName:'X'}";
    - "both null → {kind:'not_found'}";
    - "an rpc error goes through mapDbError";
    - "mapDbError maps slug_retired and product_slug_retired to VALIDATION with fieldErrors.slug = the two messages";
    - "duplicateProduct skips a retired slug when choosing the -copy slug".
  - Mock `addresses.test.ts`:
    - the mock refuses a retired business slug and a retired product slug with the same field messages;
    - reclaim works;
    - "resolvePublicAddress mirrors the SQL cases above";
    - "signed out, getBusinessBySlug('oak-ember') is NOT_FOUND; as super_admin or as the business_admin of biz_oak it is returned";
    - "deleteBusiness removes owners[id] and keeps its slug reserved".
  - `urls.redirect.test.ts`:
    - "path mode: catalog keeps ?preview=1";
    - "product keeps ?variant=v2";
    - "embed path";
    - "tenant with the same business slug: /products/sofa-oslo?variant=v2, not external";
    - "tenant with a changed business slug: external productPublicUrl + ?variant=v2".
- [ ] **Step 3: Write the failing component tests** in `unresolvedAddress.test.tsx`. Open the whole `App` at a URL, as `publicPages.test.tsx` does:
  - "signed out, /catalog/oak-ember shows 'This catalog is currently unavailable' and 'Oak & Ember Studio has paused its online catalog. Please contact the store directly.'";
  - "after renaming casa-lisboa, /catalog/casa-lisboa lands on the new path";
  - "/products/casa-lisboa/<old>?variant=<id> lands on the new product slug with ?variant kept";
  - "an embed of a renamed product redirects to the new embed path";
  - "unknown slug → 'Catalog not found'";
  - "a redirect to the current location renders the not-found view";
  - "while resolving, the loading spinner shows";
  - "a failed resolution shows the not-found view";
  - "a stale product page whose refetch returns NOT_FOUND after a rename lands on the new slug with ?variant kept";
  - "a stale product page whose refetch returns NOT_FOUND after unpublish shows 'Product not available', and the AR button is gone" (R-W4-8);
  - the same R-W4-8 case for the embed.
- [ ] **Step 4: Write the failing slug-copy test** in `slugConfirm.test.tsx`: "changing a business slug confirms with 'Old links and printed QR codes that use {old URL} will redirect to the new address while the catalog is live. The old address stays reserved for this business.'" and "the edit-mode hint reads 'Old links and printed QR codes redirect to the new address while the catalog is live.'".
- [ ] **Step 5: Run them and confirm they fail.** `npx vitest run supabase/tests/s2BusinessLogic.test.ts -t "S2 Task 1" src/services/supabase/addresses.test.ts src/services/mock/addresses.test.ts src/lib/urls.redirect.test.ts src/features/public/unresolvedAddress.test.tsx src/features/businesses/slugConfirm.test.tsx`. Expected: FAIL (tables and functions missing; `resolvePublicAddress` is not a function).
- [ ] **Step 6: Write the SQL section and the rollback section.** For `save_product`, read the latest body and confirm that a slug change is an `UPDATE` (so the triggers fire). Don't change `save_product`.
- [ ] **Step 7: Implement the services.**
  - Supabase: `resolvePublicAddress`, the `DB_RULES` entries and the `duplicateProduct` taken list (`product_slug_history` slugs of the business).
  - Mock:
    - `demoViewer()`, and `demoCanRead(b)` = `b.status === 'active'` or a `super_admin` viewer or that business's `business_admin`, applied in `getBusinessBySlug`, `getCatalog` and `getPublicProduct`;
    - `slugHistory` kept the way the triggers keep it;
    - `deleteBusiness`: `delete d.owners?.[id]`, drop the business's `ownerInviteAttempts` (as the cascade does), and reserve its slug with `businessId: null`.
- [ ] **Step 8: Implement the UI.**
  - `addressRedirectTarget` and `UnresolvedAddress`.
  - `CatalogPage`:
    - the `!b` branch wraps its existing not-found `PublicMessage` as `notFound`;
    - the `!showCatalog` branch uses `inactiveBodyNamed` with `b.name` for `inactive` and `notOpenBody` for `draft`.
  - `ProductPage` and `EmbedProductPage`: `const gone = res.status === 'error' && res.error.code === 'NOT_FOUND'`.
    - The not-found block runs when `!res.data || ownerMismatch || gone`.
    - Only `gone` (not `ownerMismatch`) renders `UnresolvedAddress`.
  - The two dictionary keys, and the two `BusinessForm` strings.
- [ ] **Step 9: Run the tests again** (same command, expected PASS).
  - Then `npx vitest run supabase/tests src/features/public src/services`. Update only the existing assertions that R-W8-2 changes.
  - Then `npm run typecheck` and `npm run lint`.
  - Check `/catalog/oak-ember` signed out, a renamed catalog, and a renamed product, at 1440 and 390, in the demo.
- [ ] **Step 10: Commit.** Message "S2 Task 1: old addresses redirect, paused catalogs say unavailable, stale pages give way".

### Task 2: Public page fixes

Closes **R-W4-9** (PUB-05), **R-W4-10** (PUB-07), **R-W4-11** (PUB-08), **R-W4-12** (PUB-09, the noindex header) and **R-W4-13** (PUB-10).

**Files:**
- Create:
  - `src/features/public/LowercaseSlugs.tsx`
  - `src/features/public/publicFixes.test.tsx`
  - `src/services/validation.cta.test.ts`
- Modify:
  - `src/features/public/CatalogPage.tsx` and `ProductPage.tsx` (regions in the table)
  - `src/app/router.tsx` (wrap the public slug routes)
  - `src/lib/urls.ts` (`catalogLocalPath`) and `src/lib/urls.test.ts`
  - `src/services/validation.ts` (`validateProductDraft`)
  - `src/features/products/editor/ProductEditorForm.tsx`: the field-to-section map gains `'cta.label': 'cta'`, `fieldValue` handles `'cta.label'`, and the "Button label" `LocalizedField` gets `error={err('cta.label')}`
  - `vercel.json`

**Interfaces:**
- Produces:
  ```ts
  export function catalogLocalPath(b: Pick<Business, 'slug'>, opts?: { preview?: boolean; category?: string }): string
  // query order: category, then preview: '/catalog/casa?category=sofas&preview=1'
  export function LowercaseSlugs(props: { route: 'catalog' | 'product' | 'embed'; tenant?: boolean; children: ReactNode }): ReactElement
  // when any slug param has upper case: <Navigate replace> to the helper-built lower-case path + location.search + location.hash
  ```
- Consumes: nothing from the other tasks.

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
    - vercel.json:
      - "/embed/products/a/b gets X-Robots-Tag: noindex";
      - "a rule with has:[{type:'query', key:'preview'}] and source '/(.*)' sets X-Robots-Tag: noindex";
      - "/catalog/casa-lisboa without a query gets no X-Robots-Tag from any rule without a has".
  - The editor (`publicFixes.test.tsx`, through `ProductEditorPage` in the demo): "saving a product with a link and no label shows 'Add a button label, or remove the link.' under Button label".
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/lib/urls.test.ts src/services/validation.cta.test.ts src/features/public/publicFixes.test.tsx`
- [ ] **Step 3: Implement.**
  - `catalogLocalPath` with `URLSearchParams`.
  - `LowercaseSlugs`, wrapping `/catalog/:businessSlug`, `/products/:businessSlug/:productSlug` and `/embed/products/:businessSlug/:productSlug`, plus the tenant `/products/:productSlug` and `/embed/products/:productSlug`.
  - `ProductPage`: `catalogHref = tenantSlug ? tenantCatalogPath({ preview: canPreview }) : catalogLocalPath({ slug: businessSlug }, { preview: canPreview })`.
  - The CTA text falls back to `t('product.contactStore')` when `localized(product.cta.label).trim()` is empty.
  - `CatalogPage`:
    - add `const MEDIA_REFRESH_MS = (MEDIA_URL_TTL_SECONDS * 1000) / 2`;
    - add `useRefreshWhenStale(products.refetch, MEDIA_REFRESH_MS, products.data)`;
    - sort with `localized(a.name).localeCompare(localized(b2.name), lang)`.
  - The `validateProductDraft` rule and the editor wiring.
  - `vercel.json`: two header rules, `{ "source": "/embed/(.*)", "headers": [{ "key": "X-Robots-Tag", "value": "noindex" }] }` and `{ "source": "/(.*)", "has": [{ "type": "query", "key": "preview" }], "headers": [{ "key": "X-Robots-Tag", "value": "noindex" }] }`.
- [ ] **Step 4: Run the tests again** (expected PASS). Then run the existing `src/features/public` and `src/features/products` suites, then `npm run typecheck` and `npm run lint`. Check `/catalog/Casa-Lisboa` and a product page in PT, at 1440 and 390.
- [ ] **Step 5: Commit.** Message "S2 Task 2: public page fixes (refresh, CTA label, lower-case addresses, noindex, PT order)".

### Task 3: Read-only business form, field limits, the owner's closure notice

Closes **R-W3-5** (BIZ-05), **R-W3-7** (BIZ-09) and the BIZ-08 part of **R-W3-6**. S1.5 Task 3 did the BIZ-02 part.

**Files:**
- Migration, Task 3 section: `create or replace public.admin_review_application(uuid, text, text)`.
  - Copy the **latest** body: the S1.5 Task 16 section. Grep the S1.5 migration to make sure no later section redefines it.
  - Change only `left(coalesce(v_app.answers ->> 'description', ''), 5000)` to `…, 1000)`.
  - The signature, grants and everything else stay the same.
  - Rollback, Task 3 section: restore the S1.5 Task 16 body, with its grants.
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

- [ ] **Step 1: Write the failing PGlite test** (`describe('S2 Task 3: one description limit')`, with `ids(3)`):
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
    - "a stored 1200-character description gets the description field error on save, not only a toast" (Review Focus 4).
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
- [ ] **Step 3: Run them and confirm they fail.** `npx vitest run supabase/tests/s2BusinessLogic.test.ts -t "S2 Task 3" src/services/validation.business.test.ts src/lib/lib.test.ts src/features/businesses src/features/admin/BusinessDetailPage.test.tsx src/services/supabase/uploadForbidden.test.ts src/components/layout/CatalogStatusNotice.test.tsx src/features/business/ownerDashboard.test.tsx src/features/settings/sections/AccountSection.test.tsx`
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
- [ ] **Step 7: Commit.** Message "S2 Task 3: read-only business form, field limits, the owner's closure notice".

### Task 4: No logo left behind, and a partial file clean-up is reported

Closes **R-W3-4** (BIZ-06, ruling 12).

**Files:**
- Create:
  - `src/features/shared/storageSweep.ts` and `storageSweep.test.ts`
  - `src/services/supabase/storageSweep.test.ts` (fake client, as `variantMedia.test.ts` builds one)
  - `src/features/businesses/useBusinessActions.test.tsx`
  - `src/features/businesses/logoMove.test.tsx`
- Modify, in the regions in the table:
  - `src/services/catalogService.ts`
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
    - "a refused insert never calls storage.move" (Review Focus 5).
  - `useBusinessActions.test.tsx`: "the toast reads 'Business deleted, but 2 files could not be removed from storage.' when failedFiles is 2, and 'Business deleted' when 0".
  - `useProductActions.test.tsx`: "'Product deleted, but 1 file could not be removed from storage.'".
  - `logoMove.test.tsx` (spy on `service.createBusiness`): "a create that returns logoMoveFailed shows 'Business created' with \"The logo couldn't be moved into the business folder; upload it again.\"".
  - Mock (in `storageSweep.test.ts` or `useBusinessActions.test.tsx`): "mock deleteBusiness and deleteProduct resolve { removedFiles: 0, failedFiles: 0 }".
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/features/shared/storageSweep.test.ts src/services/supabase/storageSweep.test.ts src/features/businesses/useBusinessActions.test.tsx src/features/businesses/logoMove.test.tsx src/features/products/useProductActions.test.tsx`
- [ ] **Step 3: Implement** the types, the services (Supabase and mock), `deletedToast`, the two hooks and the create toast.
- [ ] **Step 4: Run the tests again** (expected PASS). Then run `npx vitest run src/services src/features/admin src/features/businesses src/features/products` and update any existing assertion of `ok(undefined)` (the commit body names R-W3-4). Then `npm run typecheck` and `npm run lint`. In the demo, check business create with a logo, and business and product delete, at 1440 and 390.
- [ ] **Step 5: Commit.** Message "S2 Task 4: move the staged logo, report a partial file clean-up".

### Task 5: E2E journeys, docs and the S2 release runbook

Runs after Tasks 1–4 are merged. It covers all of them.

**Files:**
- Modify (e2e, demo mode):
  - `tests/e2e/public.spec.ts`:
    - signed out, `/catalog/oak-ember` shows the named unavailable message;
    - `/catalog/Casa-Lisboa?q=sofa` → `/catalog/casa-lisboa?q=sofa`.
  - `tests/e2e/business-crud.spec.ts`:
    - the Owner changes `casa-lisboa` to `casa-lisboa-2`, and the confirmation contains "will redirect to the new address";
    - `/catalog/casa-lisboa` lands on `/catalog/casa-lisboa-2`;
    - creating a business with slug `casa-lisboa` gets "This address was used before and still belongs to another catalog. Choose another address.";
    - the demo Team member sees the read-only form note;
    - a 501-character address gets "Use 500 characters or fewer.".
  - `tests/e2e/product-crud.spec.ts`:
    - rename a published product's slug, then open the old URL with `?variant=<id>`: it lands on the new slug with `?variant` kept;
    - a link with no label gets "Add a button label, or remove the link.".
  - `tests/e2e/settings.spec.ts`: as the owner of `biz_oak` (seeded closure), the dashboard shows the closure notice and not "Your catalog is paused.".
  - `tests/e2e/responsive.mobile.spec.ts`: the unavailable page and the read-only form at 390.
- Create: `System_arch/decisions/ADR-0034-address-history-and-unavailable-catalog.md`. It covers:
  - retired slugs reserved forever;
  - browser-side redirects, with no server HTML;
  - two definer RPCs open to `anon`, and what they reveal (that an address exists and is unavailable, plus the name only for `inactive`);
  - why product history is dropped with the product.

  Add its row to `System_arch/decisions/README.md`.
- Modify (docs):
  - `System_arch/design/14-features-public.md`: redirects, unavailable, lower-case, noindex, refresh, CTA fallback, PT order. Also the ADR-0025 note that "a printed product QR breaks if its slug changes" is now "redirects".
  - `System_arch/design/19-supabase.md`: the two tables, the triggers, the RPCs and grants, and the 1000-character description.
  - `System_arch/design/08-tenancy-urls.md`: `addressRedirectTarget` and the `category` option.
  - `System_arch/design/13-features-business.md`: the owner closure notice.
  - `docs/SECURITY_REVIEW.md`:
    - the anon RPCs and what they reveal;
    - the PUB-04 window: signed URLs stay valid for up to 12 h in pages already open (§1.3);
    - storage-RLS errors mapped to "no permission".
  - `docs/OPERATIONS_RUNBOOK.md`: a new section "S2 business-logic release", below the S1.5 one:
    1. the owner's go-ahead for `zggylkbgajamhriebdrg`;
    2. a **read-only pre-flight** whose results are shown to the owner. It writes the exact `select`s for:
       - the slugs the backfill will reserve, with their business or "deleted";
       - the businesses deleted before S2 (from `business_deleted` audit rows), whose slugs can't be recovered (§13.3). The owner can reserve known ones by hand with `insert into public.business_slug_history (slug, business_id) values ('<slug>', null)`;
    3. `supabase db push` (never `config push`);
    4. `npm run db:types`;
    5. no Edge Function deploy and no new secrets;
    6. the frontend to the Preview, then to production only when the owner asks (the `vercel.json` headers ship with it);
    7. mixed versions:
       - an old frontend shows the generic error for `slug_retired`;
       - a new frontend on the old DB gets an RPC error and shows "not found";
    8. rollback: the S2 script before the S1.5 one, with its data-loss line.
  - `docs/TEST_PLAN.md`, live checks:
    - a QA slug change redirects, and a second QA business is refused the old slug;
    - a QA business set inactive shows "unavailable" with its name, signed out;
    - `curl -sI <preview>/embed/products/<b>/<p>` and `curl -sI '<preview>/catalog/<b>?preview=1'` show `x-robots-tag: noindex`;
    - deleting a QA business with a logo leaves `business-logos/new/` empty.
  - `docs/CLIENT_HANDOVER.md`:
    - §6: old addresses redirect; a paused catalog shows "unavailable";
    - §2/§3: view-only staff see a read-only form; the field limits;
    - §4: the button label rule;
    - §10: the 12-hour signed-URL window.
  - `docs/PRD.md`: rows touched by BIZ-04 and PUB-02, if they exist.
  - `docs/PRODUCTION_READINESS.md`, `System_arch/Task.md`, `System_arch/HANDOFF.md`.
  - `System_arch/tasks/P12-team-roles-and-addons.md`: the S2 line marks these R-IDs built, with this plan's path.
  - `docs/superpowers/plans/2026-10-26-next-scope.md`: S2 "Keep" item 2 marked as built (release pending).
  - `docs/superpowers/plans/2026-10-26-business-logic-fixes.md` ("Moved out" table): each of these rows' Target becomes "S2 plan Task N".

**Interfaces:**
- Consumes: every earlier task.

- [ ] **Step 1: Write the e2e journeys** above, at 1440 (`--project=desktop`), plus the `*.mobile.spec.ts` cases at 390.
- [ ] **Step 2: Run them.**
  - Run `npx playwright test tests/e2e/public.spec.ts tests/e2e/business-crud.spec.ts tests/e2e/product-crud.spec.ts tests/e2e/settings.spec.ts --project=desktop`, then `npx playwright test tests/e2e/responsive.mobile.spec.ts --project=mobile`, then `npx playwright test tests/e2e/a11y-dashboard.spec.ts --project=desktop` and `npx playwright test --project=guard`.
  - Expected: all pass, and the pixel guard stays 14/14.
  - If the guard fails only on a page whose copy an S2 requirement changed, stop and report the diff. Never update a baseline without the owner's OK.
- [ ] **Step 3: Write the docs above.** No personal name or Gmail address in client material.
- [ ] **Step 4: Run the full gates.** `npm run typecheck && npm run lint && npm test && npm run build` all pass, and so does `npx vitest run supabase/tests`.
- [ ] **Step 5: Tick and commit.**
  - Tick S2 "Working business logic" in the P12 task file with a note, and update the phase row in `Task.md`.
  - Message "S2 Task 5: e2e journeys, ADR-0034, runbook, security and client docs".

## Coverage

| R-ID | Finding | Task |
|---|---|---|
| R-W3-1 | BIZ-04 | 1 (slug copy in `BusinessForm` too) |
| R-W3-2 (history and redirect) | PUB-03 = PROD-06 | 1 (published-slug confirmation: S4) |
| — (ruling 9) | PUB-02 = BIZ-03 | 1 |
| R-W4-8 | PUB-04 (built part) | 1 (the 12 h window documented in Task 5) |
| R-W8-2 (owners cleared on delete; signed-out visibility) | BIZ-10 | 1 (application-link bullets: S1.5 Task 16; closure bullets: S1.5 Task 14) |
| R-W4-9 | PUB-05 | 2 |
| R-W4-10 | PUB-07 | 2 |
| R-W4-11 | PUB-08 | 2 |
| R-W4-12 | PUB-09 (noindex) | 2 |
| R-W4-13 | PUB-10 | 2 |
| R-W3-5 | BIZ-05 | 3 |
| R-W3-6 (BIZ-08 part) | BIZ-08 | 3 |
| R-W3-7 | BIZ-09 | 3 |
| R-W3-4 | BIZ-06 | 4 |
| e2e, ADR, runbook, docs | — | 5 |

**Not in this plan:**
- the online/offline switch and platform suspend;
- the platform inbox setting;
- the privacy must-haves;
- the product-editor fixes (R-W4-2 to R-W4-7, R-W4-14), and R-W3-2's published-slug confirmation;
- everything in the "Dropped" list of the next-scope plan;
- PUB-09's per-page title and description.

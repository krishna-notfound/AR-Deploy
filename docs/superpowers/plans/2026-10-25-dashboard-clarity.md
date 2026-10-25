# Dashboard Clarity and Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every in-scope dashboard screen, and the public catalogue and product page, to the owner-approved Stitch designs (Variant A: Inter UI and Cormorant page titles), without changing a single pixel of the landing page, apply page or sign-in pages.

**Architecture:**
- **Dashboard scope:** dashboard looks are switched on by a scope. `DashboardShell` already provides `DashboardContext`, and the new `useInDashboard()` hook reads it. React context passes through portals, so dialogs and menus inside the shell get the new look too.
- **Shared components** keep their APIs and choose dashboard classes when `useInDashboard()` is true. Outside the shell they render exactly as today.
- **Fonts:** Inter is applied through `data-surface="dashboard"` on the shell root and on `<body>` while a dashboard is mounted, so portal content inherits the font.
- **Pixel guard:** a Playwright `toHaveScreenshot` guard, recorded before any change, proves the untouched pages stay identical.

**Tech Stack:** React 19, TypeScript 6, Tailwind 4 (`@theme` tokens in `src/index.css`), React Router 8, Vitest and Testing Library, Playwright (including the `toHaveScreenshot` visual comparison), Google Fonts (Inter variable), Stitch exports in `design/stitch/dashboard/`.

**Spec:** `docs/superpowers/specs/2026-10-25-dashboard-clarity-design.md` (binding: `design/dashboard/BRIEF.md` and the Stitch screens "Dash v2 A – …"; exports in `design/stitch/dashboard/A-*/screenshot.png`).

## Global Constraints

- **Pages that must not change by even one pixel** (enforced by the guard in Task 1): `/`, `/apply`, `/demo`, `/accept-invite`, `/reset-password`, `/join`, and the `/login` redirect, at 1440 and 390.
- **Type sizes (BRIEF §1, Variant A):**
  - h1: Cormorant Garamond 32px, line-height 1.15, weight 500, -0.01em;
  - subline: Inter 15/1.5;
  - card title: Inter 16/1.4/600;
  - body and input: Inter 14/1.5 (16px under 640px);
  - table cell: 14/20, identity 500; secondary line 13/18;
  - table header: 13/500, sentence case;
  - label: 14/500; help: 13/1.45;
  - KPI value: 28/1.1/500, tabular; KPI label: 13/500;
  - badge: 12/20/500; button: 14/500, sentence case;
  - nav item: 14 (active 500).
- **Spacing (BRIEF §2):**
  - canvas padding 40 / 24 / 16px; card gap 24px; card padding 24px;
  - control height 40px (36px in card headers, 44px on touch);
  - sidebar 256px with 40px rows and 18px icons;
  - top bar 56px.
- **Text rules:**
  - nothing under 12px;
  - dashboard greys use `#5A5148` (`text-ink-muted`); `#6E6559` only for placeholders;
  - at most three weights (400, 500, 600);
  - `tabular-nums` on every KPI, table number, count, date and file size.
- **No small uppercase letter-spaced text inside the dashboard scope** (wordmark excepted): no `uppercase`, `text-eyebrow` or `text-label` classes rendered under `useInDashboard()`.
- **Theme:** keep the colour tokens, 2px corners and hairlines. No gradients, blur, glow, emoji or new icons on stat cards. Real data only; keep the existing "Sample data" labels.
- **Behaviour:** no feature or behaviour change. Permission gating (`useCan`), data loading, empty, loading and error states, and the AR and 3D behaviour stay as they are.
- **Dependencies:** none new. Inter comes from the Google Fonts `<link>` in `index.html`.
- **Commits:** author `krishna <krishnagtkr@gmail.com>`, no co-author line. Push only `feature/sanctus-brand-design-system`.
- **A task is done when:**
  - typecheck, lint (0 errors) and `npm test` pass;
  - `npx playwright test --project=guard` passes (no pixel change on the untouched pages);
  - the task's own routes have been screenshotted at 1440 and 390 and compared with their Stitch screen.

## Review Focus

1. **A portal-rendered dialog or menu opened from a dashboard page** (confirm, invite dialog, row menu, toasts) should use Inter and the dashboard sizes. Task 2 adds "a dialog opened in the dashboard gets the dashboard font".
2. **A long name, email or product name in a table at 390px** should wrap or truncate inside its row with no horizontal scroll. Task 5 adds "long identities do not overflow at 390".
3. **A shared component used on both the public product page and the dashboard** (Button, Badge, FormField) must look new in the dashboard and old on the public page in the same session. Task 4 adds "the same Badge renders legacy styles outside the dashboard".
4. **Keyboard focus** on the new outlined row buttons, tabs and segmented EN/PT controls must stay visible (2px ink ring). Task 6 adds a focus-visible class assertion.
5. **Demo vs Supabase mode:** nothing in this plan reads data differently. The guard and visual checks run in demo mode, and the Preview shows Supabase mode, which the owner checks.

---

## File Structure

| File | Responsibility |
|---|---|
| `System_arch/decisions/ADR-0031-dashboard-type-and-density.md` | Decision record (Task 1) |
| `tests/visual/guard.spec.ts`, `playwright.config.ts` (`guard` project) | Pixel guard for untouched pages (Task 1) |
| `scripts/design-review.mjs`, `scripts/design-sheet.py` | Screenshot in-scope routes and pair them with the Stitch screen (Task 13) |
| `index.html`, `src/index.css` | Inter link; `--font-ui` and dashboard type tokens; `[data-surface="dashboard"]` rule (Task 2) |
| `src/components/layout/dashboardContext.ts` | `useInDashboard()` (Task 2) |
| `src/components/layout/DashboardShell.tsx`, `PageHeader.tsx`, `nav.ts` | Shell and header (Task 3) |
| `src/components/ui/{StatGroup,Badge,Tabs,Button}.tsx` | Task 4 |
| `src/components/ui/{DataTable,Pagination,SearchInput,Menu}.tsx` | Task 5 |
| `src/components/ui/{Form,States,Card,Modal,ToastProvider,Skeleton,ConfirmProvider}.tsx` | Task 6 |
| Business pages, the product editor, admin pages, team pages, public pages | Tasks 7–12 |

---

### Task 1: Decision record and the pixel guard (recorded before any visual change)

**Files:**
- Create: `System_arch/decisions/ADR-0031-dashboard-type-and-density.md`, `tests/visual/guard.spec.ts`
- Modify:
  - `System_arch/decisions/README.md` (one row);
  - `System_arch/design/11-design-system.md` (a "Dashboard type (ADR-0031)" section summarising the constraints above, with a link to `design/dashboard/BRIEF.md`);
  - `playwright.config.ts`: add project `guard` with `testMatch: /visual\/guard\.spec\.ts$/`, `use: { ...devices['Desktop Chrome'] }`, and `expect.toHaveScreenshot: { maxDiffPixels: 0, animations: 'disabled' }`. Exclude `tests/visual` from the `desktop` and `mobile` projects with `testIgnore`.

**Interfaces:**
- Produces: `npx playwright test --project=guard` passes against the snapshots committed in `tests/visual/guard.spec.ts-snapshots/`.

- [ ] **Step 1: Write the ADR** (context, decision and consequences from spec §1–§4; it amends ADR-0023 and ADR-0028 for the dashboards only).
- [ ] **Step 2: Write `guard.spec.ts`.** For each path in `['/', '/apply', '/demo', '/accept-invite', '/reset-password', '/join', '/login']` and each width in `[1440, 390]`:
  1. set the viewport to that width × 900;
  2. `goto(path)`;
  3. `await page.evaluate(() => document.fonts.ready)`;
  4. `expect(page).toHaveScreenshot(`${slug}-${width}.png`, { fullPage: true })`.

  Before navigating, use `page.addInitScript(() => localStorage.clear())` so no demo session leaks in.
- [ ] **Step 3: Record the baseline** on the unchanged tree: `npx playwright test --project=guard --update-snapshots`, then run `npx playwright test --project=guard` twice. Expected: PASS both times (the page is stable). If a page isn't stable, for example because of a time-based element, mask that element with the `mask` option and record the ruling.
- [ ] **Step 4: Commit** the ADR, docs, config, spec and snapshots: "Dashboard clarity: ADR-0031 and a pixel guard for the untouched pages".

### Task 2: Inter font, dashboard tokens and the dashboard scope

**Files:**
- Modify:
  - `index.html`: add `family=Inter:wght@400;500;600` to the existing Google Fonts URL, and confirm Cormorant 500 is present (it is: `0,500`);
  - `src/index.css`: in `@theme` add `--font-ui: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;`, plus tokens `--text-ui-h1` (2rem/1.15), `--text-ui-sub` (0.9375rem/1.5), `--text-ui-card` (1rem/1.4), `--text-ui-body` (0.875rem/1.5), `--text-ui-small` (0.8125rem/1.45), `--text-ui-kpi` (1.75rem/1.1) and `--text-ui-badge` (0.75rem/1.25rem). Add a base rule `[data-surface='dashboard'] { font-family: var(--font-ui); font-feature-settings: 'cv11', 'ss01'; }`;
  - `src/components/layout/dashboardContext.ts`: add `export const useInDashboard = () => useContext(DashboardContext) !== null`;
  - `src/components/layout/DashboardShell.tsx`: root `<div data-surface="dashboard" …>`, and `useEffect(() => { document.body.dataset.surface = 'dashboard'; return () => { delete document.body.dataset.surface } }, [])`.
- Test: `src/components/layout/dashboardScope.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - `it('the dashboard root and body carry the dashboard surface')`: render App at `/admin` as the Owner; expect `document.querySelector('[data-surface="dashboard"]')` to be truthy and `document.body.dataset.surface` to be `'dashboard'`;
  - `it('public pages do not')`: render at `/catalog/nordhaus`; expect `document.body.dataset.surface` to be undefined;
  - `it('a dialog opened in the dashboard gets the dashboard font')`: open a confirm dialog (Team page, revoke Marta); expect `getComputedStyle(dialog).fontFamily` to contain `Inter`, or the dialog to be inside an element whose closest `[data-surface]` is `'dashboard'`, since body carries it;
  - `useInDashboard()` returns true inside the shell and false outside (a small harness component).
- [ ] **Step 2: Run** `npx vitest run src/components/layout/dashboardScope.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same file (PASS), `npm test` and `npx playwright test --project=guard`. Expected: PASS. The untouched pages don't use the attribute, so the guard must stay green. A failure means the Inter link changed font loading for the public pages: keep `display=swap` and the URL order so existing families are unaffected.
- [ ] **Step 5: Commit** with the message "Dashboard scope: Inter font, UI type tokens, data-surface".

### Task 3: Shell and page header

**Files:**
- Modify: `src/components/layout/DashboardShell.tsx`, `PageHeader.tsx` (and its `PanelHeader`)
- Test: `src/components/layout/PageHeader.test.tsx` (new), plus selector updates in existing tests

**Target:** BRIEF §2–§3, matching the sidebar, top bar and header in every Stitch screen (for example `A-a-overview`, `A-team`).
- **Top bar:** 56px, holding the breadcrumb (14px muted, current page in ink) and the existing right-side actions.
- **Sidebar:** nav 14px, rows 40px, icons 18px; label chip in sentence case ("Admin console" / the business name).
- **PageHeader:**
  - no eyebrow;
  - the breadcrumbs prop renders in the top bar slot (through context) instead of above the title;
  - h1 uses `font-display text-[length:var(--text-ui-h1)] font-medium`;
  - subline 15px muted;
  - `meta` sits next to the subline.
- **PanelHeader:** title Inter 16/600.

- [ ] **Step 1: Write the failing tests:**
  - PageHeader inside the shell renders no element with the classes `uppercase` or `text-eyebrow`;
  - the h1 has the `font-display` and `font-medium` classes;
  - breadcrumbs appear inside the top bar `nav[aria-label="Breadcrumb"]`, not inside `main`;
  - outside the shell, PageHeader still renders as before (snapshot of its class list).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Grep the tests for text that depends on the eyebrow (`'Platform admin'`, `'Business dashboard'`) and update the selectors.
- [ ] **Step 4: Run** `npm test` and `npx playwright test --project=guard`. Expected: PASS. Screenshot `/admin` and `/dashboard` at 1440 and 390 and compare with `A-a-overview` and `A-overview`.
- [ ] **Step 5: Commit** with the message "Dashboard shell and page header to the approved design".

### Task 4: Stat strip, badges, tabs, buttons

**Files:**
- Modify: `src/components/ui/StatGroup.tsx`, `Badge.tsx`, `Tabs.tsx`, `Button.tsx`, and every `StatGroup` caller's `icon` (remove them)
- Test: `src/components/ui/dashboardPrimitives.test.tsx` (new)

**Target:** BRIEF §4 and §5 (badges), and §1 (buttons).
- **StatGroup in the dashboard:** one card; columns divided by `divide-x divide-line` (on phones, a 2-column grid with dividers); label 13/500 muted; value 28 tabular; hint 13 muted; footer row. Icons are not rendered.
- **Badge in the dashboard:** `h-5 px-2 text-[12px] font-medium normal-case tracking-normal`, with the tone colours from BRIEF §5. Owner, Admin and Team as in BRIEF §5. Outside the dashboard: unchanged.
- **Tabs (pill):** 14px sentence case, tabular counts.
- **Button in the dashboard:** `text-[14px] font-medium normal-case tracking-normal`; sizes 40 (md), 36 (sm) and 44 (touch, under `sm`); `lg` (the editorial uppercase size) is never used in the dashboard (grep it). Outside: unchanged.

- [ ] **Step 1: Write the failing tests:**
  - `StatGroup` inside the shell with stats that carry `icon` renders no `svg` in the strip;
  - the values have the `tabular-nums` class;
  - `it('the same Badge renders legacy styles outside the dashboard')`: outside, the class list contains `uppercase`; inside, it doesn't;
  - Button inside: no `uppercase` or `tracking-` classes.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, branching on `useInDashboard()`. Remove the `icon` props from the callers: `AdminOverviewPage`, `BusinessOverviewPage`, `TeamPage`, `AnalyticsView` and any others found with `grep -rn "icon: " src/features | grep -i stat`.
- [ ] **Step 4: Run** `npm test` and the guard. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Stat strip, badges, tabs and buttons for the dashboard".

### Task 5: Tables and list controls

**Files:**
- Modify: `src/components/ui/DataTable.tsx`, `Pagination.tsx`, `SearchInput.tsx`, `Menu.tsx`
- Test: `src/components/ui/DataTable.test.tsx` (new or extended)

**Target:** BRIEF §5 and the Stitch screens `A-a-applications`, `A-a-products`, `A-team`.
- **Header:** 40px, 13/500 muted, sentence case, no fill, `border-b border-line`.
- **Rows:** 52px, or 60px with a two-line identity; `border-b border-subtle`; numbers right-aligned and `tabular-nums`; a fixed 32px actions column (`w-12`).
- **Under 640px:** `mobileRow` renders as a two-line list item (identity and key value, then the rest muted).
- **Pagination:** 14px.
- **SearchInput:** 40px, about 320px wide.
- **Menu items:** 14px, 36px rows.

- [ ] **Step 1: Write the failing tests:**
  - the header cells inside the shell have no `uppercase` class;
  - columns with `align: 'right'` get `tabular-nums`;
  - `it('long identities do not overflow at 390')`: render with a 120-character email in a 390px-wide container (`style={{ width: 390 }}`), and expect the identity cell to carry the `min-w-0` and `break-words` (or `truncate`) classes.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and the guard (PASS). Screenshot `/admin/applications`, `/admin/products` and `/admin/team` at 1440 and 390 and compare with their Stitch screens.
- [ ] **Step 5: Commit** with the message "Dashboard tables, pagination, search and menus".

### Task 6: Forms, states, cards, dialogs and toasts

**Files:**
- Modify: `src/components/ui/Form.tsx`, `States.tsx`, `Skeleton.tsx`, `Card.tsx`, `Modal.tsx`, `ToastProvider.tsx`, `ConfirmProvider.tsx`, and `src/components/layout/PageHeader.tsx` (`PanelHeader` only, if Task 3 hasn't covered it)
- Test: `src/components/ui/dashboardForms.test.tsx` (new)

**Target:** BRIEF §6 and §7.
- **FormField in the dashboard:** label 14/500 above; 8px gap; help text 13 muted below; the error replaces the help text in `text-danger` with a 14px `AlertCircle` icon; "Required" / "Optional" muted after the label.
- **Inputs:** 40px (`text-[16px]` under 640px, `sm:text-[14px]`).
- **Card:** 24px padding.
- **States:**
  - empty: one ink sentence, one muted sentence and at most one action, no icon tile;
  - loading: flat `bg-subtle` bars at the real heights;
  - error: inside the block with a "Retry" text button, the icon in the danger colour.
- **Modal and toasts:** title Inter 16/600, body 14.

- [ ] **Step 1: Write the failing tests:**
  - inside the shell, a `FormField` with an error renders the error text and **not** the hint;
  - its label has no `uppercase`;
  - `ErrorState` renders a button named "Retry" (the existing tests use "Try again", so keep **"Try again"** as the label: **ruling: the brief says "Retry", but the existing UI and tests say "Try again"; keep "Try again"**);
  - the focus ring: the input class list contains `focus-visible:outline-2` (or the existing focus utility).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and the guard. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Dashboard forms, states, cards, dialogs and toasts".

### Task 7: Business owner pages

**Files:**
- Modify: `src/features/business/BusinessOverviewPage.tsx`, `MyProductsPage.tsx`, `BusinessAnalyticsPage.tsx`, `MyCatalogPage.tsx`, `BusinessSettingsPage.tsx`, and `src/features/catalogs/CatalogQrPanel.tsx`, `src/features/analytics/*`, `src/features/businesses/BusinessForm.tsx` (dashboard look only)
- Test: `src/features/business/ownerDashboard.test.tsx` (extend)

**Target:** Stitch `A-overview` (round 1, names corrected), `A-b-mycatalog`, `A-b-settings`, the business analytics part of `A-a-analytics`, and the products table from `A-a-products`.

- [ ] **Step 1: Write the failing tests:**
  - `it('business Overview has no recent lists and links the catalog only from the top bar')`: no heading "Recently added products"; exactly one link named "View my catalog" (or "Preview catalog (not public yet)"), and it sits inside the top-bar `header`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the recent panel and the header duplicate. Rebuild each page's grouping to match its Stitch screen (stat strip, next steps, chart card, most viewed, activity). Keep every data hook and state.
- [ ] **Step 4: Run** `npm test` and the guard (PASS). Screenshot `/dashboard`, `/dashboard/products`, `/dashboard/analytics`, `/dashboard/catalog` and `/dashboard/settings` at 1440 and 390 (demo business `biz_casa`) and compare.
- [ ] **Step 5: Commit** with the message "Business owner pages to the approved designs".

### Task 8: Product editor

**Files:**
- Modify: `src/features/products/editor/ProductEditorForm.tsx` and its section components in `src/features/products/editor/`
- Test: `src/features/products/editor/ProductEditorForm.test.tsx` (extend)

**Target:** Stitch `A-editor` and `A-m-editor` (mobile), BRIEF §6.
- **Section index:** 200px sticky on the left, 36px rows; the active item gets a 2px ink bar; a section with errors shows the danger colour and an icon.
- **Sections:** flat cards with a title and one muted line.
- **EN/PT:** a segmented control on the label row, with "PT ·" when the Portuguese is missing.
- **3D models:** GLB and USDZ slots side by side (stacked on mobile).
- **Publish bar:** 64px sticky. Left: status badge plus "Unsaved changes", "All changes saved" or "Not saved yet". Right: Preview, Save draft, Publish.
- **Error summary card** keeps its existing text "Fix these N issues to continue" (the COR-12 test).

- [ ] **Step 1: Write the failing tests:**
  - the publish bar shows "Unsaved changes" after editing the name and "All changes saved" after saving;
  - on a section with an error, the index item has `aria-invalid` or a visible "has errors" label;
  - the EN/PT control is a `role="group"` named after its label, with two buttons.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Keep `useBlocker`, publish rules, uploads, variants and `ModelViewer` as they are.
- [ ] **Step 4: Run** the editor tests, `npm test` and the guard. Expected: PASS. Screenshot `/dashboard/products/new` and an existing product's edit page at 1440 and 390.
- [ ] **Step 5: Commit** with the message "Product editor to the approved design".

### Task 9: Admin Overview, applications and businesses

**Files:**
- Modify: `src/features/admin/AdminOverviewPage.tsx`, `ApplicationsPage.tsx`, `ApplicationDetailPage.tsx`, `BusinessesListPage.tsx`, `BusinessDetailPage.tsx`, and `src/features/applications/*`, `src/features/businesses/BusinessOwnersPanel.tsx`
- Test: `src/features/admin/adminPages.test.tsx` (new)

**Target:** Stitch `A-a-overview`, `A-a-applications`, `A-a-app-review`, `A-a-app-approved`, `A-a-businesses`, `A-a-business`.

- [ ] **Step 1: Write the failing tests:**
  - Admin Overview has no "Recently added products" or "Recently created businesses" headings;
  - "View catalogs" is a text-style button (it has the `variant="ghost"` class marker, or the class `text-accent-ink`) and the page has exactly one primary button;
  - in the Applications list, each row's "Review" button carries the secondary (outlined) variant classes, not `bg-ink`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Keep every `useCan` gate from team roles.
- [ ] **Step 4: Run** `npm test` and the guard (PASS); screenshot and compare.
- [ ] **Step 5: Commit** with the message "Admin Overview, applications and businesses to the approved designs".

### Task 10: Admin products, catalogs, analytics, audit log and settings

**Files:**
- Modify: `src/features/admin/AdminProductsPage.tsx`, `AdminCatalogsPage.tsx`, `AdminAnalyticsPage.tsx`, `AuditLogPage.tsx`, `AdminSettingsPage.tsx`, and `src/features/products/ProductFilters.tsx`, `ProductTable.tsx` (look only)
- Test: extend the existing tests only where visible text changes

**Target:** Stitch `A-a-products`, `A-a-catalogs`, `A-a-analytics`, `A-a-audit`, `A-a-settings`. The Settings credit lines come from `src/services/mock/credits.ts`, not from Stitch.

- [ ] **Step 1: Write the failing test:** the Audit log list renders dates with `tabular-nums` and sentence-case labels (no `uppercase` inside `main`).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and the guard (PASS); screenshot and compare.
- [ ] **Step 5: Commit** with the message "Admin products, catalogs, analytics, audit log and settings to the approved designs".

### Task 11: Team & Access screens

**Files:**
- Modify: `src/features/team/*.tsx` (`TeamPage`, `MembersTable`, `InvitationsTable`, `AccessHistory`, `InvitationPanel`, `InviteMemberDialog`, `RolePermissionsPage`, `MemberDetailPage`, `teamLabels`)
- Test: existing `src/features/team/*.test.tsx` (selectors only)

**Target:** Stitch `A-team`, `A-a-roleperms`, `A-a-member`, `A-a-invite`, `A-m-team`. Role badges per BRIEF §5. Members list on mobile as cards.

- [ ] **Step 1: Write the failing test:** in `TeamPage.test`, the role badge for the Owner row has the Owner style (`bg-obsidian`) and the badges have no `uppercase`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/features/team`, `npm test`, `npx playwright test tests/e2e/team.spec.ts` and the guard. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Team & Access screens to the approved designs".

### Task 12: Public catalogue and product page (D8)

**Files:**
- Modify: `src/features/public/CatalogPage.tsx`, `ProductPage.tsx`, `VariantPicker.tsx`, `PublicShell.tsx`, `src/i18n/dictionaries/{en,pt}.ts` (only if the "Ver peça" text changes)
- Test: `src/features/public/*.test.tsx`

**Target:** Stitch `A-p-catalog`, `A-p-product`.
- Small uppercase labels become at least 12px with `tracking-[0.08em]` or less.
- No "01 //" index chip on the cards (the category chip stays).
- "Ver peça →" / "View piece →" in sentence case: remove `uppercase` from that link.
- Nothing else changes. The ModelViewer and the AR buttons are untouched.

- [ ] **Step 1: Write the failing tests:**
  - `it('catalogue cards have no index numbering')`: no text matching `/^\d{2} \/\//`;
  - the "Ver peça" link has no `uppercase` class.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/features/public`, `npm test` and the guard. Expected: PASS. The guard doesn't cover these pages: they're in scope.
- [ ] **Step 5: Commit** with the message "Public catalogue and product page: clearer type, no card numbering".

### Task 13: Visual review against the designs and accessibility checks

**Files:**
- Create: `scripts/design-review.mjs` (Playwright: signs in through `/demo` as Owner, Admin sample, Team sample and the `biz_casa` owner; screenshots every in-scope route at 1440 and 390 into `design/review/<route>-<w>.png`), `scripts/design-sheet.py` (pairs each with its `design/stitch/dashboard/A-*/screenshot.png` side by side into `design/review/pairs/*.png`)
- Create: `tests/e2e/a11y-dashboard.spec.ts`

- [ ] **Step 1: Write the a11y spec** (desktop and mobile projects). For each in-scope route:
  - no element with a computed `font-size` under 12px inside `main`, except the wordmark;
  - `document.documentElement.scrollWidth <= innerWidth` at 390;
  - no element inside `[data-surface="dashboard"]` with a computed `text-transform: uppercase`, except the wordmark.

  Run it. Expected: it lists the violations (FAIL) if any remain.
- [ ] **Step 2: Fix the violations** until the spec passes.
- [ ] **Step 3: Run the review scripts** and dispatch a fresh reviewer agent with the pairs, `design/dashboard/BRIEF.md` and the spec. Its report: a list of visible gaps per route (layout, type, spacing, states), each with a fix.
- [ ] **Step 4: Fix the Critical and Important gaps** (one pass). Re-run `npm test`, the a11y spec and the guard. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Dashboard visual review fixes and accessibility checks". Commit the review scripts; `design/review/` is git-ignored.

### Task 14: Full checks, docs, Preview

- [ ] **Step 1: Run the full checks**, with logs written to the scratchpad: `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test`. The full run includes the guard and the a11y spec. Expected: all PASS.
- [ ] **Step 2: Update the docs:**
  - `System_arch/tasks/P12-team-roles-and-addons.md`: A1 done, with notes;
  - `docs/PROJECT_COMPLETION_STATUS.md`: an A1 row and the test results;
  - `System_arch/HANDOFF.md`: a short "Dashboard type (ADR-0031)" note.
- [ ] **Step 3: Commit and push** the branch. Wait for the Preview deploy, then smoke-test `/admin` and `/dashboard` in Supabase mode on the Preview (QA admin from `.env.qa`; print nothing secret): the pages load, the Inter font is applied (computed font family) and there are no console errors.

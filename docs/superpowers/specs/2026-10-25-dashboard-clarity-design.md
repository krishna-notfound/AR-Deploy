# Dashboard clarity and typography pass (add-on A1): design

- **Date:** 2026-10-25
- **Status:** design approved in Stitch by the owner (rounds 1 and 2). This written spec awaits review.
- **Binding design sources:**
  - `design/dashboard/BRIEF.md`: exact sizes, spacing, and the table, form and state rules.
  - The Stitch screens named "Dash v2 A – …" in project 16545430197078633171, exported to `design/stitch/dashboard/A-*/` (screenshot and HTML). Contact sheets are `design/stitch/dashboard/sheet-{admin,business,public,mobile}.png`.
- **Decision record:** ADR-0031 "Dashboard type and density" (Inter for dashboard UI text; amends ADR-0023 and ADR-0028 for the dashboards only).

## 1. Goal

The internal dashboards should read at a glance and feel hassle-free. That means:
- a clear hierarchy, with one primary action per screen;
- readable text and numbers (tabular figures);
- calmer density, with no decorative noise;
- the Sanctus theme kept: palette, 2px corners, hairlines, dark sidebar.

The public catalogue and product pages get the same clarity within their existing look.

**Success criteria:**
1. Every in-scope screen matches its approved Stitch design in layout, type scale, spacing and states, allowing for real data.
2. The landing page, apply page and sign-in pages render **exactly as before**: their before and after screenshots are pixel-identical.
3. All existing behaviour is unchanged: typecheck, lint, unit and browser tests pass, and the permission and team-role behaviour is untouched.
4. No text under 12px, contrast of at least 4.5:1, and no horizontal scroll at 390px. Touch targets are at least 44px on touch layouts.

## 2. Decisions (owner, 2026-10-25)

| # | Decision |
|---|---|
| D1 | **Variant A:** Inter for all dashboard text, tables, forms and numbers; Cormorant Garamond 500 only for the page title (h1). Jost is rejected for the dashboards. |
| D2 | **No icons on stat cards.** The stats form one strip divided by hairlines: label, value, hint. |
| D3 | **No small uppercase letter-spaced labels on dashboards** (eyebrows, table headers, tags, buttons). The SANCTUS wordmark is the only exception. |
| D4 | **Remove** the "Recently added products" and "Recently created businesses" panels from both Overviews. Nothing else is removed. |
| D5 | On the business Overview, "View catalog" appears **only in the top bar**. |
| D6 | On the Applications list, each row's "Review" is an **outlined** button; the page keeps one filled primary action. |
| D7 | The Admin Overview keeps its three real header actions, with "View catalogs" as a quiet text button. |
| D8 | **Public catalogue and product pages** keep Jost and Cormorant. Small uppercase labels grow to at least 12px with less letter-spacing. The "01 //" numbering on cards goes. "Ver peça →" becomes sentence case. Structure and 3D/AR behaviour are unchanged. |
| D9 | **Not touched:** the landing page, `/apply`, `/login`, `/reset-password`, `/accept-invite`, `/join`, `/demo`, and the email designs. |

## 3. Scope

- **Admin console:** Overview, Applications, Application detail (in review and approved), Businesses, Business detail (all tabs), All Products, Catalogs & QR Codes, Analytics, Audit log, Settings, Team & Access (members, invitations, access history), Role permissions, Member detail, Invite member dialog, Invitation panel.
- **Business owner dashboard:** Overview, My Products, the product editor (new and edit), My Catalog & QR, Analytics, Business Settings.
- **Shell:** sidebar, top bar with breadcrumbs, mobile drawer, the not-found page inside the shell, confirm dialogs, toasts and menus as they appear in dashboards.
- **Public:** catalogue page and product page (clarity and type only).

## 4. Architecture

### 4.1 One dashboard scope, so nothing outside it changes

- `DashboardShell` gets a root attribute `data-surface="dashboard"`.
- All new dashboard type, density and font rules live in `src/index.css` under `[data-surface="dashboard"]`: font family, sizes, label and table rules, sentence-case buttons, tabular numbers.
- Pages outside the shell (landing, apply, auth, public) never match those selectors, so they cannot change. This is what makes success criterion 2 hold.
- Dialogs and menus render in a portal outside the shell's DOM. The portal root for dashboard dialogs (`Modal`, `DropdownMenu` popover, toasts, confirm) inherits the attribute while a dashboard route is mounted: the shell sets `document.body.dataset.surface = 'dashboard'` on mount and removes it on unmount.

### 4.2 Fonts and tokens

- **Inter:** variable weights 400, 500 and 600 from Google Fonts, added to the existing font `<link>` in `index.html`. No npm dependency.
- **New tokens in `src/index.css`** (dashboard scope):
  - `--font-ui: 'Inter', ui-sans-serif, system-ui, sans-serif`;
  - the dashboard type scale from BRIEF §1 (Variant A column);
  - spacing from BRIEF §2: canvas padding 40, 24 or 16px, card gap 24px, card padding 24px, control height 40px, sidebar 256px, top bar 56px.
- Existing colour tokens are unchanged.
- Cormorant is used for the dashboard h1 only, at 500 (`--font-display` already exists; add weight 500 to the font link if missing).

### 4.3 Shared components (most of the change)

Each component keeps its API and changes only its look inside the dashboard scope, unless noted.

| Component | Change (BRIEF section) |
|---|---|
| `PageHeader` | No eyebrow; breadcrumbs move to the top bar; h1 is Cormorant 32/1.15/500; optional subline 15px; status meta next to the subline; actions right, with one primary, at most one secondary, the rest in "More" (§3) |
| Top bar (`DashboardShell`) | 56px, solid canvas, hairline; breadcrumb text 14px; right side keeps the real actions (View catalog, Demo mode) |
| Sidebar | Nav items 14px (active 500), rows 40px, icons 18px; everything else stays as ADR-0028 |
| `StatGroup` | A single card divided by 1px vertical dividers; label 13px, value 28px tabular, hint 13px; **icons dropped** (the `icon` prop is ignored inside the dashboard scope, then removed from callers); the sample-data footer row stays (§4) |
| `DataTable` | Header 40px, 13px/500 sentence case, no fill; rows 52 or 60px; header rule `#D9D3C7`, row rules `#ECE7DD`; numbers right-aligned and tabular; a fixed 32px actions column; under 640px, a two-line list item with no dropped columns (§5) |
| `Badge` | 20px tall, 12px/500, sentence case, no tracking; tones from §5; role badges Owner, Admin, Team (§5) |
| `Tabs` (pill) | 14px sentence case, counts tabular |
| `Button` | Dashboard: 14px/500, sentence case, no tracking; 40px, 36px in card headers, 44px on touch |
| `Form` (`FormField`, `Input`, `Select`, `Textarea`) | Label 14/500 above; help 13px below; error replaces the help text in the danger colour with an icon; inputs 40px (16px text on mobile); "Required" and "Optional" markers (§6) |
| `Card`, `PanelHeader` | 24px padding; section title Inter 16/600 |
| `States` (`EmptyState`, `ErrorState`, `SkeletonRows`) | Empty: one ink sentence, one muted sentence, at most one action, no illustration; loading as flat bars at real heights; errors inside the failed block with a "Retry" text button (§7) |
| `Pagination`, `SearchInput`, `Menu`, `Modal`, toasts | Type and size alignment only |

### 4.4 Page work (after the shared components)

Each page is checked against its Stitch screen and adjusted where it differs. Most differences are layout grouping and copy placement.

- **Overviews (admin and business):** remove the recent-list panels (D4); single stat strip; one views and AR chart in a card; "Most viewed" ranked list; recent activity; next steps (business) or the pending-applications notice (admin). Header actions per D5 and D7.
- **Product editor:** a 200px sticky section index on the left with error markers; sections as flat cards; EN/PT segmented control on the label row with a "PT ·" missing marker; GLB and USDZ slots side by side; a 64px sticky publish bar with an honest status ("Unsaved changes", "All changes saved", "Not saved yet") and Preview, Save draft and Publish; an error summary card linking to fields.
- **Lists** (Applications, Businesses, All Products, My Products, Team & Access, Audit log): one toolbar row (search plus labelled selects); tables per §5; outlined row "Review" (D6).
- **Detail pages** (Application, Business, Member): header with status meta; two-column definition lists; history and timelines as plain lists.
- **Catalogs & QR, Analytics, Settings, Role permissions, Invite dialog:** per their screens.
- **Public catalogue and product (D8):** label sizes and letter-spacing, card numbering removed, sentence-case link text. Nothing else.

### 4.5 Copy

- Sentence case everywhere in the dashboards.
- Keep every existing message that tests or other features depend on, unless a design changes the visible text. Then update the matching test selector.
- No new claims, numbers or features.

## 5. Things the designs show that are not built

These are noted in BRIEF §10 and §11, and the real app wins:
- The accent swatches on Business detail are placeholders; use the real `ACCENT` values from the code.
- The Settings asset-credit lines come from `src/services/mock/credits.ts`, not from Stitch's copy.
- Stitch's sample application data is demo-only. The app shows real or seeded data with the existing "Sample data" labels.
- The editor's 3D preview in the design is a drawing; the app keeps the live `ModelViewer`.

## 6. Testing

1. **Regression guard for D9:** before any change, capture full-page screenshots, in demo mode at 1440 and 390, of `/`, `/apply`, `/demo`, `/login` (redirects to `/demo` in demo mode), `/accept-invite`, `/reset-password` and `/join`. Capture them again after each shared-component task and compare pixels. **Any difference is a failure.**
2. **Existing tests** (unit and browser) pass. Text selectors change only where a design changes the visible text.
3. **Visual check per page:** screenshots of every in-scope route in demo mode at 1440 and 390 (Admin, Business, Team, Owner and Team logins), set side by side with the Stitch screenshot in a review contact sheet. A fresh reviewer agent compares them against BRIEF.md and lists the gaps. Gaps are fixed before the page counts as done.
4. **Accessibility checks:** text below 12px is flagged; dashboard text colours are contrast-checked; there's a horizontal-overflow check at 390px; focus is visible on the new controls.

## 7. Rollout

- **Branch:** `feature/sanctus-brand-design-system`, to the Preview after each group (shared components, then the business pages, admin pages, team pages and public pages).
- **ADR-0031:** written in the first task, with a row in the decisions index. `design/11-design-system.md` gets a "Dashboard type" section.
- **No database or server changes.** Nothing goes to `main` without the owner's go-ahead.

## 8. Out of scope

- Any change to the landing page, apply page, sign-in pages, join page or emails.
- New features or data on any page.
- Dark mode.
- Changing the AR or 3D behaviour.
- Add-ons A2 (QR and direct AR link) and A3 (request a 3D model), which follow separately.

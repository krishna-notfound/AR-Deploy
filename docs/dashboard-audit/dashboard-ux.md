# Business owner workspace: UX/UI audit (Agent B)

Date: 2026-10-20. Branch `feature/sanctus-brand-design-system` (read-only; no repo files changed).
Method: local Vite in **demo mode** (`VITE_DATA_MODE=demo`, Supabase env blanked, port 5261), driven by Playwright at 1440x900 and 390x844, signed in through `/demo` as **Casa Lisboa Interiors** (active, 6 products) and **Oak & Ember Studio** (inactive, 2 products, then deleted to reach empty states). Scripts and screenshots: `<local>` (`run*.cjs`, `d-*.png`, `m-*.png`, `log.txt`, `log2.txt`).
Labels: **[observed]** = seen in the running app; **[code]** = read in source and not exercised (for example, real file uploads); **[estimate]** = a judgement.

No P0 found. The workspace is fundamentally sound. The gaps are in **status visibility**, **"what do I do next"**, a mobile layout bug, and some technical or ambiguous copy.

---

## What to keep (reuse, don't rebuild)

- **Shell and navigation.** Clear six-item sidebar. The business logo and name are shown with "Business dashboard". It has a skip link, a focus-trapped mobile drawer, a collapse control, and a visible 2px focus outline on every tab stop [observed]. The tab order is logical (skip, then brand, then nav, then topbar, then page actions) [observed].
- **`PendingApprovalNotice`** in `DashboardShell.tsx`: the right pattern for status-in-context. It should be extended (see DUX-01), not replaced.
- **Product editor** (`ProductEditorForm.tsx`):
  - Section rail with per-section error icons.
  - Error summary that receives focus, with anchor links [observed].
  - Publish auto-saves a new draft first and lists every missing requirement at once [observed].
  - Sticky Preview / Save / Publish bar with a status badge and "All changes saved" / "Unsaved changes".
  - Unit-conversion dialog.
  - **Unsaved-changes guard works** on desktop and through the mobile drawer [observed].
- **AR readiness panel and scale check** (`ModelSection.tsx`):
  - Per-platform checklist: 3D viewer, Android AR, iPhone/iPad AR, True size.
  - Honest "Scale verified" only when the measured size matches, and "AR scale unverified" otherwise.
  - Clear "No USDZ: … not guaranteed" warning [observed on Glam Velvet Sofa]. This is the best part of the workspace. Surface it elsewhere (DUX-05, DUX-06).
- **Analytics honesty.** "AR launch attempts" everywhere (never "AR sessions"). "Sample data" tag. "Includes seeded sample data. Not live production analytics." Empty states exist for top products and the performance table [observed].
- **Catalog & QR.** The QR always encodes the catalog URL, with a clear note why. Copy URL and Download PNG (1024 px). An inactive-status warning appears on this page [observed].
- **Row action menu.** Keyboard-operable (Enter opens with focus on "Edit", arrow keys move, Escape returns focus to the trigger) [observed]. Labels change with status ("Preview draft" / "Open product page", "Publish" / "Unpublish"). Delete is confirmed and says what is lost.
- **Filters in the URL**, "No products match these filters" with Clear filters. Empty state "Add your first product" with a primary action [observed].
- **Brand.** Serif display headings, obsidian primary buttons, bronze active-nav marker and links (`accent-ink`), and quiet status pills. These are consistent across every owner screen [observed].

---

## Issues

### DUX-01: An inactive (or not-yet-approved) catalogue looks normal everywhere except one page. P1 [observed]
- **Screen:** `/dashboard`, `/dashboard/products`, editor (Oak & Ember Studio, status `inactive`).
- **User goal:** "Are my customers seeing my products?"
- **Flaw:**
  - Overview shows "Published 2" with green "Published" pills and no warning.
  - `PendingApprovalNotice` only renders for `status === 'draft'`.
  - The only signal for `inactive` is the notice on `/dashboard/catalog`.
- **Why a person struggles:** The owner prints QR codes and tells customers to scan, but the public page says "This catalog is currently unavailable" (`d-oak-public.png`). Nothing on the home screen explains why the catalogue gets no views.
- **Recommendation:** Generalize `PendingApprovalNotice` into a `CatalogStatusNotice` in the shell for every non-active status:
  - `draft`: "not public yet, the platform team will activate it".
  - `inactive`: "Your catalogue is paused. Customers who scan your QR code see 'catalogue unavailable'. Contact the platform team to reactivate."
  - Use the existing `InlineNotice tone="warning"`.
  - On the overview, also show the business status badge next to the H1 (reuse `BusinessStatusBadge`).
- **Acceptance:**
  - Signed in as Oak & Ember, every `/dashboard/*` route shows the paused notice.
  - Casa Lisboa (active) shows none.
  - Draft businesses keep today's copy.
  - Desktop and mobile are both checked.

### DUX-02: The owner cannot preview their own catalogue until it is active. P1 [observed for inactive; draft from code]
- **Screen:** `/dashboard/catalog` → "Open catalog preview"; Overview → "View my catalog".
- **User goal:** For a newly approved owner (draft business), "see what my catalogue will look like before it goes live".
- **Flaw:**
  - Both buttons open `/catalog/<slug>`.
  - `CatalogPage.tsx:89` renders the customer "unavailable" page for any non-active business, with no preview mode.
  - Products already support `?preview=1` (`productLocalPath`), but catalogues do not.
- **Why a person struggles:** The approval flow says "You can add products now", but the one place to see the result is a dead end. The button behaves like a broken link.
- **Recommendation:**
  - Add a `catalogLocalPath(b, { preview })` variant in `src/lib/urls.ts` (URLs only built there).
  - Let `CatalogPage` render for the signed-in owner of that business, or a super admin, with the same preview banner the product page uses.
  - Buttons pass `preview` when `status !== 'active'`, and their label becomes "Preview catalogue (not public yet)".
  - The role guard is not a security boundary: preview shows the owner's own data the dashboard already loads, and Supabase RLS stays the real gate.
- **Acceptance:**
  - As Oak & Ember, "Open catalog preview" shows the catalogue with a "Preview: not visible to customers" banner.
  - Logged out, the same URL still shows "unavailable".

### DUX-03: The Catalog & QR panel is clipped at phone width. P1 [observed]
- **Screen:** `/dashboard/catalog` at 390 px (`m-catalog-full.png`).
- **User goal:** Copy the catalogue link or get the QR code on a phone.
- **Flaw:**
  - The left column overflows the card by about 39 px (measured: content `right=429` on a 390 px viewport).
  - `Card overflow-hidden` hides it, so "Copy URL" reads "Copy U", "View products" is cut, and the "Encode local preview URL" switch is half off-screen.
  - The grid has no explicit mobile column, so the implicit `auto` track grows to the URL's min-content width.
- **Why a person struggles:** The main action on the page they will most likely open on a phone looks broken. The switch can't be seen.
- **Recommendation:** In `CatalogQrPanel.tsx`, use `grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px]` (or `min-w-0` on the grid children).
- **Acceptance:**
  - At 390 px, no descendant of `main` extends past `window.innerWidth`.
  - The Copy URL label is fully visible.
  - Admin `/admin/catalogs` is re-checked (shared component).

### DUX-04: The overview doesn't tell an owner what to do next. P2 [observed]
- **Screen:** `/dashboard` (populated and empty).
- **User goal:** "What needs my attention today?"
- **Flaw:**
  - Five stat tiles plus two charts dominate.
  - With an empty catalogue, the first screen is a row of zeros and two flat lines. The only guidance ("Add your first product") sits in the lower-left card (`d-oak-overview-empty.png`).
  - With products, nothing points out the draft that was never published, products without a 3D model, or products with Android-only AR (no USDZ).
- **Why a person struggles:** A first-time, non-technical owner doesn't know that a 3D model and a USDZ are what make "View in AR" work on iPhones. They also don't know that a draft is invisible.
- **Recommendation:** Add a compact "Next steps" card above the charts, built from data already loaded (`products`, `business`):
  - Empty catalogue: a 3-step checklist (Add a product → Add a 3D model → Publish and print your QR code). Each step links to the existing route.
  - Populated: up to 3 attention rows ("1 draft not published", "2 products have no 3D model", "3 products have no iPhone AR file (USDZ)", "Catalogue paused"). Each row links to the filtered product list (see DUX-05).
  - Hide the trend chart when there are no published products, and show its empty state instead.
  - No new dependency. Use `Card`, `EmptyState` and existing badges.
- **Acceptance:**
  - Empty Oak & Ember shows the checklist first, with no flat-line charts.
  - Casa Lisboa shows "1 draft", "2 without 3D model" and the USDZ count, each linking to a filtered list.

### DUX-05: The product list doesn't show AR readiness; "3D" is the only hint and disappears on mobile. P2 [observed]
- **Screen:** `/dashboard/products` (desktop and mobile).
- **User goal:** "Which products can customers see in AR, and which need work?"
- **Flaw:**
  - A small "· 3D" glyph next to the category means a GLB exists. It doesn't say whether iPhone AR (USDZ) or true size is ready.
  - Mobile rows (`mobileRow`) drop the 3D marker entirely.
  - The "AR" column header and "0 AR" on mobile are ambiguous (count of what?).
  - There is no filter for "no 3D model" / "AR ready".
- **Why a person struggles:** They can't find the products that need a model without opening each one.
- **Recommendation:**
  - Replace the glyph with a small readiness pill derived from `arReadiness()` (already in `ModelSection`). Move it into a shared helper in `src/lib/product.ts` so the table and editor agree. Pill values: "AR ready", "Android only", "Photos only".
  - Show the pill in `mobileRow` too.
  - Rename the column to "AR attempts", and the mobile text to "N AR attempts".
  - Add a "3D / AR" select to `ProductFilterBar` (All / AR ready / Needs iPhone file / No 3D model), kept in the URL like the other filters.
  - ProductTable stays shared with admin (no per-dashboard copy).
- **Acceptance:**
  - The Casa Lisboa table shows "Photos only" for Atlantic Round Dining Table and Mustard Tufted Armchair, and "Android only" for Glam Velvet Sofa (no USDZ).
  - The filter returns those sets.
  - The pill is visible at 390 px.

### DUX-06: Publish requirements only appear after a failed attempt, and the error toast covers the action bar. P2 [observed]
- **Screen:** `/dashboard/products/new` and edit.
- **User goal:** Publish a product without trial and error.
- **Flaw:**
  - The rules (price > 0, ≥ 1 image, three dimensions > 0) are revealed only by clicking Publish. The red banner then says "Fix these 3 issues to continue".
  - The "Cannot publish yet" toast is bottom-right, over the sticky bar's Save draft / Publish buttons at both 1440 and 390 px (`d-new-publish-name.png`, `m-new-publish-name.png`).
  - Clicking Publish on a new product silently creates a draft (breadcrumb becomes "Edit product") without saying so.
- **Why a person struggles:** It feels like being scolded. The buttons they need are hidden for several seconds. Owners don't learn the rules up front.
- **Recommendation:**
  - In the sticky bar's left area (or above the first section), show a persistent "Ready to publish: 2 of 4" checklist using `validateForPublish` live (Name, Price, At least one image, Dimensions). Each item is ticked or links to its section.
  - Rename the error banner title to "Before you can publish" when only publish rules fail.
  - When publish was blocked on a new product, add "Saved as a draft." to the toast.
  - Raise the toast region above the sticky bar on editor routes (`bottom: calc(bar height + gap)`), or position it top-right. This is a change in `ToastProvider` via a CSS variable the editor sets.
- **Acceptance:**
  - A new product shows the checklist before any click.
  - A blocked publish toast never overlaps the Publish button at 1440 or 390 px.
  - The toast mentions the saved draft.

### DUX-07: Analytics wording and per-product AR numbers can mislead. P2 [observed]
- **Screen:** `/dashboard/analytics`, overview tiles, product table.
- **User goal:** Understand how customers engage with AR.
- **Flaw:**
  - The "AR launch rate" hint says "Activations per product view". "Activations" implies confirmed AR, which contradicts "attempts".
  - Products with no 3D model show "0 AR attempts / AR rate 0.0%" (Atlantic Round Dining Table, Mustard Tufted Armchair). That reads as poor performance, not as "AR not available".
  - "3D interactions" is 0 alongside 4,072 views in the sample data, which looks broken. Its hint "Visitors who turned or zoomed a model" implies unique people.
  - The time range "Last 30 days" appears on the chart but not on the analytics stat tiles (the overview tiles have it). There is no range choice [estimate: acceptable for v1 if labelled].
  - The "Sample data" tag on analytics sits only on the chart card, not with the totals.
- **Why a person struggles:** An owner may decide AR "doesn't work" for a product that simply has no model, or think 3D tracking is broken.
- **Recommendation:**
  - Hint: "AR launch attempts per product page view".
  - For products without a GLB, show "—" with a title "No 3D model" in the AR attempts / AR rate cells and the top list (`AnalyticsView`, shared).
  - "3D interactions" hint: "Times a visitor turned or zoomed a 3D model". Seed a few sample interactions, or show "—" when sample data has none.
  - Add `hint: 'Last 30 days'` to the analytics tiles.
  - Show the `SampleDataTag` plus footer note under the StatGroup, as on the overview.
- **Acceptance:**
  - No owner-visible string contains "activation(s)" for AR.
  - Products without a model never show "0.0%".
  - The tiles state the period.

### DUX-08: Technical and developer copy in the owner workspace. P2 [observed; production pill from code]
- **Screens:**
  - Catalog: "Encode local preview URL / For testing on a phone on this network"; "Demo URL. The subdomain is not live until DNS and hosting are set up with the backend."
  - Topbar pill: `isDemoMode ? 'Demo mode' : 'Supabase'`. A production owner sees **"Supabase"** (`DashboardShell.tsx` Topbar).
  - Editor: "/products/" slug addon; "The file header is checked to confirm the format."
  - Settings save toast: "a real subdomain and SSL certificate need deployment setup" (`BusinessForm.tsx:111`).
- **User goal:** Understand the screen without IT help.
- **Why a person struggles:** "Supabase", "DNS", "backend" and "file header" are meaningless to a furniture shop owner. The local-URL switch invites them to print a QR code that only works on their Wi-Fi.
- **Recommendation:**
  - Hide the topbar data-mode pill outside demo mode. Keep "Demo mode" in demo, since it is honest labelling.
  - Show the "Encode local preview URL" switch only when `PUBLIC_URLS_ARE_TEMPORARY` (local or preview hosts), never on production.
  - Rewrite demo-URL notes as "Example address for this demo. Your real address is set up by the platform team."
  - Rename "Product URL" to "Web address", with the hint "Customers see this at …".
  - Keep the technical model wording inside the 3D section (owners pass it to their 3D artist).
- **Acceptance:** On a production-like build (`PUBLIC_URLS_ARE_LIVE`), no owner-visible text contains "Supabase", "DNS", "backend" or "SSL", and the local-URL switch is absent.

### DUX-09: "Copy product URL" on a draft copies a link customers can't open. P2 [observed + code]
- **Screen:** product row menu (`d-products-menu.png`).
- **Flaw:** For a draft, the menu offers "Copy product URL". `copyUrl` copies the public URL, which shows "not available" to customers. The toast doesn't warn.
- **Why a person struggles:** The owner pastes it into WhatsApp and the customer gets an error.
- **Recommendation:** For drafts, hide "Copy product URL", or keep it with the toast "Copied. This link works once the product is published." Do the same when the business is not active. The change goes in `useProductActions.copyUrl` (shared).
- **Acceptance:** Copying a draft's URL never shows a plain success without the not-live caveat.

### DUX-10: Touch targets below 44 px on phone. P2 [observed]
- **Screen:** all owner routes at 390 px.
- **Flaw (measured):**
  - Row actions "…" 32×32 (products, overview).
  - EN/PT language toggles 36×28 (×5 per editor).
  - Copy URL, "Show as table", "Add colour or option", Centimetres/Inches and image "Remove": 32 px tall.
  - Inline text links ("Open analytics", "All products", product names in lists): 20 px tall.
  - Topbar avatar 36×36.
- **Why a person struggles:** Mis-taps on the action menu next to a product name. The PT toggle is easy to miss.
- **Recommendation:**
  - Add a `coarse`-pointer rule (`@media (pointer: coarse)`) in `src/index.css` that gives `IconButton size="sm"`, `SegmentedControl size="sm"` and `Button size="sm"` a min-height and min-width of 44 px (or a 44 px hit area via padding or pseudo-element).
  - Give card-header text links `py-2`.
  - Desktop density is unchanged.
- **Acceptance:** The Playwright scan reports no interactive control under 40×40 on `/dashboard/*` at 390 px with `hasTouch`, except the skip link.

### DUX-11: The editor route highlights no nav item; "Add Product" is a nav destination. P3 [observed]
- **Flaw:**
  - On `/dashboard/products/:id/edit` no sidebar item is active, because "My Products" has `end: true` (`d-edit.png`).
  - "Add Product" sits in the nav beside "My Products", which mixes actions and places, while the same primary button already appears on Overview and My Products.
- **Recommendation:** Drop `end` on My Products, or match `/dashboard/products/*` except `/new`, so editing keeps "My Products" active. Consider removing "Add Product" from `businessNav` (it stays as the primary button on both pages). This is a nav.ts-only change.
- **Acceptance:** The edit page highlights "My Products".

### DUX-12: Small polish items. P3 [observed]
- **Avatar initials.** "Oak & Ember Studio" renders as **"O&"** in the topbar avatar (`d-oak-overview.png`). The `initials()` helper should skip non-letters. The brand tile correctly shows "OE".
- **Mobile overview stat grid.** The 5th tile ("AR launch attempts") sits alone with an empty cell beside it (`m-overview.png`). Let the last odd tile span 2 columns in `StatGroup`.
- **Notifications on first sign-in.** The bell shows "8 new" for the owner's own historic activity, so the red dot is always lit on first visit. Treat everything before first sign-in as read, or relabel the panel "Recent activity" without an unread badge.
- **Unpublish has no distinct state.** It turns a product back into "Draft" (toast: "The product is now a draft"). There is no "Unpublished" status, so owners can't tell never-published from taken-down. Acceptable for v1 if the editor shows "Was published on …" for drafts with a `publishedAt` [code: check field availability before promising].
- **Upload status label [code, not exercised].** While a model uploads, the button still reads "Checking file…" (the `checking` state covers the upload too) and there is no progress for files up to 50 MB. The sticky Save/Publish buttons are not disabled while `ModelSection` is busy. Show "Uploading…" during `service.uploadAsset`, and lift a `uploading` flag to disable Save/Publish until it finishes.
- **Hardcoded chart colour.** The top-products bar colour `#2E8B6A` is hardcoded in `AnalyticsView` (a validated chart palette in `Charts.tsx`). Move it to a token in `src/index.css` for consistency with ADR-0023.

---

## Prioritised implementation list (smallest coherent set; no new dependencies, no rewrite)

| # | Change | Files | Fixes | Size [estimate] |
|---|---|---|---|---|
| 1 | Mobile grid fix in QR panel (`grid-cols-1` on mobile) | `catalogs/CatalogQrPanel.tsx` | DUX-03 | XS |
| 2 | `CatalogStatusNotice` for draft **and** inactive; status badge on Overview H1 | `layout/DashboardShell.tsx`, `business/BusinessOverviewPage.tsx` | DUX-01 | S |
| 3 | Owner catalogue preview (`catalogLocalPath(..., {preview})` in `urls.ts`; `CatalogPage` preview banner for owner/admin); preview-aware buttons | `lib/urls.ts`, `public/CatalogPage.tsx`, `CatalogQrPanel.tsx`, Overview | DUX-02 | M |
| 4 | Shared `arReadinessSummary(product)` helper; readiness pill in ProductTable (desktop and mobile), "AR attempts" label, 3D/AR filter | `lib/product.ts`, `products/ProductTable.tsx`, `products/ProductFilters.tsx`, `editor/ModelSection.tsx` (reuse helper) | DUX-05 | M |
| 5 | Overview "Next steps" card (empty checklist / attention rows linking to filtered lists); chart hidden when nothing published | `business/BusinessOverviewPage.tsx` | DUX-04 | S–M |
| 6 | Editor publish-readiness checklist; toast offset above sticky bar; "Saved as a draft" copy | `editor/ProductEditorForm.tsx`, `ui/ToastProvider` | DUX-06 | S |
| 7 | Analytics copy and N/A for no-model products; period hints; sample tag on totals | `analytics/AnalyticsView.tsx` | DUX-07 | S |
| 8 | Plain-language copy pass; hide data-mode pill outside demo; local-URL switch only on temporary hosts | `DashboardShell.tsx`, `CatalogQrPanel.tsx`, `BusinessForm.tsx`, editor hints | DUX-08 | S |
| 9 | Draft-aware "Copy product URL" | `products/useProductActions.tsx` | DUX-09 | XS |
| 10 | Coarse-pointer 44 px targets for sm controls and card links | `src/index.css`, `ui/Button`, `ui/Form` (SegmentedControl) | DUX-10 | S |
| 11 | Nav active state for edit routes (and optionally drop "Add Product" item) | `layout/nav.ts` | DUX-11 | XS |
| 12 | Polish: initials, odd stat tile, notification seed, upload label and save lock, chart colour token | various | DUX-12 | S |

Items 1–3 are the release-relevant set (status honesty and a broken mobile screen). Items 4–7 make the workspace feel guided and professional. Items 8–12 are polish.
Every change stays inside the shared components (ProductTable, CatalogQrPanel, AnalyticsView, BusinessForm), so `/admin` benefits too. Re-check `/admin/products`, `/admin/catalogs` and `/admin/analytics` after items 1, 4, 7 and 9.
Per CLAUDE.md, each item needs typecheck, lint, test and build, plus desktop and mobile checks. AR modes are untouched: the readiness helper only reads existing model data.

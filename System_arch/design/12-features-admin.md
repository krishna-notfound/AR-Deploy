# 12 · Super Admin screens + demo entry
Read when: building `/` or any `/admin/*` page. For the shared editor, see [15-product-editor.md](15-product-editor.md). For analytics, see [16-analytics.md](16-analytics.md).

## Demo entry `/`
- Short intro.
- Card "Super Admin" → `/admin`.
- Card "Business Admin": a business Select plus a **"Scope pending confirmation"** badge → `/dashboard`.
- List of public catalogs.
- Footnote: "Demo mode: no real authentication; data stored in this browser."

## Overview `/admin`
- 6 StatCards: businesses, products, published, drafts, views, AR activations.
- 30-day chart of views and AR activations.
- Recent products, recent businesses, top products, recent activity.
- Quick actions: Create Business, Add Product, View Catalogs.
- "Sample data" tag.

## Businesses list `/admin/businesses`
- **Columns:** logo, name, catalog URL (Demo), total/published products, views/AR, status, updated.
- **Controls:** search; status filter; sort by name, updated, products, or views; pagination of 10.
- **Row actions:**
  - Edit
  - Open catalog
  - View products → `/admin/products?business=`
  - View QR → `/admin/catalogs?business=`
  - Activate/Deactivate (confirm)
  - Delete (confirm; cascades to products)

## Business create / edit (`BusinessForm`, shared)
- **Fields:**
  - name (required, max 80)
  - slug (auto-generated from the name, editable, pattern-checked, unique)
  - logo upload
  - description
  - contact: email, phone, website, address (with email and URL validation)
  - status
  - accent colour
  - default currency
- A live `BusinessIdentityPreview`.
- **Actions:** "Save as draft" or "Create business" on create; "Save changes" on edit.
- After create, show a toast with the honesty note from [01-overview.md](01-overview.md) rule 2.
- `/admin/businesses/:id` also has Products and QR tabs.

## All products `/admin/products`
- `ProductTable`: image, name, business, price, status, views, AR, updated.
- **Filters:** search, business, status, category. Filters, sort, and paging are synced to the URL.
- **Row menu:**
  - View
  - Edit
  - Duplicate
  - Publish/Unpublish
  - Copy URL
  - Open preview
  - Delete (confirm)
- "Add product" opens a business-picker modal unless `?business` is already set.

## Catalogs & QR `/admin/catalogs`
`CatalogQrPanel` (shared):
- Business selector.
- Demo catalog URL with a copy button.
- QR canvas with "Download PNG".
- Open catalog preview.
- Published/total product counts with a link to the filtered product list.
- Note: "The QR always points to the catalog, so it stays valid as products change."

## Settings `/admin/settings`
- Profile (display only).
- Reset demo data (confirm).
- Developer: failure-injection toggle.
- Limitations panel, using the table in [18-mock-vs-backend.md](18-mock-vs-backend.md).

## Website Editor `/admin/editor` (ADR-0043, 2026-10-29; needs `content.manage`; built, migration not applied)
- Nav item "Website editor" (`editor.nav`) after "Catalogs & QR Codes", shown only with `content.manage` (Owner and Admin by default, Team no). Every route is wrapped in `RequirePermission`; the database refuses the same calls (2FA gate, then permission).
- Routes: `/admin/editor` (to Pages), `/pages`, `/pages/:pageKey` (`terms`, `privacy` or a custom page id), `/apply` (tabs `?tab=form` and `?tab=messages`), `/social`, `/preview/:target` (`page/:key`, `apply`, `apply/done`, `footer`).
- One draft document edited by all sections, autosaved 2 s after the last change with the last known `draftUpdatedAt`. A second editor gets `draft_conflict` and a banner. The top bar always shows save status, Preview, History, Publish.
- Publish opens "Publish N changes to the live site?" with counts by group and the number of `[[PLACEHOLDER]]` tokens still in the text (warns, does not block). History lists every published version; Restore copies one into the draft, it does not go live until the next Publish.
- Pages: Terms and Privacy start from the shipped text with Reset to original per language; custom pages have title, address (`/pages/<slug>`), "Show in footer", footer order, Markdown body in EN and PT (empty PT shows the English text). No raw HTML.
- Application form builder: steps (up to 8, Review fixed last), field order and "Move to step", hide or optional per field (business name, contact name and contact email are locked), up to 10 extra questions, choice options can be hidden, all `apply.*` texts in EN and PT. Buttons only, no drag and drop (no dependency).
- Social links: six networks, host-checked `https` URLs, shown as icons in the main site footer and the Apply page, not in business catalogue footers.
- Preview uses the real public components with the draft as the source, under a fixed "Preview of the draft. Not live." bar; the application form cannot send from there.
- Spec: `docs/superpowers/specs/2026-10-29-content-editor-and-bilingual-dashboards-design.md`. Playwright: `tests/e2e/content-editor.spec.ts` and `.mobile.spec.ts`.
- The dashboards are bilingual (EN and PT-PT) through `t()`, with the same language switch in the top bar as on the public pages (ADR-0044, design/10).

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
- Routes: `/admin/editor` (to Pages), `/pages`, `/pages/:pageKey` (`terms`, `privacy` or a custom page id), `/apply` (`?tab=messages` opens the "Button & message texts" panel), `/social`, `/preview/:target` (`page/:key`, `apply`, `apply/done`, `footer`).
- One draft document edited by all sections, autosaved 2 s after the last change with the last known `draftUpdatedAt`. A second editor gets `draft_conflict` and a banner. The top bar always shows save status, Preview, History, Publish.
- Publish opens "Publish N changes to the live site?" with counts by group and the number of `[[PLACEHOLDER]]` tokens still in the text (warns, does not block). History lists every published version; Restore copies one into the draft, it does not go live until the next Publish.
- Pages: Terms and Privacy start from the shipped text with Reset to original per language; custom pages have title, address (`/pages/<slug>`), "Show in footer", footer order, Markdown body in EN and PT (empty PT shows the English text). No raw HTML.
- Application form builder (ADR-0059, 2026-11-11; replaces the Form and Messages tabs and the field drawer of ADR-0043): one centred column of cards edited in place, like Google Forms. Same saved format and public page; the locks and limits are changed by ADR-0057 (2026-11-11, below): only the email and the consent and terms ticks are locked, any other question or section can be deleted, 30 own questions and 12 sections.
  - Header card (eyebrow, title, introduction); a group per section (title and description in place, a ⋮ menu: Move up, Move down, Add section below, Delete for every section except Review, with a confirmation: its questions move to the section above, or to the next one for the first section; the last section before Review cannot be deleted and its menu says why; up to 12 sections, Review fixed last with the consent sentence editable and both rows marked "Required by law."); an "After sending" card (thank-you texts, link to preview); a collapsible, searchable "Button & message texts" panel (`?tab=messages` opens it).
  - Question cards: closed they look like the form (Required, Optional, Hidden, Standard badges); click or Enter opens one at a time. Own questions: kind menu with icons (short answer, paragraph, yes or no, multiple choice, checkboxes), description, options (add, remove, move; 2 to 10), Duplicate ("(copy)", disabled at 30 with the reason), Delete with a confirmation, Required switch. Standard questions: reword with Reset to default, rename and hide options (one stays visible), Hide or Show, and **Delete** (card button and ⋮ menu, with a confirmation, ADR-0057). Only the contact email is locked: a lock and "We reply to this address and invite the owner here.", no Hide, no Delete, no Required switch; its wording can be edited.
  - Reorder by dragging the handle inside a section or into another (pointer events, no dependency; the line shows where it lands), or with the ⋮ menu (Move up, Move down, Move to section) and the arrow keys on the handle; moves are announced and focus stays on the handle. Pure helpers in `formOps.ts` (`moveFieldTo`, `moveField`, `moveFieldToStep`, `duplicateQuestion`, `addQuestion`, `addStep`).
  - EN | PT switch at the top = the language being typed (an empty Portuguese field shows the English text greyed). Add bar: Add question (kind first, below the open card or at the end of the section in view) and Add section; floating to the right of the open card from 1280 px, a fixed bottom bar below. "Preview the form" opens the live preview (EN | PT, desktop | phone) in a light area (`data-theme="light"`). The problems banner links each problem to its card.
  - Delete anything (ADR-0057, 2026-11-11; migration `apply_form_delete_anything` written, applied to the testing database only after the owner's go-ahead): every standard question except the email can be deleted. The document keeps `removedFields` (built-in keys, never `applicantEmail`); a deleted question has no placement, is not asked, and applications store it as null (a deleted `language` stores the language the visitor used). **Add question** has a "Restore a standard question" group listing them (they do not count as own questions). The form menu (⋮ next to Preview) has **Start from blank** (one section holding the email, then Review; own questions, other sections and hidden options go; texts stay) and **Restore the original form** (back to `DEFAULT_APPLY_FORM` with the texts kept; off while the form is original). Both confirm and are draft edits, so History and "don't publish" undo them. Pure helpers in `formOps.ts`: `deleteField`, `restoreField`, `startFromBlank`, `restoreOriginal`, `canDeleteStep`, `isOriginalForm`; `deleteStep` now takes built-in sections. Limits: 30 own questions, 12 sections, 50 placements.
- Social links: six networks, host-checked `https` URLs, shown as icons in the main site footer and the Apply page, not in business catalogue footers.
- Landing collections (ADR-0046): `/admin/editor/landing` edits the cards of the landing page Collections section (up to 8; EN/PT title and short text; one of 12 built-in photos; link to a published product, a business catalogue with an optional category, the application form, or none; hide/show; order). Nothing published = the built-in four. Preview opens the landing page with the draft.
- Site icon and landing texts (ADR-0053, 2026-11-09, migration `site_content_round2` written, not applied): `/admin/editor/site` uploads or removes the favicon (PNG only, square, 32 px or more, at most 1 MB; previews at 16, 32 and 180 px; the built-in icons stay when none is set; applied at run time by `useSiteFavicon` in `RootLayout`). The Landing tab ends with a "Texts" block: the 49 whitelisted `landing.*` texts by section (Hero, How it works, Experience, Collections, About, Partners), EN and PT, the original as placeholder, Reset to original per text and per section; the landing renders `override ?? dictionary` through `LandingRoute`.
- Homepage sections, QR section and About pictures (ADR-0061, 2026-11-11, migration `landing_sections` written, not applied): the Landing tab opens with a **Sections** block over `landing.sections` (default: qr, how, experience, collections, about, partners; the hero is always first). Each row has Move up/down, Hide/Show, Edit (own sections, the QR row and the About row) and Delete with a confirm (own sections only); **Add section** offers Text, Picture + text and Banner (EN/PT texts, uploaded picture with alt through `UploadButton`/`content.uploadSiteAsset`, optional button with a `/` or `https://` link, optional anchor; at most 16 sections, 10 own). The QR row edits `landing.qr` (picture, left/right/none); the About row edits `landing.about` (main and detail photograph, Reset to the built-in one). The QR texts are a new group in Texts (`landing.qr.*`; `landing.hero.body` is moved there). Pure edits in `features/editor/sectionOps.ts`; the SQL gate is `private.check_landing_layout` plus helpers.
- Preview uses the real public components with the draft as the source, under a fixed "Preview of the draft. Not live." bar; the application form cannot send from there.
- Spec: `docs/superpowers/specs/2026-10-29-content-editor-and-bilingual-dashboards-design.md`. Playwright: `tests/e2e/content-editor.spec.ts` and `.mobile.spec.ts`.
- The dashboards are bilingual (EN and PT-PT) through `t()`, with the same language switch in the top bar as on the public pages (ADR-0044, design/10).

## Categories and currencies (ADR-0055)

Admin console entry "Categories & currencies" (`/admin/lists`, `content.manage`) with two tabs. Categories: add (English and Portuguese name), rename, move up and down, show or hide, delete with a confirmation (the products move to "Other"). Currencies: a searchable list with a switch each; at least one stays on. The product editor, the product filters, the CSV import, the business form and the public catalogue read the lists through `useCategories` / `useCategoryLabel` / `useCurrencies` (`src/services/listsHooks.ts`); the built-ins are the fallback while the lists load.

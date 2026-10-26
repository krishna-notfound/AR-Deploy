# PUB audit (public catalog, product pages, AR, QR, embed)
Scope read: `src/features/public/*` (CatalogPage, ProductPage, EmbedProductPage, ProductMedia, ArSection, PublicShell, ShareActions), `src/features/ar/{variantMedia,readiness}.ts`, `src/components/three/ModelViewer.tsx`, `src/lib/{urls,product,userAgent}.ts`, `src/tenant/resolveTenant.ts`, `src/app/router.tsx`, `src/i18n/{LanguageProvider,translate}.ts` + dictionaries (EN/PT key sets compared: complete), `src/services/hooks.ts`, the public reads in `src/services/supabase/supabaseCatalogService.ts` and `src/services/mock/mockCatalogService.ts`, `src/features/catalogs/CatalogQrPanel.tsx`, `src/features/products/{ProductQrDialog,EmbedCodeDialog,useProductActions,ProductTable}.tsx`, `ProductEditorForm.tsx` (preview, slug, CTA), `vercel.json`, `index.html`, RLS/grants in `20261012192143_init_schema.sql`, `20261012192159_storage.sql`, `20261020143507_variant_media.sql`, `20261025070915_platform_team_roles.sql`, `record_event_limited` in `20261012200810_analytics_rate_limit.sql`, approval insert in `20261020091428_*`, ADR-0025/0026.

Checked and found consistent (no finding): anon RLS shows only `status='active'` businesses and `published` products of active businesses, and children/variant media/storage objects follow the parent's visibility. `record_event_limited` checks published + active. The embed refuses drafts and non-active businesses even for signed-in users. The catalog QR encodes `catalogPublicUrl` (ADR-0005), and the product QR is offered for published products only. `?variant=` with an unknown id falls back to the first variant. Variant ids stay stable across `save_product`. A missing USDZ lets iPhone generate one from the GLB, and the copy says so. A GLB with Scene-Viewer-unsupported extensions gets the "model unsupported" message on Android. A USDZ without a GLB is never used, and readiness says so. EN/PT dictionaries have the same keys, and `pickLocalized` falls back to EN and marks it with `lang="en"`. The reserved-subdomain list matches the DB slug check.

## Findings

### PUB-01 "Open product page" / editor Preview of a published product in a draft or paused business shows "Product not available" — High — CONFIRMED
- Where: `src/features/products/useProductActions.tsx:87` (`preview: p.status !== 'published'`), `src/features/products/editor/ProductEditorForm.tsx:333` (same rule), `src/features/products/ProductTable.tsx:75` (label "Open product page"), `src/features/public/ProductPage.tsx:61` (`canPreview` only with `?preview=1`), `src/services/supabase/supabaseCatalogService.ts:782` and `src/services/mock/mockCatalogService.ts:215` (no `allowDraft` → business not active → NOT_FOUND).
- What happens: every approved owner starts with a `draft` business (`20261020091428_applications_and_owner_access.sql:189-191`). The owner publishes a product, and the toast says it will be visible once activated (`useProductActions.tsx:37-38`). They then click "Open product page" in the table, or Preview in the editor. The link has no `?preview=1` because the product is published, so the page answers "Product not available. This product may have been removed or is not published." That is false: it is published, and the catalog is the reason. The same happens for a paused (`inactive`) business. The only way in is the catalog preview, whose product links carry the flag. Even then, the banner reads "Draft preview. Customers cannot see this page until it is published" (`product.draftPreview`, `ProductPage.tsx:225`) for a product that is already published.
- Expected rule: ADR-0025 §3 says owner preview of a non-active catalogue must not be a dead end ("the dashboard buttons are no longer dead ends"). CLAUDE.md requires honest UI.
- Fix sketch: UI. Compute the flag as `preview: p.status !== 'published' || business.status !== 'active'` in both callers (ideally one helper in `urls.ts`). In ProductPage, choose the banner by cause (`catalog.previewBanner` when the business is not active, `product.draftPreview` when the product is a draft).
- Live check: as a draft-business owner, publish a product, then use "Open product page" from My products.

### PUB-02 Paused/draft catalog: in Supabase mode, visitors see "Catalog not found, check the address", not the "unavailable" message the dashboard and ADR promise — Medium — CONFIRMED
- Where: RLS `"Active businesses are public"` (`20261012192143_init_schema.sql:261-263`). `getBusinessBySlug` returns NOT_FOUND when RLS hides the row (`supabaseCatalogService.ts:698-703`), so `CatalogPage.tsx:79-96` renders `catalog.notFoundTitle/Body` ("Check the address, or ask the store for their catalog link"). The `inactiveTitle` branch (`CatalogPage.tsx:104-110`) is reachable only by signed-in members and admins. The mock returns any business to anyone (`mockCatalogService.ts:106-110`), so the demo shows "paused".
- What happens: a store is paused, or a newly approved one is not activated yet. A customer scans the printed catalog QR and is told the address is wrong. Meanwhile `CatalogQrPanel.tsx:86` tells the owner "Customers who scan the QR code will see 'catalog unavailable'", and ADR-0025 §3 says "Everyone else still gets 'catalog unavailable'". The demo models the wrong behaviour. Also, the inactive copy says "The store has paused its online catalog. Please contact them directly" for a `draft` business too, and it offers no contact details even though `b.contact` is loaded.
- Expected rule: ADR-0025 §3, CatalogQrPanel copy, and the brief's rule that the demo must model the real rules.
- Fix sketch: SQL. Add a `security definer` RPC `public_catalog_status(slug)` that returns only `{exists, status}` (or name + status) for anon, and have the service map a hidden-but-existing business to a distinct code (e.g. `UNAVAILABLE`). Alternatively, change the dashboard and ADR copy to the real behaviour. Use a draft-specific body ("not open yet") and show the contact details when they exist. Make the mock return `UNAVAILABLE` to non-members.
- Live check: set a test business to inactive, then open `/catalog/<slug>` signed out.

### PUB-03 Changing a published product's slug silently breaks its product QR, embeds and shared links (no warning; the business slug has one) — Medium — CONFIRMED
- Where: `src/features/products/editor/ProductEditorForm.tsx:505` (slug freely editable on a published product, no confirm). Compare `src/features/businesses/BusinessForm.tsx:80-95`, which confirms "Printed QR codes and shared links to the old address will stop working". The routes resolve by slug only (`supabaseCatalogService.ts:777`), with no redirect or history.
- What happens: an owner prints product QR labels (ADR-0025) or pastes the embed (ADR-0026) on their website, then renames the slug. Every printed code and external iframe now shows "Product not available" with no warning. ADR-0025 itself names this trade-off ("a printed product QR code breaks if ... its slug changes"), but the UI never tells the owner at the moment it happens.
- Expected rule: consistency with the business-slug confirm, and ADR-0025's own trade-off note.
- Fix sketch: UI. When `latest.status === 'published' && input.slug !== latest.slug`, show the same destructive confirm on save ("product QR codes, embeds and shared links to /products/<old> will stop working"). Optionally store old slugs for a redirect (SQL, later).
- Live check: not needed (code path).

### PUB-04 Unpublished product stays viewable (and AR-launchable) in already-open pages, and its signed media URLs stay valid for up to 12 h — Low — CONFIRMED
- Where: `src/services/hooks.ts:31` (a failed refetch keeps `prev.data`), `ProductPage.tsx:70,83` (renders whenever `res.data` exists), `src/services/catalogService.ts:60` (`MEDIA_URL_TTL_SECONDS = 12 h`), and `supabaseCatalogService.ts:547` (signed URLs).
- What happens: the owner unpublishes. A visitor's open tab refreshes on focus (`useRefreshWhenStale`) and gets NOT_FOUND, but the page keeps showing the product and the AR button, because the error state keeps the previous data. Any signed model or photo URL already issued (including ones handed to Scene Viewer or Quick Look, or copied) keeps working until it expires. The `useProductActions.tsx:45` confirm promises that "Existing links will show 'product not available'".
- Expected rule: the unpublish confirm text, and the brief's "unpublish → embed/QR/public".
- Fix sketch: UI. In ProductPage and EmbedProductPage, treat `status==='error' && error.code==='NOT_FOUND'` as not-found even when stale data exists. Optionally use a shorter TTL for model URLs (service). Accept the remaining window in SECURITY_REVIEW.
- Live check: open a product, unpublish it in another tab, wait or force a refetch, then focus the first tab.

### PUB-05 Catalog page never refreshes signed image URLs: a catalog tab restored after 12 h shows broken photos — Low — CONFIRMED
- Where: `src/features/public/CatalogPage.tsx:46-49` (no `useRefreshWhenStale`), while `ProductPage.tsx:70` and `EmbedProductPage.tsx:33` do refresh.
- What happens: a visitor scans the QR, leaves the tab, and comes back the next day. Every card photo has expired and shows the missing-image state until a manual reload.
- Expected rule: consistency with the product page's stale-media rule (MEDIA_REFRESH_MS).
- Fix sketch: UI. Add `useRefreshWhenStale(products.refetch, MEDIA_REFRESH_MS, products.data)`.
- Live check: not needed.

### PUB-06 Admin "Open catalog" for a non-active business lands on "catalog paused" (no preview flag) — Low — CONFIRMED
- Where: `src/features/admin/BusinessDetailPage.tsx:106`, `src/features/admin/BusinessesListPage.tsx:92` (`catalogLocalPath(b)` with no preview). Compare `CatalogQrPanel.tsx:65` and `DashboardShell.tsx:412`, which add `preview: status !== 'active'`.
- What happens: a platform admin reviewing a draft business clicks "Open catalog". The page says "The store has paused its online catalog", which is wrong for a draft and is a dead end for the reviewer.
- Expected rule: ADR-0025 §3 (preview for platform admins). Two screens apply different rules.
- Fix sketch: UI. Pass `{ preview: b.status !== 'active' }` in both admin call sites.
- Live check: not needed.

### PUB-07 CTA link with an empty label renders an invisible, nameless link; the owner's label is ignored when there is no URL — Low — CONFIRMED
- Where: `ProductPage.tsx:324-332` (`<a>` with `<LocalizedSpan text={product.cta.label}/>`), `src/services/validation.ts:42` (URL validated, label not), and the editor at `ProductEditorForm.tsx:632-634`.
- What happens: the owner clears "Button label" but keeps a link. The public page renders an empty `<a>` (no visible text, no accessible name), and the store-contact fallback is also suppressed. In the other direction, with no URL, the public page shows "Contact the store" and the owner's custom label is never used.
- Expected rule: CLAUDE.md "No dead buttons".
- Fix sketch: validation and UI. Require `cta.label.en` when `cta.url` is set (or fall back to `t('product.contactStore')` for an empty label).
- Live check: not needed.

### PUB-08 Public routes build URLs outside `src/lib/urls.ts`; path-mode slugs are case-sensitive — Low — CONFIRMED
- Where: `ProductPage.tsx:71` (`` `/catalog/${businessSlug}` ``, which also drops the preview flag, so "Back to catalog" from a preview of a non-active catalog shows "paused"), `src/features/marketing/LandingPage.tsx:82` (`?category=` concatenated). `resolveTenant.ts:145` lowercases the host, but `/catalog/:businessSlug` and `/products/:b/:p` pass the param verbatim (`supabaseCatalogService.ts:700,775`).
- What happens: a hand-typed `/catalog/Casa-Lisboa` (from a printed card) returns "Catalog not found". From a product preview, the back link loses `?preview=1`.
- Expected rule: CLAUDE.md "URLs are built only in `src/lib/urls.ts`".
- Fix sketch: UI. Use `catalogLocalPath(b, { preview })` / `tenantCatalogPath()` in ProductPage, and a `catalogLocalPath(b, { category })` option. Lowercase the slug params (or `<Navigate>` to the lowercase path) in the public pages.
- Live check: not needed.

### PUB-09 Shared catalog/product links carry no per-page meta: link previews show the generic platform title; preview and embed URLs are indexable — Low — CONFIRMED
- Where: `index.html:7,15` (static description and title), with only `document.title` set client-side (`CatalogPage.tsx:52`, `ProductPage.tsx:162`). There is no `og:*`, canonical or `noindex` anywhere in `src`.
- What happens: a visitor uses Share (WhatsApp or Facebook crawlers don't run JS). The preview card reads "Sanctus · Beyond What Is Seen." with no product name or photo. The `/embed/...` routes and `?preview=1` URLs carry no `noindex`, so search engines can index duplicate chrome-less copies.
- Expected rule: none written (no SEO requirement in PRD). Reported because the brief asks about it and the Share button exists.
- Fix sketch: Vercel or edge. Use a small per-route meta injection (or accept and document). At minimum, add `X-Robots-Tag: noindex` for `/embed/(.*)` in `vercel.json`.
- Live check: paste a product URL into WhatsApp or the Facebook sharing debugger.

### PUB-10 Catalog order sorts by the English name while showing Portuguese names — Low — CONFIRMED
- Where: `CatalogPage.tsx:62` (`a.name.en.localeCompare(b2.name.en)`), with cards rendering `localized(p.name)` (`:211`).
- What happens: in PT, the grid looks unsorted (e.g. "Sofá Lisboa" sorted as "Lisbon sofa").
- Expected rule: consistency (display language drives order).
- Fix sketch: UI. Sort by `localized(p.name)` with `localeCompare(…, lang)`.
- Live check: not needed.

## Ideas (optional, max 5 lines)
- Show the store's contact details on the "catalog unavailable" message (PUB-02) so a paused store's printed QR still leads somewhere.
- Hide the catalog "3D" badge when the model's signed URL is empty (`status: 'invalid'` from `toModels`); `hasAny3d` ignores status.
- The mock `recordEvent` records events for drafts and inactive businesses; mirror `record_event_limited` (demo-only).

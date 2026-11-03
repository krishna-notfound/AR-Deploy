# ADR-0047: The admin's own showcase catalogue (house business)
- **Status:** Accepted (owner, 2026-11-03)
- **Date:** 2026-11-03
- **Affects:** ADR-0046 (supersedes in part: card links to business catalogues and products, the separate 3D-card upload), design/12-features-admin.md, design/19-supabase.md, design/21 (landing)

## Context
The landing page should show visiting furniture-business owners what Sanctus does on real pieces, so they apply. Until now the landing's live example, 3D card and collection pages showed products of real businesses (the QA business on the live site). The owner decided on 2026-11-03: the platform admin has their **own** products and collections, used only for showing off; no public business is ever used as the preview; business catalogues stay untouched.

## Decision
- **One hidden house business.** `businesses.is_house boolean not null default false`, with a unique partial index so at most one row is the house. A migration creates it (slug `sanctus-showcase`, name "Sanctus", status `active`, no members). A trigger refuses changing `is_house` and deleting the house row.
- **Never listed as a business.** `getBusinesses`, `getCatalogs`, `getCatalog`, `getProducts` exclude the house and its products in both services. The tenant catalogue `/catalog/sanctus-showcase` shows "not found". New `getShowcase()` returns the house business and its products (published to visitors, all to staff).
- **Products are normal products.** They use the shared ProductEditor (photos, GLB, Build from GLB for iPhone, variants), RLS (`products.edit`) and the `product-media` bucket, and go live with their own Published / Draft status.
- **Public pages in the site's own style** (SiteHeader/SiteFooter, not the tenant PublicShell):
  - `/showcase/:productSlug` is the showcase product page. The stage switches image ↔ 3D inside the stage (no side "Photos" rail), the primary button is AR on a phone / 3D on a computer, the product's own link (`cta`) is a real secondary button, and Share is a real button. Then dimensions, material, description, "More in this collection", and one closing banner ("This is how your customers will see your pieces" → Apply). No analytics event is recorded (no business to report to).
  - `/collections/:slug` lists only house products, each opening `/showcase/...`.
  - `/products/sanctus-showcase/:slug` redirects to `/showcase/:slug`.
- **Landing content points only at house products** (refs keep the `{businessSlug, productSlug}` shape with `businessSlug = 'sanctus-showcase'`):
  - `landing.example`: the hero's "See a live example". Absent: the 3D card's piece, else the newest showcase piece.
  - `landing.featured`: the 3D card's piece. The separate `landing.showcase` upload is no longer shown or edited; the page ignores it.
  - `landing.collections[].products`: house products only. A card always opens its own collection page (link kinds `catalog` and business `product` are no longer offered; existing ones are treated as `collection`).
  - The built-in four cards, before any publish, show house products by category.
- **Hero:** one action, "See a live example". "Apply as a business" stays in the header and in the closing banners.
- **Website Editor:** a new **Showcase** tab (`/admin/editor/showcase`) lists the house products and opens the shared ProductEditor with the house business fixed (`/admin/editor/showcase/new`, `/admin/editor/showcase/:productId/edit`). The **Landing** tab becomes three blocks in page order: Live example (pick a piece), 3D card (pick a piece), Collections (large picture area with upload/change/remove, name and text EN/PT, pieces picked from a thumbnail grid, order, show/hide).
- **Business product pages** get the same small fixes: Photos/3D switch inside the stage instead of the side rail; the product link and Share as real buttons. Nothing else there changes.

## Consequences
- Good: one product editor, one AR path, one storage path; no duplicated feature (CLAUDE.md shared-features rule).
- Good: the landing never shows a client's product without that client being on the platform.
- Trade-off: every business list must exclude the house; a missed list would show "Sanctus" as a business. Service-level filters plus tests guard this.
- Trade-off: the admin needs both `content.manage` and `products.edit` for the Showcase tab (the Owner has both).
- Needs the owner's go-ahead to apply: the migration `admin_showcase` (column, index, trigger, house row, two function replacements).

## Alternatives rejected
- Products inside the site-content document: a second, smaller product editor without variants or the GLB→USDZ build.
- Separate showcase tables: rebuilding the product editor and its storage rules.

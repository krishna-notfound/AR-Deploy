# ADR-0025: Separate per-product QR code; owner preview of a catalogue that is not public yet
- **Status:** Accepted
- **Date:** 2026-10-20
- **Affects:** design/08-tenancy-urls.md, design/13-features-business.md. Amends (does not replace) ADR-0005.

## Context
- The confirmed requirement for a product QR code (audit B8, P11 sub-project 5, requirements O-14) conflicts with ADR-0005, which says the QR code never encodes a product.
- An owner of a draft or paused business could not see their own catalogue: `/catalog/<slug>` showed "catalog unavailable" to everyone (O-12, DUX-02).

## Decision
1. **The catalogue QR code is unchanged.** `CatalogQrPanel` always encodes `catalogPublicUrl(b)` (ADR-0005). It is still the code to print for showrooms, flyers and packaging.
2. **A separate per-product QR code** is offered from the product row menu ("Product QR code") in the shared `ProductTable` (both dashboards), in `ProductQrDialog`:
   - It encodes `productPublicUrl(b, p)` from `src/lib/urls.ts`, labelled "Product QR code" with the note that the catalogue code is the one that stays valid as products change.
   - **Published products only.** A draft gets no code ("Not public yet": the page is hidden and the slug can still change), and the menu item reads "Product QR code (not public yet)".
   - A published product of a business that is not active gets the code with a "Not public yet" warning: customers see "product not available" until the catalogue is activated.
   - It keeps the catalogue panel's honesty rules: the demo-address note, the temporary-host warning, and the "Encode local preview URL" switch only on demo or temporary hosts. PNG at 1024 px, named `{business}-{product}-qr.png`.
3. **Owner catalogue preview.** `catalogLocalPath(b, { preview: true })` adds `?preview=1`. `CatalogPage` renders a non-active catalogue only for a signed-in owner of that business or a platform admin, with a "Preview" banner (`catalog.previewBanner`), and product links keep the flag. Everyone else still gets "catalog unavailable". As with the product draft preview, this is a UX rule, not a security boundary: in Supabase mode RLS only returns a non-active business and its products to members and platform admins.

## Consequences
- Good: owners can hand out a link to one product (e.g. a label on a showroom piece) without weakening the catalogue QR rule.
- Good: a newly approved owner can see the result of their work before activation; the dashboard buttons are no longer dead ends.
- Trade-off: a printed product QR code breaks if the product is deleted or its slug changes; the dialog steers people to the catalogue code for print.

## Alternatives rejected
- Replacing the catalogue QR with product codes: breaks ADR-0005's guarantee that printed codes survive catalogue changes.
- Product QR codes for drafts: the slug can still change and the page is not public, so a printed code would fail.
- A separate preview route: duplicates the public catalogue; the `?preview=1` flag mirrors the existing product preview.

# ADR-0054: Public catalogue rules: no prices, 3D-only publishing, internal company description, Share switch
- **Status:** Accepted
- **Date:** 2026-11-09
- **Affects:** design/19-supabase.md (businesses grants, publish rules), design/12-features-admin.md, `src/features/public/`, `src/features/marketing/`, `supabase/migrations/20261109120040_catalogue_rules_round2.sql`

## Context
Client requests of 2026-11-09 (round 2, workstream W3), decided with the owner the same day:
- Prices must not appear on any public page (the catalogue is a showroom, not a shop).
- The public product cards looked different on the catalogue, the collection page and the showcase "More pieces", and cropped the photos.
- Only pieces with a real 3D model should be published.
- A company's internal description must not be public (it was readable by anyone through the Data API: `grant select on public.businesses to anon`).
- The platform must be able to switch the Share button off for one company.

## Decision
1. **No prices on public pages.** The catalogue cards, product page, showcase page and its "More pieces", collection page, landing 3D card (the illustrative armchair's price too), embed and the finish picker (no "+ price" difference) show no price. Prices stay in the dashboards, the data and the CSV import.
2. **One product card.** `src/features/public/ProductCard.tsx` is used by the company catalogue, the collection page and the showcase "More pieces": hairline frame on the Sanctus tokens, a fixed 4:5 frame on the subtle ground with `object-contain` (the whole piece is visible), category label, serif name, a "3D · AR" chip when the piece has a model (`hasAny3d`), a "View piece" line, a visible keyboard focus ring, two columns on a phone.
3. **3D-only publishing.** `validateForPublish` requires the product's own GLB (`models.glb`, status `valid`; a demo upload `session-only` counts, as it works in that session). The database refuses the transition to `published` without a `product_models` glb row (error key `publish_needs_model`, deferred constraint trigger like the gallery-image rule; checked at commit because `save_product` replaces model rows inside one transaction). The rule fires on the transition only. **Products already published without a model stay published** and stay editable (owner, 2026-11-09: "user can publish it or not his choice ... we can unpublish it"); saving a published product that has a model cannot remove it. The admin and company product lists get a **"Published without 3D"** status filter so staff can find these and unpublish them. Flagged to the client.
4. **Company description is internal.** Migration revokes table-level `select` on `businesses` from `anon` and grants `select` on every column except `description`. The public service reads (`getBusinessBySlug`, `getShowcase`, `getPublicProduct`) use the explicit column list `PUBLIC_BUSINESS_COLUMNS` (`select('*')` fails for anon). The description is gone from the public catalogue header. Platform staff and the company's owners (role `authenticated`) read and edit it as before.
5. **Share switch.** `businesses.share_enabled boolean not null default true`, changed only by platform staff with `businesses.edit`: the update column grant plus `guard_business_admin_fields` (an allow-list, so an owner's attempt raises the existing `business_field_admin_only`) plus the staff update policy. Toggled in the admin business detail ("Public pages" card). Off: the Share button is hidden on that company's product pages; Copy link and the AR phone QR stay (owner: "Share button only").
6. **QR (item 12).** The product QR menu entry is offered only for a publicly visible product (published, in an active catalogue); both the catalogue QR and the product QR download from the admin and the company dashboards (checked).

## Consequences
- Good: one card to maintain and one place that decides what is public; the internal description cannot leak through the API; every newly published piece has a model.
- Trade-off: `select *` from `businesses` as `anon` now fails. A column added to `businesses` later must also be granted to `anon` (`grant select (col) ... to anon`) and added to `PUBLIC_BUSINESS_COLUMNS`, or the public pages break. The migration's header says so.
- Trade-off: `authenticated` keeps table-level select, and "Active businesses are public" applies to it too, so a signed-in owner or staff member who queries the API directly can read another active company's description. Only visitors (anon) are covered; accepted because accounts are the platform's staff and approved companies.
- Trade-off: products published before the rule stay without a model until someone unpublishes them; the filter makes them findable.
- Trade-off: a deferred trigger reports `publish_needs_model` at commit, so a client sees it on the publishing call (mapped to the "models" field of the editor).
- Rollback: `supabase/rollback/20261109_catalogue_rules_round2_rollback.sql` (drops the triggers and the column, restores the table-level select). Tested in `supabase/tests/catalogueRulesRound2.test.ts`.

## Alternatives rejected
- Hide prices with CSS or a per-company switch: the owner wants no prices at all on public pages.
- A view or a second table for the public business columns: more objects, and the existing policies and embeds read `businesses` directly; column privileges are enough.
- Move the description to its own admin-only table: a larger change to a column the dashboards and the CSV/application flows already use.
- Apply the 3D rule to existing published rows (unpublish them): rejected by the owner.
- Enforce "valid model" in the database by file inspection: the database stores no validity flag; the editor validates the file on upload.
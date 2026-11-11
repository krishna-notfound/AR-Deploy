# ADR-0062: Catalogue top on a Sanctus photograph, Sanctus header, whole pieces in product pictures
- **Status:** Accepted
- **Date:** 2026-11-11
- **Affects:** design/14-features-public.md, design/11-design-system.md; amends ADR-0054 (not superseded)

## Context
Client round 3 (owner answers 2026-11-11, `docs/DECISIONS.md`): the company name showed three times on a catalogue page (header, the title block with the logo, the footer `© name`); the catalogue top looked plain next to the landing hero and the sign-in pages; and the product thumbnails and "More photos" cropped the piece (`SmartImage` defaults to `object-cover`), so a tall or low piece lost its edges.

## Decision
- **Header** on every public tenant page (catalogue, product, loading and not-found frames, legal pages inside `PublicShell`): the Sanctus `Wordmark` linking to `/`, the language switch on the right. The company name and logo are no longer in the header.
- **Catalogue top:** a full-width Sanctus photograph (`public/images/sanctus/v2/lamp-vase.webp`, not the landing hero's or the sign-in pages') under a plain dark veil. In white: the company logo (on a small chalk tile so any logo reads), the "Catalog" eyebrow, the company name as the only `<h1>`, and the piece count. The name is written once on the page; the footer keeps "Catalogue powered by Sanctus" without `© name`; the tab title stays the name. The back link on the product page keeps "Back to <name>".
- **Body:** a serif "The pieces" heading (`catalog.heading`, EN and PT), then the unchanged search and category chips and the shared `ProductCard` grid (2 columns on phones, 3 at `lg`, 4 at `xl`).
- **Whole pieces:** the product thumbnails and "More photos" use `object-contain` with padding on the subtle ground. `SmartImage` keeps `object-cover` as its default but omits it when the caller's `className` sets an `object-*` fit (so the two classes never compete); every other use is unchanged.
- No database change, no new dependency. Demo data is unaffected.

## Consequences
- Good: one name per page, a catalogue that matches the landing and sign-in look, no cropped pieces.
- Trade-off: on a business subdomain the wordmark links to `/`, which is that catalogue itself; the platform home is not reachable from there (same as before, where the header linked to the catalogue).
- Trade-off: the hero photograph is one fixed image for every company; the company's own picture is not used (not asked for).

## Alternatives rejected
- Keep the company logo in the header: the logo now sits on the photograph; two places read as repetition.
- Change `SmartImage`'s default to `object-contain`: it would change avatars, thumbnails and cards elsewhere that rely on a filled square.

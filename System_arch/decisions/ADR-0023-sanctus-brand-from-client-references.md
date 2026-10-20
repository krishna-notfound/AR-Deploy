# ADR-0023: Sanctus brand and UI recreated from the client references
- **Status:** Accepted (owner instruction, 2026-10-20)
- **Date:** 2026-10-20
- **Affects:** design/11-design-system.md, design/21-sanctus-reference-map.md, src/index.css, public pages, platform chrome. Supersedes the palette and type of ADR-0014.

## Context
The client supplied the Sanctus brand board and page mockups (`AR-attachment/`). The owner asked for the UI to be recreated from them as closely as the architecture allows, including their copy, while keeping the platform multi-industry and its scope unchanged (no cart, checkout or store-contact features). The app still carried the "Furnish AR" identity with an orange accent and a single sans font.

## Decision
- **Tokens:** the moodboard palette becomes the token values (Chalk canvas, Limestone lines, Umber and Obsidian ink, Burnished Bronze accent). The token names stay, so every surface, dashboards included, reskins without per-component edits. Corners drop to 2px; shadows stay limited to floating layers.
- **Type:** Cormorant Garamond for display, headline and title styles and dashboard page titles; Jost for body and UI. New `text-eyebrow` and `text-label` styles give the spaced uppercase captions of the references. Both fonts load from Google Fonts like the previous one, so no package is added. Jost was chosen over Hanken Grotesk and Montserrat after rendering the same hero and product panel in each (Jost is closest to the references' light geometric sans).
- **Brand mark:** the SANCTUS wordmark and "S" monogram are traced from the brand board into inline SVG (`BrandMark.tsx`, `public/favicon.svg`), not set in a font.
- **Landing page:** rebuilt section by section from the homepage reference (R3), with the reference copy verbatim in `pt.ts` and translated in `en.ts`. The landing now sits inside `LanguageProvider` (EN/PT switch), which supersedes "landing page English-only".
- **Product page:** opens on the standard photograph. "Visualizar em 3D" and "Ver em AR" are separate round actions beside the stage (R6). The 3D viewer still loads behind the photo, so the AR capability check, the scale check and the native AR launch (Scene Viewer / Quick Look, ADR-0021) are unchanged.
- **Photography** is cut from the references (crops, inpainting, WebP) until the client sends originals. Provenance is in design/21.
- **Scope kept:** no cart, bag, checkout, favourites, "Trocar ambiente" or social links; the existing per-product call to action and "Contact the store" are restyled, not removed (decision for the client). Every reference element left out, and why, is listed in design/21.

## Consequences
- Good: one coherent look across landing, catalogues, product pages, sign-in and dashboards; the client sees their own brand and copy.
- Good: the categories, data and AR flows are untouched, so the platform remains multi-industry. Furniture-only wording on public pages (AR tips, "View in my home") became neutral.
- Trade-off: reference-derived photos are soft at large sizes; the hero is upscaled about 2x. They are placeholders for the client's originals.
- Trade-off: landing copy is Brazilian Portuguese while the rest of `pt.ts` is European Portuguese (open question Q3).
- Trade-off: category values are still fixed by a database check (`products.category`); making them configurable needs a migration (planned with the access-model migration).

## Alternatives rejected
- Inspired-by redesign with new copy: the owner asked for fidelity to the references, including text.
- Setting the wordmark in Cormorant: loses the distinctive "A" of the client's logo.
- Opening the product page on the 3D viewer: the client requires the photograph first.

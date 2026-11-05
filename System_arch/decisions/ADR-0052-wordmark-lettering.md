# ADR-0052: The "Sanctus" wordmark is lettered after the client's logo
- **Status:** Accepted
- **Date:** 2026-11-05
- **Affects:** design/21 (landing, brand), `src/components/ui/BrandMark.tsx`

## Context
The client (feedback 2026-11-05): "I'd like the Sanctus lettering to follow the typography and style of my original logo, respecting the distinctive characteristics of the letters. I don't want you to use my logo directly, but rather keep the composition of the name you've created and adapt the lettering to match my brand's visual identity." The wordmark was a path traced from a photo of the brand board (ADR-0023), thick and even, without the logo's high contrast or its distinctive N.

## Decision
- The `Wordmark` path in `BrandMark.tsx` is redrawn after the logo (`public/brand/sanctus-logo-source.jpg`): a high-contrast display serif with fine hairlines, and the logo's N (a hairline stem with a footed serif, a thick diagonal starting in a flag at the top left, and instead of a right stem a fine curl that sweeps up to cap height).
- Font chosen by eye from a contact sheet of OFL Google Fonts (Bodoni Moda, Playfair Display, Gilda Display, Prata, Libre Bodoni, Italiana, Cormorant, Marcellus, Cinzel and others) set next to the logo: **Bodoni Moda** (SIL Open Font License 1.1, The Bodoni Moda Project Authors), optical size 14, weight 540. It has the stroke contrast, flat serifs, wide round C, S and U and proportions closest to the logo. The outline is grown by 0.55% of the cap height per side so the hairlines stay visible at the 12 to 15 px header sizes.
- The composition stays as it was: uppercase, evenly tracked, one `currentColor` path, same component API (`size`, `sub`, `className`, `aria-label="Sanctus"`), same places (landing header, footer and mobile menu, sign-in and invitation pages, dashboard sidebar, public shell).
- The path is generated once with a throwaway script outside the repo (fontTools and shapely, not added to the project): Bodoni Moda glyphs flattened, the N drawn by hand from measurements of the logo, outline grown, merged into one path of about 10 KB. It is a generated path, not a shipped font: no font file and no dependency is added.
- The favicon and the S monogram are unchanged.
- The pixel-guard baselines (`tests/visual/guard.spec.ts-snapshots`) were re-recorded on purpose. Only the wordmark pixels differ, plus the landing header navigation, which re-centres because the wordmark is a little narrower.

## Consequences
- Good: the header, footer and sign-in screens carry lettering in the client's style, with no runtime font cost.
- Trade-off: the N and the spacing are our interpretation of the logo, not the client's vector; replace the path when the official logo file arrives. At 12 px the hairlines of the A and the N stem are very fine.

## Alternatives rejected
- Use the logo image or a trace of it directly: the client asked not to use the logo itself.
- Load a web font and set "SANCTUS" as text: no curl N, an extra network request, and it would not match the logo's N.
- Playfair Display or Prata: lower contrast, ball terminals or heavier serifs than the logo.

# ADR-0014: Editorial design refresh (orange accent, charcoal actions, hairlines)
- **Status:** Accepted (supersedes the palette in ADR-0011; keeps its type family and dimension drawing)
- **Date:** 2026-10-12
- **Affects:** design/11-design-system.md, src/index.css, components/ui/Button.tsx

## Context
The Phase 2 brief asked for a restrained, editorial furniture-store look (reference: wiemer.store) with an orange accent around `#FE6F2D`. That orange is 2.8:1 on white: it fails as text, and white text on it fails too.

## Decision
- **Palette:**
  - canvas `#FAF9F7`, white surfaces, hairlines `#E7E5E1`
  - ink `#161616`, body `#333333`, muted `#5F5D59`
- **Orange is split by job:**
  - `accent-bright #FE6F2D`: fills under dark text only
  - `accent #E85F1F`: 3.4:1, for focus rings, indicators and icons
  - `accent-ink #B4441A`: 5.5:1, for text and links
  - `accent-soft #FFF1EA`
- **Buttons:** the default primary button is charcoal (`bg-ink`). The orange `accent` button is kept for the one action that matters most on a screen.
- **Elevation:** `--shadow-card` is a 1 px hairline ring. Only menus, dialogs and toasts cast a shadow.
- **Radii:** 6 / 10 / 14 px (control / card / stage). Pills are used only for marketing and public CTAs and chips.
- **Type:** one family, Hanken Grotesk 300–600. Display and headline sizes are light (300) with tight tracking. Dashboard UI stays at 13–15 px. Tokens: `text-display`, `text-headline`, `text-title`, `text-lead`.
- **Spacing rhythm:** 6 / 14 / 24 / 32 / 64 px, which maps onto Tailwind steps 1.5 / 3.5 / 6 / 8 / 16. No new spacing tokens.
- **Tenant branding:** tenant catalogs keep each business's own accent colour (contrast-guarded). The orange belongs to the platform surfaces: landing page and dashboards.
- **Charts:** colours unchanged (views `#2E8B6A`, AR `#D07A1F`, validated in ADR-0011). The AR orange now matches the brand.

## Consequences
- Good: one design language across landing, dashboards and catalogs; every text colour pairing passes AA.
- Trade-off: the brand orange appears less often than in the reference, because most of its uses would fail contrast.

## Alternatives rejected
- White text on `#FE6F2D` buttons: fails WCAG AA.
- Darkening the brand orange everywhere: loses the requested colour.
- A second display typeface: one family already carries the editorial weight contrast, and avoids another font download.

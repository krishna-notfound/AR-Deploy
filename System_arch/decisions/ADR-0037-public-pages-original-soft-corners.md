# ADR-0037: Public pages back to the original look, with slightly soft corners
- **Status:** Accepted (owner decision, 2026-10-26)
- **Date:** 2026-10-26
- **Supersedes:** ADR-0036
- **Affects:** design/14-features-public.md, `src/index.css`, `src/features/public/*`

## Context
The owner tried the Stitch redesigns of the catalog and product pages (ADR-0036, v1 and v2). They prefer the pages as they were before that work.

## Decision
- The catalog and product pages return to their pre-ADR-0036 layout and type (as of commit 38bed33).
- Corners are softened slightly on the public pages only:
  - `.public-soft` on the `PublicShell` root sets `--radius-control` 6px and `--radius-card`/`--radius-stage` 10px;
  - cards, photos, the 3D frame, panels, chips, buttons, fields and swatches use these tokens;
  - the photo arrows are round.
- The product's own link (label and URL from the product form) stays a real button: outlined beside the AR button, the primary button when there is no AR or 3D.
- Fixes made after the redesign started stay: AR public copies and WebXR first (ADR-0035), no demo traces on the live site, and the 30 MB / 40 MB model limits.
- Dashboards keep the 2px corners.

## Consequences
- The v1 and v2 sections are removed: hero, counts, AR bands, gallery, "More from" and contact strip. The Stitch PNGs stay in `design/stitch/public/` for reference.

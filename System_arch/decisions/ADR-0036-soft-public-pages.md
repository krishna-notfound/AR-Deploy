# ADR-0036: Soft, editorial catalog and product pages
- **Status:** Superseded by ADR-0037 (owner, 2026-10-26: back to the original pages)
- **Date:** 2026-10-26
- **Affects:** ADR-0023 (amended for the public catalog and product pages), design/11-design-system.md, design/14-features-public.md, `src/index.css`, `src/features/public/*`

## Context
The owner found the public catalog and product pages generic and harsh. The taste-skill inspector (2026-10-26) measured the product page:
- 11 FAILs, including 12 tiny spaced-uppercase labels, an eyebrow above the title, 7 hairlines, outlined boxes, and 13–15px grey body text;
- on tablet the title started 1195px down;
- no primary button on the first screen.

The owner asked for:
- a distinctive, not AI-generic look;
- soft shapes instead of sharp edges;
- strong typography.

They approved four Stitch designs (`design/stitch/public/`, Stitch project "Sanctus UI Design System Specification").

## Decision
- **Palette and faces:** the Sanctus palette and fonts stay (bone canvas, bronze, obsidian; Cormorant Garamond with Jost).
- **New tokens, public pages only:**
  - `--radius-soft` (24px) and `--radius-soft-sm` (18px) for photos, the 3D stage and panels;
  - pills (`rounded-full`) for buttons, chips, fields and switches;
  - type steps `text-monument` (the business name on its catalog), `text-piece` (product name), `text-piece-card` and `text-body-public` (17px, full ink).
- **No ornament:**
  - no hairlines, outlined boxes, tiny tracked uppercase labels or eyebrows;
  - surfaces are separated by space and a tone step.
- **Catalog:**
  - the business name set very large as a monument;
  - pill category chips and search;
  - the first piece featured across two columns, then an unboxed grid with the name in the serif and price and size beneath;
  - a "3D & AR" pill on pieces with 3D.
- **Product:**
  - a rounded media stage with a Photos | 3D switch inside it;
  - a sticky right column with name, price, size, finish swatches, and the obsidian "View in my home" pill;
  - a quiet "Open on your phone" pill and Share;
  - one rounded details panel (dimensions and material);
  - on phones, a sticky bottom bar with the price and "View in my home".
- **No invented content:** the Stitch extras (VAT, lead time, warranty, address, "Contact workshop") are not built, because the platform does not store them.
- **Dashboards:** unchanged; they keep the square references.

## Consequences
- Good:
  - the pages read as a furniture house rather than a tool;
  - the AR action is on the first screen on phones;
  - the inspector's eyebrow, micro-label, hairline, body-size and title failures are addressed.
- Trade-off: the public pages and the dashboards now differ in corner shape. This is intended, since only customers see the public pages.

## Alternatives rejected
- **Keep the 2px squares and only enlarge the type:** the owner explicitly asked for softer shapes.
- **A dark gallery page:** it fights the bone brand palette. Its idea survives only as a calm stage for the 3D model.

# ADR-0028: Redesign from the owner's Stitch screens
- **Status:** Accepted
- **Date:** 2026-10-25
- **Affects:** design/11-design-system.md, design/21-sanctus-reference-map.md, ADR-0023

## Context
The owner redesigned the landing page, the sign-in screens and the admin dashboard in Google Stitch (project 16545430197078633171), and generated new interior and product photographs there. The instruction was to follow the designs and photos across every page without copying them literally. The exports and a brief are in `design/stitch/` (`BRIEF.md`).

## Decision
- **Kept from ADR-0023:**
  - the palette and tokens;
  - Cormorant Garamond and Jost;
  - 2px corners and hairline borders;
  - the obsidian primary button.

  The Stitch auth and dashboard screens use EB Garamond and Manrope; they are mapped to our two fonts, so nothing new is added.
- **Public:**
  - a solid header, with no blur;
  - a split-card hero;
  - numbered collection cards;
  - a new dark 3D/AR section;
  - a quote card, and an about section with a photo collage;
  - a new business call-to-action band (to `/apply`);
  - a four-column footer.

  The catalogue and product pages take the same card, chip and frame styling.
- **Sign-in pages:**
  - a split layout, with a photo panel on the left and the form on the right;
  - step indicators on the code-based reset and invitation flows.
- **Dashboards:**
  - a dark obsidian sidebar and a light breadcrumb top bar;
  - eyebrow and serif page headers;
  - stat cards with line icons;
  - a priority notice for pending applications;
  - tables with monogram avatars and status pills.

  Chart colours are moved onto the palette (obsidian and bronze).
- **Photos:** the 12 owner-generated photos are in `public/images/sanctus/v2/`. The original reference photos stay.
- **Left out on purpose:**
  - **Controls with no feature behind them:** search, the notification bell, a hero slider, Apple ID and Google Workspace sign-up, a role toggle, material swatches that do nothing, batch actions and audit export.
  - **Claims nobody has confirmed:** company statistics, security certifications, city lists, the contact email, and WebXR (AR stays native only, ADR-0021).
  - **Jargon:** "telemetry", "curatorial" and similar wording.

## Consequences
- Good: one consistent, more editorial look across the public site, sign-in and dashboards, approved by the owner in Stitch.
- Good: no new dependencies and no token changes.
- Trade-off: the new 3D/AR section and the business band add copy outside the client's original reference text. It is short, written in both languages, and the client can change it.
- Trade-off: the landing's 3D section shows a photograph labelled as an illustration, not a live model, because the featured piece has no 3D model.

## Alternatives rejected
- Pasting the Stitch HTML in: it would bypass translations, the data services, and the loading, empty and error states, and bring in an icon font and two extra web fonts.

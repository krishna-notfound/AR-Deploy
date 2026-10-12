# ADR-0011: Visual identity (eucalyptus + plaster, Hanken Grotesk, dimension drawing)
- **Status:** Accepted (supersedes the token values first listed in design/11)
- **Date:** 2026-10-12
- **Affects:** design/11-design-system.md, src/index.css

## Context
The first token draft used cream `#FAF8F5`, a walnut/clay accent and Inter + Fraunces. Reviewed with the frontend-design skill, that combination is the generic "warm cream + serif + clay" look. The brief asks for warm white, charcoal and a muted accent, with no generic dashboard cards.

## Decision
- **Palette:**
  - plaster `#F6F5F2`
  - white surfaces
  - graphite ink `#23221F`
  - muted eucalyptus accent `#36564A`
- **Type:** one family, Hanken Grotesk, with a tight display weight. There is no decorative serif.
- **Radii by hierarchy:** controls 8 px, cards 12 px, the 3D stage 20 px.
- **Key figures:** shown as one hairline-divided strip (`StatGroup`), not a row of identical cards.
- **Signature element:** the product page has an isometric **dimension drawing** that shows W/H/D at the product's true proportions. It reinforces the brief's "accurate furniture scale" requirement.
- **Charts:** views `#2E8B6A` and AR `#D07A1F`. Both passed the dataviz validator in light mode. Views and AR are drawn as two small multiples, never on a dual axis.

## Consequences
- Good: a distinct, calm identity, with one deliberate standout element.
- Trade-off: business accent colours apply only to public buttons and links, and fall back to the platform accent below 4.5:1 contrast.

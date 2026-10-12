# ADR-0006: Fixed AR scale plus a measured-vs-entered scale check
- **Status:** Accepted
- **Date:** 2026-10-12
- **Affects:** design/09-3d-ar.md, design/15-product-editor.md

## Context
Brief §12: furniture scale must be accurate. Never silently scale a model based on a guess. If its size can't be verified, treat AR accuracy as unverified.

## Decision
- Set `ar-scale="fixed"` on model-viewer so users can't resize the model in AR.
- After the model loads, compare `getDimensions()` with the entered W, H and D, with ±5 % tolerance:
  - within tolerance → show "True-to-size model ✓"
  - otherwise → show "AR scale unverified"
- Never change `scale` to make the numbers match.
- Show the same check in the admin ModelPreview.

## Consequences
- Good: an honest, real check, and the business can see when its asset is wrong.
- Trade-off: a model with wrong axes or units will show as unverified until the asset itself is fixed.

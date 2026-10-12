# ADR-0013: Sample 3D assets, rendered posters and measured dimensions
- **Status:** Accepted
- **Date:** 2026-10-12
- **Affects:** design/09-3d-ar.md, tasks/P1-data-layer.md, src/services/mock/seed.ts

## Context
The demo needs real GLB models with correct licences. Product dimensions must not be guessed (brief §12).

## Decision
- **Models:** six Khronos glTF-Sample-Assets GLBs (CC BY 4.0), hotlinked from raw.githubusercontent.com. Each URL was checked to return 200 with `Access-Control-Allow-Origin: *`. Credits appear in Admin → Settings and in the README.
- **Posters:** `public/images/models/*.webp` were **rendered from the actual models** with model-viewer `toBlob()`, so each poster matches its model.
- **Dimensions:** the seed uses each model's **measured** bounding box from model-viewer `getDimensions()`. The Damask chair is deliberately left mismatched so the "AR scale unverified" state can be demonstrated.
- **Broken model:** one product points to a non-existent GLB, to demonstrate the error state.
- **No USDZ:** no seed product has a USDZ file, because no correctly licensed USDZ was available. The editor flags the missing file.
- **Photos:** non-3D products use Unsplash photos (Unsplash License). Each ID was checked to resolve.

## Consequences
- Good: AR scale verification is real and demonstrable, and the posters are truthful.
- Trade-off: the demo depends on GitHub raw hosting. If it fails, copy the GLBs into `public/models/`.

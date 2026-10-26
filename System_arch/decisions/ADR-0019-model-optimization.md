# ADR-0019: Safe GLB optimization in the browser before upload (glTF-Transform)
- **Status:** Accepted for implementation. Extended and switched on by default by ADR-0038 (owner, 2026-10-26: adds triangle reduction; `VITE_MODEL_OPTIMIZATION=off` now opts out).
- **Date:** 2026-10-13
- **Affects:** design/15-product-editor.md, audit/PRIORITIZED_ISSUES.md P1-01

## Context
The contract asks for "automatic model compression" on upload. The usual GLB compression methods are Draco, meshopt, KTX2, WebP and quantization. All of them add glTF extensions that Google Scene Viewer does not support: it lists only `KHR_materials_unlit`, `KHR_texture_transform` and spec-gloss, and its texture limit is 2048 px. A "compressed" model could therefore stop opening in Android AR.

A Supabase Edge Function can't do this either: it is limited to 2 s of CPU and 256 MB, and our files go up to 50 MB.

## Decision
- **Where it runs:** in the admin's browser, in a Web Worker, before upload (`src/features/products/editor/modelOptimize*.ts`).
- **What it does:**
  - Lossless cleanup: `dedup`, `prune`, `resample`.
  - Textures larger than 2048 px are downscaled in their own format (PNG/JPEG) with OffscreenCanvas.
  - PNGs with any transparency are left alone, because the canvas would premultiply the alpha.
- **What it never does:** add a glTF extension, convert formats, simplify geometry, or touch USDZ files.
- **Checks:** the output is re-read and must keep the same bounding box (±1 mm, which matters for AR scale), the same triangle count, no extra materials and no new extensions.
- **Keeping the original:** if any check fails, if the saving is under 5%, or if the worker can't run. The admin sees both sizes and can upload the original instead.
- **Dependencies:** `@gltf-transform/core`, `@gltf-transform/functions` and `@gltf-transform/extensions` 4.5.1 (MIT), pinned exactly. They load only inside the worker chunk, about 175 kB, and only when the feature is on.
- **Feature flag:** `VITE_MODEL_OPTIMIZATION=on`. Off by default, on in E2E.
- **Also added (needs no flag):** an upload warning when a GLB *requires* an extension Scene Viewer doesn't support (`lib/files.ts unsupportedForSceneViewer`).

## Consequences
- **Good:** large-texture models, the most common cause of oversized furniture GLBs, shrink a lot and still open in Scene Viewer and Quick Look.
- **Trade-off:** files that are heavy because of their geometry barely shrink, which is honest but less impressive. USDZ files are uploaded as delivered.
- **Trade-off:** the canvas resampling changes texture pixels slightly. Compare before and after on a device before enabling it.

## Alternatives rejected
- **Draco / meshopt / KTX2 / WebP:** not in Scene Viewer's supported list.
- **Edge Function or a server:** over the CPU and memory limits, or against the rule of no custom backend.
- **glTF-Transform `textureCompress`:** in the browser it ignores most quality options and can silently switch format.

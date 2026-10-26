# ADR-0038: Automatic model lightening is on by default, with triangle reduction
- **Status:** Accepted (owner, 2026-10-26). Extends ADR-0019 and switches it on.
- **Date:** 2026-10-26
- **Affects:** ADR-0019, design/15-product-editor.md, design/17-testing.md, docs/PRD.md (R-31, A-2), docs/CLIENT_HANDOVER.md, docs/TEST_PLAN.md

## Context
The owner answered client question A-2 with "yes, turn it on". ADR-0019 only downscaled textures, and that is not enough for models made by AI 3D tools. The owner's real chair (Tripo-generated) is 17.5 MB with 440,384 triangles and three 4096 px textures. The texture-only optimizer took it from 16.7 MB to 13.7 MB (as the app reports, MiB), which is still heavy on a phone. Done by hand with the algorithm below, the same chair came to 3.4 MB, 88,076 triangles and 2048 px textures, and a side-by-side render looked identical.

## Decision
- **On by default.** `VITE_MODEL_OPTIMIZATION` is now an opt-out: set it to `off` to disable. The business can still choose "Upload the original instead".
- **Where it runs:** unchanged from ADR-0019. In the uploader's browser, in a Web Worker, before upload. No server, no backend (ADR-0015).
- **New step, triangle reduction:** a model above 100,000 triangles is welded and simplified toward 100,000 triangles with the meshoptimizer simplifier (quadric-error edge collapse). The surface never moves more than 0.1% of the model's size (error 0.001). Textures above 2048 px are downscaled as before.
- **Still no compression extensions:** no Draco, KTX2, meshopt, WebP or quantization, so Android AR (Scene Viewer) and WebXR can still open the file.
- **Checks:** the result is re-read. The bounding box (true size) must stay within 0.5% of the original, with no new extensions and no new materials. Otherwise the original is kept.
- **USDZ:** untouched. No GLB-to-USDZ conversion, ever.
- **Dependency:** `meshoptimizer` 1.2.0 (MIT), pinned exactly. It is the same library `@gltf-transform/cli` 4.5.1 uses for simplification. It loads only inside the worker chunk.

## Consequences
- Good: AI-generated models become phone-friendly without the business doing anything. A real chair went from 17.5 MB to 3.4 MB with no visible change.
- Good: the true-size check still guards AR scale, now with a tighter 0.5% bound.
- Trade-off: simplification changes the triangle count, which ADR-0019's check ("same triangle count") forbade. That check is replaced by the 0.5% bounding-box bound and the 0.1% surface-error limit.
- Trade-off: the iPhone file (USDZ) is not reduced. Businesses should export it light too, or leave it out and let the iPhone build one from the GLB.
- Trade-off: a heavy GLB takes a few extra seconds in the browser before upload.

## Alternatives rejected
- Draco, meshopt, KTX2 or WebP compression: Scene Viewer does not support them, so Android AR could stop opening the file (ADR-0019).
- A server-side or Edge Function optimizer: CPU and memory limits, and a custom backend is out of scope (ADR-0015).
- Keeping texture-only optimization: it cut the owner's chair by only about 3 MB.
- Optimizing USDZ: would need GLB-to-USDZ conversion, which is never built.

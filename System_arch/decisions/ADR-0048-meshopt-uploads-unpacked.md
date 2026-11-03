# ADR-0048: Meshopt-packed GLB uploads are unpacked
- **Status:** Accepted (owner, 2026-11-04)
- **Date:** 2026-11-04
- **Affects:** ADR-0038 (upload optimization), ADR-0039 (Build from GLB), ADR-0035 (viewer/AR), `vercel.json`

## Context
Tripo's "_meshopt" downloads are packed by gltfpack with `EXT_meshopt_compression` and `KHR_mesh_quantization`, both marked required. Nothing in the app could read them: the upload optimizer kept the original ("Missing required extension"), "Build from GLB" failed, the 3D viewer failed ("setMeshoptDecoder must be called before loading compressed files") and Android Scene Viewer does not accept meshopt. The owner's test file was 22.4 MB with 1,896,736 triangles and an 8192 px texture.

## Decision
- One reader for uploaded GLBs (`features/products/editor/glbIo.ts`): the Khronos extensions plus `EXT_meshopt_compression` with the meshopt decoder from the existing `meshoptimizer` package (no new dependency).
- On upload, a packed model is always unpacked to a plain GLB (meshopt and quantization removed), even when the plain file is larger, then optimized as before (100,000 triangles, 2048 px textures). Stored GLBs carry no compression extension (ADR-0038 unchanged).
- "Build from GLB" decodes a packed GLB stored before this change.
- The viewer sets model-viewer's `meshoptDecoderLocation` to the decoder served from this site (CSP `script-src 'self'`), so a packed GLB stored before this change still opens in 3D. Vercel serves `/assets/*.cjs` as `text/javascript` (the site sends `nosniff`).

## Consequences
- Good: Tripo "_meshopt" files work everywhere after upload. Measured on the owner's file in the browser (demo mode): 22.4 MB → 6.0 MB, 1,896,736 → 99,998 triangles, Build from GLB in 4 s.
- Trade-off: a packed file stored before this change still fails in Android Scene Viewer until it is uploaded again.

## Alternatives rejected
- Asking businesses to export without meshopt only: easy to get wrong, and the error gave no hint.
- Loading the decoder from a CDN: blocked by the CSP and adds a third party.

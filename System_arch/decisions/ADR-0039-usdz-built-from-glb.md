# ADR-0039: The editor builds the iPhone USDZ from the GLB, in the browser
- **Status:** Accepted (owner, 2026-10-27). Supersedes the earlier rule "never build GLB→USDZ conversion" (original scope).
- **Date:** 2026-10-27
- **Affects:** ADR-0038, CLAUDE.md, design/15-product-editor.md, docs/CLIENT_HANDOVER.md, docs/TEST_PLAN.md

## Context
Without a USDZ, the iPhone builds one from the GLB on every "View in my home" tap (ADR-0038). That is slow and repeated. Businesses that make a USDZ with AI tools get heavy files: the owner's chair came to 12.8 MB with the geometry stored as text. The owner decided on 2026-10-27 to allow conversion, in the browser only.

## Decision
- **Button:** the USDZ (iPhone) section of the product editor shows **"Build from GLB"** when a GLB is uploaded and no USDZ is. It is not shown for a product that already has a USDZ.
- **How:** the file is built in the uploader's browser from the GLB (already lightened, ADR-0038) with three.js r183 `GLTFLoader` and `USDZExporter`. `three` 0.183.2 is pinned exactly. It was already installed as model-viewer's own dependency and is now a direct one. Settings: `quickLookCompatible` on, metres kept (`metersPerUnit` 1), so the true size stays. USDZ stores the shape as text and textures as PNG, so the iPhone file is made lighter again first: at most 50,000 triangles (same simplifier and error bound as ADR-0038) and 1024 px textures. Measured on the owner's chair: 7.3 MB, 50,000 triangles, 0.735 × 1.0 × 0.646 m (same as the GLB), built in about 6 s; with 100,000 triangles and 2048 px it was 16 MB, heavier than the original 12.8 MB USDZ.
- **Then the normal path:** the built file goes through the existing USDZ upload: the same validation (zip, first entry .usda/.usdc, uncompressed, 64-byte aligned, 40 MB), storage and public AR copy.
- **Label:** the editor shows "Built from the GLB" with the date. The business can replace it by uploading its own USDZ, or rebuild after changing the GLB.
- **No USDZ stored:** the earlier behaviour still applies. The iPhone builds one at tap time (ADR-0038).
- **Limits:** it runs on the main thread of the dashboard (desktop browsers; a few seconds for about 100k triangles). Materials are converted to Quick Look's supported set: PBR base colour, metal/rough, normal, emissive, occlusion. No transmission or volume effects. The result must still be checked on a real iPhone (docs/TEST_PLAN.md). No server, no backend (ADR-0015).

## Consequences
- Good: iPhone AR opens at once from a stored, light file instead of a build on every tap.
- Good: a heavy USDZ from AI tools is no longer needed.
- Trade-off: one new direct dependency (`three`), loaded only when the button is used.
- Trade-off: the main thread is busy for a few seconds while it builds.
- Trade-off: complex materials (glass, transmission) lose their effect in the built file.

## Alternatives rejected
- A server-side or Edge Function converter: a custom backend is out of scope (ADR-0015).
- Keeping only the tap-time build: slow, repeated on every tap, and not stored.
- Running the build in a Web Worker: `USDZExporter` needs the DOM for textures, so the main thread is simpler.

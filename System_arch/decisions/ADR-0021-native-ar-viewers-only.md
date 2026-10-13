# ADR-0021: Native AR viewers only (Scene Viewer, Quick Look)
- **Status:** Accepted (owner decision, 2026-10-13); not deployed: needs a real-device check before `main`
- **Date:** 2026-10-13
- **Affects:** design/09-3d-ar.md, src/components/three/ModelViewer.tsx

## Context
Live AR uses `ar-modes="webxr scene-viewer quick-look"`: on ARCore phones AR opens inside Chrome (model-viewer's WebXR) and Scene Viewer is only a fallback. The contract names Google Scene Viewer and Apple Quick Look. The owner decided the platform should use the native viewers only. An earlier "Scene Viewer first" attempt (8f1ee02, reverted in 8026a37) did not open the Google app on the owner's phone; the cause was never diagnosed.

## Decision
`ar-modes="scene-viewer quick-look"`, keeping `ar-scale="fixed"` (Scene Viewer `resizable=false`) and `ar-placement="floor"`. Android: Scene Viewer intent with `mode=ar_preferred` (3D view on phones without ARCore). iOS/iPadOS: Quick Look with the uploaded USDZ. Everything else: the interactive 3D viewer with the phone hand-off (link + QR). No WebXR, custom AR session or custom physics.

## Consequences
- Good: matches the contract; floor detection, lighting, shadows and gestures come from the platform viewers; no in-browser camera session.
- Trade-off: Android AR depends on the Google app (Google Play Services for AR). If the intent does not open, the visitor gets model-viewer's failure event and our "AR failed" toast instead of in-browser AR. Must be checked on a real Android phone before release (the earlier attempt failed there).

## Alternatives rejected
- Keep WebXR first: what the owner tested and showed the client, but not the owner's chosen architecture.
- Scene Viewer first with WebXR fallback (8f1ee02): owner wants no WebXR at all.

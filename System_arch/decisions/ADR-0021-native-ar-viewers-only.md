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

## Amendment (2026-10-26, owner go-ahead): direct native launch
"View in my home" now opens the native viewers itself (`src/features/ar/nativeAr.ts`, URLs in `src/lib/urls.ts`): Android navigates to `intent://arvr.google.com/scene-viewer/1.2?file=<encoded GLB>&mode=ar_preferred&title=<name>[&resizable=false]#Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;S.browser_fallback_url=<page>#ar-unavailable;end;`; iPhone/iPad with an uploaded USDZ clicks an `<a rel="ar"><img></a>` to the USDZ (`#allowsContentScaling=0` when true to size). `resizable=false` / `allowsContentScaling=0` only when the scale is verified. iPhone without a USDZ, in-app browsers and desktop keep model-viewer's `activateAR()`. `ar-modes` is unchanged; still no WebXR. The signed model URL is passed once, whole and encoded (model-viewer also copied its `token` out as a top-level intent parameter, AR-12). Needs a real-device check.

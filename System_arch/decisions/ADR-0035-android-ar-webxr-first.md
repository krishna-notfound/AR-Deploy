# ADR-0035: Android AR opens inside Chrome first (WebXR), Scene Viewer as fallback
- **Status:** Accepted (owner decision, 2026-10-26); needs a real-device check
- **Date:** 2026-10-26
- **Affects:** ADR-0021 (amended for Android), design/09-3d-ar.md, src/components/three/ModelViewer.tsx, src/features/ar/nativeAr.ts

## Context
After ADR-0021 (native viewers only), "View in my home" on the owner's Android phones and a second tester's phone showed "Preparing AR…", then a black screen, and returned to the page. The diagnosis (2026-10-26):
- the page sent a correct Scene Viewer intent with a public file;
- the file was served correctly (public link, then the site's own `/ar/` path);
- Google's own sample sofa, opened directly in Scene Viewer from GitHub, gave the same black screen.

So Scene Viewer itself fails on these phones. The flow that worked for the owner was `ar-modes="webxr scene-viewer quick-look"`, which runs AR inside Chrome. An earlier "Scene Viewer first" attempt (8f1ee02) also failed on the owner's phone.

## Decision
- **Android:** `ar-modes="webxr scene-viewer quick-look"`. The page calls model-viewer's `activateAR()`, which uses WebXR when Chrome supports it and falls back to Scene Viewer otherwise.
- **iPhone/iPad:** unchanged. AR Quick Look with the uploaded USDZ, opened directly, and model-viewer's activateAR when there is no USDZ.
- The direct Scene Viewer launch stays in the code. `ANDROID_WEBXR_FIRST = false` in `src/features/ar/nativeAr.ts` switches it back on.

## Consequences
- Good: the AR the owner tested and showed works again on their phones.
- Good: the public copies (`/ar/` path) still serve iPhone Quick Look.
- Trade-off: this is not the contract's "Google Scene Viewer first". WebXR AR shows model-viewer's in-browser placement instead of Google's viewer, and it still needs Google Play Services for AR.
- To check on real devices: Android Chrome (WebXR), an Android phone without WebXR (Scene Viewer fallback), and iPhone Safari (Quick Look).

## Alternatives rejected
- **Keep Scene Viewer only:** it fails on the owner's phones even with Google's sample.
- **WebXR only:** it loses the Scene Viewer fallback on phones without WebXR.

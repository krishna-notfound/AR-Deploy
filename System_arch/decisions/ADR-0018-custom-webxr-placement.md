# ADR-0018: Our own WebXR placement session where supported; native viewers otherwise
- **Status:** Withdrawn 2026-10-13 (see revision c): original model-viewer AR restored
- **Date:** 2026-10-13
- **Affects:** design/09-3d-ar.md, design/15-product-editor.md, tasks/P10-ar.md

## Context
AR started on a Pixel 10a, but people struggled to position and control the furniture. The root cause is in
model-viewer 4.4's built-in WebXR mode (`lib/three-components/ARRenderer.js`). With `ar-modes="webxr …"`,
Chrome on ARCore phones picks WebXR first. In that mode:
- The model spawns in front of the camera. The first floor hit only sets its height, so its floor position is arbitrary.
- A one-finger drag moves the model only when it starts on the model. Otherwise it **rotates** it, so near-misses spin the furniture.
- Two-finger twist also rotates. There is no explicit move, done or reset control, and no anchors.

## Decision
- **Mode A, our WebXR session** (`src/features/ar/`). Used when `navigator.xr.isSessionSupported('immersive-ar')` is true. The flow:
  1. A reticle shows the floor point under the centre of the screen. "Place here", or a tap on the screen, places the item there. Only upward-facing hits 0.3–8 m away are accepted.
  2. After placement, explicit buttons: Rotate ±15°, Move (the item follows the reticle until "Place here", or Cancel restores it) and Start over.
  3. No drag or pinch gestures, so there are no gesture conflicts. Real scale is never changed.
  4. An anchor is used when the browser offers one. Tracking loss pauses actions and says so. A contact shadow sits under the item.
  5. The state machine is a pure reducer (`placement.ts`), so it is unit-tested without a device.
- **Mode B, native viewers.** model-viewer with `ar-modes="scene-viewer quick-look"`: Quick Look on iOS and Scene Viewer on Android without WebXR. Also used when our session fails to start ("Open in phone AR viewer").
- **Mode C, no AR.** The 3D viewer, dimensions and the phone hand-off (link and QR), as before.
- **Choosing a mode.** The choice is capability-based, never by user agent: `chooseArMode()` in `capability.ts`.
- **Dependencies.** `three` 0.183.2 is listed explicitly, pinned to the exact copy model-viewer already bundles, so it adds no new code to the bundle. `@types/three` 0.183.1 is a dev dependency. The session module is loaded only on WebXR-capable devices.
- **Compressed models.** The loader uses the same Draco, KTX2 and Meshopt decoders, at the same gstatic locations, as model-viewer.
- **AR readiness in the product editor.** It lists the 3D viewer, Android AR, iPhone AR, true size, and a warning for files over 15 MB.

## Consequences
- Good: one predictable flow (aim → place → turn or move), large controls, EN/PT text, and true size always.
- Good: Quick Look and Scene Viewer keep their platform-native gestures, which users already know.
- Trade-off: placement is floor-only in Mode A, and there is no occlusion, lighting estimation or measurement. Every product
  is floor-placed in all modes (wall lamps included), as before; wall placement needs a product field first. Real-device tuning is still pending (tasks/P10).
- Trade-off: the GLB downloads again when the session starts (the browser cache usually serves it).

## Alternatives rejected
- **Keep model-viewer WebXR and tune it.** The gesture model can't be changed without forking the library.
- **Scene Viewer only on Android.** It's reliable, but it leaves the page. Its own gestures are the same drag-or-rotate pattern, and we get no placement metrics.
- **A native app.** Out of scope (no native app).

## Revision 2026-10-13 (after the audit)
- **The device-difference finding:** Chrome reports immersive-ar on every Android 7+ phone, ARCore or not (Chromium source), so WebXR-first sends phones without ARCore into a failed start or an ARCore install prompt. Native-first (Scene Viewer, as the contract says) is implemented behind `AR_DEFAULT_PREFERENCE`, which stays `'webxr'` until the client approves (audit APPROVAL_REQUIRED A-1).
- **Hardening:**
  - Setup failures end the session.
  - A cancel isn't a failure.
  - A `NotSupportedError` failure is remembered for 7 days.
  - A native `ar-status: failed` removes the dead button.
  - Anchors are created inside the animation frame.
  - The bounding box is precise.
  - Analytics count one `ar_activation` per page view.
- **Owner request:** a true-footprint preview and a settle-onto-floor drop. Cosmetic, with no fit claims.

## Revision 2026-10-13 (b): custom session switched OFF, last good AR flow restored
- **The regression:** AR became slower and less reliable after 98c7545. That commit removed `webxr` from `ar-modes` and routed Android Chrome to our own session. Confirmed in the code:
  - The session downloads and parses the GLB a **second** time at launch (`webxrSession.ts`, `GLTFLoader.loadAsync`).
  - It runs a **second** WebGL renderer with antialiasing next to model-viewer's.
  - It is chosen on every Android 7+ phone, ARCore or not.

  model-viewer's built-in WebXR reuses the model and renderer already on the page.
- **Decision:**
  - `ar-modes="webxr scene-viewer quick-look"` again, exactly as in a6bc75b.
  - `CUSTOM_WEBXR_ENABLED` (`VITE_CUSTOM_WEBXR=on`) is off by default. The session code is kept but never probed or loaded.
- **Kept from later work, on the model-viewer path:**
  - no dead button after `ar-status: failed`
  - one `ar_activation` per page view
  - refreshed signed URLs
- **Not kept while the session is off:** the placement controls, footprint preview and settle drop (they live in the custom session).
- **Before reviving it:** test on a device, reuse model-viewer's loaded scene instead of downloading again, and avoid two live renderers.

## Revision 2026-10-13 (c): WITHDRAWN, owner decision
The owner wants the original AR experience with no new AR buttons. The product page, `ArSection`, `ModelViewer` and the AR text are restored byte-for-byte from a6bc75b. The custom session code (`capability`, `placement`, `webxrSession`, `useArExperience`, `ArSessionOverlay`) and the explicit `three` / `@types/three` dependencies are removed; git history keeps them. Only the admin AR readiness panel (`features/ar/readiness.ts`) remains. Any new AR work is a separate task that starts with a device test.

# P10 · AR Experience 2.0

> **Superseded for AR (2026-10-13):** the custom WebXR session, footprint and settle, native-first and 'Precise placement' described here were removed. Live AR is the original model-viewer flow. See `System_arch/HANDOFF.md`.
→ design/09, ADR-0018. Branch `feature/ar-experience-2`.

## Root cause (why controlling was hard on the Pixel 10a)
model-viewer's built-in WebXR mode, picked first on ARCore phones, spawns the item at an arbitrary floor point. It also treats a one-finger touch that misses the item as **rotate**, and it has no Move, Done or Reset controls and no anchors. Details are in ADR-0018.

## Tasks
- [x] P10-01 Capability-based mode choice (`chooseArMode`, `detectWebXrAr`) — done 2026-10-13: unit-tested.
- [x] P10-02 Placement state machine (`placement.ts`): scanning → aiming → placed ↔ moving, ±15° turns, start over, tracking loss, metrics — done 2026-10-13: unit-tested.
- [x] P10-03 WebXR session (`webxrSession.ts`): hit-test reticle, tap or button to place, anchors, contact shadow, real scale, Draco/KTX2/Meshopt — done 2026-10-13: typechecked; **not run on a device**.
- [x] P10-04 Overlay controls (`ArSessionOverlay.tsx`), EN/PT, safe areas, 56 px targets, `data-xr-control` — done 2026-10-13: component-tested.
- [x] P10-05 Product page integration: one "View in my home" button per mode, native fallback after a failed start, analytics `ar_activation` kept — done 2026-10-13: E2E with a stubbed `navigator.xr` that refuses the session.
- [x] P10-06 model-viewer limited to `scene-viewer quick-look` — done 2026-10-13.
- [x] P10-07 Admin AR readiness panel in the product editor — done 2026-10-13: unit tests and an E2E test.
- [x] P10-08 ADR-0018, design/09 updated — done 2026-10-13.
- [ ] P10-09 Manual real-device pass (checklist below). Nothing on it has been run yet.

## Manual device checklist (record device, OS, browser, date and result)
Open the product page with `?ardebug`, and use Chrome remote debugging to read `[ar] session metrics`.

**Pixel 10a or another ARCore phone, Chrome (Mode A)**
1. "View in my home" opens the camera with no tips dialog. The hint says to move the phone. Exit (X) is in the top right.
2. The reticle appears on the floor within about 10 s. "Place here" stays disabled until it does.
3. Tapping "Place here" or the screen places the item facing you at the reticle, with a shadow under it. Check that the size looks right next to a known object.
4. Rotate left and right turn it in 15° steps. Tapping the screen does **not** move or rotate it.
5. Move: the item follows the reticle. Cancel puts it back; Place here sets it down. Its turn is kept.
6. Start over hides it and the reticle returns.
7. Cover the camera: the hint says tracking was lost and the buttons pause. Uncover: it recovers.
8. Exit returns to the page. Re-enter works.
9. Deny camera permission: the page shows "AR could not start…" and an "Open in phone AR viewer" button that opens Scene Viewer.
10. PT: switch to PT first, then check every label and hint.

**iPhone, Safari (Mode B, Quick Look)**: the AR tips appear first, then Quick Look opens at fixed scale. Check a product with a USDZ and one without.

**Android without ARCore** (or Firefox): the "Show QR code" phone hand-off appears, with no dead button.

**Desktop**: the hand-off panel and QR appear. The E2E tests cover this.

## Known limitations (do not claim otherwise)
- No occlusion, depth, lighting estimation, collision or room measurement.
- Placement is floor-only in every mode, including wall lamps.
- The GLB downloads again when the session starts; large files are slow over mobile data, and the readiness panel warns above 10 MB (Google's recommendation for Scene Viewer).
- In-app browsers (Instagram, Facebook) usually block WebXR and camera access. The notice suggests opening the page in Chrome or Safari.

## Discovered (audit 2026-10-13)
- [x] P10-10 Session hardening: setup failure ends the session, cancel vs failure, overlay only with a controller, no placing while the model is loading, anchors inside the frame. Done 2026-10-13: `webxrSession.test.ts`.
- [x] P10-11 Native failure no longer leaves a dead button; `none/failed` state. Done 2026-10-13: `ar.test.ts`, `ArSection.test.tsx`, e2e.
- [x] P10-12 `ar_activation` once per page view. Done 2026-10-13: e2e.
- [x] P10-13 Footprint preview and settle drop (owner request). Done 2026-10-13: `settleOffset` unit test. Not seen on a device.
- [ ] P10-14 Native-first default: waiting for client approval A-1.

> **Superseded in part (2026-10-13).** AR and analytics statements below are outdated. Current state: System_arch/HANDOFF.md and docs/PRODUCTION_READINESS.md.

# P10 · AR Experience 2.0

> **AR (2026-10-13):** the custom WebXR session (P10-01 to P10-05, P10-10, P10-13), footprint and settle, native-first switch and "Precise placement" were removed in f171db3; ADR-0018 is withdrawn. On branch `chore/production-readiness` (not yet deployed) the owner chose native viewers only: `ar-modes="scene-viewer quick-look"`, `ar-scale="fixed"`, `ar-placement="floor"` (Android: Scene Viewer, `mode=ar_preferred`, `resizable=false`; iOS: Quick Look; elsewhere: 3D viewer plus phone hand-off). No real-device test recorded.

→ design/09, ADR-0018. Branch `feature/ar-experience-2`.

## Root cause (why controlling was hard on the Pixel 10a)
model-viewer's built-in WebXR mode, picked first on ARCore phones, spawns the item at an arbitrary floor point. It also treats a one-finger touch that misses the item as **rotate**, and it has no Move, Done or Reset controls and no anchors. Details are in ADR-0018.

## Tasks
- ~~[x] P10-01 Capability-based mode choice (`chooseArMode`, `detectWebXrAr`)~~ — removed (f171db3).
- ~~[x] P10-02 Placement state machine (`placement.ts`)~~ — removed (f171db3).
- ~~[x] P10-03 WebXR session (`webxrSession.ts`)~~ — removed (f171db3).
- ~~[x] P10-04 Overlay controls (`ArSessionOverlay.tsx`)~~ — removed (f171db3).
- ~~[x] P10-05 Product page integration: one button per mode, native fallback after a failed start~~ — removed (f171db3). `ar_activation` kept: one per launch attempt.
- [x] P10-06 model-viewer limited to `scene-viewer quick-look` — done 2026-10-13.
- [x] P10-07 Admin AR readiness panel in the product editor — done 2026-10-13: unit tests and an E2E test.
- [x] P10-08 ADR-0018, design/09 updated — done 2026-10-13.
- [ ] P10-09 Manual real-device pass (checklist below). Nothing on it has been run yet.

## Manual device checklist (record device, OS, browser, date and result)
> **2026-10-13:** Mode A below tested the removed custom WebXR session and **no longer applies**. With native-only AR, on an ARCore Android phone check instead: "View in my home" opens Google Scene Viewer (not in-browser AR) at true size, on the floor. On Android without ARCore: Scene Viewer opens in 3D (`mode=ar_preferred`). Use the device test matrix (`audit/DEVICE_TEST_MATRIX.md`).

~~Open the product page with `?ardebug`, and use Chrome remote debugging to read `[ar] session metrics`.~~

**~~Pixel 10a or another ARCore phone, Chrome (Mode A)~~** (obsolete)
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
- ~~The GLB downloads again when the session starts;~~ Large files are slow over mobile data, and the readiness panel warns above 10 MB (Google's recommendation for Scene Viewer).
- In-app browsers (Instagram, Facebook) may not hand off to Scene Viewer or Quick Look (unverified). The notice suggests opening the page in Chrome or Safari.

## Discovered (audit 2026-10-13)
- ~~[x] P10-10 Session hardening (`webxrSession.test.ts`)~~ — removed with the session (f171db3).
- [x] P10-11 Native failure no longer leaves a dead button; `none/failed` state. Done 2026-10-13: ~~`ar.test.ts`, `ArSection.test.tsx`~~ (removed in f171db3), e2e. Current code: a failed launch (`ar-status: failed`) shows an error toast.
- ~~[x] P10-12 `ar_activation` once per page view.~~ Corrected: `ar_activation` is one per AR launch attempt (taps within 2 s of a launch ignored); it means "tried to open AR", not success or placement.
- ~~[x] P10-13 Footprint preview and settle drop (owner request).~~ — removed (f171db3).
- ~~[ ] P10-14 Native-first default: waiting for client approval A-1.~~ Superseded: owner chose native-only (`scene-viewer quick-look`) on 2026-10-13, branch `chore/production-readiness`, not yet deployed; needs a real-device check before push to `main`.

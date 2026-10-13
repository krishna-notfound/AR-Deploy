> **Superseded in part (2026-10-13).** AR and analytics statements below are outdated. Current state: System_arch/HANDOFF.md and docs/PRODUCTION_READINESS.md.

# AR compatibility, scale and physics

> **AR (2026-10-13):** the custom WebXR session (`webxrSession.ts`, `chooseArMode`, `placement.ts`, overlay, "Precise placement (beta)", footprint and settle) was removed in f171db3; it does not exist in the code. The owner then chose **native viewers only** on branch `chore/production-readiness` (not yet deployed): `ar-modes="scene-viewer quick-look"`, `ar-scale="fixed"`, `ar-placement="floor"`; Scene Viewer intent `mode=ar_preferred`, `resizable=false`. No WebXR, no custom AR session, no custom physics. The Chromium/ARCore and Scene Viewer findings in §2 remain useful background; §4–§5 describe a path that is no longer planned. No real-device test recorded.

Tags: **VERIFIED** means confirmed from source code or official docs, with the citation. **HYPOTHESIS** means it needs a physical device.

## 1. Three different things, not interchangeable
| Layer | What runs it | Where it's launched | Controls |
|---|---|---|---|
| 3D in the browser | model-viewer 4.4 (`components/three/ModelViewer.tsx`) | Always, when there is a GLB | Our page |
| Native AR | Scene Viewer (Android, Google app), Quick Look (iOS) | `activateAR()`; `ar-modes="scene-viewer quick-look"`, `ar-scale="fixed"`, `ar-placement="floor"` | **The platform's.** The website can set only scale, placement and a few intent parameters |
| ~~Custom WebXR AR~~ | ~~`src/features/ar/webxrSession.ts` (three 0.183.2)~~ **Removed** (f171db3) | — | — |

## 2. Root cause: why Android phones behave differently
1. **Chrome's WebXR check doesn't look at ARCore.** VERIFIED in Chromium main:
   - `arcore_device_provider.cc` registers the AR runtime when `IsArCoreSupported()`, which only checks Android ≥ 7 (`arcore_shim.cc`).
   - `SupportsSession` never calls `checkAvailability`.
   - So `isSessionSupported('immersive-ar')` returns **true on every Android 7+ Chrome**.
2. **ARCore availability is only checked once a session is requested.** VERIFIED in `arcore_install_helper.cc` and `ArCoreInstallUtils.java`. What happens next depends on the phone:
   - **Phone ARCore has already marked as not capable:** the request fails immediately.
   - **Availability unknown or ARCore not installed:** the Play install flow starts, and on an unsupported phone it ends with "device not compatible". This is most likely the field report.
3. **model-viewer offers Scene Viewer on any Android browser except Firefox and Oculus.** It is a user-agent check only. VERIFIED: `node_modules/@google/model-viewer/lib/constants.js:61`, `features/ar.js:102-104`.
4. **Scene Viewer handles missing ARCore gracefully.** VERIFIED in the Scene Viewer docs: with `mode=ar_preferred`, when Play Services for AR is missing it falls back to its 3D view, with no "incompatible" prompt.
5. **What the Pixel 10a actually ran.** Before commit 98c7545 the code used `ar-modes="webxr scene-viewer quick-look"` (VERIFIED, `git show 98c7545^`). The Pixel 10a report ("works, but hard to control") therefore came from **model-viewer's built-in WebXR mode**. That mode:
   - spawns the item at an arbitrary floor point,
   - turns a one-finger miss into a rotation,
   - has no Done or Reset (ADR-0018).
6. ~~**This branch makes it worse on phones without ARCore.** Our `chooseArMode` picks WebXR first.~~ (Historical: `chooseArMode` was removed in f171db3.) Those phones get the failure or install prompt, then the "Allow camera access…" message, which names the wrong cause, and only then the native fallback.

**Conclusion.** The difference between phones is ARCore certification and installation state, combined with WebXR being chosen first:
- **Pixel 10a:** certified, with ARCore installed, so it works.
- **The "incompatible" phone:** not certified.

The fix is to choose **native first** (Scene Viewer handles phones without ARCore)~~, and offer our WebXR session only as an opt-in~~. 2026-10-13: done as native-only on the branch (no WebXR at all); unverified on a device.

### Other AR defects found
| ID | Defect | Status |
|---|---|---|
| P1-03 | After `ar-status: failed`, the button stays visible but `activateAR()` only logs a console warning (`ar.js:157`). `canAR` is never reset (`ProductPage.tsx`) | VERIFIED |
| P1-04 | Signed GLB/USDZ URLs live 1 h. Scene Viewer, Quick Look and our session all fetch the URL again at launch | VERIFIED (expiry); the failure on a phone is a HYPOTHESIS |
| P2-01 | WebXR session left running when `setSession`, `requestReferenceSpace`, `requestHitTestSource` or `new WebGLRenderer` throws. The `end` listener is attached late | VERIFIED |
| P2-01 | Overlay and Exit shown before the session exists, so Exit does nothing during the permission prompt. Screen taps can place the item while the model is still loading | VERIFIED |
| P3 | `hit.createAnchor()` is called outside the frame callback. The spec says to reject when the frame isn't active; Chromium doesn't check this (VERIFIED, `xr_hit_test_result.cc`). Works on Chrome today; move it into the frame for spec compliance | VERIFIED |
| P3 | `Box3().setFromObject(model)` without `precise`, so the footprint and shadow can be larger than the viewer's measured size | VERIFIED |
| P2-08 | Readiness text says "in-browser AR on ARCore phones, otherwise Scene Viewer", which is wrong. The size warning is at 15 MB while Scene Viewer recommends ≤ 10 MB | VERIFIED |
| P2-08 | "True size" is shown on iOS, but the USDZ is never measured | VERIFIED |
| — | In-app browsers: Android WebView has no WebXR (MDN browser-compat-data). Whether Instagram or Facebook pass on the `intent://` link, and Quick Look support in iOS webviews | HYPOTHESIS: device test |

## 3. Real-world scale
- **Storage and conversion:** values are stored as entered, in cm or inches, and `toMeters` is correct. VERIFIED.
- **The check:** `checkScale` compares model-viewer's `getDimensions()` (the overall bounding box, without baked shadows) with W/H/D at ±5%, and never rescales (ADR-0006).
- **Seed models:** all six seed GLBs were measured. Five match within 1 cm, and Damask is a deliberate mismatch. VERIFIED by parsing the GLBs.
- **Gaps:**
  1. In the editor, the cm/in toggle only relabels the numbers: 219 cm silently becomes 219 in (`ProductEditorForm.tsx`).
  2. A 90° axis swap or uniform unit errors (cm/mm/in authoring) show only a vague "mismatch".
  3. Tiny items hit rounding noise: use the larger of 5% and 1 cm.
  4. The USDZ is never measured, so on iOS "True size" means "checked on the GLB".
  5. Variants share one model and one set of dimensions.
- **Proposed validation (pure functions in `lib/scale.ts`, still never rescaling):**
  - A `reason` field: `axis-swap`, `uniform` (k ≈ 100, 1000, 39.37 or 2.54, each with a named likely cause) or `axis` (one axis off).
  - Tolerance = max(5%, 1 cm), one global value. (Implemented in `lib/scale.ts`; UI copy still says "within 5%".)
  - USDZ copy: "checked on the 3D (GLB) file; the iPhone file isn't measured".
  - Later, measure the USDZ with three's `USDLoader`, which is already installed (`metersPerUnit` handling must be added).
- **Do not stretch axes independently.** Uniform scale is suggested only as a fix for the admin to apply to the file.

## 4. Physics and placement feasibility
> **Not planned (2026-10-13):** the owner chose native viewers only, with no custom physics. Rows marked "Done" in the Custom WebXR column below referred to the removed session. Kept as feasibility notes only.

Native viewers can't take custom behaviour. Everything beyond basic placement works only in ~~our~~ a custom WebXR mode (none exists now).

| Capability | Native AR | Custom WebXR | Reliability limitations | Phase |
|---|---|---|---|---|
| Floor placement + anchors | Built in | Done. Anchor creation moves into the frame callback | ARCore floor height accurate to a few cm (HYPOTHESIS); drift without anchors | P-A (owner) |
| Settle onto the floor (gravity-like drop) | No | Yes: a damped ease over about 250 ms, no engine; off with reduced motion | Cosmetic | P-A (owner) |
| True footprint preview (outer W × D on the reticle) | No | Yes: an outline drawn from the precise bounding box | Bounding box ≠ shape; label it "outer footprint" | P-A (owner) |
| Move / rotate / reset | Platform gestures | Done (buttons) | — | done |
| Drag on the floor | Platform gestures | Yes: `requestHitTestSourceForTransientInput` (model-viewer already uses it on Chrome); no new permission | Gesture conflicts; needs tuning on a device | P-B (**client**) |
| Several items + overlap warnings | Impossible (one asset per launch) | Yes: 2D rotated-rectangle separating-axis test (SAT), microseconds per pair; cap at 3 items, shared geometry | Footprints are boxes (chairs tuck under tables), so **warn, never block**; phone GPU memory | P-C (**client**) |
| Wall clearance / "fits here?" | Impossible | Partial: the user points at the wall to capture a vertical hit; automatic `plane-detection` is a Chrome **Developer Trial** (VERIFIED, ARCore comparison page) | Vertical-hit support on Chrome is a HYPOTHESIS; blank walls track badly; always "≈ estimate", never "fits" | P-D (**client**, experimental) |
| Depth occlusion | No | Depth API exists | Noisy, device-dependent | Not recommended |
| Rigid-body physics (Rapier) | No | Possible | About 2 MB of WASM, a new dependency, **and no room geometry to collide with** | Rejected |

**Privacy:** the session requests only `hit-test`, `dom-overlay` and optional `anchors`. Camera frames never reach JavaScript. Do not add `camera-access` or `depth-sensing`.

### Physics design (P-A to P-D)
- **`placement.ts`, new pure functions with unit tests:**
  - `footprint(box, pos, yaw)` → `{cx, cz, hx, hz, yaw}`
  - `obbOverlap(a, b, margin)` → `{overlap, depth}` (SAT on 4 axes)
  - `pointInObb`
  - `settleY(t, drop = 0.12, dur = 250)` (0 under reduced motion)
  - `wallClearance(obb, {point, normal})`
  - `fits(obb, walls, others)` → `'clear' | 'tight' (< 5 cm) | 'blocked'`, with distances
- **Reducer:**
  - new state: `items[]`, `activeId`, `dragging`
  - new events: `drag-start` (only when the touch lands on the active footprint), `drag-end`, `add-item`, `select-item`, `remove-item`, `wall`
  - Overlap results are computed per frame and not stored.
  - Rule kept: a tap that isn't on the item only places while aiming or moving.
- **`webxrSession.ts`:**
  - queue placement and create the anchor in the next frame;
  - precise bounding box;
  - a footprint `LineLoop` that turns red on overlap or wall crossing;
  - the settle drop;
  - transient hit-test for dragging;
  - item loading through `service`, disposed when removed.
- **Overlay:**
  - shows "≈ 12 cm from wall (estimate)" and "Overlaps <item>" as warnings;
  - all text in EN and PT.

## 5. Recommended staged approach
1. **Tier 1 (contract).** Native first. Fix the dead button, URL expiry, analytics counting and wrong copy. Compression that keeps files Scene Viewer-safe. Real-device pass.
2. ~~**Tier 2 (control).** Our WebXR session as **"Precise placement (beta)"**, a secondary link on Android Chrome only. Session fixes (P2-01) and physics P-A.~~ Dropped: session removed; owner chose native-only.
3. ~~**Tier 3 (physics enhancements).** P-B drag, P-C several items with overlap, P-D wall clearance. All need client approval. Ship them behind the beta link and keep claims as estimates.~~ Dropped for the same reason.

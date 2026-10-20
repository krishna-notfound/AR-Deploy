# Sanctus 3D and AR: QA report

| | |
|---|---|
| **Date** | 2026-10-20 |
| **Tested** | Commits `a1e8392` and `422481b`. Preview https://ar-deploy-i328t0wiz-track0.vercel.app (journeys first ran on the `a1e8392` build `ar-deploy-qio4qn0c4`). Demo mode locally. |
| **Detailed analysis** | [`dashboard-audit/ar.md`](dashboard-audit/ar.md) (findings AR-01 to AR-14, matrix, device steps). QA evidence: [`dashboard-audit/qa-journeys.md`](dashboard-audit/qa-journeys.md), Journeys C and E. |

> **Honesty note:** every result below comes from desktop Chromium, or from Chromium emulating a Pixel 7 or an iPhone 14. **Emulation is not a device.** Scene Viewer placement, Quick Look, and real-world scale in a room have **not** been tested. They are **BLOCKED** until someone runs the manual steps in section 7 on physical phones.

## 1. Supported formats and implementation paths

| Item | Implementation |
|---|---|
| Web 3D viewer | `@google/model-viewer` through `src/components/three/ModelViewer.tsx`, lazy-loaded. It shows a GLB. |
| Android AR | Google **Scene Viewer** via `ar-modes="scene-viewer quick-look"`, `ar-scale="fixed"`, `ar-placement="floor"` (ADR-0021). No WebXR. |
| iOS AR | Apple **Quick Look** with the uploaded USDZ (`ios-src`). Without a USDZ, model-viewer generates one on the device; that is not guaranteed and is flagged as such in readiness. |
| Upload validation | `src/lib/files.ts`, client side. **GLB:** `glTF` magic, version 2, declared length equal to the file size, and the first chunk is JSON. **USDZ:** zip local-file header, and an entry ending `.usdc` or `.usda`. Size limits apply. The server checks size and MIME type (bucket). |
| Scene Viewer compatibility | Required glTF extensions are checked against the Scene Viewer list. The result is stored in `required_extensions`, shown in the editor and the product list ("Android AR blocked"), and Android AR is never offered for such a file. |
| Dimensions and scale | Stored in cm or in. The editor converts exactly on request; the old automatic toggle drifted the values. The scale check compares the GLB bounding box with the entered size (5% tolerance) and only then says "True size". The USDZ is not measured, and the copy says so. |
| Per-variant media | `product_variant_images` and `product_variant_models` (migration `20261020143507`). The page switches photo, GLB and USDZ together, never mixing a variant GLB with the base USDZ. `?variant=` links work. A variant without a model shows the product's model with a note. |
| Analytics | `ar_activation` is recorded when the AR launch is attempted. It is a **launch attempt**, not a confirmed AR session, and is labelled that way everywhere. A repeat tap within 2 s, or a tap after a failed Scene Viewer launch, is not counted again (AR-04). |
| Not built, by decision | GLB→USDZ conversion, AI photo-to-3D, WebXR |

## 2. GLB viewer tests

| Test | Env | Result |
|---|---|---|
| SheenChair.glb (P1) loads in the viewer | Preview, desktop Chromium | **PASS** |
| GlamVelvetSofa.glb (P2) loads | Preview, desktop | **PASS** |
| P3 "Sheen" and "Damask" GLBs load when switching finish | Preview, desktop | **PASS** |
| No-model product (P4): photos only, no viewer, no 3D/AR buttons | Preview, desktop | **PASS** |
| Truncated GLB rejected before upload, with a clear message ("declares 3.9 MB but the file is 293.0 KB… cut off or damaged") | Preview, owner editor | **PASS** |
| Broken model URL: error overlay, and the 3D/AR call to action hidden (AR-08) | Demo, unit and browser | **PASS** |
| Keyboard focus visible on the viewer (focus ring only for keyboard users) | Demo, browser | **PASS** (fixed during QA) |

## 3. USDZ and native AR

| Test | Env | Result |
|---|---|---|
| Android: AR button shown, Scene Viewer intent built (`mode=ar_preferred`, `resizable=false`) | Pixel 7 **emulation** | **PASS (emulation)** |
| Android: a model that needs `EXT_texture_webp` is not offered for AR, and the note is shown | Demo, Pixel 7 emulation | **PASS** |
| Android: Scene Viewer opens, the model is placed on the floor at true size | Physical Android | **BLOCKED (no device)** |
| iOS: Quick Look opens the USDZ, or the generated USDZ when there isn't one | Physical iPhone or iPad | **BLOCKED (no device)** |
| iOS emulation shows the "view it on your phone" card | iPhone 14 user agent in Chromium | **PASS**, as expected (Chromium can't launch Quick Look) |
| Signed Supabase URLs (`?token=`) in Scene Viewer and Quick Look | Physical devices | **BLOCKED (no device)**, see AR-12 |

No QA product has a USDZ: none was available with a clear licence, and none was generated. iPhone AR for the QA products therefore depends on model-viewer generating a USDZ on the device, and readiness says so ("Android only").

## 4. Variant-to-asset correctness (P3 "QA Lounge Chair — two finishes")

| Check | Result |
|---|---|
| "Sheen" shows the Sheen photo and `…/8d88610b….glb` | **PASS** |
| "Damask" shows the Damask photo and `…/c0a6d92d….glb` | **PASS** |
| The AR target (`src`) follows the selected finish. No base USDZ is mixed in (`ios-src` stays empty). | **PASS** |
| `?variant=<damask id>` opens Damask; an unknown id falls back to the first finish | **PASS** |
| Dimensions shown for the product | **PASS** |
| The catalogue card shows the 3D badge and readiness counts the variant models | **PASS** after the QA fix (`422481b`), re-verified on the Preview |

## 5. Dimensions and scale

The bounding boxes were measured with glTF-Transform and matched model-viewer's `getDimensions()` in the browser.

| Model | Bounding box (m) | QA product dimensions | Verdict |
|---|---|---|---|
| SheenChair | 0.827 × 0.686 × 0.570 | 83 × 69 × 57 cm (P1, P3) | Matches within 1 cm, "True size" (viewer) |
| ChairDamaskPurplegold | 0.829 × 0.687 × 0.572 | 83 × 69 × 57 cm (P3 Damask) | Matches within 1 cm |
| GlamVelvetSofa | 2.188 × 0.788 × 1.023 | 219 × 79 × 102 cm (P2) | Matches within 1 cm |

Physical scale in AR, checked with a tape measure, is **BLOCKED (no device)**.

## 6. Model compatibility matrix

| Model | Format | Size | Viewer | Native AR attributes | Env | Outcome |
|---|---|---|---|---|---|---|
| SheenChair (CC0, Eric Chadwick / Wayfair) | GLB 2.0 | 4.1 MB | Loads | `ar`, scene-viewer + quick-look, fixed scale, floor | Preview desktop, Pixel 7 and iPhone 14 emulation | Viewer **PASS**. Android handoff **PASS (emulation)**. Physical AR **BLOCKED** |
| ChairDamaskPurplegold (CC BY 4.0, Eric Chadwick / Wayfair) | GLB 2.0 | 2.0 MB | Loads | same | same | Viewer **PASS**. Physical AR **BLOCKED** |
| GlamVelvetSofa (CC BY 4.0, Eric Chadwick / Wayfair) | GLB 2.0 | 3.1 MB | Loads | same | same | Viewer **PASS**. Android handoff **PASS (emulation)**. Physical AR **BLOCKED** |
| SheenWoodLeatherSofa (demo seed only) | GLB 2.0, requires `EXT_texture_webp` | 10.1 MB | Loads | Android AR **withheld** (AR-01 fix) | Demo, Pixel 7 emulation | **PASS** (correctly not offered on Android) |
| qa-invalid-truncated.glb (negative fixture) | Truncated GLB | 293 KB | n/a | n/a | Preview editor | **PASS** (rejected before upload) |
| Seeded missing model (`BROKEN_MODEL_URL`) | 404 | n/a | Error overlay | No AR button | Demo | **PASS** |

The QA models come from the Khronos glTF Sample Assets repository, under the licences above. The demo credits were corrected in `src/services/mock/credits.ts`.

## 7. Untested or blocked: manual steps for a physical device

Full step lists are in [`dashboard-audit/ar.md`](dashboard-audit/ar.md) section 5: 11 Android steps, 9 iOS steps and 3 for both.

1. **Android** (ARCore phone, Chrome, Google app installed). Open `/products/qa-sanctus-demo-atelier-do-not-delete-automatically/qa-glam-velvet-sofa`, tap "View in AR" and confirm Scene Viewer opens. Place the sofa and tape-measure its width; it should be 219 cm, within 5%. Then repeat on P3 with each finish (`?variant=<id>`) and confirm the model matches the finish you picked.
2. **iOS** (Safari, ARKit device). Same pages. Confirm Quick Look opens. These products have no USDZ, so the phone generates one, which may fail or look different; record what happens. Measure the sofa.
3. **Both.**
   - Return from AR to the page and confirm it still works.
   - In the owner dashboard, confirm the AR launch attempts went up by exactly the number of launches you made.
   - Scan the printed catalogue QR and a product QR with the phone camera. On the Preview host, Vercel protection will ask for a login; use the bypass link from the QA notes.

**Blocked items:**
- physical Scene Viewer;
- Quick Look;
- scale measured in a room;
- signed-URL handling on devices;
- a real camera QR scan.

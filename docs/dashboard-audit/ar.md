# Sanctus: 3D/AR QA analysis (Agent D)

Date: 2026-10-20. Branch `feature/sanctus-brand-design-system` (HEAD `e2c1e74`). This phase was **read-only**: the repo was not edited and the live Supabase project was not called. The browser checks ran against a demo-only Vite server on :5271, which has since been stopped.
AR is native only (ADR-0021): `ar-modes="scene-viewer quick-look"`. This document proposes no WebXR, no GLB→USDZ conversion and no AI 3D.

**Kinds of evidence used.** (a) Code reading. (b) Node probes that ran the repo's own pure functions (`files.ts` and `scale.ts`, transpiled with the repo's TypeScript). (c) glTF-Transform inspection of the six Khronos GLBs. (d) Playwright in headless Chromium: desktop, `Pixel 7` emulation, and `iPhone 14` UA/viewport in **Chromium**. **Emulation is not a real device.** Nothing here verifies AR placement or true size on a phone.

Artifacts (all under `<local>`):
`glb/` (downloaded GLBs, LICENSE.md and metadata.json), `glb-inspect.jsonl`, `validate-probe.log`, `vitest.log`, `browser.log` and `browser/results.json` plus 21 screenshots, `sv-fallback.log`, `scripts/*.mjs`.

Existing tests: `npx vitest run src/features/ar src/lib src/features/products/editor src/test/modelViewer.test.tsx` → **5 files, 45 tests passed** (`vitest.log`).

---

## 1. Implementation paths

| Concern | Where | What it does |
|---|---|---|
| Upload validation | `src/lib/files.ts:22-73` | Checks extension, size (≤ 50 MiB for each format) and the **first 4 bytes only**: `glTF` for GLB, `PK\x03\x04` for USDZ. |
| Scene Viewer extension check | `src/lib/files.ts:80-95` | Reads the GLB JSON chunk and reports `extensionsRequired` outside `[KHR_materials_unlit, KHR_texture_transform, KHR_materials_pbrSpecularGlossiness]`. Runs **after** upload, for uploaded GLBs only (`ModelSection.tsx:99`). The result is a non-blocking warning held in component state. |
| Editor slot and preview | `src/features/products/editor/ModelSection.tsx` | Upload or URL link (`onUrl` :109 checks only the scheme and extension). `ModelPreview` :219 shows the 3D preview, the scale report and AR readiness. |
| Optimisation | `modelOptimize.ts`, `modelOptimizeClient.ts`, worker | Off unless `VITE_MODEL_OPTIMIZATION=on`. Lossless dedup/prune/resample plus a texture downscale to 2048 px. Re-reads its output and keeps the original if bounds, triangles, materials or extensions change. |
| Readiness | `src/features/ar/readiness.ts` | Viewer, Android, iOS, scale and size items. "Large" means > 10 MiB. |
| Scale | `src/lib/scale.ts` | Measured bbox (model-viewer `getDimensions()`, metres) vs entered dims. Tolerance 5% or 1 cm. Never rescales. Diagnoses axis-swap, wrong unit, model units and uniform error. |
| Units | `src/lib/format.ts:63-70` (`toMeters`, `convertLength`), `formModel.ts:59 convertDims` | Converts cm↔in with 1-decimal rounding. |
| UA helpers | `src/lib/userAgent.ts` | In-app browser detection (Instagram, FB, WhatsApp) for `InAppNotice`. `isIOS` and `isAndroid` are used only for notice copy. |
| Viewer wrapper | `src/components/three/ModelViewer.tsx` | Lazy-loads `@google/model-viewer@4.4.0`. `key={src}`, `ar-modes="scene-viewer quick-look"`, `ar-scale="fixed"`, `ar-placement="floor"`, built-in AR button hidden. Exposes `activateAR`, `canActivateAR` and `getDimensions`. |
| Public stage | `src/features/public/ProductMedia.tsx` | Viewer is mounted behind the photo from the start. Loading bar, 45 s stall timeout, error overlay with Retry/Photos. `usableModels` drops stale `blob:` assets. |
| AR UI | `ProductPage.tsx:132-155, 208-226`, `ArSection.tsx` | "View in AR" rail button only when `modelState==='loaded' && canActivateAR`. Otherwise shows a "View in your space on a phone" card with copy link and page QR. |
| AR analytics | `ProductPage.tsx:140-155` | `ar_activation` = **tap that starts a launch attempt**. Recorded before `activateAR()`. 2 s re-tap guard. Skipped in preview. Never means "placed". Supabase path goes through the rate-limited `track-event` Edge Function (`supabaseCatalogService.ts:752`). Demo path pushes to the localStorage db. |
| Storage / signed URLs | `supabaseCatalogService.ts:34-40, 209-224, 474-485, 883-899` | Private `product-media` bucket with path `{business_id}/{uuid}.{ext}`. Upload is re-wrapped with `model/gltf-binary` or `model/vnd.usdz+zip`. 12 h signed URLs. A signing failure gives an empty URL and `status:'invalid'`. `ProductPage.tsx:54` refetches after 6 h on tab return. |
| Bucket server rules | `supabase/migrations/20261012192159_storage.sql:22-27` | 50 MiB. Allowed MIME types are the **declared** Content-Type, which the browser sets; content is not sniffed. |
| Scene Viewer handoff (library) | `node_modules/@google/model-viewer/lib/features/ar.js:255-300` | `intent://arvr.google.com/scene-viewer/1.2?mode=ar_preferred&disable_occlusion=true&resizable=false&file=<src>#Intent;scheme=https;package=com.google.android.googlequicksearchbox;…;S.browser_fallback_url=<page>#model-viewer-no-ar-fallback;end;`. The model URL's own query params (for example a Supabase `token=`) are copied into the intent params. |
| Quick Look handoff (library) | same file :315-360 | `<a rel="ar" href="<ios-src>#allowsContentScaling=0">`. **With no `ios-src`**, model-viewer exports a USDZ from the GLB in the browser (three.js `USDZExporter`) and hands Quick Look a `blob:`. This is library behaviour, not code in this repo; readiness labels it as "not guaranteed". |
| AR mode selection (library) | `lib/constants.js:61-79`, `ar.js:163-205` | Android: `canActivateAR` is true for any Android UA that isn't Firefox or Oculus. **There is no ARCore check.** iOS: Safari needs `relList.supports('ar')`. CriOS, EdgiOS, FxiOS and DuckDuckGo count as candidates. The Google app (GSA) is excluded. |

---

## 2. Findings

| ID | Sev | Finding | Evidence | Fix (no WebXR, no conversion) |
|---|---|---|---|---|
| AR-01 | **High (demo/QA)** | The seeded **Wood & Leather Sofa** GLB *requires* `EXT_texture_webp`, which the repo's own Scene Viewer list says Android AR does not support. The product still shows "View in AR" on Android and fires the Scene Viewer intent. The public page and readiness say nothing about it. Android AR for this product is expected to fail; this needs a device to confirm. | `glb-inspect.jsonl` (`extensionsRequired:["KHR_texture_transform","EXT_texture_webp"]`). Repo function `unsupportedForSceneViewer` returns `["EXT_texture_webp"]` (`validate-probe.log`). `seed.ts:231`. Pixel 7 run: AR button shown, intent captured (`browser.log`). | Remove it from the AR demo set or swap in a Scene-Viewer-safe GLB. Run `unsupportedForSceneViewer` on linked URLs and on load as well, persist the result on `ModelAsset` (for example `arWarnings`), and feed it into `arReadiness` so the Android item is `warning`. |
| AR-02 | Medium | Readiness "Android AR" is driven only by whether the GLB loads (`readiness.ts:31,38`), so it shows **Ready** for GLBs with unsupported required extensions. The extension warning is ephemeral `useState` (`ModelSection.tsx:68,99-104`): it is lost on reload, never computed for "Paste URL" models (`onUrl` :109-116), and not visible on reopen. | Code. Probe shows the function works when called. | Same as AR-01: persist and reuse. |
| AR-03 | Medium | Format validation is a 4-byte magic check only. **Accepted:** a 4-byte `glTF` file, `glTF` + random junk, a **glTF v1** header, a header that declares 999,999 bytes on a 12-byte file, a real GLB **truncated to half**, an empty zip renamed `.usdz`, and a docx-like zip renamed `.usdz`. Rejected: text renamed .glb, an empty file, a GLB renamed .usdz. The server only checks size and the declared MIME, so no layer checks content. The broken GLB is then saved and publishable; `validateForPublish` ignores models (`validation.ts:46-50`). Customers see the error overlay. | `validate-probe.log`. `files.ts:56-73`. `lib.test.ts:131` asserts an 8-byte `glTF v2` stub is valid. Bucket SQL :22-27. | GLB: require version == 2, declared length == `file.size`, and chunk 0 type `JSON` with a parseable `asset.version` starting `2.`. Optionally run gltf-transform `readBinary` in the worker that already exists. USDZ: parse the zip central directory, require the first entry to be `.usdc`/`.usda`, all entries stored (method 0), and 64-byte data alignment (Apple's USDZ rules). Treat a load failure in the admin preview as a publish **warning**. |
| AR-04 | Medium | After a Scene Viewer failure (Google app missing or disabled → `browser_fallback_url#model-viewer-no-ar-fallback`), model-viewer sets `canActivateAR=false` and fires `ar-status: failed` (toast shown). The page's `canAR` state is never re-read, so **"View in AR" stays visible**. A second tap records another `ar_activation` and does nothing: no intent, no toast, only a console warning "No AR Mode can be activated". This is a dead button and inflates analytics. | `sv-fallback.log`: `canActivateAR:false`, `btnStillVisible:true`, `intentLaunches:1`, `arActivationEvents:2`. Code `ProductPage.tsx:143-155, 197, 199-205`. Library `ar.js:146-161, 292-306`. | On `ar-status === 'failed'`, set `canAR` to `viewerRef.current.canActivateAR()`, which hides the button and shows the "phone" card. In `startAR`, check `canActivateAR()` before recording the event. |
| AR-05 | Medium (honesty) | **Variants do not affect the 3D view or AR.** Selecting a colour changes only the price and label: same `model-viewer` element, same `src`, `variantName` null. Two seeded GLBs carry `KHR_materials_variants` with names that don't match the seeded variants. Glam sofa GLB: Champagne, Navy, Gray, Black, Pale Pink; seed: Sapphire, Emerald, Dusty Rose. Sheen chair GLB: Mango Velvet, Peacock Velvet; seed: Tangerine Velvet, Peacock Velvet. A customer picking "Emerald" sees the default material in 3D and AR. | `browser.log` `variants` (before/after `src` equal, `sameElement:true`, price €1,899→€2,049). `availableVariants` read from the element. `types.ts:82-89`. | See §4. Until it is built, show a small "3D shows the {default} finish" note when a variant without its own model is selected. |
| AR-06 | Medium | `readiness.ts:44` marks iOS **Ready** whenever a USDZ exists, even with **no GLB**. The public page mounts the viewer (and so AR) only when a GLB exists (`ProductMedia.tsx:94`), so a USDZ-only product has **no AR on iPhone** while the admin sees "Ready". There is no unit test for USDZ without GLB (`readiness.test.ts:16-21` passes neither file). | Code. | iOS level = `hasGlb && hasUsdz ? 'ready' : …`; when there is a USDZ but no GLB, the detail should say "Add the GLB too: the page needs it to show 3D and AR." Add a test. |
| AR-07 | Low-Med | The admin `ModelPreview` keeps `state`, `measured` and `progress` across a GLB **replacement**. The component is not keyed by `glb.url` (`ModelSection.tsx:49, 220-223`); only the inner viewer is. While the new file loads, the old measurement drives "Scale verified" and readiness "Ready". The admin preview has no stall timeout, so a hung load keeps the old verdict indefinitely. | Code. | Use `<ModelPreview key={glb?.url} …>` or reset state in an effect on `glb.url`. Reuse `MODEL_STALL_TIMEOUT_MS`. |
| AR-08 | Low | When a model fails, the primary CTA still reads **"View in 3D / AR"** and the "3D" rail stays, because `has3d = modelState !== 'none'` counts `'error'`. On desktop the CTA also says "AR" where AR is unavailable. | Screenshot `browser/pixel7-tejo-side-table.png`. `ProductPage.tsx:106, 266-270`. | Show the CTA only when `modelState === 'loaded'`, and say "View in 3D" unless `availability === 'available'`. |
| AR-09 | Low | `isHttpUrl` accepts `http:` (`files.ts:159-162`) and the DB check allows `https?://` (`init_schema.sql:123`). An http model on the https site is blocked as mixed content, and the Scene Viewer intent uses `scheme=https`. The error message says "https://" but the code allows http. | Code. | Require `https:` for model URLs. |
| AR-10 | Low | `convertDims` rounds to 0.1 on every unit toggle, so values drift: 83 cm → 32.7 in → 83.1 cm. This is small next to the 5% tolerance but changes saved data. | `formModel.ts:59-67`. Arithmetic 83/2.54=32.68→32.7; ×2.54=83.06→83.1. | Convert from the originally entered value, or store in mm. |
| AR-11 | Low | On Android, `canActivateAR` is UA-only: no ARCore or Google-app check. Every Android Chrome visitor sees "View in AR". `mode=ar_preferred` opens Scene Viewer's 3D mode on non-ARCore phones. The readiness copy ("other phones keep the 3D view") is close but unverified. | `constants.js:61`, `ar.js:174-181`. Pixel 7 emulation `canAR=true` even for the **broken** model (button correctly hidden by the app). | Device test only. Keep the copy honest ("may open in 3D only"). |
| AR-12 | Low | Signed-URL query (`token=…`) is copied into the Scene Viewer intent params as well as `file=`. This is harmless to function, but it duplicates the token in the intent. Quick Look gets `…/x.usdz?token=…#allowsContentScaling=0`. Whether Quick Look accepts a query-string USDZ URL served as `model/vnd.usdz+zip` has **never been tested on a device**. | `ar.js:269-291`. `supabaseCatalogService.ts:305, 892-899`. | Device test (§5, step A7/I7). No code change unless it fails. |
| AR-13 | Low (licence) | `credits.ts` labels all six models "CC BY 4.0" with no creator. Upstream metadata: SheenChair is **CC0** (Wayfair/Eric Chadwick). SheenWoodLeatherSofa is CC0 (Fran Calvente) plus CC BY 4.0 improvements (Eric Chadwick / DGG). The others are CC BY 4.0, by Eric Chadwick / Wayfair, LLC or DGG. CC BY needs the creator to be named. Credits are shown only in Admin Settings, not where the models appear publicly. | `glb/*.metadata.json`, `*.LICENSE.md`. `AdminSettingsPage.tsx:153`. | Add `artist`/`owner`/`spdx` to `MODEL_CREDITS`, and show a "3D sample: … CC BY 4.0" line on sample product pages while sample data exists. |
| AR-14 | Info | The variant migration has a schema prerequisite: `save_product` **deletes and re-inserts** all `product_variants` on every save (`20261012192454_save_product.sql:76, 89-92`), so variant UUIDs change on every save. Any FK from per-variant media to `product_variants.id` would cascade-delete media on the next save. | SQL. | See §4. |

Things that check out: native-only AR modes; `ar-scale=fixed` → `resizable=false` and `allowsContentScaling=0`; built-in AR button hidden; AR button only after load **and** `canActivateAR`; one launch per 2 s; the seeded broken model shows the error overlay in ~2 s on all three envs; the 45 s stall timeout exists; scale verdicts match the repo's `checkScale` (see matrix); desktop and emulated iPhone show the "View in your space on a phone" card with copy link and QR; the preview is excluded from analytics.

---

## 3. Model compatibility matrix

Bounding box: glTF-Transform `getBounds` (node transforms applied). It matched model-viewer `getDimensions()` in-browser to 4 dp for all six. Declared dims are from `seed.ts`; the verdict uses the repo's `checkScale`. "Native AR attrs" are the same for every row: `src=<raw.githubusercontent GLB>`, `iosSrc=null` (no seeded USDZ), `ar=true`, `ar-modes="scene-viewer quick-look"`, `ar-scale="fixed"`, `ar-placement="floor"`. Note: React 19 sets `src`/`ar` as **properties**, so `getAttribute('src')` is null. Read the properties.

Every row is glTF 2.0 with magic `glTF`, a correct declared length and the JSON chunk first.

| Model | Format | Size | Bounding box (m) W×H×D | Declared dims | Viewer result | Native AR attrs / handoff | Env | Outcome |
|---|---|---|---|---|---|---|---|---|
| GlamVelvetSofa (glam-velvet-sofa) | GLB 2.0, req `KHR_texture_transform`; uses sheen, specular, **materials_variants**, lights_punctual | 3.15 MB, 4.2k tris, tex ≤1024 | 2.188×0.788×1.023 | 219×79×102 cm → **verified** | Loaded (3.9–7.5 s), "True-to-size model" | Desktop: no AR, phone card. Pixel 7: intent `mode=ar_preferred&disable_occlusion=true&resizable=false&file=…` (1 event). iPhone UA in Chromium: no AR (no `rel=ar`) | desktop / Pixel 7 emu / iPhone 14 UA (Chromium) | Viewer **PASS**; Android handoff **PASS (emulation)**; Scene Viewer placement and size **NOT TESTED**; Quick Look **NOT TESTED** |
| SheenWoodLeatherSofa (wood-leather-sofa) | GLB 2.0, **req `EXT_texture_webp`** + texture_transform; 13 WebP textures | 10.1 MB (9.64 MiB, just under the 10 MiB warning), 46.5k tris, tex 2048 | 2.726×1.117×0.923 | 273×112×92 → verified | Loaded, "True-to-size model" | Pixel 7: AR button + intent fired despite WebP | same | Viewer **PASS**; Android AR **FAIL (by repo rule, AR-01)**, unverified on device |
| SheenChair (sheen-lounge-chair) | GLB 2.0, req texture_transform; sheen, **materials_variants** (Mango Velvet, Peacock Velvet) | 4.13 MB, 39.9k tris, tex ≤1024 | 0.827×0.686×0.570 | 83×69×57 → verified | Loaded, "True-to-size model" | Pixel 7 intent captured | same | Viewer **PASS**; handoff **PASS (emulation)**; AR **NOT TESTED** |
| ChairDamaskPurplegold (damask-accent-chair) | GLB 2.0, no required ext; sheen, specular, texture_transform | 2.03 MB, 10k tris, tex ≤1024 | 0.829×0.687×0.572 | 60×100×60 (deliberate mismatch) → mismatch 38% | Loaded, "AR scale unverified" | Pixel 7 intent captured | same | Viewer **PASS**; scale-mismatch path **PASS**; AR **NOT TESTED** |
| AnisotropyBarnLamp (copper-barn-wall-lamp) | GLB 2.0, no required ext; anisotropy, clearcoat, transmission, volume, emissive_strength | 7.83 MB, 10.2k tris, tex 2048 | 0.191×0.255×0.227 | 19×26×23 → verified (1 cm floor) | Loaded | Pixel 7 intent captured. Wall lamp but `ar-placement=floor` | same | Viewer **PASS**; AR **NOT TESTED** (placement on floor for a wall lamp is a content note) |
| LightsPunctualLamp (tulip-floor-lamp) | GLB 2.0, no required ext; transmission, lights_punctual | 4.34 MB, 6k tris, tex 2048 | 1.127×1.864×0.722 | 113×186×72 → verified | Loaded | Pixel 7 intent captured | same | Viewer **PASS**; AR **NOT TESTED** |
| MissingSideTable (tejo-side-table, `BROKEN_MODEL_URL`) | 404 text/plain | n/a | n/a | 40×52×40 | Error overlay "The 3D model could not be loaded" + Try again/Photos (~2 s) | No AR button (app gate), although model-viewer `canActivateAR=true` on Pixel 7 | same | Error state **PASS**; CTA copy **FAIL (AR-08)** |

Licences (upstream `metadata.json`): Glam Velvet Sofa, Damask, Barn Lamp: CC BY 4.0, Eric Chadwick / Wayfair. Sheen Chair: **CC0**, Eric Chadwick / Wayfair. Sheen Wood Leather Sofa: CC0 original (Fran Calvente) + CC BY 4.0 improvements (Eric Chadwick / DGG). Punctual Lamp: CC BY 4.0, DGG. All are hosted on raw.githubusercontent with `Access-Control-Allow-Origin: *`, `application/octet-stream`, `max-age=300`.

**Recommended QA fixtures** (legit, licensed, Scene-Viewer-safe):
- *Valid 3D product:* **SheenChair.glb** (CC0, 4.1 MB, verified at 83×69×57 cm).
- *Native-AR product:* **GlamVelvetSofa.glb** (CC BY 4.0, 3.1 MB, large enough to tape-measure: 219 cm wide). For iOS, a matching USDZ must come from the 3D artist (no conversion here). Until then, use the iOS path with no USDZ, where model-viewer generates one on the device, and record it as such.
- *Two variants with different models:* **SheenChair.glb** + **ChairDamaskPurplegold.glb**. Same Wayfair chair shell, different upholstery, bounding boxes within 2 mm (0.827×0.686×0.570 vs 0.829×0.687×0.572), so both verify against one 83×69×57 cm product. Licences: CC0 + CC BY 4.0, credit Eric Chadwick / Wayfair.
- *Do not use as an AR fixture:* SheenWoodLeatherSofa (`EXT_texture_webp` required). Use it only as the **negative** fixture for the AR-01/02 warning.
- *Negative format fixtures:* write them with `scripts/validate-probe.mjs` (truncated GLB, glTF v1 header, empty zip as .usdz).

---

## 4. Per-variant photos and models: design advice

The owner approved an additive migration.

**Data**
- New table `product_variant_models (variant_id uuid references product_variants(id) on delete cascade, format text check in ('glb','usdz'), url, storage_path, file_name, size_bytes, primary key (variant_id, format), check ((url is null) <> (storage_path is null)))`. Copy the `product_models` constraints and its storage-folder RLS (`split_part(storage_path,'/',1) = business_id`), add explicit grants, and add `product_variant_images` with the same shape as `product_images`. Domain: `ProductVariant.models?: { glb?: ModelAsset; usdz?: ModelAsset }` and `images?: ProductImage[]`.
- **Prerequisite (AR-14):** change `save_product` to **upsert variants by id** (pass `id` in `p_variants`, `insert … on conflict (id) do update`, delete only ids that are absent). Otherwise every save regenerates variant ids and cascades the media away. Write the variant media in the same RPC, in one transaction. Extend `mediaPaths()` and the orphan cleanup (`supabaseCatalogService.ts:286, 525-538`) and `hydrate()` signing (:474-485) to include variant paths.
- Optional, cheaper path for GLBs that already carry `KHR_materials_variants` (Glam sofa, Sheen chair): a nullable `product_variants.gltf_variant text`. The viewer sets `model-viewer.variantName`. **Caveat:** Scene Viewer and Quick Look open the *file*, so AR shows the GLB's default material. Mark material-variant AR as "3D only, AR shows default finish" unless a per-variant file exists. Do not try to bake variants into new files (that would be conversion).

**Viewer and AR switching**
- Resolve one `effectiveModels = variant.models?.glb ? variant.models : product.models` per variant. Never mix a variant GLB with the base USDZ: a variant that has a GLB but no USDZ gets **no `ios-src`**, not the base one, because it would show the wrong colour in Quick Look.
- `ModelViewer` is keyed by `src`, so a variant switch remounts the element. `ProductMedia` must then reset `state` to `loading`, `progress`, `timedOut` and the parent's `canAR`/`measured`. Key `ProductMedia`'s viewer block by `effectiveModels.glb.url`, and run **scale per variant** with `checkScale(measured, product.dimensions)`. A variant may use a different shell, so it must re-verify. Never carry "True-to-size" across a switch.
- Hide or disable "View in AR" while the new variant's model loads, so AR never opens the previous variant's file. `ar_activation` stays a per-tap event. Add an optional `variant_id` column to analytics later; this is not needed now.
- Deep link `?variant=<id>` (built in `src/lib/urls.ts`) so a shared or QR'd product page opens the same finish. Stable ids are required, hence AR-14.
- Photos: if the variant has gallery images, switch the photo stage to them. Otherwise keep the product gallery.

**When a variant lacks its own model**
- Fall back to the base product model, and say so in place, honestly: "3D and AR show the {base variant name} finish" (EN/PT via `t()`). If the base GLB has `KHR_materials_variants` with a mapped `gltf_variant`, apply it in the 3D viewer only, and keep the note "AR shows the default finish".
- If neither the variant nor the product has a GLB: photos only plus the existing `viewer.unavailable` copy. No AR button, no "3D / AR" CTA (see AR-08).
- Admin: the readiness panel gets a per-variant row (GLB, USDZ, scale verdict, Scene Viewer extension warning) and a summary of "N of M variants have their own 3D model". This is never a publish blocker, only a warning.

---

## 5. Manual real-device test steps

Record each run in `System_arch/audit/DEVICE_TEST_MATRIX.md`: device, OS, browser + version, Google app version (Android), URL + commit, product, result, screen recording. Use a **staging or preview** deployment, not production data. Bring a tape measure and some floor space of at least 2.5 m.

Fixtures: (P1) Glam Velvet Sofa, verified, GLB only. (P2) Sheen Chair with GLB **and** a real USDZ from the artist stored in Supabase (signed URL). (P3) Damask chair, scale mismatch. (P4) Wood & Leather Sofa, WebP. (P5) Tejo side table, broken.

### Android: Scene Viewer (Chrome, ARCore-certified phone, Google app installed)
- **A1.** Open P1. The 3D loads behind the photo. Tap "3D": it turns and zooms. "View in AR" appears only after the load finishes.
- **A2.** Tap "View in AR" → tips → "Start AR". **Expected:** the *Google app's* Scene Viewer opens (Google header, "View in your space"), not AR inside Chrome. If it shows AR inside Chrome, FAIL (it would be WebXR).
- **A3.** Place on the floor. Pinch must **not** resize (`resizable=false`). Measure width (219 cm) and height (79 cm). PASS if within 5% or 1 cm. Only then mark scale "verified on device".
- **A4.** Back to Chrome: page usable, no spinner, no "AR could not start" toast.
- **A5.** Double-tap "View in AR": one Scene Viewer launch. About a minute later, the dashboard's AR attempts rise by 1.
- **A6.** Open P4 (WebP sofa) and start AR. Note whether Scene Viewer shows an error or the model with missing textures. This confirms or refutes AR-01.
- **A7.** Open P2 (Supabase signed URL) and start AR. **Expected:** the model loads in Scene Viewer, which proves that a signed URL with `?token=` works. Repeat after leaving the tab in the background for more than 6 h (tests the refetch).
- **A8.** Disable the Google app (Settings → Apps → Google → Disable), reload, tap AR. **Expected:** the "AR could not start" toast and the 3D view stays. Then check AR-04: whether the AR button is still shown, and whether a second tap does nothing.
- **A9.** If you have a non-ARCore Android: Scene Viewer should open in 3D-only mode, or the toast appears. Note which.
- **A10.** Open P5: error overlay, no AR button. Note the "View in 3D / AR" CTA (AR-08).
- **A11.** Open the catalog link from inside WhatsApp, Instagram and Facebook: the in-app notice appears, "copy link" works, and AR in the in-app browser is noted as-is.

### iOS: AR Quick Look (Safari, ARKit iPhone or iPad, iOS 16+)
- **I1.** Open P2 (GLB + USDZ). 3D loads, and "View in AR" appears (Safari `rel="ar"` supported).
- **I2.** Tips → Start AR. **Expected:** Quick Look opens the **USDZ** (not a "Preparing" export). Choose the "AR" tab and place it.
- **I3.** `allowsContentScaling=0`: pinch must not scale. Measure the chair (83×69×57 cm). Report the USDZ separately: the app never measures USDZ files, and the page says so ("3D model true to size", separate-file note).
- **I4.** Close Quick Look: back on the page, usable, with no double toast.
- **I5.** Open P1 (no USDZ). Note the time until Quick Look opens: model-viewer generates a USDZ on the device. Note any material loss (sheen and variants are not exported) and measure the size. A slow or failed result is a finding, not a pass.
- **I6.** Open P1 in Chrome for iOS (CriOS). The AR button should appear. Record the behaviour. Open it in the **Google app** (GSA): expect no AR button and the "view on a phone" card.
- **I7.** For P2, check that the signed URL `…/x.usdz?token=…#allowsContentScaling=0` opens in Quick Look. If it fails, note it: AR-12.
- **I8.** Instagram, Facebook and WhatsApp in-app browsers: the in-app notice shows. Record whether AR opens.
- **I9.** Open P3: "AR scale unverified" shows before AR, and AR still opens.

### Both
- **B1.** Desktop: no AR button, "View in your space on a phone" card, and the QR opens the same product on the phone.
- **B2.** Variant switch (after §4 ships): pick each colour, then start AR. The AR file must match the selected colour, or the page must say which finish AR shows.
- **B3.** Never record placement, occlusion, wall detection or room fit as "verified". Only the measured size counts.

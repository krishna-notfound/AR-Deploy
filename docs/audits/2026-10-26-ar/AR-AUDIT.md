# AR audit: what can stop a visitor getting into AR (2026-10-26)

| | |
|---|---|
| **Scope** | Public product page, embed, model viewer, editor upload checks, analytics, live site `https://sanctus.warpkit.online` |
| **Branch read** | `feature/sanctus-brand-design-system` at `ad88f6a` (includes the AR-button fix `8ba391c`, merged in `8ecce90`) |
| **Library** | `@google/model-viewer` 4.4.0 (`node_modules/@google/model-viewer/lib/features/ar.js`) |
| **Rules applied** | ADR-0021: native viewers only, `ar-modes="scene-viewer quick-look"`, no WebXR, no AR-mode change without the owner's go-ahead |
| **Method** | Code read with file:line evidence. Live probe: Playwright Chromium with a Pixel 7 profile (no real device). Local probe: demo-mode dev server at 390 × 844 and 360 × 740. GLB headers read through an anon signed URL. Nothing in the repo was changed. |

> **Honesty note.** Emulation cannot open Scene Viewer or Quick Look. Every "SUSPECTED" item below needs the
> real-device checklist at the end. Findings in this report are numbered AR-01 onwards. They are new IDs, not the
> AR-xx IDs in `docs/dashboard-audit/ar.md`. Where a finding repeats an older one, it says so.

> **Side effect of the live probe.** The live probe opened the QA products and tapped the AR control. That
> recorded roughly 7 `view` and 4 `ar_activation` events on the QA atelier ("do not delete") products on
> 2026-10-26, about 12:40–12:50 local time. No other data was written.

## Summary

| Severity | Count | Findings |
|---|---|---|
| Critical | 0 | – |
| High | 3 | AR-01, AR-02, AR-03 |
| Medium | 7 | AR-04 to AR-10 |
| Low | 7 | AR-11 to AR-17 |

**High findings:**
- **AR-01:** The live site still runs the pre-fix build. Its primary button "View in 3D / AR" does not start AR.
- **AR-02:** The Android Scene Viewer hand-off has never been verified on a phone, and it has no fallback.
- **AR-03:** iPhone AR depends entirely on the phone generating a USDZ. No live product has a USDZ.

No finding needs `ar-modes` changed. Only one possible fix touches AR modes: re-adding `webxr` as a fallback (AR-02). It is listed for completeness and needs the owner's go-ahead.

---

## Findings

### AR-01: The live site still serves the pre-fix build, so its main button does not start AR
- **Severity:** High. **Status:** CONFIRMED (live probe, 2026-10-26).
- **Where:**
  - Live `https://sanctus.warpkit.online/products/qa-sanctus-demo-atelier-do-not-delete-automatically/qa-glam-velvet-sofa`, plus `qa-lounge-chair-two-finishes` and `qa-sheen-chair`.
  - Fixed on the branch at `src/features/public/ProductPage.tsx:312-317`.
- **Evidence:**
  - Live buttons (Pixel 7 profile): `"3DView in 3D"`, `"ARView in AR"` (the 48 px rail square), `"View in 3D / AR"` (primary) and `"AR tips"`.
  - On the branch, the primary button reads "View in my home" and calls `onActivate`, and the rail square is gone.
  - The live intent is fired only from the small "AR" square.
- **What the visitor experiences:** They tap the large obsidian "View in 3D / AR" button and the stage only turns to 3D. AR is reachable only through the small "AR" square under the stage. This is investigation cause 1, and it is still live.
- **Smallest fix:** Redeploy the branch head (`ad88f6a` or later) to the Vercel project that serves `sanctus.warpkit.online`. No code change is needed. Deploying is an owner decision: pushing to `main` deploys production. This does not touch AR modes.

### AR-02: Android: the Scene Viewer hand-off is unverified on a real phone and has no fallback
- **Severity:** High. **Status:** SUSPECTED (cannot be reproduced without a device).
- **Where:**
  - `src/components/three/ModelViewer.tsx:140` (`ar-modes="scene-viewer quick-look"`).
  - Intent built in `ar.js:248-291`. Failure path in `ar.js:292-305`: `isSceneViewerBlocked = true`, the AR mode is re-selected, and `ar-status: failed` is sent.
  - Page reaction: `ProductPage.tsx:265-270` (toast, `canAR` re-read) and `ProductPage.tsx:185-189`.
  - History: `System_arch/HANDOFF.md:68` and `:83-88`. The earlier "Scene Viewer first" attempt did not open the Google app on the owner's phone, and the cause was never found.
- **Evidence:**
  - The live intent is well formed. Token redacted: `intent://arvr.google.com/scene-viewer/1.2?token=<…>&mode=ar_preferred&disable_occlusion=true&resizable=false&file=https://zggylkbgajamhriebdrg.supabase.co/storage/v1/object/sign/product-media/…glb?token=<…>#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=…#model-viewer-no-ar-fallback;end;`
  - `canActivateAR` depends on the user agent only (`constants.js:61`: `IS_ANDROID && !IS_FIREFOX && !IS_OCULUS`). It does not check for ARCore or the Google app. The older audit's AR-11 says the same.
- **What the visitor experiences:** If the Google app is missing, disabled or out of date, or Chrome refuses the intent:
  - Chrome loads the fallback hash.
  - The page shows "AR could not start on this device. You can still explore the 3D model." (`en.ts:91`).
  - The button turns into "View in 3D".

  There is no in-browser AR, by design (ADR-0021). On phones without ARCore, `mode=ar_preferred` should open Scene Viewer's 3D view instead of AR. That is unverified.
- **Smallest fix within ADR-0021:** Diagnose first, with no code change. Use checklist steps 1–5. Record:
  - the phone model and Android version;
  - the Chrome version;
  - whether **Google** (`com.google.android.googlequicksearchbox`) and **Google Play Services for AR** are installed, enabled and up to date;
  - that the page was opened in Chrome itself;
  - a screen recording.

  If the Google app was the problem, the fix is on the device.

  **Owner go-ahead needed:** re-adding `webxr` as a fallback would be a one-attribute AR-mode change. ADR-0021 and the owner's decision forbid it, so it is not recommended here.

### AR-03: iPhone AR depends entirely on the phone generating a USDZ, which has never been tested
- **Severity:** High. **Status:** SUSPECTED. The provisioning gap is CONFIRMED; the device behaviour is not.
- **Where:**
  - The live probe read `ios-src: none` on all three QA products with 3D. `docs/SANCTUS_3D_AR_QA_REPORT.md` §3 says the same: no QA product has a USDZ.
  - Generation path: `ar.js:316-321` (`generateUsdz = !this.iosSrc`, then `prepareUSDZ()`) and `ar.js:394`. `ar-usdz-max-texture-size` is not set, so it is `'auto'`, which is NaN, so textures are exported at full size (**Infinity**).
  - The iOS Google app is excluded from Quick Look: `ar.js:185,194` (`!IS_IOS_GSA`).
  - The product GLBs use `KHR_materials_sheen`, `KHR_materials_specular` and `KHR_lights_punctual` (live probe `extensionsUsed`). Three's USDZ exporter does not carry those.
  - Readiness already warns about this (`src/features/ar/readiness.ts:50`): "No USDZ: the phone converts the GLB itself… not guaranteed."
- **What the visitor experiences:**
  - In Safari, nothing visible happens for several seconds after the tap while the phone converts 3–4 MB GLBs (see AR-06). Then Quick Look opens. If the conversion runs out of memory, the tab can reload or the toast shows.
  - Velvet and sheen fabrics can look flat or different in Quick Look.
  - In the iOS Google app, no AR button appears at all (see AR-07 for the misleading copy shown instead).
- **Smallest fix within ADR-0021:**
  - **Provisioning:** businesses upload a USDZ for each product and each finish. The editor already supports it (`ModelSection.tsx:19`), and `variantMedia.ts:26-33` already pairs each finish's USDZ correctly. Then test in Safari.
  - **Optional:** add `ar-usdz-max-texture-size="2048"` to cap memory while a USDZ is still generated. This is one model-viewer attribute. HANDOFF (`System_arch/HANDOFF.md:95`) requires any such attribute to be tested on the owner's phone first, so it **needs the owner's go-ahead**. It does not change AR modes.

### AR-04: The AR button appears only after the whole GLB has downloaded, and each visit downloads it again
- **Severity:** Medium. **Status:** CONFIRMED.
- **Where:**
  - `ProductPage.tsx:312` (CTA only when `modelState === 'loaded'`).
  - `ArSection.tsx:15-19` ("checking" until load).
  - `ModelViewer.tsx:86` (`canActivateAR` is read on `load`).
  - The AR mode itself is chosen synchronously at element update (`ar.js:163-190`), long before the load finishes.
  - Signed URLs: `supabaseCatalogService.ts:594` (a new token on every page load).
  - The upload sets no `cacheControl`: `supabaseCatalogService.ts:1121`. Logo uploads do: `supabaseAccount.ts:283`.
- **Evidence:**
  - Live time to the AR control: 6.7 s (sofa, 3.1 MB), 7.2 s and 8.7 s (chairs, 4.1 MB), on desktop broadband with a phone profile. Mobile data will be slower.
  - The GLB GET returns no `Cache-Control` header (`cf-cache-status: HIT` at the edge only).
  - Scene Viewer then downloads the same GLB again in the Google app.
- **What the visitor experiences:** "Checking AR support…" for many seconds on mobile data, with no AR button and no "View in 3D" button. Some visitors will leave first. Opening the page again re-downloads the model.
- **Smallest fix (no AR-mode change):**
  - Show the AR button once the viewer reports `canActivateAR`, without waiting for the load. On Android this needs only the Scene Viewer extension check, which is already stored with the asset (`media.models.glb.requiredExtensions`, `ProductPage.tsx:170`).
  - Keep the scale note tied to the load.
  - Set `cacheControl` on model uploads. This helps only the CDN, because each signed URL differs.

### AR-05: At phone width, the AR button is below the fold
- **Severity:** Medium. **Status:** CONFIRMED (branch, demo mode, Android profile).
- **Where:** `ProductPage.tsx:237-317`. The stage comes first on phones, then the title, price, description and finish picker, then the CTA.
- **Evidence:**

  | Viewport | CTA "View in my home" top | Viewport height | Below the fold by |
  |---|---|---|---|
  | 390 × 844 | 1090 px | 844 px | ~250 px |
  | 360 × 740 | 1060 px | 740 px | ~320 px |

  There is no horizontal scroll. The `3D`/`AR` header chips are plain text now (they don't look like buttons).
- **What the visitor experiences:** The first screen shows a photo and an "AR" label, but no way to start AR until they scroll. The fix report flagged this too.
- **Smallest fix (design, not AR):** Move the CTA directly under the stage on screens below `lg` (CSS order only). Alternatively, show a compact sticky "View in my home" bar once AR is available. Either needs the owner's design sign-off. AR behaviour is unchanged.

### AR-06: No "preparing AR" state, and a 2-second re-tap guard that is shorter than USDZ generation
- **Severity:** Medium. **Status:** The code is CONFIRMED. The device effect is SUSPECTED.
- **Where:**
  - `ProductPage.tsx:36` (`AR_RELAUNCH_MS = 2000`) and `:190-196`.
  - `ModelViewer.tsx:153`: the built-in progress bar is hidden.
  - `ProductMedia.tsx:130`: our overlay shows only while `state === 'loading'`.
  - `ar.js:316-321`: `prepareUSDZ()` awaits before Quick Look opens.
- **What the visitor experiences:** On iPhone without a USDZ, nothing on screen changes for several seconds after "Start AR". A second tap after 2 s:
  - records a second `ar_activation`;
  - starts a second export, doubling memory use on the phone.

  On Android the Google app takes a moment to open, and the same impatience applies.
- **Smallest fix (no AR-mode change):** While the `activateAR()` promise is pending:
  - disable the CTA;
  - show "Opening AR…";
  - set `lastLaunch` when the promise settles, not only when the tap happens.

### AR-07: Phones that cannot open AR are told to "open this page on your mobile device"
- **Severity:** Medium. **Status:** The code is CONFIRMED. Verified under iPhone emulation, which shows the same card.
- **Where:**
  - `ArSection.tsx:56-74`, with copy at `en.ts:85-86` and `pt.ts:87-88`.
  - When it shows on a phone:
    - the iOS Google app (`ar.js:185,194`);
    - iOS in-app WebViews such as Instagram or Facebook (no `rel="ar"` support, `constants.js:68-79`);
    - Firefox for Android (`constants.js:61`);
    - any Android phone after a failed hand-off (`ProductPage.tsx:269`).
- **What the visitor experiences:** They are already on a phone, and the page tells them to use a phone. They get no hint that Safari or Chrome would work.
- **Smallest fix (copy only):**
  - When `isIOS()` or `isAndroid()` (`src/lib/userAgent.ts:11-17`), show "AR isn't available in this browser. Open this page in Safari / Chrome", with the existing Copy link button.
  - Keep the QR code for desktop only.

### AR-08: Android in-app browsers: AR fails and the message blames the phone
- **Severity:** Medium. **Status:** SUSPECTED (needs a device).
- **Where:**
  - `src/lib/userAgent.ts:4-9`: detects only Instagram, Facebook and WhatsApp. TikTok, LinkedIn, Snapchat, X, Telegram and LINE are missed.
  - `InAppNotice.tsx:22-37`: a dismissible banner.
  - `ProductPage.tsx:265-269`: a generic failure toast.
- **What the visitor experiences:** Links shared in social apps often open in a WebView that refuses or swallows `intent://`. The visitor taps "View in my home" and gets "AR could not start on this device", or nothing at all. The same phone works in Chrome.
- **Smallest fix (no AR-mode change):**
  - Widen the detection list.
  - When the AR status is failed and an in-app browser is detected, show "Open in Chrome to use AR" with Copy link instead of the device message.

  This is copy and navigation only.

### AR-09: A mis-scaled model still opens in AR at a fixed size, with no warning where AR starts
- **Severity:** Medium. **Status:** CONFIRMED.
- **Where:**
  - `ProductPage.tsx:365`: the scale note sits in the Dimensions section, below the CTA.
  - `ArTips.tsx:65-70`: the tips say nothing about scale.
  - `ModelViewer.tsx:141`: `ar-scale="fixed"`, which becomes `resizable=false` (`ar.js:276`) and `allowsContentScaling=0` (`ar.js:345`).
  - The scale check is in `src/lib/scale.ts:32-55` (5% or 1 cm).
- **Label mismatch:** Admin readiness promises the public page will say "True size" / "Size not verified" (`readiness.ts:72-74`). The public strings are "True-to-size model" / "AR scale unverified" (`en.ts:93-98`).
- **What the visitor experiences:** If the model and the listed dimensions disagree, the piece opens at the model's size and cannot be pinched. The only warning is lower down the page. The honesty rule is met ("verified" only when it matches), but nothing warns the visitor at the moment AR starts.
- **Smallest fix (no AR-mode change):**
  - When `scale.status === 'mismatch'`, add one line to the "before AR" tips dialog: "Size not verified: use the listed dimensions."
  - Align the readiness copy with the public labels.

### AR-10: Uploads allow files far larger than Android AR handles well, and texture size is not checked
- **Severity:** Medium. **Status:** SUSPECTED. The limits are CONFIRMED; the device failure point is not.
- **Where:**
  - `src/lib/files.ts:23-24`: GLB and USDZ up to **50 MB**.
  - `readiness.ts:7,78-79`: an admin-only warning above 10 MB.
  - `modelOptimize.ts:1-6`: textures are reduced to 2048 px **only** when `VITE_MODEL_OPTIMIZATION=on`, which is off pending the client's sign-off.
- **What the visitor experiences:** A 20–50 MB model or 4K textures mean:
  - a long wait before the AR button appears (AR-04);
  - a likely Scene Viewer load failure or slow placement;
  - memory pressure during iPhone USDZ generation (AR-03).

  The public page still offers AR.
- **Smallest fix (no AR-mode change):**
  - Make files over 15 MB a readiness **warning** on the product list too.
  - Read the image sizes from the GLB JSON and warn above 2048 px.
  - Or have the owner sign off on turning the optimizer on.

### AR-11: The signed-URL token is copied into the Scene Viewer intent as a top-level parameter
- **Severity:** Low. **Status:** SUSPECTED (repeats the older AR-12; never tested on a device).
- **Where:** `ar.js:259-291`. model-viewer copies the model URL's query string into the intent parameters. The token appears twice in the live intent.
- **Evidence:**
  - The GLB is served with `200` / `206` (ranges supported), `Content-Type: model/gltf-binary` and `Access-Control-Allow-Origin: *`.
  - A damaged token returns `400 InvalidJWT`.
  - The signed-URL TTL is 12 h (`catalogService.ts:65`). Pages refetch on focus after 6 h (`services/hooks.ts:88-107`, `ProductPage.tsx:38,70`).
- **What the visitor experiences:** Probably nothing. If Scene Viewer rejects the extra parameter, the result is AR-02's failure path.
- **Smallest fix:** Test only (checklist step 3). If it fails, serving published models through public, query-free URLs is a storage and security decision. That **needs an ADR and the owner's approval**. It does not change AR modes.

### AR-12: The Scene Viewer extension allow-list may be too strict, and Draco/KTX2 decoders load from a Google CDN
- **Severity:** Low. **Status:** SUSPECTED.
- **Where:**
  - `src/lib/files.ts:125`: only `KHR_materials_unlit`, `KHR_texture_transform` and `KHR_materials_pbrSpecularGlossiness`. A GLB that *requires* Draco is refused Android AR (`ProductPage.tsx:170`, `ArSection.tsx:41-47`).
  - The decoders come from `https://www.gstatic.com/draco/…` and `/basis-universal/…` (`node_modules/@google/model-viewer/lib/features/loading.js:28-29`). The CSP allows `connect-src https://www.gstatic.com` (`vercel.json:17`), and it is report-only anyway.
- **What the visitor experiences:**
  - Draco-compressed models get "AR is not available for this model on Android", even though Scene Viewer may support Draco.
  - On networks that block gstatic, compressed models fail to load in 3D. AR is gated on the load (AR-04), so no AR button appears on iPhone either.
  - No current QA model is compressed, so there is no impact today.
- **Smallest fix:** On a device, test one Draco sample before relaxing the list. Self-hosting the decoders would be a new build asset or dependency, so it needs an ADR. Neither touches AR modes.

### AR-13: Analytics count launch attempts only, with no failures, platform or finish
- **Severity:** Low. **Status:** CONFIRMED.
- **Where:**
  - `ProductPage.tsx:194`: recorded before `activateAR()`.
  - `supabase/functions/track-event/handler.ts:15`: the event types are `view`, `embed_view`, `ar_activation` and `model_interaction`. No failure type, no platform, no variant.
  - Rate limit: 30 events per visitor key per minute (`supabase/migrations/20261026041731_business_logic_fixes.sql:796`). The key is the IP network (/64) per day (`handler.ts:39-52`).
  - The embed correctly never records AR (`EmbedProductPage.tsx:91-92`).
- **What the visitor experiences:** Nothing. The owner sees "AR launch attempts" (labelled honestly, `HANDOFF.md:97`) but cannot tell:
  - iPhone from Android;
  - failed launches from successful ones;
  - which finish was viewed.

  In a busy showroom where every phone shares one Wi-Fi IP, events above 30 per minute are dropped.
- **Smallest fix:** Leave it as it is for launch. A failure event or a platform field is a schema change, which **needs a new migration and the owner's approval**.

### AR-14: The embed's AR link promises "View in your space" on desktop, and the new tab makes the visitor wait and tap again
- **Severity:** Low. **Status:** CONFIRMED.
- **Where:**
  - `EmbedProductPage.tsx:150-155`: `embed.arLink` = "View in your space (opens Sanctus)" (`en.ts:71`), shown whenever there is a GLB.
  - `ProductMedia.tsx:60` and `EmbedProductPage.tsx:120`: `ar={false}` in the iframe, which is correct per ADR-0026.
- **What the visitor experiences:**
  - **On a desktop host site:** the link opens a page that shows the "use a phone" card.
  - **On a phone:** a new tab opens, the model downloads again (AR-04), and the visitor taps "View in my home", then "Start AR".
- **Smallest fix (copy only):** Show `embed.arLink` only on iOS and Android, and "Full details" elsewhere.

### AR-15: The AR tips do not match how the native viewers behave
- **Severity:** Low. **Status:** SUSPECTED (confirm on a device).
- **Where:** `en.ts:104-107` / `pt.ts:106-109` ("Tap to place the piece", "…two fingers to rotate"), shown before every launch unless dismissed (`ArTips.tsx:40-51,65-70`).
- **What the visitor experiences:**
  - Scene Viewer and Quick Look place the piece on the floor themselves.
  - With a fixed scale, pinching does nothing, and nothing tells the visitor so.
  - The tips are the same on both platforms.
- **Smallest fix (copy only):**
  - "Point at the floor and move slowly. The piece appears at its real size."
  - "Drag to move, twist with two fingers to turn."

### AR-16: Finishes need their own model files, and a single GLB with built-in finishes is not used
- **Severity:** Low. **Status:** CONFIRMED.
- **Where:**
  - `src/features/ar/variantMedia.ts:26-33`: a finish shows its own GLB/USDZ, otherwise the product's model with a note (`ProductPage.tsx:274-276`, `en.ts:101`).
  - The live sheen chair GLB carries `KHR_materials_variants` (live probe `extensionsUsed`). model-viewer's `variant-name` is not used, and Scene Viewer shows only the default material.
  - `ar_activation` has no finish (AR-13).
- **What the visitor experiences:** If a business uploads one GLB that contains every finish, every finish shows the default material in 3D and in AR. The fallback note says "may look different", which is honest.
- **Smallest fix:** Provisioning only: one GLB, and one USDZ, per finish (see "What the owner and businesses must provide").

### AR-17: Accessibility: the bare "3D"/"AR" status labels; otherwise the AR path works by keyboard
- **Severity:** Low. **Status:** CONFIRMED (local probe).
- **Where:** `ProductPage.tsx:250-255`. The chips are plain `<span>`s reading "3D" "AR", with no context for screen readers.
- **What works:**
  - The CTA is a real `<button>` with visible text, and its icon is `aria-hidden` (`ProductPage.tsx:313-316`).
  - From the top of the page it takes 9 Tabs to reach "View in my home".
  - The tips dialog is `aria-modal`, and focus lands on "Start AR" (`ArTips.tsx:44`).
  - Enter fires exactly one intent.
  - The failure toast is `role="alert"` in an `aria-live` region (`ToastProvider.tsx:59,68`).
  - "Checking AR support…" is `role="status"` (`ArSection.tsx:35`).
  - The "AR tips" link has a 44 px hit area (`tapTarget.ts`).
- **Smallest fix:** Mark the chip row `aria-hidden`, because the CTA already says the same thing. Alternatively, give it a visually hidden "3D and AR available".

---

## Ruled out (with evidence)

| Suspect | Result |
|---|---|
| CSP blocking models or decoders | Only `frame-ancestors` is enforced. The full policy is report-only (live headers; `vercel.json:17,21-28`). |
| GLB MIME, CORS, integrity | Live: `model/gltf-binary`, `ACAO: *`, `glTF` magic bytes, `Accept-Ranges: bytes`; 3,149,844 B (sofa) and 4,125,648 B (chairs). |
| USDZ MIME on upload | Forced to `model/vnd.usdz+zip` (`supabaseCatalogService.ts:374,1119-1121`). The bucket allows it (`20261012192159_storage.sql:27`). No live USDZ exists to confirm the served header. |
| `canActivateAR` timing race | The mode is chosen synchronously at element update for Android and iOS candidates (`ar.js:163-190`). The only async branch is the XR-headset `formFactor` check. Reading it on `load` is reliable (it is late, not wrong; see AR-04). |
| Lost user activation | `startAR` reaches `activateAR()` with no `await` before it (`ProductPage.tsx:182-196`). Live and local probes each produced exactly one intent per tap, including through the tips dialog. |
| Android extension gate on QA models | They require only `KHR_texture_transform`, which is allowed (`files.ts:125`). |
| Signed-URL expiry | TTL 12 h, with a refetch on focus or visibility after 6 h (`hooks.ts:88-107`). A dead token gives a clean `400`, not a hang. |
| Variant ↔ model pairing | One source per finish, never a finish's GLB with the base USDZ (`variantMedia.ts:26-33`). Live: the lounge chair's AR target follows the selected finish (also QA report §4). Variant IDs stay stable across saves (`20261020143507_variant_media.sql:12`). |
| AR-mode config drift | `ar-modes="scene-viewer quick-look"`, `ar-scale="fixed"`, `ar-placement="floor"` (`ModelViewer.tsx:140-142`), the same as ADR-0021. Live element attribute confirmed. |
| Horizontal scroll at 360/390 | None (`scrollWidth` equals the viewport). |

## What the owner and businesses must provide

1. **For each product, and for each finish that should look different:**
   - one **GLB** (glTF 2.0) for 3D and Android;
   - one **USDZ** for iPhone and iPad.

   Without a USDZ, the iPhone has to convert the GLB on the spot (AR-03).
2. **Real-size models.** Units in metres, the floor at the model's base, the front facing +Z. Width, height and depth must match the listed dimensions within 5% (or 1 cm). Export the USDZ at the same size, because it is not measured.
3. **Light files.**
   - GLB ideally ≤ 10 MB, textures ≤ 2048 px.
   - The only required extensions should be `KHR_texture_transform`, `KHR_materials_unlit` or `KHR_materials_pbrSpecularGlossiness`. No Draco, meshopt, KTX2 or WebP until a device test says otherwise.
   - USDZ: an uncompressed zip whose first entry is the `.usdc`/`.usda` file (the editor checks this).
4. **Dimensions entered** in cm or in for every product with a model, so that the size check can run.
5. **For the test:** one ARCore Android phone with the **Google** app and **Google Play Services for AR** up to date, and one iPhone (iOS 16+) with Safari.
6. **A deploy decision** for AR-01, so that the tested build is the one visitors get.

## Real-device test checklist (about 10 minutes)

Use **the build being released**. If AR-01 is not deployed yet, the live AR control is the small square marked "AR" under the stage. After the deploy, it is the black "View in my home" button. Screen-record each phone.

**Test URLs:**
- Sofa (219 × 79 × 102 cm): `https://sanctus.warpkit.online/products/qa-sanctus-demo-atelier-do-not-delete-automatically/qa-glam-velvet-sofa`
- Chair with two finishes: `https://sanctus.warpkit.online/products/qa-sanctus-demo-atelier-do-not-delete-automatically/qa-lounge-chair-two-finishes`

**Android (Chrome), about 5 minutes**
1. Write down the phone model, Android version and Chrome version. In the Play Store, confirm that **Google** and **Google Play Services for AR** are installed and up to date.
2. Type the sofa URL into Chrome (not a link inside WhatsApp or Instagram). Count the seconds until the AR control appears, then scroll to it. *Pass:* it appears. Note the seconds and whether you had to scroll (AR-04, AR-05).
3. Tap the AR control. If the tips appear, tap **Start AR**. *Pass:* the Google **Scene Viewer** opens on the camera and shows the sofa. *Fail:* the "AR could not start" message, or AR opens inside the browser. Note exactly what you see (AR-02, AR-11).
4. Place the sofa on the floor. Try to pinch it. *Pass:* the size does not change. Measure its width with a tape: **208–230 cm** passes (AR-09).
5. Press back. *Pass:* the product page still works, and the AR control is still there.
6. Open the chair, pick **Damask**, and start AR. *Pass:* the Damask pattern shows in Scene Viewer. Repeat with **Sheen** (AR-16).
7. Optional (Samsung phone): repeat step 3 in **Samsung Internet**.
8. Send yourself the sofa link in WhatsApp or Instagram, open it inside that app, and tap AR. Note what happens and what message shows (AR-08).

**iPhone (Safari), about 4 minutes**

9. Open the sofa URL in **Safari**. Note the seconds until the AR control appears.
10. Tap it, then **Start AR**, and **don't tap again**. Time from the tap until Quick Look opens. *Pass:* Quick Look opens within about 10 s, and the page did not reload (AR-03, AR-06).
11. In Quick Look, use the **AR** tab. Place the sofa and try to pinch it. *Pass:* the size is fixed, and the width measures 208–230 cm. Note whether the velvet looks flat compared with the web view.
12. Chair → **Damask** → AR. *Pass:* the Damask finish shows in Quick Look.
13. Open the same sofa link in the **Google app** or inside **Instagram**. *Expected:* no AR button. Note the message shown (AR-07).

**Both, about 1 minute**

14. In the Sanctus owner dashboard, check that **AR launch attempts** for these products went up by exactly the number of launches you made.
15. Scan the product's QR code with the phone camera. *Pass:* the page opens in Safari or Chrome, not inside another app.

**Send back:** pass or fail for each step, the timings from steps 2, 9 and 10, the two tape measurements, the phone, OS and browser versions, and the recordings.

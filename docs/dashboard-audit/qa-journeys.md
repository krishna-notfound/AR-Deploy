# Sanctus Preview: QA journeys (real deployed app)

Date: 2026-10-20. Target: Preview `https://ar-deploy-qio4qn0c4-track0.vercel.app` (Supabase mode, client DEV project `zggylkbgajamhriebdrg`). Driver: Playwright (Chromium headless) from scripts in this folder; evidence in `shots/` and `qr/`. No secrets, tokens or signed URLs are written here (storage paths only).

QA business: **QA — Sanctus Demo Atelier — DO NOT DELETE AUTOMATICALLY** (`e5a40e29-c022-41ea-9a63-e06222581b85`, slug `qa-sanctus-demo-atelier-do-not-delete-automatically`), application reference **059B9C06**. Status changed by the admin (UI) from **draft → active**. Nothing outside this business was edited or deleted; no QA record was deleted.

## Status counts

| Journey | PASS | FAIL | BLOCKED | NOT TESTED |
|---|---|---|---|---|
| Setup | 1 | 0 | 0 | 0 |
| B | 22 | 0 | 0 | 0 |
| A | 19 | 0 | 1 | 1 |
| C | 7 | 0 | 0 | 0 |
| E | 11 | 0 | 2 | 0 |
| D | 10 | 0 | 1 | 0 |
| G | 21 | 2 | 0 | 0 |
| F | 7 | 0 | 0 | 0 |

## Products created (owner, real editor UI)

| Key | Name | id | slug | End status | Storage objects (product-media) |
|---|---|---|---|---|---|
| P1 | QA Sheen Chair | `1268c143-8f7f-483f-9916-0602420f3692` | `qa-sheen-chair` | published | `e5a40e29-c022-41ea-9a63-e06222581b85/8861686f-c73a-4dc8-9683-3da9bae8a708.webp`<br>`e5a40e29-c022-41ea-9a63-e06222581b85/8d913734-3ab5-4cdd-9898-2759946591dd.glb` |
| P2 | QA Glam Velvet Sofa | `755ae419-8c15-46a2-ab61-f93c8589a7d7` | `qa-glam-velvet-sofa` | published | `e5a40e29-c022-41ea-9a63-e06222581b85/bcd32489-3acd-4cb2-9a71-a57c92846a62.webp`<br>`e5a40e29-c022-41ea-9a63-e06222581b85/4f36bc4f-3958-4ddd-833b-9e13df69edd7.glb` |
| P3 | QA Lounge Chair — two finishes | `0de0088f-d816-422f-9acc-e153ef2d7750` | `qa-lounge-chair-two-finishes` | published | `e5a40e29-c022-41ea-9a63-e06222581b85/7a54bb12-5026-4dd6-a24d-374a69f12b4b.webp`<br>`e5a40e29-c022-41ea-9a63-e06222581b85/b3adfcb7-f06e-4f85-b4c5-334a794fe8cd.webp`<br>`e5a40e29-c022-41ea-9a63-e06222581b85/8d88610b-0dfe-4c94-8286-f9edd554076d.glb`<br>`e5a40e29-c022-41ea-9a63-e06222581b85/e18cd2ea-2de1-405d-bd94-8d69ab944426.webp`<br>`e5a40e29-c022-41ea-9a63-e06222581b85/c0a6d92d-7b59-4d6e-8f3f-632342407920.glb` |
| P4 | QA Barn Lamp — photos only | `10149abf-8817-49a9-ba02-8e3346c01f60` | `qa-barn-lamp-photos-only` | published (after unpublish + re-publish) | `e5a40e29-c022-41ea-9a63-e06222581b85/404576a6-d1c7-4554-8158-3ff3fed72acf.webp` |
| P5 | QA Draft Side Table — not published | `d5a55eb9-4f06-4e19-b7df-fa291c787c8e` | `qa-draft-side-table-not-published` | draft | `e5a40e29-c022-41ea-9a63-e06222581b85/6aa64822-35ec-4802-b92d-b174c13be233.webp` |
| P6 | QA Invalid Model Test | `832e53a8-e7f5-4558-a041-7df7da59c6fd` | `qa-invalid-model-test` | draft | — |

P3 variant ids: Sheen `6aaa5a51-50ce-4fda-9b02-5b218199e4b5`, Damask `60be4f49-c82f-41d8-8b1d-5e0785735017` (from the public `?variant=` deep link). Storage listing of `e5a40e29-c022-41ea-9a63-e06222581b85/` with the owner session shows exactly these 11 objects (no orphans; the invalid GLB was rejected before upload).
P3 storage order: product photo, Sheen photo, Sheen GLB, Damask photo, Damask GLB.

## Journey Setup

| Step | Status | Evidence | Notes |
|---|---|---|---|
| Admin sets QA business status to Active (UI) | **PASS** | shots/s2-admin-business-active.png | button was "Activate"; header badge now ?; console errors 0; http>=400 0 |

## Journey A

| Step | Status | Evidence | Notes |
|---|---|---|---|
| Owner sign-in lands on /dashboard Overview of the QA business | **PASS** | shots/A1-owner-dashboard-overview.png | path /dashboard; h1 "Overview"; nav: QA — Sanctus Demo Atelier — DO NOT DELETE AUTOMATICALLY Business dashboard Overview My Products Analytics My Catalog & Q |
| Owner cannot open /admin | **PASS** | shots/A2-owner-opens_admin.png | final path /admin; admin UI shown: false; text: This area is for Super Admin accounts You are signed in as Business Admin. Sign in with another account to continue. Swi |
| Owner cannot open /admin/businesses | **PASS** | shots/A2-owner-opens_admin_businesses.png | final path /admin/businesses; admin UI shown: false; text: This area is for Super Admin accounts You are signed in as Business Admin. Sign in with another account to continue. Swi |
| Owner cannot open /admin/businesses/e5a40e29-c022-41ea-9a63-e06222581b85 | **PASS** | shots/A2-owner-opens_admin_businesses_e5a40e29-c022-41ea-9a63-e06222581b85.png | final path /admin/businesses/e5a40e29-c022-41ea-9a63-e06222581b85; admin UI shown: false; text: This area is for Super Admin accounts You are signed in as Business Admin. Sign in with another account to continue. Swi |
| Owner cannot open /admin/applications | **PASS** | shots/A2-owner-opens_admin_applications.png | final path /admin/applications; admin UI shown: false; text: This area is for Super Admin accounts You are signed in as Business Admin. Sign in with another account to continue. Swi |
| Owner cannot open /admin/products | **PASS** | shots/A2-owner-opens_admin_products.png | final path /admin/products; admin UI shown: false; text: This area is for Super Admin accounts You are signed in as Business Admin. Sign in with another account to continue. Swi |
| REST: owner reads own products (sanity) | **PASS** | REST | status 200; rows 6 |
| REST: owner cannot read other businesses' DRAFT products | **PASS** | REST | status 200; rows 0 |
| REST: other businesses' rows visible to owner are only PUBLISHED (public catalogue data) | **PASS** | REST | status 200; published rows visible from other businesses: 0 (public catalogue data, expected readable) |
| REST: other businesses visible to owner are only ACTIVE ones | **PASS** | REST | status 200; visible other businesses: 0; statuses  |
| REST: business_applications exposes no other-business rows to the owner | **PASS** | REST | status 200; rows 0; other-business rows 0 |
| REST: audit_events exposes no other-business rows to the owner | **PASS** | REST | status 200; rows 0; other-business rows 0 |
| REST: email_log exposes no other-business rows to the owner | **PASS** | REST | status 200; rows 0; other-business rows 0 |
| REST: platform_admins exposes no other-business rows to the owner | **PASS** | REST | status 200; rows 0; other-business rows 0 |
| REST: business_members exposes no other-business rows to the owner | **PASS** | REST | status 200; rows 1; other-business rows 0 |
| REST: owner cannot read other businesses' analytics events | **PASS** | REST | status 200; rows 0 |
| REST: INSERT/DELETE into another business | **NOT TESTED** |  | Deliberately skipped: a broken policy would cause a real write/delete in shared client data. UPDATE same-value attempts used instead. |
| REST: owner GET-by-id / child tables / same-value UPDATE on another business's PRODUCT | **BLOCKED** | REST | No other business in the DEV project has any product (admin read-only check saw 0), and creating one would be a write outside the QA business. The equivalent checks on another BUSINESS row passed (GET by id 0 rows, UPDATE 0 rows). |
| REST: owner GET another (draft) business by id returns 0 rows | **PASS** | REST | status 200; rows 0 |
| REST: owner UPDATE (same-value) on another business row affects 0 rows | **PASS** | REST | status 200; rows 0 |
| Storage: owner lists other businesses' product-media folders: 0 objects | **PASS** | REST | 4 other businesses: admin sees 0 / owner sees 0; admin sees 0 / owner sees 0; admin sees 0 / owner sees 0; admin sees 0 / owner sees 0 (folders are empty even for admin, so this only shows nothing leaks, not that RLS blocks real files) |

## Journey B

| Step | Status | Evidence | Notes |
|---|---|---|---|
| P1 created in editor: photo + SheenChair.glb + 83×69×57 cm + price | **PASS** | shots/p1-P1-editor-filled.png | Scale verified; Model measures W × H × D 83 cm × 69 cm × 57 cm. Entered 83 cm × 69 cm × 57 cm. |
| P1 Save draft, then RELOAD: name, photo, GLB, dims persisted | **PASS** | shots/p1-P1-after-reload.png | {"nameVal":"QA Sheen Chair","imgs":1,"glbName":true,"width":"83","variantsOk":null} |
| P1 Preview opens draft page with draft banner | **PASS** | shots/p1-P1-draft-preview.png | /products/qa-sanctus-demo-atelier-do-not-delete-automatically/qa-sheen-chair?preview=1; h1 QA Sheen Chair |
| P1 Publish | **PASS** | shots/p1-P1-published-dialog.png | Product published The catalog is not active yet: customers will see this product once the business is activated. Product URL https://ar-deploy-qio4qn0c4-track0.vercel.app/products/qa-sanctus-demo-atelier-do-not-delete-automatically/qa-sheen-chair Copy Keep editing Open product page |
| P2 created + published (photo + GlamVelvetSofa.glb, 219×79×102 cm) | **PASS** | shots/p1-P2-published-dialog.png | Scale verified; Model measures W × H × D 219 cm × 79 cm × 102 cm. Entered 219 cm × 79 cm × 102 cm.; no USDZ uploaded: iPhone AR relies on model-viewer generating a USDZ in the browser |
| P3 created with variants Sheen/Damask, each with own photo + GLB | **PASS** | shots/p1-P3-editor-filled.png | Sheen Scale verified; Damask Scale verified; summary: 2 of 2 options have their own 3D model Never required to publish. Options without their own files show the product’s photos and model, with a note on the page. Sheen: 1 own photo · own GLB (no USDZ: iPhone converts the GLB) Damask: 1 own photo · own GLB (no USDZ: iPhone converts the GLB) |
| P3 RELOAD: variant media persisted | **PASS** | shots/p1-P3-after-reload.png | Sheen: Photos and 3D for Sheen · own 1 photo, GLB / Damask: Photos and 3D for Damask · own 1 photo, GLB |
| P3 Publish | **PASS** | shots/p1-P3-published-dialog.png |  |
| P4 photos-only product published | **PASS** | shots/p1-P4-published-dialog.png |  |
| P5 left as draft | **PASS** | shots/p1-P5-editor-filled.png | photo reused from barn-lamp fixture (no side-table photo fixture) |
| P6 invalid truncated GLB rejected with clear message; no upload; saved as draft without model | **PASS** | shots/p1-P6-invalid-glb-rejected.png | "qa-invalid-truncated.glb does not look like a valid GLB file: it declares 3.9 MB but the file is 293.0 KB, so it is cut off or damaged. Export it again." |
| Editor console errors / HTTP >= 400 during creation | **PASS** |  | none recorded |
| Public catalogue lists P1-P4 | **PASS** | shots/B1-catalog-desktop.png | found P1,P2,P3,P4; count label "4 PRODUCTS"; links 4 |
| Public catalogue hides drafts P5/P6 | **PASS** | shots/B1-catalog-desktop.png | absent: P5,P6 |
| Direct public URL of draft P5 shows "Product not available" | **PASS** | shots/B2-P5-direct-url.png |  |
| Direct public URL of draft P6 shows "Product not available" | **PASS** | shots/B2-P6-direct-url.png |  |
| Owner unpublishes P4 (confirm dialog) | **PASS** | shots/B3-P4-unpublished-editor.png | dialog: Unpublish “QA Barn Lamp — photos only”? Customers will no longer see this product in the catalog. Existing links will show “product not available”. Cancel Unpublish |
| Unpublished P4 disappears from public catalogue | **PASS** | shots/B3-catalog-without-P4.png | links: qa-glam-velvet-sofa, qa-lounge-chair-two-finishes, qa-sheen-chair; count "3 PRODUCTS" |
| Unpublished P4 direct URL shows "Product not available" | **PASS** | shots/B3-P4-direct-url-unpublished.png |  |
| Owner re-publishes P4 | **PASS** | shots/B4-P4-republished-dialog.png | Product published It now appears in the business catalog. Product URL https://ar-deploy-qio4qn0c4-track0.vercel.app/products/qa-sanctus-demo-atelier-do-not-dele |
| Re-published P4 returns to public catalogue | **PASS** | shots/B4-catalog-with-P4-again.png | count "4 PRODUCTS" |
| Owner product list shows end statuses (P1-P4 published, P5/P6 draft) | **PASS** | shots/B5-owner-products-list.png | {"P1":"Published","P2":"Published","P3":"Published","P4":"Published","P5":"Draft","P6":"Draft"} |

## Journey C

| Step | Status | Evidence | Notes |
|---|---|---|---|
| P3 opens on first variant (Sheen) with its own photo and GLB | **PASS** | shots/C1-P3-default-Sheen.png | checked Sheen; photo e5a40e29-c022-41ea-9a63-e06222581b85/b3adfcb7-f06e-4f85-b4c5-334a794fe8cd.webp; model e5a40e29-c022-41ea-9a63-e06222581b85/8d88610b-0dfe-4c94-8286-f9edd554076d.glb; ios-src none; fallback note false |
| Dimensions shown on P3 | **PASS** | shots/C1-P3-default-Sheen.png | DIMENSIONS cm in 83 cm 57 cm 69 cm Width 83 cm Height 69 cm Depth 57 cm; measured 82.7,68.6,57; true-size badge false |
| Switching to Damask changes photo, model src and price; URL gets ?variant= | **PASS** | shots/C2-P3-switched-Damask.png | photo e5a40e29-c022-41ea-9a63-e06222581b85/e18cd2ea-2de1-405d-bd94-8d69ab944426.webp; model e5a40e29-c022-41ea-9a63-e06222581b85/c0a6d92d-7b59-4d6e-8f3f-632342407920.glb; ios-src none; ?variant=60be4f49-c82f-41d8-8b1d-5e0785735017; price €1,490.00; true-size true; measured 82.9,68.7,57.2 |
| Switching back to Sheen restores Sheen photo + model | **PASS** | shots/C3-P3-back-to-Sheen.png | ?variant=6aaa5a51-50ce-4fda-9b02-5b218199e4b5 |
| ?variant=<Damask id> deep link opens Damask (photo + model) | **PASS** | shots/C4-P3-deeplink-Damask.png | checked Damask +€100.00; model e5a40e29-c022-41ea-9a63-e06222581b85/c0a6d92d-7b59-4d6e-8f3f-632342407920.glb |
| Unknown ?variant= falls back to first variant | **PASS** | shots/C5-P3-bad-variant.png | checked Sheen |
| AR target follows variant (Pixel 7 emulation: Scene Viewer intent file) | **PASS** | shots/C6-P3-pixel7-ar-targets.png | Damask tap -> intent file=e5a40e29-c022-41ea-9a63-e06222581b85/c0a6d92d-7b59-4d6e-8f3f-632342407920.glb; Sheen tap -> intent file=e5a40e29-c022-41ea-9a63-e06222581b85/8d88610b-0dfe-4c94-8286-f9edd554076d.glb; events ["view:204","ar_activation:204","ar_activation:204"] |

## Journey D

| Step | Status | Evidence | Notes |
|---|---|---|---|
| Catalogue QR PNG downloads and decodes to the catalogue URL | **PASS** | shots/D1-owner-catalog-qr-panel.png, qr/qa-sanctus-demo-atelier-do-not-delete-automatically-catalog-qr.png | file qa-sanctus-demo-atelier-do-not-delete-automatically-catalog-qr.png 1024x1024; decoded https://ar-deploy-qio4qn0c4-track0.vercel.app/catalog/qa-sanctus-demo-atelier-do-not-delete-automatically; preview-host warning shown: true |
| On-screen catalogue QR (screenshot) decodes to the same URL | **PASS** | qr/catalog-onscreen.png | decoded https://ar-deploy-qio4qn0c4-track0.vercel.app/catalog/qa-sanctus-demo-atelier-do-not-delete-automatically |
| P1 product QR PNG decodes to the product URL | **PASS** | shots/D2-owner-P1-product-qr-dialog.png, qr/qa-sanctus-demo-atelier-do-not-delete-automatically-qa-sheen-chair-qr.png | file qa-sanctus-demo-atelier-do-not-delete-automatically-qa-sheen-chair-qr.png 1023x1023; decoded https://ar-deploy-qio4qn0c4-track0.vercel.app/products/qa-sanctus-demo-atelier-do-not-delete-automatically/qa-sheen-chair |
| P3 product QR PNG decodes to the product URL | **PASS** | shots/D2-owner-P3-product-qr-dialog.png, qr/qa-sanctus-demo-atelier-do-not-delete-automatically-qa-lounge-chair-two-finishes-qr.png | file qa-sanctus-demo-atelier-do-not-delete-automatically-qa-lounge-chair-two-finishes-qr.png 1024x1024; decoded https://ar-deploy-qio4qn0c4-track0.vercel.app/products/qa-sanctus-demo-atelier-do-not-delete-automatically/qa-lounge-chair-two-finishes |
| Decoded catalogue URL opens the QA business catalogue (desktop) | **PASS** | shots/D-catalog-desktop.png | h1 "QA — Sanctus Demo Atelier — DO NOT DELETE AUTOMATICALLY"; path /catalog/qa-sanctus-demo-atelier-do-not-delete-automatically |
| Decoded P1 product URL opens QA Sheen Chair (desktop) | **PASS** | shots/D-P1-desktop.png | h1 "QA Sheen Chair"; path /products/qa-sanctus-demo-atelier-do-not-delete-automatically/qa-sheen-chair |
| Decoded P3 product URL opens QA Lounge Chair — two finishes (desktop) | **PASS** | shots/D-P3-desktop.png | h1 "QA Lounge Chair — two finishes"; path /products/qa-sanctus-demo-atelier-do-not-delete-automatically/qa-lounge-chair-two-finishes |
| Decoded catalogue URL opens the QA business catalogue (Pixel 7) | **PASS** | shots/D-catalog-pixel7.png | h1 "QA — Sanctus Demo Atelier — DO NOT DELETE AUTOMATICALLY"; path /catalog/qa-sanctus-demo-atelier-do-not-delete-automatically |
| Decoded P1 product URL opens QA Sheen Chair (Pixel 7) | **PASS** | shots/D-P1-pixel7.png | h1 "QA Sheen Chair"; path /products/qa-sanctus-demo-atelier-do-not-delete-automatically/qa-sheen-chair |
| Decoded P3 product URL opens QA Lounge Chair — two finishes (Pixel 7) | **PASS** | shots/D-P3-pixel7.png | h1 "QA Lounge Chair — two finishes"; path /products/qa-sanctus-demo-atelier-do-not-delete-automatically/qa-lounge-chair-two-finishes |
| Scanning the printed/screen QR with a real phone camera | **BLOCKED** |  | No physical device. Also: these QRs encode the protected Vercel Preview host, so a real phone would hit Vercel auth without the bypass cookie (expected for Preview; production QRs use the production host). |

## Journey E

| Step | Status | Evidence | Notes |
|---|---|---|---|
| Desktop: 3D viewer loads P1 GLB | **PASS** | shots/E1-P1-desktop-3d.png | loaded in ~5.8s after h1; measured cm 82.7,68.6,57; true-size badge true; AR button false; phone card true |
| Desktop: no AR button, "View in your space on a phone" card on P1 | **PASS** | shots/E1-P1-desktop-3d.png |  |
| Desktop: 3D viewer loads P2 GLB | **PASS** | shots/E1-P2-desktop-3d.png | loaded in ~5.3s after h1; measured cm 218.8,78.8,102.3; true-size badge true; AR button false; phone card true |
| Desktop: no AR button, "View in your space on a phone" card on P2 | **PASS** | shots/E1-P2-desktop-3d.png |  |
| Desktop: P3 Sheen and Damask GLBs load | **PASS** | shots/C1-P3-default-Sheen.png, shots/C2-P3-switched-Damask.png | see C1/C2 (mv.loaded true for both) |
| No-model product (P4): photos only, no viewer, no 3D/AR buttons | **PASS** | shots/E2-P4-no-model.png | model-viewer absent; 3D buttons 0; photo e5a40e29-c022-41ea-9a63-e06222581b85/404576a6-d1c7-4554-8158-3ff3fed72acf.webp |
| Pixel 7 emulation P1: AR button + native attrs (Scene Viewer) | **PASS** | shots/E4-P1-Pixel7.png | ar=true ar-modes="scene-viewer quick-look" ar-scale=fixed ar-placement=floor canActivateAR=true; AR button true; ios-src none (model-viewer would generate USDZ from GLB on iOS) |
| Pixel 7 emulation P2: AR button + native attrs (Scene Viewer) | **PASS** | shots/E4-P2-Pixel7.png | ar=true ar-modes="scene-viewer quick-look" ar-scale=fixed ar-placement=floor canActivateAR=true; AR button true; ios-src none (model-viewer would generate USDZ from GLB on iOS) |
| iPhone 14 emulation (Chromium UA) P1: native attrs; Quick Look path | **PASS** | shots/E4-P1-iPhone14.png | ar=true ar-modes="scene-viewer quick-look" canActivateAR=false; AR button false; phone card false; ios-src none (model-viewer would generate USDZ from GLB on iOS). Chromium has no rel=ar support so Quick Look cannot be exercised in emulation. |
| iPhone 14 emulation (Chromium UA) P2: native attrs; Quick Look path | **PASS** | shots/E4-P2-iPhone14.png | ar=true ar-modes="scene-viewer quick-look" canActivateAR=false; AR button false; phone card false; ios-src none (model-viewer would generate USDZ from GLB on iOS). Chromium has no rel=ar support so Quick Look cannot be exercised in emulation. |
| Physical AR placement / true size on Android (Scene Viewer) and iPhone (Quick Look) | **BLOCKED** |  | No physical device available. Emulation only proves the hand-off attributes and intent URL. |
| iPhone Quick Look with generated USDZ (P2 has no USDZ) | **BLOCKED** |  | Needs a real iPhone/iPad Safari. P1/P2/P3 have no USDZ; iPhone AR relies on model-viewer generating a USDZ from the GLB in the browser (library behaviour, not guaranteed). |
| Viewer error state when the GLB cannot load (request blocked in test) - recheck | **PASS** | shots/E3b-P1-glb-blocked.png | elements: [{"t":"The 3D model could not be loaded","vis":true,"role":"alert"},{"t":"The 3D model could not be loaded","vis":true,"role":"status"}]. Visible status line under the photo with "Try again"; photos stay; 3D/AR buttons removed. |

## Journey F

| Step | Status | Evidence | Notes |
|---|---|---|---|
| Variant-only 3D product (P3) shows its AR launch attempts in analytics | **PASS** | shots/G4-analytics-P3-row.png | P3 row: QA Lounge Chair — two finishes \| 10 \| 4 \| 40.0%. Journey C sent ar_activation x2 per C run (2 runs = 4, each HTTP 204) from Pixel 7 emulation. |
| Controlled anonymous traffic generated on P1/P2 (fresh contexts, paced, all track-event 204) | **PASS** | shots/F-v2-P1-desktop.png, shots/F-v4-P1-pixel7-ar.png, shots/F-v5-P2-pixel7-ar.png, shots/F-v6-P2-pixel7-ar-doubletap.png | P1: 4 views, 1 interaction, 1 AR tap. P2: 4 views, 1 interaction, 3 AR taps (2 within 400 ms). |
| Dashboard views per product match generated (P1 4, P2 4) | **PASS** | shots/F-analytics-after.png | QA Sheen Chair \| 4 \| 1 \| 25.0% / QA Glam Velvet Sofa \| 4 \| 2 \| 50.0% |
| Dashboard AR launch attempts per product match (P1 1, P2 2: re-tap guard drops the 400 ms double tap) | **PASS** | shots/F-analytics-after.png |  |
| 3D interactions KPI matches (0 -> 2) | **PASS** | shots/F-analytics-after.png | business total only; not broken down per product |
| Wording uses "AR launch attempts" (KPI, chart, table, top list) | **PASS** | shots/F-analytics-after.png |  |
| Rate limit / per-day visitor key did not distort counts | **PASS** |  | ~15 events over ~2 min from one IP, max well under 30/min; every call 204. Visitor key = hash(IP network\|UTC date\|salt) only drives the limiter; views are not de-duplicated per visitor, so 4 page loads = 4 views. |

### Analytics reconciliation

Generated as anonymous visitors in fresh browser contexts (one per visit), from one IP, paced ~4 s apart (well under the 30 events/min/visitor-key limit; every `track-event` call returned **204**, none rate-limited):

| Product | Page views generated | 3D interactions generated | AR taps | AR launch attempts expected | Dashboard before | Dashboard after |
|---|---|---|---|---|---|---|
| P1 QA Sheen Chair | 4 (2 desktop + 1 Pixel 7 in run 1, +1 desktop in run 2) | 1 (desktop drag) | 1 (Pixel 7) | 1 | 0 views / 0 AR | **4 / 1** |
| P2 QA Glam Velvet Sofa | 4 (1 desktop + 2 Pixel 7 in run 1, +1 desktop in run 2) | 1 (desktop drag) | 3 (Pixel 7; 2 of them 400 ms apart) | 2 (2 s re-tap guard) | 0 / 0 | **4 / 2** |

KPI "3D interactions": 0 → **2** (shown only as a business total, not per product). Column wording is "AR launch attempts" (also KPI, chart and Top-performing list). Run 1's first visit failed before the drag (test selector bug), so interactions were redone in run 2 (+1 view each); the numbers above include that. The response listener missed one 204 for run 1 visit 1, but the dashboard count (3 after run 1) matches the 3 page loads. Later journeys (C, D, E, G) added more views/AR attempts (final: P1 14/1, P2 10/2, P3 10/4, P4 2/—); those are outside the controlled count.

## Journey G

| Step | Status | Evidence | Notes |
|---|---|---|---|
| Owner overview at 1440px renders, no horizontal overflow | **PASS** | shots/G1-1440-overview.png | h1 "Overview"; scrollWidth 1440 / clientWidth 1440 |
| Owner products at 1440px renders, no horizontal overflow | **PASS** | shots/G1-1440-products.png | h1 "My products"; scrollWidth 1440 / clientWidth 1440 [corrected: first run flagged FAIL only because the test expected h1 "My Products"; the page h1 is "My products"; no overflow measured] |
| Owner editor at 1440px renders, no horizontal overflow | **PASS** | shots/G1-1440-editor.png | h1 "QA Sheen Chair"; scrollWidth 1440 / clientWidth 1440 |
| Owner catalog at 1440px renders, no horizontal overflow | **PASS** | shots/G1-1440-catalog.png | h1 "My catalog & QR code"; scrollWidth 1440 / clientWidth 1440 |
| Owner analytics at 1440px renders, no horizontal overflow | **PASS** | shots/G1-1440-analytics.png | h1 "Analytics"; scrollWidth 1440 / clientWidth 1440 |
| Owner overview at 390px renders, no horizontal overflow | **FAIL** | shots/G1-390-overview.png | h1 "Overview"; scrollWidth 404 / clientWidth 390; wide: DIV.rounded-[var(--radius-card)] bg-surface , DIV.flex flex-wrap items-start justify-betwe, DIV.px-5 pb-5 |
| Owner products at 390px renders, no horizontal overflow | **PASS** | shots/G1-390-products.png | h1 "My products"; scrollWidth 390 / clientWidth 390 [corrected: first run flagged FAIL only because the test expected h1 "My Products"; the page h1 is "My products"; no overflow measured] |
| Owner editor at 390px renders, no horizontal overflow | **PASS** | shots/G1-390-editor.png | h1 "QA Sheen Chair"; scrollWidth 390 / clientWidth 390 |
| Owner catalog at 390px renders, no horizontal overflow | **PASS** | shots/G1-390-catalog.png | h1 "My catalog & QR code"; scrollWidth 390 / clientWidth 390 |
| Owner analytics at 390px renders, no horizontal overflow | **PASS** | shots/G1-390-analytics.png | h1 "Analytics"; scrollWidth 390 / clientWidth 390 |
| Owner dashboard 390px: navigation menu button present | **PASS** | shots/G1-390-nav.png | Open navigation |
| Unsaved-changes guard on in-app navigation (Stay keeps edits) | **PASS** | shots/G2-unsaved-guard-dialog.png | dialog true; autofocus on "Stay on page"; stayed with edit true |
| Unsaved-changes guard on tab close/reload (beforeunload) | **PASS** |  | dialog type beforeunload |
| "Leave page" discards the edit (nothing saved) | **PASS** | shots/G2-after-leave.png | value unchanged |
| Keyboard: editor fields reachable by Tab in logical order with visible focus | **FAIL** | shots/G3-keyboard-focus-editor.png | 1 of 30 focus stops without detectable outline/box-shadow; sequence: INPUT:Product URL * > BUTTON:EN > BUTTON:PT · > INPUT:Short description English > BUTTON:EN > BUTTON:PT > TEXTAREA:Full description English > SELECT:Category > INPUT:Price > SELECT:Currency > BUTTON:Remove sheen-chair > INPUT:Upload product images(sr-only input) > INPUT:Upload additional photos(sr-only input) > BUTTON:Remove GLB file > INPUT:Replace .glb file(sr-only input) > INPUT:GLB model URL > INPUT:Upload .usdz file(sr-only input) > INPUT:USDZ model URL > MODEL-VIEWER:MODEL-VIEWER(no visible ring) > BUTTON:Centimetres > BUTTON:Inches > INPUT:Width > INPUT:Height > INPUT:Depth > BUTTON:EN > BUTTON:PT · > INPUT:Material English > INPUT:Weight (optional) > SELECT:Weight unit > BUTTON:Add colour or option |
| Public catalog-pt at 1440px: language + no overflow | **PASS** | shots/G5-1440-catalog-pt.png | html lang=pt-PT; expected text true; English UI strings left: none; fallback label "Apresentado em inglês": false; overflow false (1440/1440) |
| Public P1-pt at 1440px: language + no overflow | **PASS** | shots/G5-1440-P1-pt.png | html lang=pt-PT; expected text true; English UI strings left: none; fallback label "Apresentado em inglês": false; overflow false (1440/1440) |
| Public P3-pt at 1440px: language + no overflow | **PASS** | shots/G5-1440-P3-pt.png | html lang=pt-PT; expected text true; English UI strings left: none; fallback label "Apresentado em inglês": false; overflow false (1440/1440) |
| Public P1-en at 1440px: language + no overflow | **PASS** | shots/G5-1440-P1-en.png | html lang=en; expected text true; English UI strings left: none; fallback label "Apresentado em inglês": false; overflow false (1440/1440) |
| Public catalog-pt at 390px: language + no overflow | **PASS** | shots/G5-390-catalog-pt.png | html lang=pt-PT; expected text true; English UI strings left: none; fallback label "Apresentado em inglês": false; overflow false (412/412) |
| Public P1-pt at 390px: language + no overflow | **PASS** | shots/G5-390-P1-pt.png | html lang=pt-PT; expected text true; English UI strings left: none; fallback label "Apresentado em inglês": false; overflow false (412/412) |
| Public P3-pt at 390px: language + no overflow | **PASS** | shots/G5-390-P3-pt.png | html lang=pt-PT; expected text true; English UI strings left: none; fallback label "Apresentado em inglês": false; overflow false (412/412) |
| Public P1-en at 390px: language + no overflow | **PASS** | shots/G5-390-P1-en.png | html lang=en; expected text true; English UI strings left: none; fallback label "Apresentado em inglês": false; overflow false (412/412) |

## Bugs found

| ID | Severity | Title | Repro / evidence | Likely cause |
|---|---|---|---|---|
| QA-J1 | Medium | Variant-only 3D product is treated as "photos only" everywhere outside the product page | Create a product with no product-level GLB but variants that each have their own GLB (P3). (1) Public catalogue card has no "View in 3D" badge (CatalogPage checks p.models.glb only; B1-catalog-desktop.png). (2) Owner Overview "Next steps" says "4 products have no 3D model (photos only)" (G1-390-overview.png) – P3 is counted. (3) Analytics shows "—" / "No 3D model" for P3 while it has 0 AR attempts (F-analytics-after.png); once attempts exist the number shows (G4). (4) Products filter "No 3D model" uses the same productArReadiness(p.models). | src/features/products/productReadiness.ts productArReadiness/hasArModel and CatalogPage badge look at product.models only, ignoring variants[].models. |
| QA-J2 | Low | Owner Overview overflows horizontally at 390 px | Sign in as owner, viewport 390×844, open /dashboard: document scrollWidth 404 > 390; the "Recent products" card is wider than the screen and status badges are clipped at the right edge (G1-390-overview.png). | Recent products card / row (flex items-start justify-between) does not shrink; probably a min-w-0/truncate missing. |
| QA-J3 | Low | Product QR PNG is 1023×1023 while the toast says 1024 × 1024 px | Dashboard > My products > Actions for "QA Sheen Chair" > Product QR code > Download PNG: file is 1023×1023 (catalogue and P3 QR are 1024×1024). Decodes fine. | Rounding in QR rendering for some URL lengths. |
| QA-J4 | Low (a11y) | Admin 3D preview (model-viewer) takes keyboard focus without a visible focus ring | Edit P1, Tab through the form: the <model-viewer> stop shows no outline/box-shadow (1 of 30 stops). All other stops show a ring. | No :focus-visible style for model-viewer in the editor preview. |
| QA-J5 | Info (emulation) | iPhone-UA in Chromium shows the "View in your space on a phone" card (no AR button) | iPhone 14 emulation: canActivateAR=false because Chromium has no rel="ar"; page shows the desktop/other-device card telling the user to open the page on a mobile device. Expected on real Safari to show View in AR; needs a device. | Emulation limit, not an app bug (recorded so it is not mistaken for one). |
| QA-J6 | Info (Preview only) | Console: report-only CSP violations for vercel.live framing on Pixel 7 emulation | Preview deployments inject the Vercel toolbar; CSP is report-only so nothing is blocked. Not present in app code. | Vercel Preview toolbar. |

## BLOCKED / NOT TESTED and why

- **Physical AR (Scene Viewer placement, Quick Look, true size with tape)**: BLOCKED, no device. Emulation only proved the hand-off: Pixel 7 emulation shows "View in AR", `ar-modes="scene-viewer quick-look"`, `ar-scale=fixed`, `ar-placement=floor`, and the captured intent is `scene-viewer/1.2?mode=ar_preferred…resizable=false` with `file=` the right GLB (per variant for P3).
- **iPhone Quick Look**: BLOCKED. No USDZ was uploaded for any product (none available, no conversion allowed), so iPhone AR depends on model-viewer generating a USDZ in Safari. Chromium cannot exercise `rel="ar"`.
- **Real phone camera QR scan**: BLOCKED (no device). QR PNGs were decoded with jsqr instead. Note the codes encode the protected Preview host.
- **Owner product-level isolation against another business's product (GET by id, child tables, UPDATE)**: BLOCKED, no other business in the DEV project has products and creating one would be a write outside the QA business. Business-row isolation, draft listing, applications, audit, email log, analytics and storage listing all returned 0 foreign rows.
- **INSERT/DELETE into another business via REST**: NOT TESTED on purpose (a broken policy would write/delete shared client data).

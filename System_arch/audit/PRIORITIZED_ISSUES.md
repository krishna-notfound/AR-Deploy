# Prioritized issues

**Severity:**
- **P0:** data exposure or cross-business access, broken production, data corruption, a vulnerability. **No P0 issues were found.**
- **P1:** release blocker for contracted functionality.
- **P2:** important.
- **P3:** enhancement or hygiene.

**Scope:**
- **In:** within the contract.
- **Owner:** needs the owner's go-ahead (a migration, an Edge Function deploy or a live setting).
- **Client:** changes the agreed scope or behaviour.

## P1: release blockers

### P1-01 Automatic model compression missing
- **Requirement:** A14 / C8.
- **Where:** nothing exists. `src/lib/files.ts` only validates; `ModelSection.tsx` says files are not compressed.
- **Repro:** upload a 30 MB GLB. The stored file is identical.
- **Root cause:** the design listed compression as a non-goal (design/01). This contradicts the contract.
- **Fix:**
  - An admin-only Web Worker, loaded lazily, runs glTF-Transform `dedup`, `prune`, `weld` and `resample`.
  - Textures are downscaled to at most 2048 px with `createImageBitmap` and `OffscreenCanvas`, keeping JPEG/PNG. Opaque base-colour PNGs become JPEG.
  - It adds **no glTF extensions**: no meshopt, Draco, WebP or quantization. Scene Viewer accepts only `KHR_materials_unlit`, `KHR_texture_transform` and spec-gloss (Scene Viewer docs).
  - **Guards:** re-read the output and require the same bounding box (±1 mm), the same triangle count and the same material count. Keep the original if the output is not smaller than 95% of the input or if any check fails. Show sizes before and after.
  - Also warn about any `extensionsRequired` outside the allowlist.
  - USDZ: explain that it cannot be compressed client-side.
- **Rejected alternatives:** an Edge Function (2 s CPU and 256 MB limits) and meshopt (also breaks model-viewer unless a decoder is configured).
- **Risk:** medium. Texture quality and alpha premultiplication on normal and ORM maps, so leave non-colour maps unchanged apart from resizing.
- **Test:** unit tests on a fixture GLB (size goes down, bounding box unchanged, no new extensions), plus a device check in Scene Viewer.
- **Scope:** In. It needs a new dependency (`@gltf-transform/core` and `@gltf-transform/functions`, MIT) and therefore **ADR-0019**. **Client:** confirm that "compression" means size optimization that stays compatible with Scene Viewer.

### P1-02 Android AR defaults to custom WebXR, against the contract, and fails on phones without ARCore
- **Requirement:** A4.
- **Where:** `src/features/ar/capability.ts` `chooseArMode`; `ArSection.tsx`; `useArExperience.ts`.
- **Repro:** non-ARCore Android with Chrome → tap "View in my home". The session request fails (or the ARCore install prompt says "incompatible"), then "AR could not start. Allow camera access…".
- **Root cause:** Chrome's `isSessionSupported('immersive-ar')` is true on every Android 7+ phone. Details in AR_COMPATIBILITY_AND_PHYSICS §2.
- **Fix:**
  - Return `native` whenever `nativeAR`; WebXR only when native is unavailable or has failed.
  - Add a secondary "Precise placement (beta)" link when `webxrAR` is true.
  - Rename the failure text so it states no cause.
- **Risk:** low. It restores the contracted default.
- **Test:** `chooseArMode` unit tests; E2E for the native-first label and the beta link with a stubbed `navigator.xr`.
- **Scope:** In (it restores the contract). The beta link is an addition, so tell the client.

### P1-03 The AR button does nothing after Scene Viewer fails
- **Requirement:** A4 / A8.
- **Where:** `ProductPage.tsx` `onArStatus` (shows a toast only); `canAR` is set only on model load.
- **Repro:**
  1. On Android without the Google app, tap AR. The fallback hash fires `ar-status: failed`.
  2. Tap again: nothing happens, and a second `ar_activation` is recorded.
- **Root cause:** model-viewer switches to `NONE` mode after a failure; the page never learns this.
- **Fix:** on `failed`, call `setCanAR(false)` (plus the `nativeFailed` input to `chooseArMode`). The page then shows the honest no-AR state, or WebXR beta if supported.
- **Risk:** low. **Test:** unit test of `chooseArMode` with `nativeFailed`. **Scope:** In.

### P1-04 Signed media URLs expire after 1 h and are never refreshed
- **Requirement:** A3, A4, B5.
- **Where:** `supabaseCatalogService.ts` `SIGNED_URL_TTL_SECONDS` and `hydrate`; `hooks.ts` (no refresh).
- **Repro:** open a product page, wait more than 60 minutes (or come back the next day from the back-forward cache), then tap AR. The model fetch fails.
- **Root cause:** URLs are signed once per fetch with a short TTL; every AR path fetches the file again.
- **Fix:**
  - Raise the TTL for public pages to 12 h. Anonymous visitors can already sign any published path, so a longer TTL only affects the window after unpublishing.
  - On `visibilitychange`/`focus`, if the URLs are older than TTL minus 10 minutes, re-fetch the product.
  - **Never** re-sign inside the AR tap: that breaks the user-gesture requirement.
- **Risk:** low. A new URL remounts the viewer, which happens only when the page comes back stale.
- **Test:** unit test of the staleness helper; a live test manually with a short TTL.
- **Scope:** In.

### P1-05 A production build without env vars serves demo data
- **Requirement:** G / honest UI.
- **Where:** `src/services/backend.ts` (`VITE_DATA_MODE || 'demo'`); no guard in `vite.config.ts`.
- **Repro:** deploy to Vercel production without the variables. The public catalog shows seed businesses.
- **Fix:** in `vite.config.ts`, using `loadEnv`, throw when `process.env.VERCEL_ENV === 'production'` unless `VITE_DATA_MODE=supabase` and the URL and key are present. Also reject `sb_secret_` keys. Document "deploy from Git only" (`--prebuilt` skips the guard).
- **Risk:** low. **Test:** a small unit test of the guard function, kept in `vite.config` helpers. **Scope:** In.

### P1-06 Delivery artifacts missing
- **Requirement:** E2, E3, E4.
- **What:** no production deployment, domain, wildcard subdomain or SSL; no device tests; no user guide or walkthrough video; no handover document.
- **Fix:** follow Stage D of the plan. This is configuration and documentation, not code.
- **Scope:** In (contracted delivery). Domain purchase and DNS need the owner.

### P1-07 A business member can make an admin delete another business's logo
- **Requirement:** B3 (data integrity).
- **Where:** `supabaseCatalogService.ts` `logoPath`, `updateBusiness` and `deleteBusiness`. `logo_url` is only checked to be `^https?://`.
- **Repro:**
  1. An owner of business A sets A's `logo_url` to B's public logo URL through the REST API.
  2. Later an admin changes A's logo or deletes A.
  3. The admin's session deletes B's logo file.
- **Fix:** remove the old logo only when its path starts with `${businessId}/` (or `new/` uploaded in this session). No migration needed.
- **Risk:** low. Old `new/` logos become orphans.
- **Test:** unit test with a mocked storage client. **Scope:** In.

### P1-08 Live Auth settings unverified; adding an owner links unconfirmed accounts
- **Requirement:** C1.
- **Where:** `supabase/config.toml`: `enable_signup=true`, `enable_confirmations=false`, minimum password length 6. `admin_add_business_member` doesn't check `email_confirmed_at`.
- **Repro:** if sign-up is on live, a stranger registers `owner@shop.com` before the admin adds that owner, and the admin's link grants the stranger owner rights.
- **Fix:**
  - The owner confirms in the dashboard: sign-up off, confirmations on, minimum length 12, leaked-password protection on.
  - Align `config.toml` so `config push` can't weaken production.
  - Migration: add `email_confirmed_at is not null`.
- **Risk:** low. **Test:** live test with an unconfirmed user (owner-approved). **Scope:** Owner.

## P2: important
| ID | Issue | Where | Fix | Test | Scope |
|---|---|---|---|---|---|
| P2-01 | WebXR session left running after a setup failure; Exit does nothing during the permission prompt; `end` listener attached late; taps place while the model is loading | `webxrSession.ts` start (try/catch → `session.end()`, attach `end` first, `loading` guard on select); `useArExperience.ts` (set `active` only after the controller exists) | as listed | unit tests with a fake `XRSession` | In (beta path) |
| P2-02 | `ar_activation` counted per tap and twice after a fallback; failed launches counted | `ProductPage.tsx` `recordAr`, `startAR` | `useRef` guard: one per page view. Document: "a tap on View in my home, once per page view"; it is **not** a placement | unit/component test | In |
| P2-03 | Publishing under a draft or inactive business says "Live at…" but the page shows not found | `useProductActions.tsx`, publish modal, `ProductEditorForm.tsx` | Show "Catalog is not live yet" when the business isn't active | e2e | In |
| P2-04 | Publish rules enforced in the UI only; `published_at` set by the client | `services/validation.ts`; `*_save_product.sql`; products update policy | Deferred constraint trigger on `products` and `product_images` (ignored when the product is gone), plus a BEFORE trigger for `published_at`. Run the audit query first; map 23514 to VALIDATION | live test | **Owner** (migration) |
| P2-05 | Analytics visitor key from the first `X-Forwarded-For` entry, probably spoofable (community report) | `supabase/functions/track-event/handler.ts` `clientIp` | Deploy a header-echo build to staging, then key on the platform-appended entry | handler test | **Owner** (redeploy) |
| P2-06 | SVG logo accepted by the client, rejected by the bucket with a raw error | `lib/files.ts` `LOGO_RULES` | Remove SVG from the allowed types | unit | In |
| P2-07 | Changing business after uploads on a new product gives a false "not allowed" error and orphaned files | `ProductEditorForm.tsx` business select | Lock the select once media is uploaded, or clear the media with a confirmation | e2e | In |
| P2-08 | Misleading AR copy: readiness Android text; start-failure cause; size warning 15 MB vs Scene Viewer's 10 MB; iOS "True size" from an unmeasured USDZ | `readiness.ts`, `en.ts`/`pt.ts`, `ArSessionOverlay.tsx` | Fix the copy; `LARGE_MODEL_BYTES = 10 MB`; on iOS show "checked on the 3D file" | unit | In |
| P2-09 | Unit toggle relabels numbers (219 cm becomes 219 in); mismatches not diagnosed | `ProductEditorForm.tsx` unit toggle; `lib/scale.ts` | Convert values on toggle; `checkScale` reason (axis swap, uniform k, wrong unit); tolerance max(5%, 1 cm) | unit | In |
| P2-10 | Supabase mode shows "demo" wording | `BusinessForm.tsx`, `useBusinessActions.ts`, `useProductActions.tsx`, `ModelSection.tsx` | Mode-aware text | grep test | In |
| P2-11 | Concurrent edits can delete a file that is still referenced | `updateProduct` (last write wins) | Optimistic lock on `updated_at` in `save_product` | live test | **Owner** (migration) |
| P2-12 | Analytics show only the last 30 days; sample analytics may be present in production | `analytics()`, `seed/sample_data.sql` | Add an all-time total; owner checks for and removes sample rows before handover | — | In / Owner |
| P2-13 | Raw Postgres error text shown to users, including on public pages | `supabaseCatalogService.ts` error mapping | Generic messages; details only in development | unit (`backend.test.ts`) | In |
| P2-14 | Variants never change the model, photos or dimensions | `ProductVariant` | Clarify with the client; label "Colour shown in 3D: base model" | — | **Client** |
| P2-15 | CSP is only `frame-ancestors` | `vercel.json` | Add a report-only CSP (see the policy below) and keep the enforced `frame-ancestors` | manual | In |

CSP draft (report-only):
```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://<ref>.supabase.co https://www.gstatic.com https://raw.githubusercontent.com blob: data:; img-src 'self' data: blob: https://<ref>.supabase.co https://images.unsplash.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'
```

## P3: enhancements and hygiene
| ID | Item | Scope |
|---|---|---|
| P3-01 | Orphaned uploads: unsaved, abandoned, `new/` logos, and `removeFolder` over 1000 objects. Add a periodic owner-run cleanup query | In |
| P3-02 | Layering: `RootLayout.tsx` and `AdminSettingsPage.tsx` import `services/mock/*`; the mock store is built in Supabase builds | In |
| P3-03 | Routes hard-coded outside `lib/urls.ts` (`CatalogPage`, `ProductPage`, `ArSection`) | In |
| P3-04 | `createClient` without the `Database` generic | In |
| P3-05 | `AccountProvider` load race; a network error is treated as signed out | In |
| P3-06 | Revoke EXECUTE on `public.rls_auto_enable()` from public, anon and authenticated (advisor warning; not callable as RPC) | Owner (migration) |
| P3-07 | Image and variant arrays have no length limit in `save_product`; `contact_email` has no format check | Owner (migration) |
| P3-08 | WebXR: create anchors inside the frame callback (spec compliance); precise `Box3`; dispose `RoomEnvironment` | In |
| P3-09 | **Physics P-A:** footprint preview and settle-onto-floor (AR_COMPATIBILITY_AND_PHYSICS §4) | Owner decision |
| P3-10 | **Physics P-B:** drag on the floor | **Client** |
| P3-11 | **Physics P-C:** several items with overlap warnings | **Client** |
| P3-12 | **Physics P-D:** wall clearance estimate | **Client**, experimental |
| P3-13 | Wall placement for wall lamps (needs a product field) | **Client** |
| P3-14 | Free-form specifications list (A6) | **Client** (clarify) |
| P3-15 | Remove the seeded sample owner accounts, or rotate their passwords, before launch | Owner |

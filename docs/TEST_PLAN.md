# Test plan

Three kinds of evidence, never mixed: **automated** (local, demo mode or disposable Postgres), **live integration** (real Supabase API), **real device** (a physical phone, recorded). Only the last can verify AR.

## Automated (run before every commit)

| Command | Covers | Latest result (2026-10-13, branch `chore/production-readiness`) |
|---|---|---|
| `npm run typecheck`, `npm run lint`, `npm run build` | types, lint (0 errors), production bundle | pass |
| `npm test` | unit + component + PGlite database tests (migrations, RLS, publish rules, registration, claim links, cross-business isolation, rollback script) | 121 passed, 15 skipped (live suite) |
| `npm run test:e2e` | Playwright, demo mode, desktop + emulated Pixel 7: catalog, product page, 3D fallback, Scene Viewer intent on a **simulated** Android UA, no WebXR, one launch per double tap, PT/EN, in-app notice, admin CRUD, QR | 27/27 (one earlier run had a flaky demo-only failure, see PRODUCTION_READINESS 6c) |

## Live integration (real Supabase API)

`src/services/supabase/live.integration.test.ts`: 15 tests. Roles from tables, owner uploads into own folder, cross-business isolation, private draft files, owners can't change address/status or manage owners, publish → public + signed URLs, analytics insert-only + owner-only reads, rate limit, unpublish hides files, unreferenced files removed, logo bucket refuses SVG, draft registration invisible to public, contact-email match grants nothing, claim link single use.

**Latest run:** 2026-10-13 on `pmnjchhrgvajtjpadpqo` (owner-approved), 15 passed / 0 failed / 0 skipped, after migrations `20261013093006` and `20261013144121` were applied. QA users created with a throwaway in-memory password and deleted afterwards; no QA businesses, products, files, analytics, claims or memberships left (read-only check). How to re-run: `docs/OPERATIONS_RUNBOOK.md`.

## Real-device AR checklist

Status: **BLOCKED**, no physical device available and no safe preview URL yet (Preview shares the live database). Record every run in `System_arch/audit/DEVICE_TEST_MATRIX.md`: device model, OS version, browser + version, Google app installed (Android), URL + commit, product, result, screen recording link.

Use a product with a GLB **and** a USDZ whose scale shows "True-to-size model", plus one product without a USDZ.

### Android (Chrome, ARCore phone)
1. Open the product page; the model loads in 3D; "View in my home" is visible.
2. Tap it → AR tips appear → "Start AR". **Expected:** the Google app's Scene Viewer opens (not AR inside Chrome). If Chrome shows AR itself, that is a FAIL (WebXR must not be used).
3. Furniture appears on the floor at true size: measure one dimension with a tape measure, within 5% or 1 cm of the product page value. Pinch-to-resize is disabled (`resizable=false`).
4. Back to the page: the page is usable, no stuck spinner.
5. Tap "View in my home" twice quickly: only one Scene Viewer launch; in the dashboard the "AR launch attempts" count rises by 1, not 2 (check after ~1 minute).
6. On a phone **without** ARCore (if available): Scene Viewer's 3D view opens, or the page shows "AR failed" and the 3D viewer still works.
7. If the Google app does not open: note phone model, Chrome version, whether the Google app is installed/enabled, and record the screen (the earlier "Scene Viewer first" attempt failed this way, cause unknown).

### iPhone / iPad (Safari)
1. Product page loads the 3D model; tap "View in my home" → tips → "Start AR". **Expected:** Apple Quick Look opens with the USDZ.
2. True size: measure as above. Quick Look allows pinch-scaling by default; note whether the initial size is correct.
3. Product **without** USDZ: note what happens (model-viewer may convert the GLB; slow or failing is a finding, not a pass).
4. Close Quick Look: back on the page, usable.

### Both platforms
- **Model URL refresh:** open a product page, leave the tab in the background for 6 h+ (or overnight), return, then start AR. **Expected:** AR opens (the page fetched fresh 12 h signed URLs on return). Only meaningful for products whose files are stored in Supabase (the sample products use external URLs).
- **In-app browsers:** open a catalog link from Instagram, Facebook and WhatsApp. **Expected:** the notice to open in Safari/Chrome on the catalog and product pages; copy-link works.
- **Fallback:** on a computer, no AR button; 3D viewer + "view on a phone" QR that opens the same product.
- **Never claimed:** wall detection, collisions, room fit, guaranteed occlusion.

## Pending manual checks

| Check | Needs |
|---|---|
| `/signup` email confirmation flow | Production sign-ups stay off. Needs approval + custom SMTP (Resend) before real owners |
| Admin creates a claim link in the UI and an owner redeems it in a browser | A test owner account; can run on the live site with approval |
| Subdomain routing + SSL | Client domain and DNS access |
| Optimized model (compression) in Scene Viewer + Quick Look | Client sign-off (A-2) and devices |

> **Superseded in part (2026-10-13).** AR and analytics statements below are outdated. Current state: System_arch/HANDOFF.md and docs/PRODUCTION_READINESS.md.

# Architecture and data flow (as built, 2026-10-13)

For the design intent, see design/05, 07, 08, 19 and 20. This file records what the code actually does, and where it breaks.

## Overview
- **Routing** (`src/app/router.tsx`):
  - **Path mode:** `/`, `/demo`, `/login`, `/reset-password`, `/admin/*` (`RequireRole super_admin`), `/dashboard/*` (`RequireRole business_admin`), `/catalog/:businessSlug`, `/products/:businessSlug/:productSlug`.
  - **Hostname mode:** used when `resolveTenant()` (`src/tenant/resolveTenant.ts`) matches a non-reserved subdomain of `VITE_ROOT_DOMAIN`. `/` shows the catalog and `/products/:productSlug` a product.
- **Service swap** (`src/services/index.ts`, `backend.ts`):
  - `VITE_DATA_MODE=supabase` selects `createSupabaseCatalogService`.
  - An empty value selects `mockCatalogService` (demo).
  - A malformed value selects `unavailableService`, which shows `BackendConfigError`.
  - It never falls back to demo data after a Supabase error.
- **Contract:** `CatalogService` in `src/services/catalogService.ts` returns `Result<T>`.
- **Hooks:** `src/services/hooks.ts` `useServiceQuery` refetches when `service.subscribe` fires. That works in both modes, but only within the same browser tab.
- **Storage:**
  - Product media is in the private bucket `product-media/{businessId}/{uuid}.ext`, served through **1-hour** signed URLs (`supabaseCatalogService.ts` `SIGNED_URL_TTL_SECONDS`).
  - Logos are in the public bucket `business-logos`.
- **Analytics:** `service.recordEvent` → Edge Function `track-event` → `record_event_limited` (30 events per minute per visitor key) → `product_analytics`. Reads go through the security-invoker view `product_analytics_daily`.
- **AR:** ~~`ProductPage` → `useArExperience` (`chooseArMode`) → our WebXR session (`features/ar/webxrSession.ts`) / native / hand-off~~ (removed in f171db3). **Current (branch `chore/production-readiness`, not yet deployed):** `ProductPage` → model-viewer `activateAR()` with `ar-modes="scene-viewer quick-look"` (Android: Scene Viewer; iOS: Quick Look); otherwise the 3D viewer plus the phone hand-off panel.

## Workflow traces
| Flow | Path (file → function) | Breaks at |
|---|---|---|
| A. Create business | `BusinessForm.submit` → `LogoUpload.onFile` → `validateImageFile` → `uploadAsset` (`business-logos/new/{uuid}`) → `createBusiness` (slug uniqueness comes from the DB unique constraint; error 23505 is mapped to a slug field error) → `changed()` → detail page. Catalog URL and QR via `catalogPublicUrl` | SVG accepted by the client, rejected by the bucket (P2-06). Logos uploaded under `new/` are orphaned if the form is abandoned (P3). Logo cross-deletion (P1-07) |
| B. Create product | `ProductEditorForm` → `ImageUpload.addFiles` / `ModelSlot.onFile` → `validateModelFile` (magic bytes, 50 MB) → `uploadAsset` (`product-media/{biz}/{uuid}`) → signed URL → `save()` → `createProduct` → RPC `save_product` (always inserts as draft) → `productById` | No compression (P1-01). No upload progress or retry. Switching the business after uploading gives a false "not allowed" error and orphans the files (P2-07) |
| C. Publish | `onPublish` / `useProductActions.publish` → `publishProduct` → `validateForPublish` (**client-side only**) → `UPDATE status, published_at` | Rule "at least one gallery image" is not enforced in the DB (P2-04). `published_at` is set by the client. Publishing under a draft or inactive business says "Live at…", but RLS hides it (P2-03) |
| D. Public view | Host or path → `ProductPage` → `getPublicProduct` (business by slug → product by `(business_id, slug)` → status filter → `hydrate` signs media for 1 h) → `localized()` | Signed URLs are never refreshed (P1-04). A signing failure looks like "missing 3D" (P3) |
| E. AR | ~~`onActivate` → `recordAr()` → WebXR: `startWebXr` → `startArSession` (fetches the GLB **again**); or~~ native: `activateAR()` (Scene Viewer / Quick Look fetch the URL themselves). 2026-10-13: native only; one `ar_activation` per launch attempt (taps within 2 s ignored) | ~~Wrong default on Android (P1-02). Double counting (P2-02). Session setup failures (P2-01)~~ (WebXR removed). Dead button after `ar-status: failed` (P1-03). Not verified on a real device |
| F. Analytics | `ProductPage` effects (view, first interaction, AR) → `recordEvent` (never throws) → `track-event` (UUID and type validation, salted IP hash) → `record_event_limited` (published + active + business match) | Visitor key taken from the first `X-Forwarded-For` entry, probably spoofable (P2-05) |
| G. Modes | No env → demo. Malformed → config error screen | An empty `VITE_DATA_MODE` in a production build serves demo data on the public pages (P1-05) |

## Broken or missing connections (summary; full entries in PRIORITIZED_ISSUES.md)
- Signed URLs expire after 1 h with no refresh: P1-04.
- Production demo-mode default: P1-05.
- Logo path not tied to its own business: P1-07.
- Publish rules and `published_at` are client-trusted: P2-04.
- Publish under an inactive business: P2-03.
- Business switch after upload: P2-07.
- Concurrent edits can delete a file that is still referenced, because the last write wins: P2-11.
- Orphaned uploads (unsaved, abandoned, `removeFolder` over 1000 objects): P3-01.
- Layering:
  - `RootLayout.tsx` and `AdminSettingsPage.tsx` import `services/mock/*`.
  - `services/index.ts` builds the mock store (and its seed) even in Supabase builds.
  - Tracked as P3-02.
- Hard-coded routes outside `lib/urls.ts` (`CatalogPage.tsx`, `ProductPage.tsx`, `ArSection.tsx`): P3-03.
- `createClient` is called without the `Database` generic, so there are no DB types at the boundary: P3-04.
- `AccountProvider` load race; a network error during `getUser()` is treated as signed out: P3-05.

## Verified sound
- **Tenant isolation:** every policy is scoped by `is_business_member(business_id)`. Child rows must point at storage paths in their own business folder.
- **Anonymous signing:** anon can only sign media referenced by published products of active businesses.
- **Duplicates:** a duplicate shares its original's storage paths. Delete and replace remove only paths no row still references.
- **`save_product`:** it cannot change `status` or `business_id`.
- **Owner-field guard:** a trigger stops owners editing slug and status.
- **Analytics:** limited to published products of active businesses; anonymous users cannot read the aggregates.
- **Failures:** `recordEvent` failures cannot break the page.

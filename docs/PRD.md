# Product Requirements: AR Furniture Platform

Last verified against code and the live Supabase project: **2026-10-13** (Phase 0 audit, branch `chore/production-readiness`, base `048cd01`).

This document lists the agreed requirements and where each one stands. Status reflects **evidence**, not code existence:

| Status | Meaning |
|---|---|
| `VERIFIED` | Real evidence: a live-system check or a real-device test, recorded |
| `IMPLEMENTED_NOT_VERIFIED` | Code exists; at most mocked/unit/e2e tests (emulated browsers) |
| `INCOMPLETE` | Partly built, or built differently from the agreed scope |
| `BLOCKED` | Needs an account, device, decision or access we don't have |
| `REQUIRES_OWNER_APPROVAL` | Ready, but switching it on is an owner/client decision |
| `OUT_OF_SCOPE` | Not in the agreed contract |

Source: **C** = agreed client scope, **E** = engineering necessity, **P** = proposed enhancement.

Authority order when items conflict: (1) accepted client offer, (2) owner-approved clarifications, (3) confirmed intentional behaviour, (4) security/correctness, (5) enhancements.

## Public product experience

| ID | Requirement | Src | Status | Evidence | Gap / risk | Acceptance | Client approval |
|---|---|---|---|---|---|---|---|
| R-01 | Reusable product page | C | IMPLEMENTED_NOT_VERIFIED | `src/features/public/ProductPage.tsx`; `src/app/router.tsx` | No real-device run | Every published product renders from DB data on iPhone + Android | N |
| R-02 | Interactive 3D viewer (model-viewer) | C | IMPLEMENTED_NOT_VERIFIED | `src/components/three/ModelViewer.tsx` (identical to `a6bc75b`); e2e `tests/e2e/public.spec.ts` | Desktop Chromium only. Listeners not re-attached when `src` changes (SEC-04) | Model loads, rotates, zooms on real phones | N |
| R-03 | iOS Quick Look handoff | C | IMPLEMENTED_NOT_VERIFIED | `ios-src` in `ModelViewer.tsx`, fed from `ProductMedia.tsx` | Never tested on an iPhone. Without a USDZ, model-viewer converts the GLB at tap time (slow, unverified) | Quick Look opens with the uploaded USDZ on a physical iPhone | N |
| R-04 | Android AR (Scene Viewer / WebXR) | C | IMPLEMENTED_NOT_VERIFIED | `ar-modes="webxr scene-viewer quick-look"`, `ar-scale="fixed"` | Contract names Scene Viewer; live flow tries in-browser WebXR first (owner-approved, shown to client). "Scene Viewer first" attempt failed on owner's phone, cause undiagnosed | AR opens on a physical ARCore phone; non-ARCore phone gets a useful fallback | Y: confirm current flow is accepted |
| R-05 | 3D fallback when AR unavailable | C | IMPLEMENTED_NOT_VERIFIED | `ArSection.tsx` (copy link, QR), `ProductMedia.tsx` (error, retry, photos) | Device check | Unsupported device shows 3D + explanation, never a dead button | N |
| R-06 | True real-world size | C | IMPLEMENTED_NOT_VERIFIED | `src/lib/scale.ts` (5% or 1 cm tolerance); editor scale diagnosis | USDZ size never measured; UI text says "within 5%" but code also allows 1 cm; no tape-measure test | Measured AR size matches product dimensions on both platforms | N |
| R-07 | Name, price, description, dimensions, photos, CTA | C | IMPLEMENTED_NOT_VERIFIED | `ProductPage.tsx` | — | Fields shown from DB in EN and PT | N |
| R-08 | Materials | C | INCOMPLETE | One localized `material` text field | No structured materials list | Client confirms one text field is enough (A-3) | Y |
| R-09 | Variants | C | INCOMPLETE | Colour swatch + price (`VariantsEditor.tsx`) | Picking a variant doesn't change model, photos or dimensions | Client confirms swatch + price meaning (A-3) | Y |
| R-10 | Responsive, mobile-first | C | IMPLEMENTED_NOT_VERIFIED | e2e `responsive.mobile.spec.ts` (emulated Pixel 7) | No real phones; no accessibility audit | Checked on real iPhone + Android widths | N |
| R-11 | Portuguese + English with switcher | C | IMPLEMENTED_NOT_VERIFIED | `src/i18n/`, `PublicShell.tsx`; e2e | PT product text depends on data entry | Every public string has PT; switcher persists | N |
| R-12 | In-app browser notice (Instagram, Facebook, WhatsApp) | C | IMPLEMENTED_NOT_VERIFIED | `src/lib/userAgent.ts`, `InAppNotice.tsx`; e2e Instagram only | Shown on product page only, not the catalog page the QR opens. WhatsApp on Android often uses Custom Tabs (no marker) | Notice appears in all three apps on a real phone | N |
| R-13 | AR placement guidance | C | IMPLEMENTED_NOT_VERIFIED | `ArTips.tsx` | "Don't show again" + blocked storage = Start AR does nothing (SEC-07) | Tips shown before first AR; Start always launches | N |

## Business catalogues and links

| ID | Requirement | Src | Status | Evidence | Gap / risk | Acceptance | Client approval |
|---|---|---|---|---|---|---|---|
| R-14 | Multiple businesses managed by admin | C | VERIFIED (live) | 5 businesses in live DB; RLS `init_schema.sql`; P9 live tests | — | — | N |
| R-15 | Distinct catalogue + subdomain per business | C | INCOMPLETE | `src/tenant/resolveTenant.ts`, `src/lib/urls.ts` (hostname mode when `VITE_ROOT_DOMAIN` set) | Live runs in path mode (`/catalog/:slug`). No domain/wildcard DNS. `www.`/`admin.` and multi-level subdomains get the full app | `{slug}.{domain}` serves only that catalog over HTTPS | Y (domain) |
| R-16 | Business logo + branding | C | IMPLEMENTED_NOT_VERIFIED | `LogoUpload.tsx`; `logoUrl`, `accentColor` | — | Logo and accent show on catalog + product pages | N |
| R-17 | QR → business catalogue URL | C | IMPLEMENTED_NOT_VERIFIED | `CatalogQrPanel.tsx`, `urls.ts` | Path mode uses `window.location.origin`, so a QR made on a preview/localhost URL encodes that origin forever. QRs printed before subdomains go live must be reprinted | QR always encodes the production catalog URL | N |
| R-18 | Shareable product URLs | C | IMPLEMENTED_NOT_VERIFIED | `urls.ts`; `ShareActions.tsx` | `ShareActions` builds from `window.location.href` (breaks project rule); regex can mangle `?preview=1&lang=pt` | Shared link opens the same product, same language | N |
| R-19 | Pages generated from saved data | C | VERIFIED (live) | `supabaseCatalogService.ts`; 18 live products | — | — | N |
| R-20 | Unpublished products not public | C | VERIFIED (live RLS, read-only policy review) | Anon policy on `products` requires `published` + active business; child tables inherit; PGlite RLS tests | Storage read policy doesn't tie `storage_path` to the product's business (SEC-05, latent: 0 media objects today) | Anon API call for a draft returns nothing | N |

## Admin dashboard

| ID | Requirement | Src | Status | Evidence | Gap / risk | Acceptance | Client approval |
|---|---|---|---|---|---|---|---|
| R-21 | Secure team/admin login | C | REQUIRES_OWNER_APPROVAL | `services/supabase/auth.ts`; RLS `is_platform_admin()` | Live auth settings unknown from code (signup / confirm email / password length). Leaked-password protection OFF (advisor). See SEC-01 | Sign-ups off or invite-only, confirmations on, min length 12 | Y (O-2) |
| R-22 | Create and manage businesses | C | IMPLEMENTED_NOT_VERIFIED | `BusinessForm.tsx`; e2e | — | Create/edit/deactivate on live staging | N |
| R-23 | Add, edit, publish, unpublish, duplicate, delete products | C | IMPLEMENTED_NOT_VERIFIED | `ProductTable.tsx`; duplicate = draft copy (`save_product.sql`); e2e | Publish rule (needs a gallery image) is UI-only until migration `20261013093006` is applied | All six actions work against real Supabase | Y (O-1) |
| R-24 | Product form fields | C | IMPLEMENTED_NOT_VERIFIED | `ProductEditorForm.tsx` | No free-form specs (A-3) | — | Y (A-3) |
| R-25 | GLB + USDZ upload with format/size validation | C | IMPLEMENTED_NOT_VERIFIED | `src/lib/files.ts`: extension, 50 MB, magic bytes; bucket MIME list + 50 MB | Checks are browser-side; storage trusts declared MIME. Any ZIP passes as USDZ. Image checks have no magic bytes | Bad files rejected with a clear message | N |
| R-26 | Model preview before publishing | C | IMPLEMENTED_NOT_VERIFIED | `ModelSection.tsx` `ModelPreview`; `?preview=1` | — | Draft previews without being public | N |
| R-27 | Real persistent backend data | C | VERIFIED (live) | Supabase mode live; build guard `backendConfig.ts` | Live DB holds sample data (4 sample businesses, 18 products, seeded analytics, sample owners). Build guard runs only when `VERCEL_ENV=production` | Sample data removed before handover | Y (O-4) |

## Analytics

| ID | Requirement | Src | Status | Evidence | Gap / risk | Acceptance | Client approval |
|---|---|---|---|---|---|---|---|
| R-28 | Product page views | C | VERIFIED (live) | `ProductPage.tsx` once per load → `track-event`; live rows | Rate-limit key may be spoofable (SEC-03); seeded sample analytics mixed in | Counts reconcile with stored events | N |
| R-29 | AR activation **attempts** | C | INCOMPLETE | `ProductPage.tsx`: recorded on every tap before `activateAR()` | Repeat taps inflate; dashboard label says "activations"; several docs wrongly say "once per page view" | Metric labelled "AR attempts", one per launch attempt | N |
| R-30 | Per-product and per-business totals | C | IMPLEMENTED_NOT_VERIFIED | `product_analytics_daily` view; `AnalyticsView.tsx` | 30-day window only | Totals match raw event counts | N |

## Assets, delivery, ownership

| ID | Requirement | Src | Status | Evidence | Gap / risk | Acceptance | Client approval |
|---|---|---|---|---|---|---|---|
| R-31 | Automatic model compression | C | REQUIRES_OWNER_APPROVAL | ADR-0019; glTF-Transform pipeline behind `VITE_MODEL_OPTIMIZATION` (off) | GLB only; USDZ untouched. Needs a device check of an optimized model before switching on | Client agrees on meaning (A-2); optimized model passes Scene Viewer + Quick Look | Y (A-2) |
| R-32 | Domain, subdomain routing, HTTPS | C | BLOCKED | Code ready (R-15); `System_arch/design/20-*` runbook | Needs the owner's domain and DNS access. Vercel wildcard domains require the domain's nameservers to point at Vercel | `https://{slug}.{domain}` works for every active business | Y |
| R-33 | Source, schema, models handover | C | INCOMPLETE | Repo, 6 migrations, `System_arch/` | Several audit docs are stale (see PRODUCTION_READINESS §5) | Repo + Supabase + Vercel transferred via provider tools | Y |
| R-34 | Non-technical user guide + walkthrough | C | INCOMPLETE | — | Not written | Client can create a business and publish a product from the guide alone | N |
| R-35 | Real-device testing iOS + Android | C | BLOCKED | `System_arch/audit/DEVICE_TEST_MATRIX.md`: all "Not run" | Needs physical devices | Matrix filled with device, OS, browser, model, result | N |

## Built but outside the contract

| ID | Item | Status | Note |
|---|---|---|---|
| X-01 | Business-owner dashboard `/dashboard` + owner accounts | REQUIRES_OWNER_APPROVAL | Built and RLS-tested; contract excludes self-service accounts (A-5) |
| X-02 | Physics/fit features (drag, overlap, wall clearance) | OUT_OF_SCOPE | Change request only (A-4) |
| X-03 | AI photo-to-3D, billing, team roles, fashion | OUT_OF_SCOPE | — |

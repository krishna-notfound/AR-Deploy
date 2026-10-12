# Delivery report: 3D furniture catalog & AR platform (frontend)

**Date:** 2026-10-12. Sections 1–8 cover the first brief's §20. **Section 9 covers Phase 2** (design refinement + Supabase foundation). Architecture docs are in `System_arch/` (start with `README.md`).

## 1. Screens implemented

**Demo entry (`/`)**
- Super Admin card.
- Business Admin card with a business picker and a **“Scope pending confirmation”** badge.
- List of public catalogs.
- A note that there is no real authentication.

**Super Admin (`/admin`)**

| Screen | Highlights |
|---|---|
| Overview | 6 key figures, 30-day views and AR charts (two small multiples), top products, recent activity, recent products and businesses, quick actions, “Sample data” label |
| Businesses | Search, status filter, sorting and pagination (all synced to the URL). Row actions: edit, open catalog, view products, view QR, activate/deactivate (with confirm), delete (with confirm; cascades). |
| Create / edit business | Validation, auto slug with uniqueness check, logo upload, contact, accent colour, currency, live identity preview, Save as draft / Create business, unsaved-changes guard. The detail page has Details, Products and Catalog & QR tabs. |
| All products | Search plus business, status and category filters (in the URL), sorting, pagination. Row actions: edit, preview, copy URL, duplicate, publish/unpublish, delete. A business picker opens before creating a product. |
| Product editor (shared) | See the editor sections listed below. |
| Analytics | Business filter, key figures, daily views and AR charts with a table view, views by business, top products, sortable product performance table |
| Catalogs & QR codes | Business selector, demo catalog URL with copy, client-side QR of the **catalog** URL, PNG download (1024 px), preview, product counts, local-URL toggle for phone testing |
| Settings | Profile, reset demo data, simulated-error toggle, “what this demo does / needs backend” table, asset credits |

The shared product editor has these sections:
- EN/PT localized fields.
- Slug, with the demo URL preview.
- Category, price and currency.
- Gallery images with a primary image, plus additional photos.
- GLB and USDZ slots (upload or URL, header check, status), a format explanation, and a 3D preview with a **scale check**.
- Dimensions and unit, material, weight, variants.
- Call-to-action button.
- A sticky bar with Preview, Save draft and Publish/Unpublish, a “Product published” dialog showing the demo URL, and an unsaved-changes guard.

**Business Admin (`/dashboard`, scope pending)**
- Overview, My Products, Add/Edit Product, Analytics, My Catalog & QR, Business Settings.
- Every screen reuses the shared features and is scoped to the signed-in business.
- The slug and catalog URL are read-only for the owner.

**Public pages (EN/PT)**
- **Catalog:** branded header, search, category chips, responsive grid with a 3D badge, and empty, no-results, not-found and inactive states.
- **Product page:**
  - `<model-viewer>` stage with loading, error/retry and no-model fallbacks, and a 3D/Photos toggle.
  - **“View in my home”**, shown only when model-viewer reports `canActivateAR`. Otherwise a phone hand-off panel with copy link and the page's QR code.
  - First-time AR tips.
  - Isometric **dimension drawing** with a cm/in toggle.
  - **True-to-size / AR scale unverified** badge, based on measured vs entered size.
  - Variants with price differences, materials, description and additional photos.
  - CTA link, or a contact-details dialog when there is no link.
  - Native share or copy link.
  - In-app browser notice for Instagram, Facebook and WhatsApp.
  - Draft preview (`?preview=1` for signed-in demo admins).

## 2. Important files

| Area | Files |
|---|---|
| Domain and services | `src/domain/types.ts`, `src/services/catalogService.ts`, `src/services/index.ts` (swap point), `src/services/hooks.ts`, `src/services/mock/{mockCatalogService,store,db,seed,analytics,validation,credits}.ts` |
| Routing and accounts | `src/app/router.tsx`, `src/auth/{AccountProvider,RequireRole,accounts}.tsx`, `src/tenant/resolveTenant.ts` |
| Design system | `src/index.css` (tokens), `src/components/ui/*`, `src/components/layout/*`, `src/components/charts/*`, `src/components/three/ModelViewer.tsx` |
| Shared features | `src/features/products/*` (editor, table, actions), `src/features/businesses/*`, `src/features/catalogs/CatalogQrPanel.tsx`, `src/features/analytics/AnalyticsView.tsx` |
| Pages | `src/features/{demo,admin,business,public}/*` |
| i18n | `src/i18n/{LanguageProvider.tsx,translate.ts,dictionaries/en.ts,dictionaries/pt.ts}` |
| Utilities | `src/lib/{urls,format,files,scale,slug,color,userAgent,clipboard,download,product}.ts` |
| Tests | `src/**/*.test.ts(x)`, `tests/e2e/*.spec.ts`, `playwright.config.ts` |
| Assets | `public/images/models/*.webp` (posters rendered from the sample GLBs) |
| Docs | `README.md`, `CLAUDE.md`, `System_arch/**` (ADRs 0001–0013) |

## 3. Routes for testing

- `/`
- Super Admin:
  - `/admin`
  - `/admin/businesses`
  - `/admin/businesses/new`
  - `/admin/businesses/biz_casa`
  - `/admin/products`
  - `/admin/products/new?business=biz_nord`
  - `/admin/products/prd_sheen_chair/edit`
  - `/admin/analytics`
  - `/admin/catalogs`
  - `/admin/settings`
- Business Admin:
  - `/dashboard`
  - `/dashboard/products`
  - `/dashboard/products/new`
  - `/dashboard/analytics`
  - `/dashboard/catalog`
  - `/dashboard/settings`
- Public pages:
  - `/catalog/casa-lisboa`
  - `/catalog/nordhaus`
  - `/catalog/atelier-verde`
  - `/catalog/oak-ember` (inactive)
  - `/products/casa-lisboa/glam-velvet-sofa` (3D, verified scale)
  - `/products/atelier-verde/damask-accent-chair` (3D, unverified scale)
  - `/products/casa-lisboa/tejo-side-table` (broken model)
  - `/products/nordhaus/fjord-shell-chair` (no model)
  - `/products/atelier-verde/rio-sideboard` (missing Portuguese)

## 4. How to run

```bash
npm install
npm run dev                       # http://localhost:5173
npx playwright install chromium   # once, for E2E
npm run test:e2e
```

## 5. Dependencies added

- **Runtime:**
  - `react-router`
  - `lucide-react`
  - `@google/model-viewer` (brings in `three`)
  - `recharts`
  - `qrcode`
- **Dev:**
  - `tailwindcss`, `@tailwindcss/vite`
  - `vitest`, `jsdom`
  - `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`
  - `@playwright/test`
  - `@types/qrcode`
- **From the Vite template:** `react`, `react-dom`, `typescript` ~6.0, `vite`, `@vitejs/plugin-react`, `oxlint`, `@types/*`

## 6. Build and quality results (2026-10-12)

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` | ✅ 0 errors. About 15 advisory warnings remain (React-compiler-style hints such as “setState in effect” and “ref read during render” for intentional latest-ref patterns, plus a few jsx-a11y hints). |
| `npm test` | ✅ 32 / 32 passed (lib, service, i18n, component tests) |
| `npm run test:e2e` | ✅ 19 / 19 passed (desktop Chromium + Pixel 7 emulation). Covers every item in §19.1–19.15. |
| `npm run build` | ✅ Succeeds |

Bundle notes:
- `model-viewer` is a separate ~1 MB chunk (290 KB gzipped), loaded only on pages that show 3D.
- Charts (recharts) load only in the dashboards.
- Public pages don't load admin code.

## 7. Known limitations and incomplete items

- **AR was not tested on a physical device.** Headless Chromium reports `canActivateAR = false`, so automated tests cover only the fallback. The button, Quick Look, Scene Viewer and the AR tips “Start AR” path still need checking on a real iPhone and Android phone (task P7-10).
- **No sample product has a USDZ file**, because no correctly licensed USDZ asset was available. On iOS, model-viewer may build a USDZ for Quick Look on its own. The app does not present that as a feature, and the editor flags the missing file.
- **The accessibility pass was partial.** Labels, focus traps, keyboard menus, focus rings and `aria-sort` are implemented, and layouts were reviewed at 390 px and 1280–1440 px. A full keyboard-only and screen-reader audit was not done (P7-11).
- **Sample 3D models are hotlinked** from GitHub raw (CORS checked). Self-host them if that proves unreliable (P7-12).
- **Uploaded 3D files last for the browser session only** (ADR-0007). Images are resized and stored in `localStorage` (up to 1.5 MB each).
- **Hostname (subdomain) routing** is implemented and unit-tested through `resolveTenant`, but has not been run under a real subdomain.
- **Portuguese** uses pt-PT wording and number formatting (open question Q3).
- **Nothing is committed.** The repo is initialised with git but has no commits yet.
- **Superseded by Phase 2 (section 9):** `/` is now the landing page; the account picker is at `/demo`.

## 8. Mock frontend vs needs-backend

| Capability | This frontend (mock) | Needs backend for production |
|---|---|---|
| Login and accounts | Mock account selector in localStorage; route guards are UX only | Auth provider, sessions, server-side authorization |
| Business and product CRUD | Mock `CatalogService` + localStorage, simulated latency, optional simulated errors | API + database (swap `services/index.ts`) |
| Image upload | Validated, resized, stored as data URLs | Object storage, CDN, image processing |
| 3D model upload | Validated (extension, size, header bytes); session-only blob URL | Object storage + CDN with correct MIME types and CORS |
| GLB→USDZ conversion | **Not provided** (by design) | Out of scope |
| Scale check | Real: model-viewer `getDimensions()` vs entered dimensions (±5%) | — |
| Publish / product URL | Demo URL `https://{business}.example.com/products/{slug}` plus a local preview route | Real domain, routing and DNS |
| Subdomains, DNS, SSL | `resolveTenant()` ready; demo URLs only | Wildcard DNS, TLS, hosting |
| QR codes | Real client-side QR of the catalog URL, PNG download | Works as-is once real URLs exist |
| Analytics | Seeded sample data + real views and AR taps recorded in this browser | Event ingestion, aggregation, storage |
| AR | Real model-viewer AR (WebXR, Scene Viewer, Quick Look), shown only when the device supports it | Hosted assets |
| i18n | Static EN/PT dictionaries + per-field product translations | CMS/API translation fields |

## 9. Phase 2: design refinement + Supabase foundation (2026-10-12)

### Visual changes (ADR-0014, ADR-0016)
- **Tokens:**
  - The orange accent is split by contrast job: `#FE6F2D` for fills under dark text, `#E85F1F` for rings and indicators, `#B4441A` for text.
  - The primary button is charcoal.
  - Cards use hairlines instead of shadows; radii are 6/10/14 px.
  - New light editorial type sizes (`display`, `headline`, `title`, `lead`) in Hanken Grotesk 300–600.
  - New `BrandMark`.
- **Landing page (`/`):**
  - Hero with the real 3D sofa, measured in the browser.
  - 3D-then-AR explainer, three steps, showcase from the service, business value, platform features.
  - "Try it on your phone" QR code (with a localhost caveat).
  - Embedded demo picker and a footer.
  - No fake logos, testimonials or statistics.
- **Platform-wide:**
  - Dashboard shell: wordmark and an orange active-nav indicator.
  - Page titles, links and badges use the new tokens.
  - Public catalog and product page: wider editorial layout, light headings, larger product imagery.
  - "Sample data" labels are now driven by the data (`isSample`).
- **Routes and files:**
  - New: `/`, `/demo`, `/login`.
  - New files: `features/marketing/*`, `features/demo/DemoAccounts.tsx`, `features/auth/LoginPage.tsx`, `app/BackendConfigError.tsx`, `components/ui/BrandMark.tsx`, `lib/useQrCode.ts`.

### Supabase architecture (ADR-0015, design/19)
- **Mode switch:** `services/backend.ts` reads `VITE_DATA_MODE`: `demo` (default), `supabase`, or misconfigured, which shows a setup screen and never falls back to demo data. Secret and service_role keys are rejected.
- **Selection:** `services/index.ts` picks the service at build time, so demo builds don't include supabase-js (the services chunk is 43 KB vs 271 KB).
- **Supabase modules:** `services/supabase/client.ts` (one client), `supabaseCatalogService.ts` (the full `CatalogService`: RLS-aware error mapping, signed URLs, the `save_product` RPC) and `auth.ts` (session, user plus role, password sign-in, sign-out, state changes).
- **UI wiring:** uploads now go through `service.uploadAsset`, and hooks refetch via `service.subscribe`.

### Migrations (`supabase/migrations/`, not applied)
| File | Contents |
|---|---|
| `20261012192143_init_schema.sql` | Creates `businesses`, `platform_admins`, `business_members`, `products`, `product_images`, `product_models`, `product_variants`, `product_analytics` and the `product_analytics_daily` view (security_invoker). Adds checks, indexes, `updated_at` triggers, a slug/status guard trigger, helper functions, RLS and explicit grants. |
| `20261012192159_storage.sql` | Creates the public `business-logos` bucket (2 MB, no SVG) and the private `product-media` bucket (50 MB, images + GLB + USDZ) with `storage.objects` policies. |
| `20261012192454_save_product.sql` | Creates `save_product()`, a SECURITY INVOKER RPC that saves a product and its children in one transaction. |

**RLS summary:**
- The public sees only active businesses and published products of active businesses.
- Owners manage only their own business, and cannot change its slug or status.
- Super Admins are rows in `platform_admins`, which have no client write path.
- Analytics is insert-only for the public and readable by members and admins. It stores no personal data.
- Files in `product-media` are readable only when a product the caller can see references them.

### What works without setup (demo mode)
Everything from sections 1–8, plus the landing page. Demo mode creates no Supabase client and sends no requests to Supabase.

### What needs a Supabase project
- Apply the migrations (design/19 §3).
- Create users, and add platform admins and business members with SQL.
- Set the auth redirect URLs.
- Set the env vars.
- Run advisors and generate types.

### Verification
| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` | ✅ 0 errors, 16 advisory warnings (the same kinds as before, plus one `set-state-in-effect` in `DemoAccounts`, carried over from the old demo page) |
| `npm test` | ✅ 50 / 50, including 18 new tests: config parsing, secret-key rejection, demo mode never creating a client, the misconfigured service, PostgREST error mapping (CONFLICT / PERMISSION / NOT_FOUND / network) with no fake success, listener notification, insert-only analytics, blocking browser-only file URLs, `save_product` arguments |
| `npm run test:e2e` | ✅ 22 / 22 (desktop + Pixel 7), including 3 new landing and route tests |
| `npm run build` | ✅ Succeeds (demo mode); a Supabase-mode build also succeeds |
| RLS / storage SQL | ✅ 55 / 55 cases against PGlite with stub `auth` and `storage` schemas. **Not** run on a real Supabase project. |
| Live project (read-only) | In Supabase mode against `pmnjchhrgvajtjpadpqo` (schema not applied), the UI shows Supabase's real error ("Could not find the table 'public.businesses'") rather than demo data. |

### Not verified or not done
- **Migrations:** not applied to the live project, which needs your approval. As a result:
  - No real sign-in, upload, signed URL or RLS check has been done through PostgREST.
  - Generated types don't exist yet.
- **AR:** still not tested on a physical phone.
- **Supabase features not built:**
  - membership or invite UI
  - password reset or magic links
  - orphaned-file cleanup
  - analytics rate limiting

  These are listed in `tasks/P8-design-supabase.md` under Discovered.

### Pre-deployment review (2026-10-12, nothing applied)
- **Fixes:** 7 issues fixed in the unapplied migrations; the most important stopped a product from referencing another business's private file. Details are in design/19 "Pre-deployment review".
- **Local checks:** 80/80 pass (55 original + 25 new). The rollback script was verified to remove everything and allow a clean re-apply.
- **New files:** `supabase/checks/preflight_readonly.sql` (read-only checks to run on the target first) and `supabase/rollback/20261012_p8_rollback.sql` (destructive, manual).
- **Open decision:** rate-limiting public analytics events (P8-17).
- **Target project:** `pmnjchhrgvajtjpadpqo`, from `.mcp.json` (not CLI-linked, no env files). Not contacted during the review.
- **Secret scan:** no secret or service_role key in the source, built files, logs or test output. The only matches are fake test strings and the guard that rejects such keys.

### Database deployment and real-API verification (2026-10-13)
- **Pre-flight (read-only):**
  - `pmnjchhrgvajtjpadpqo` had no tables, buckets, storage policies, migration history or users.
  - It runs Postgres 17.11.
  - It still uses legacy default privileges (anon gets full access to new tables). The migrations revoke and re-grant explicitly, and the 81 local checks were re-run under the same defaults.
- **Applied with the owner's approval:**
  - 3 migrations, recorded as `20261012192143`, `20261012192159` and `20261012192454`; the local files were renamed to match.
  - Also fixed before applying: reserved subdomain names (`www`, `admin`, `api`, …) are refused as business slugs (app check, DB check and a sync test).
  - No rollback SQL was run.
- **Live verification:**
  - RLS on all tables; policies, buckets and grants confirmed.
  - Security advisors: nothing from these migrations.
  - Real-API suite 10/10 and Supabase-mode UI smoke 8/8.
  - A real bug was found and fixed: GLB/USDZ uploads were sent as octet-stream and rejected.
  - The QA users and data were deleted afterwards.
- **Deployment prep:**
  - `vercel.json` (SPA rewrite, caching, security headers).
  - design/20: env checklist, wildcard domain requirements, auth settings, analytics rate-limit proposal.
  - Hostname routing verified 10/10 against a production build with mapped subdomains.
- **Not done, needs approval:**
  - Vercel project, domains and DNS.
  - Supabase Auth settings (sign-ups off, redirects, SMTP).
  - First real admin account.
  - Analytics rate limiting (P8-17).
  - Real-device AR (P7-10).

### Production preparation (2026-10-13)
- **Analytics protection (built, not deployed):**
  - migration `20261012200810_analytics_rate_limit` adds a private counter table and `record_event_limited()` (30 events/min per hashed visitor, service_role only), and closes direct anonymous inserts
  - Edge Function `track-event` (SHA-256 of IP|date|secret salt; no raw identifiers stored)
  - the client now goes through the function
  - tests: handler 11/11, PGlite 98/98, rollback re-verified, `deno check` passes
- **Vercel (read-only):** team `track0`, no project for this app, no domains. Nothing was created or changed.
- **Readiness:**
  - `vercel.json` sets framework vite, build `npm run build`, output `dist`, the SPA rewrite and security headers
  - Node pinned to 24.x
  - the frontend reads exactly the four public `VITE_*` variables, and no secret appears in the source or the build
- **Auth:** exact dashboard changes are listed in design/20; nothing was changed live.

### P9 release work (2026-10-13)
- **Backend (live on `pmnjchhrgvajtjpadpqo`):**
  - migrations `20261012200810_analytics_rate_limit` and `20261012200813_business_member_admin` applied, 5 in total
  - Edge Function `track-event` version 1 ACTIVE
  - types regenerated
- **New in the app:**
  - password reset (`/reset-password`)
  - Owners tab: platform admins link owner accounts by email
  - 3D-interaction analytics, a viewer stall timeout and Reset view
  - storage cleanup after a product or business is deleted, or a file replaced
  - real path-mode public URLs in production (no `example.com` outside demo mode)
- **Fixed:** an account-loading race that bounced signed-in users through `/login` on a fresh load of a guarded route.
- **Verified:**
  - live API suite 13/13
  - Supabase-mode UI journey 9/9
  - PGlite 110/110 + rollback
  - unit tests 66 (13 live tests skipped without credentials)
  - e2e 22/22; typecheck and build OK; lint 0 errors
- **Blocked:**
  - Vercel project creation (403: no write access to team `track0`)
  - production domain
  - Supabase Auth dashboard settings
  - custom SMTP (password emails reach only org members)
  - first real platform admin (email needed)
  - real-device AR


# Client scope acceptance matrix

Status key: **Complete**, **Partial**, **Missing**, **Contradicts contract**, **Unverified** (built, but not proven on a device or against the live backend).

How each mode was checked:
- **Demo mode:** E2E-tested.
- **Supabase mode:** covered by `src/services/supabase/live.integration.test.ts`. That test is skipped by default and was not run in this audit. It writes data and needs QA accounts; it was last recorded passing in tasks/P9 G1–G4.

## A. Public product experience
| # | Requirement | Evidence | Status | Missing logic | Acceptance test |
|---|---|---|---|---|---|
| A1 | Reusable product page | `features/public/ProductPage.tsx`; routes in `app/router.tsx` (path and hostname mode) | Complete | — | Two products from different businesses: same layout, each with its own data |
| A2 | 3D viewer: rotate and zoom | `components/three/ModelViewer.tsx` (model-viewer 4.4); e2e `public.spec.ts` "model loads…" | Complete | — | Drag and pinch on a phone |
| A3 | Quick Look on iOS | `ModelViewer.tsx` `ios-src`, `ar-modes="scene-viewer quick-look"` | Unverified | Device test. The USDZ is never measured, yet "True size" is shown (P2-08) | iPhone Safari opens Quick Look at true size |
| A4 | Scene Viewer on Android | `features/ar/capability.ts` `chooseArMode`: WebXR wins whenever `isSessionSupported` is true | **Contradicts contract** | Make native the default (P1-02) | Pixel: Scene Viewer opens. Phone without ARCore: Scene Viewer opens in 3D |
| A5 | Correct real-world scale | `ar-scale="fixed"`; `lib/scale.ts` `checkScale` (±5%, never rescales); seed GLBs measured and matching (Agent 4) | Partial | Mismatch diagnosis, unit-toggle relabel bug (P2-09), USDZ not measured; device check | Tape-measure a 200 cm sofa in AR |
| A6 | Name, price, description, specs, dimensions, materials, photos, CTA | `domain/types.ts` Product; `ProductPage.tsx` | Partial | No free-form specifications list (only dimensions, material, weight, category) | Fill every field and check it renders |
| A7 | Colours / variants | `ProductVariant` (name, colour, SKU, price change) | Partial | A variant never changes the model, photos or dimensions. Agree this with the client (APPROVAL-3) | Pick a variant: the price and swatch change |
| A8 | 3D fallback without AR | `ArSection.tsx` hand-off (link and QR); e2e | Complete | — | Desktop shows the 3D view and the hand-off |
| A9 | In-app browser detection (Instagram, Facebook, WhatsApp) | `lib/userAgent.ts`, `InAppNotice.tsx`; e2e (Instagram user agent only) | Unverified | Real in-app browser behaviour; whether intents get through is unknown | Open from each app on both phones |
| A10 | First-time AR guidance | `ArTips.tsx` (native mode); `ArSessionOverlay.tsx` (WebXR) | Unverified | Device test | Clean phone: guidance shows on the first tap |
| A11 | Responsive, mobile-first | e2e `responsive.mobile.spec.ts` | Partial | Accessibility audit (P7-11), real phones | 390 px wide with no horizontal scroll |
| A12 | PT/EN pages with a switcher | `LanguageSwitcher`, dictionaries, `localized()`; e2e | Complete | — | Switch to PT |
| A13 | Optimized model loading | Lazy model-viewer, poster, stall timeout, readiness size warning | Partial | Eager loading; the size warning is at 15 MB where Scene Viewer recommends 10 MB | Lighthouse with a 4G profile |
| A14 | **Automatic model compression** | None. `ModelSection.tsx` says files are "not converted, compressed or processed" | **Missing** | P1-01 | A 20 MB GLB becomes smaller and still opens in Scene Viewer |

## B. Businesses, domains, QR
| # | Requirement | Evidence | Status | Missing logic | Acceptance test |
|---|---|---|---|---|---|
| B1 | Many businesses | `businesses` table and RLS (`*_init_schema.sql`) | Complete | — | Two businesses stay isolated (live test) |
| B2 | A subdomain per business | `tenant/resolveTenant.ts`, `lib/urls.ts` `PUBLIC_URL_MODE`; runbook in design/20 | Code complete; **deployment missing** | Domain, wildcard DNS and TLS (P1-06) | `slug.domain` over HTTPS |
| B3 | Catalog page with logo and published products | `CatalogPage.tsx`; RLS public-read policy | Complete | SVG logo accepted by the client, rejected by the bucket (P2-06) | Upload a PNG logo; it shows publicly |
| B4 | Printable QR code to the catalog | `CatalogQrPanel.tsx`; e2e `qr-copy.spec.ts` | Complete | Reprint once real subdomains go live | Scan the print: it opens the catalog |
| B5 | Shareable product links | `ShareActions.tsx`, `productPublicUrl` | Complete | — | Open on a second phone |
| B6 | Publishing makes the page live | `publishProduct`, RLS | Partial | Publishing under a draft or inactive business shows "Live at…" but the page says not found (P2-03) | Publish under a draft business: a warning is shown |

## C. Admin dashboard
| # | Requirement | Evidence | Status | Missing logic | Acceptance test |
|---|---|---|---|---|---|
| C1 | Secure team login | Supabase Auth; `platform_admins` table; RLS `is_platform_admin()` | Partial | Live sign-up and confirmation settings unverified (P1-08); admins can only be added via SQL | A non-admin inserting a business is refused |
| C2 | Create and manage businesses | `BusinessForm`, service create/update/delete | Complete | Logo cross-deletion (P1-07) | e2e `business-crud` |
| C3 | Products: add, edit, publish, unpublish, delete, duplicate | Service methods and the `save_product` RPC | Complete | Publish rules enforced in the UI only (P2-04) | e2e `product-crud`; live test |
| C4 | Product form | `features/products/editor/*` | Partial | Specs list (A6) | — |
| C5 | Preview the 3D model before publishing | `ModelPreview` loads the stored file through a signed URL; `?preview=1` | Complete | — | Preview a draft |
| C6 | GLB/USDZ upload with format and size checks | `lib/files.ts` (magic bytes, 50 MB); bucket MIME and size limits | Complete (client checks; the bucket trusts the declared type, P3) | — | A .txt renamed to .glb is rejected |
| C7 | Admin in one language | English-only dashboards | Complete | "demo" wording in Supabase mode (P2-10) | — |
| C8 | Automatic compression on upload | — | **Missing** | P1-01 | as A14 |

## D. Analytics
| # | Requirement | Evidence | Status | Missing logic | Acceptance test |
|---|---|---|---|---|---|
| D1 | Page views | `ProductPage` → `track-event` → `record_event_limited` | Complete (live per P9) | Rate limit may be spoofable (P2-05) | One visit adds one row |
| D2 | AR activations | `recordAr()` | Partial | Counted per tap and double-counted after a fallback (P2-02) | One AR attempt per page view adds one row |
| D3 | Per-product and per-business totals | `product_analytics_daily` view | Partial | 30-day window only. Whether sample analytics exist in production is unverified (P2-12) | Totals match the visits made |

## E. Delivery
| # | Item | Status | Note |
|---|---|---|---|
| E1 | Source, DB and model handover | Partial | No handover document; sample GLBs are hot-linked from GitHub raw |
| E2 | Deployment, domain, subdomains, SSL | **Missing** | Vercel was blocked by access rights; no domain chosen. Configuration, not code (the CLAUDE.md "never build DNS/SSL" rule means no automation, not "don't configure") |
| E3 | Real-device testing on iPhone and Android | **Missing** | DEVICE_TEST_MATRIX.md: every row is "Not run" |
| E4 | User guide and walkthrough video | **Missing** | — |
| E5 | 2 revisions, 1 month support | n/a | — |

## Built beyond the agreement (scope creep), with risk
| Item | Where | Risk / recommendation |
|---|---|---|
| Business-owner dashboard `/dashboard` | `features/business/*`, RLS member policies | Live attack surface that the contract excludes ("business self-service"). Keep it disabled (no owner accounts) unless the client approves |
| Owner management | `BusinessOwnersPanel.tsx`, `*_business_member_admin.sql` (SECURITY DEFINER, reads `auth.users`) | Same. Sample owner accounts exist in seed data: remove them or rotate their passwords before launch |
| `model_interaction` analytics event | `*_analytics_rate_limit.sql`, ProductPage | Low risk; "advanced analytics" was excluded. Don't show it in client reports |
| Custom WebXR placement | `src/features/ar/*` (ADR-0018) | Keep it as an opt-in beta, not the default (P1-02) |
| Landing page, demo picker, sample-data generator | ADR-0016/0017 | Low risk |

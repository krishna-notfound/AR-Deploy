# Implementation status (functional phase, 2026-10-13)

> **Superseded for AR (2026-10-13):** the custom WebXR session, footprint and settle, native-first and 'Precise placement' described here were removed. Live AR is the original model-viewer flow. See `System_arch/HANDOFF.md`.

Branch `feature/ar-experience-2`. Issue IDs refer to PRIORITIZED_ISSUES.md; approvals to APPROVAL_REQUIRED.md.

**Overall:**
- **Functionally ready** for the UI phase.
- **Staging-ready** once the owner approves O-1 (migration) and deploys a preview.
- **Not production-ready:** deployment, domain/SSL, live migration, Auth settings, the analytics IP fix and **all real-device tests** are still open.

## Done (code, with tests that ran and passed)
| Issue | Change | Files | Tests |
|---|---|---|---|
| P1-07 | Logo cleanup only deletes files in the business's own folder | `services/supabase/supabaseCatalogService.ts` (`ownedLogoPath`) | `backend.test.ts` |
| P2-13 | Raw Postgres text is never shown; DB rule names map to field errors | same (`mapDbError`, `DB_RULES`) | `backend.test.ts` |
| P1-05 | Production build guard: refuses demo mode, missing values, non-https URLs and secret keys | `services/backendConfig.ts` (new, pure), `services/backend.ts`, `vite.config.ts` | `backend.test.ts`; 4 manual builds (2 blocked, 2 built) |
| P1-03 + AR | Native `ar-status: failed` leaves no dead button. WebXR setup failures end the session. A cancel isn't a failure. `NotSupportedError` is remembered for 7 days. The overlay only shows with a live controller. No placing while the model is loading. Anchors are created inside the frame. Precise bounding box | `features/ar/capability.ts`, `useArExperience.ts`, `webxrSession.ts`, `public/ArSection.tsx`, `ProductPage.tsx`, dictionaries | `ar.test.ts`, `webxrSession.test.ts` (fails on the old code), `ArSection.test.tsx`, e2e `public.spec.ts` |
| P1-02 | Native-first **prepared, not switched on** (A-1) | `capability.ts` `AR_DEFAULT_PREFERENCE` | `ar.test.ts` |
| P2-02 | `ar_activation` counted once per page view | `ProductPage.tsx` | e2e "counted once per page view" |
| P1-04 | Signed media URLs: 12 h lifetime, refreshed when a visitor returns to a stale page (never inside the AR tap) | `services/catalogService.ts`, `supabaseCatalogService.ts`, `services/hooks.ts` (`useRefreshWhenStale`), `ProductPage.tsx` | `components.test.tsx` |
| P2-04, P1-08, P3-06 | Migration written and **tested, not applied** (O-1): <br>• a published product needs a gallery image <br>• `published_at` set by the server <br>• owners linked only to confirmed emails <br>• revoke on `rls_auto_enable` | `supabase/migrations/20261013093006_publish_rules.sql` | `supabase/tests/migrations.test.ts` (PGlite; 4 rule tests fail without the migration) |
| B6 | RLS verified as the API roles: anon sees published products of active catalogs only and can't write; no cross-business reads or writes; strangers can't write; admins can | — | `migrations.test.ts` (5 access tests) |
| P2-03 | Publishing under an inactive catalog says so; "Open product page" opens the preview | `useProductActions.tsx`, `ProductEditorForm.tsx` | e2e `product-crud.spec.ts` |
| P2-06 | No SVG logos (the bucket refuses them) | `lib/files.ts`, `LogoUpload.tsx` | — |
| P2-07 | Business choice locked once files are stored in its folder | `ProductEditorForm.tsx` | — (Supabase-mode path; manual) |
| P2-08 | Readiness copy (Android, iPhone USDZ caveat), 10 MB warning, neutral start-failure text | `features/ar/readiness.ts`, dictionaries | `readiness.test.ts` |
| P2-09 | Scale mismatch diagnosis (axis swap, wrong unit, model units, uniform); tolerance max(5%, 1 cm); unit switch explained | `lib/scale.ts`, `ModelSection.tsx`, `ProductEditorForm.tsx` | `lib.test.ts` |
| P2-10 | "demo" wording removed from Supabase-mode messages | `BusinessForm.tsx`, `useBusinessActions.ts`, `useProductActions.tsx`, `ModelSection.tsx` | e2e `business-crud.spec.ts` |
| P2-15 | Report-only CSP; enforced `frame-ancestors` kept | `vercel.json` | Scripted check on a production build: 0 violations across 5 flows; the check itself shown to catch a broken policy |
| P1-01 / B4 | Safe model optimization (ADR-0019), **off until A-2**; Scene Viewer extension warning (always on) | `products/editor/modelOptimize*.ts`, `ModelSection.tsx`, `lib/files.ts` | `modelOptimize.test.ts`, e2e `model-optimize.spec.ts`, `lib.test.ts` |
| Physics (owner request) | Footprint outline before placing; settle drop onto the shadow; reduced motion respected | `features/ar/placement.ts` (`settleOffset`), `webxrSession.ts` | `ar.test.ts`. Not seen on a device |
| Found during testing | **Product list lost the search term** when a filter changed within about 250 ms of typing. React Router hands every update the last render's params; navigation commits asynchronously | `features/products/ProductFilters.tsx` | `components.test.tsx` (failed before the fix); e2e 4/4 repeats |
| Test hygiene | Two long E2E tests had step timeouts larger than their test budget (network-bound sample models) | `tests/e2e/public.spec.ts`, `product-crud.spec.ts` | repeated runs |

New dependencies, each with an ADR:
- `@gltf-transform/core`, `@gltf-transform/functions` and `@gltf-transform/extensions` 4.5.1 (MIT), worker-only (ADR-0019)
- `@electric-sql/pglite` 0.5.9 (Apache-2.0), dev-only (ADR-0020)

## Not done, and why
| Item | Blocker |
|---|---|
| Native-first AR default (A-1), model optimization switched on (A-2) | Client approval |
| Apply the publish-rules migration (O-1) | Owner approval |
| Analytics client-IP fix (O-3) | Needs a staging header test and owner approval to redeploy |
| Optimistic locking for concurrent edits (P2-11) | Would change the `save_product` signature. Deferred until the migration bundle is approved, to avoid two live changes |
| Deployment, domain, SSL, Auth settings (O-2, O-5) | Owner action and approval |
| Remove sample data from production (O-4) | Owner decision. 18 sample products are live |
| Real-device tests (all of DEVICE_TEST_MATRIX) | Physical devices |
| Live integration test (O-7) | Credentials and approval (it writes data) |
| Free-form specifications, variant models, wall placement, physics P-B to P-D | Client scope decisions (A-3, A-4) |
| UI improvements | Deferred to the UI phase (UI_BACKLOG.md) |

## Incident to report
While reproducing an E2E failure (2026-10-13 09:50 UTC), a scratch dev server picked up `.env.local` (Supabase mode). Loading one product page recorded **one `view` analytics event on the live sample product `sheen-lounge-chair`**. Nothing else was written. It was left in place, not deleted without approval. Since then, scratch servers are started with demo-mode env, and test servers are stopped by port.

## Evidence (commands run on the final code)
See DEVICE_TEST_MATRIX.md §Evidence.

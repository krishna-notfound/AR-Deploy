> **Superseded in part (2026-10-13).** AR and analytics statements below are outdated. Current state: System_arch/HANDOFF.md and docs/PRODUCTION_READINESS.md.

# Implementation plan

Order by dependency. Every task follows the CLAUDE.md definition of done: typecheck, lint, test and build pass; the touched route is checked at desktop and mobile widths; the task is ticked off.

Issue IDs refer to PRIORITIZED_ISSUES.md.

## Stage A: contracted correctness fixes (code only, no approvals)
| # | Task | Files | Acceptance / regression test |
|---|---|---|---|
| A1 | **Superseded 2026-10-13:** the WebXR session and these files were removed (f171db3); the owner chose native-only `scene-viewer quick-look` (branch, not yet deployed). ~~Native AR first. WebXR becomes a secondary "Precise placement (beta)" link.~~ `nativeFailed` input; on `ar-status: failed`, set `canAR = false` (P1-02, P1-03) | `features/ar/capability.ts`, `useArExperience.ts`, `public/ArSection.tsx`, `public/ProductPage.tsx`, `i18n/dictionaries/en.ts` and `pt.ts` | Unit tests for `chooseArMode` (native wins; `nativeFailed` → webxr or none). E2E: with a stubbed `navigator.xr`, both the main button and the beta link render; the existing desktop fallback test still passes |
| A2 | ~~Count `ar_activation` once per page view~~ Count one `ar_activation` per AR launch attempt (taps within 2 s of a launch ignored) and document it as "AR launch attempts", not success or placement (P2-02) | `ProductPage.tsx` | ~~Component test: two taps record one event~~ Two taps within 2 s record one event |
| ~~A3~~ | ~~Make the WebXR session robust (P2-01, P3-08)~~ Moot: session removed | `features/ar/webxrSession.ts`, `useArExperience.ts` | Unit tests with a fake XR session: a setup throw ends the session; Exit works while starting; no place while the model is loading |
| A4 | Signed URLs: 12 h TTL plus re-fetch on visibility change when stale (P1-04) | `services/supabase/supabaseCatalogService.ts`, `public/ProductPage.tsx` (or a small hook) | Unit test of the staleness helper; manual check with a 2-minute TTL |
| A5 | Production build guard (P1-05) | `vite.config.ts`, design/20 | Unit test of the guard function; `VERCEL_ENV=production npm run build` fails without the vars |
| A6 | Logo deletion limited to the business's own folder (P1-07) | `supabaseCatalogService.ts` | `backend.test.ts`: another business's path is never removed |
| A7 | Copy and honesty fixes: readiness Android text, failure message, 10 MB warning, iOS "checked on the 3D file", "demo" wording in Supabase mode, publish under an inactive business, generic DB errors (P2-03, P2-08, P2-10, P2-13) | `features/ar/readiness.ts`, dictionaries, ~~`ArSessionOverlay.tsx`~~ (removed), `useProductActions.tsx`, `ProductEditorForm.tsx`, `BusinessForm.tsx`, `useBusinessActions.ts`, `supabaseCatalogService.ts` | Unit and E2E text assertions |
| A8 | Editor: remove SVG logos; lock the business select after uploads; the unit toggle converts values (P2-06, P2-07, P2-09) | `lib/files.ts`, `ProductEditorForm.tsx` | E2E: toggle 219 cm, which becomes 86.2 in |
| A9 | Scale-check diagnosis: axis swap, uniform factor, tolerance max(5%, 1 cm) (P2-09) | `lib/scale.ts`, `ModelSection.tsx` `ScaleReport` | Unit tests: Damask, ×100, swapped W/D |
| A10 | Report-only CSP (P2-15) | `vercel.json` | Manual check on the preview: no violations in normal flows |
| A11 | ~~Update ADR-0018 (native first; WebXR is beta), design/09 and tasks/P10~~ ADR-0018 withdrawn; docs updated for native-only | docs | — |

## Stage B: compression (after the client confirms its meaning)
| # | Task | Files | Acceptance |
|---|---|---|---|
| B1 | ADR-0019: glTF-Transform for in-browser model optimization (admin-only lazy chunk, MIT, no glTF extensions added) | `System_arch/decisions/` | ADR row added |
| B2 | Compression worker: `dedup`, `prune`, `weld`, `resample`; textures ≤ 2048 px; opaque PNG → JPEG; guards (bounding box ±1 mm, triangle count, material count, keep original if the output is ≥ 95% of the input) | new `src/features/products/editor/modelOptimize.worker.ts` plus a helper | Unit tests on a fixture GLB: smaller output, identical bounding box, no new `extensionsUsed` |
| B3 | Editor UI: show sizes before and after, "Use original" option, progress | `ModelSection.tsx` | E2E (demo mode): upload, and the stored size is shown |
| B4 | Readiness warns about `extensionsRequired` outside Scene Viewer's allowlist | `features/ar/readiness.ts` (parse the GLB JSON chunk) | Unit test |

## Stage C: migration bundle (owner approval of the exact SQL first; `npx supabase migration new`)
| # | Task | Acceptance |
|---|---|---|
| C1 | Publish trigger (at least one gallery image) plus `published_at` set by the server (P2-04). Run the audit query first | Live test: a direct `PATCH` publish without an image is rejected |
| C2 | `admin_add_business_member`: only accept confirmed emails (P1-08) | Live test with an unconfirmed user |
| C3 | Optimistic lock in `save_product` (P2-11) | Live test with two concurrent saves |
| C4 | Revoke `rls_auto_enable` EXECUTE; array length caps; `contact_email` check (P3-06, P3-07) | Advisor warning cleared |
| C5 | `track-event`: client IP from the trusted header, after a header-echo test on staging (P2-05) | Handler test plus a staging test |
| C6 | Owner, in the dashboard: sign-up off, confirmations on, minimum password length 12, leaked-password protection on; align `config.toml` (P1-08) | Screenshot recorded in tasks/P9 |

## Stage D: release (contracted delivery)
1. Vercel project with Git deploys (production uses Supabase, previews use demo) (done: production deploy exists, 2026-10-13), domain, wildcard `*.domain`, SSL (design/20).
2. Run the live integration test against an approved target.
3. Device pass: DEVICE_TEST_MATRIX.md. Fix what it finds (this uses revision round 1 if the client is involved).
4. Remove sample data and sample owner accounts from production (P2-12, P3-15).
5. User guide (non-technical), walkthrough video, handover document (repo, Supabase ownership transfer, where model files live).

## Stage E: physics enhancements (beta WebXR path only)
> **Not planned (2026-10-13):** the WebXR path was removed and the owner chose native viewers only, with no custom physics. E1 was built and then removed with the session. Kept for reference.

| # | Task | Files | Approval |
|---|---|---|---|
| E1 (P-A) | Footprint preview on the reticle and settle-onto-floor; pure `footprint` and `settleY` with tests; reduced-motion aware | `features/ar/placement.ts`, `webxrSession.ts`, `ArSessionOverlay.tsx` | Owner |
| E2 (P-B) | Drag on the floor via transient hit-test; gesture rules in the reducer; amend ADR-0018 | same | **Client** |
| E3 (P-C) | Up to 3 items, product picker, `obbOverlap` warnings (warn, never block) | same, plus the service for the product list | **Client** |
| E4 (P-D) | "Mark wall" step, `wallClearance`, "≈ estimate" label; use `plane-detection` when offered | same | **Client**, experimental |

Every Stage E task needs a Pixel/ARCore device check before it is called done.

## Approvals needed
- **APPROVAL-1 (client):** confirm that "automatic model compression" means size optimization that keeps the model valid for Scene Viewer and Quick Look (no Draco or meshopt), and that USDZ files are uploaded already optimized.
- ~~**APPROVAL-2 (client):** offering a "Precise placement (beta)" in-browser AR option in addition to Scene Viewer on Android.~~ Moot: native-only (owner, 2026-10-13).
- **APPROVAL-3 (client):** variants mean colour/price swatches on one 3D model, and a "specifications" free-form list (in or out).
- **APPROVAL-4 (client):** physics enhancements E2–E4. These are beyond the agreement: quote them as a change request or as goodwill.
- **APPROVAL-5 (owner):** Stage C migrations, the `track-event` redeploy and the live Auth settings.
- **APPROVAL-6 (owner):** keep the `/dashboard` business-owner surface disabled, or get the client to accept it as an addition.

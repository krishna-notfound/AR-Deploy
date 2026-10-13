# Production readiness

**Release gate: NOT READY TO SHIP** (2026-10-13). No real-device AR test (native-only change is unverified on a phone), no staging project yet, no domain, sample data in the production DB, branch work not deployed.

Requirements and their status: [PRD.md](PRD.md). Background and older audits: `System_arch/HANDOFF.md` (authoritative), `System_arch/audit/` (partly stale, see §5).

## 1. Baseline (Phase 0, 2026-10-13)

Commit `048cd01` on `feature/ar-experience-2` (= `main` `8026a37` + handoff doc). Checks run in demo mode so nothing touched production.

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass, 0 errors, 8 warnings (3 set-state-in-effect, 4 a11y, 1 refs-in-render) |
| `npm test` | pass: 106 passed, 13 skipped (live integration tests, need credentials) |
| `npm run build` | pass |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run test:e2e` | not re-run in Phase 0; last recorded 26/26 after the AR revert (HANDOFF) |
| Secret scan (src, scripts, supabase, git history) | no secret or service_role keys found |
| Production deploy | `main` `8026a37` → Vercel project `ar-deploy` (team `track0`), status success. Vercel MCP has no access to the team (403), so env vars can't be inspected from here |

## 2. Live Supabase (`pmnjchhrgvajtjpadpqo`), read-only check 2026-10-13

- Migrations: first 5 applied and identical to the repo; `20261013093006_publish_rules.sql` **not applied**. No drift.
- RLS on all 8 public tables. Anon can read only active businesses, published products and their children. No analytics, members or admins exposed.
- Storage: `business-logos` public (2 MB, png/jpeg/webp), `product-media` private (50 MB). 5 objects, all logos; all product media is external URLs today.
- Edge Function `track-event` ACTIVE v1, `verify_jwt=false` (intended); validates product is published + business active; stores a daily-salted IP hash, not the IP.
- Data: 5 businesses (4 are sample data, 1 real-looking `digital-heroes-buisness` with 0 products, slug typo), 21 products (18 published), ~17k analytics events (mostly seeded), 3 auth users, 1 platform admin.
- Advisors: leaked-password protection OFF; `rls_auto_enable` executable by anon (fixed by the pending migration); 5 multiple-permissive-policy perf warnings (minor).

## 3. Current state

**Works (evidence: live check):** real Supabase data path, RLS hiding drafts, analytics view events reaching the DB, admin business management.

**Works in code, never verified on a device:** product page, 3D viewer, iOS Quick Look, Android AR, fallbacks, PT/EN, in-app notice, QR, uploads, compression (off).

**Broken or incorrect:**
- AR activations counted on every tap; docs claim once per view (R-29).
- Viewer stops reporting load/AR events if the model URL changes while the page is open (SEC-04).
- Signed media URLs expire after 12 h and the refresh hook is never called (SEC-06).

**Still sample/dev:** sample businesses, products, seeded analytics and owner accounts in the production DB; sample GLBs hot-linked from raw.githubusercontent.com; `/demo` route ships (harmless in Supabase mode).

**Production-configured already:** Vercel deploy from `main`, SPA rewrites, security headers, report-only CSP, build guard refusing demo mode or secret keys.

**Needs external access or owner action:** domain + DNS, Supabase Auth dashboard settings, physical iPhone + Android, a staging Supabase project, Vercel env-var access, client decisions A-2/A-3/A-5.

## 4. Findings ranked by severity

No Critical findings. Numbering is stable; later phases append.

| ID | Sev | Finding | Where | Fix (proposed, not applied) | Gate |
|---|---|---|---|---|---|
| SEC-01 | Low now, High if sign-ups open | Owner linking trusts any account with a matching email. Live settings (owner-reported 2026-10-13): sign-ups **disabled**, email confirmation **enabled**, min password 8, so not exploitable today. Becomes real if sign-ups are opened without the claim design | `admin_add_business_member`; Auth settings | Owner-registration and claim design (2026-10-13 proposal); apply O-1 migration | Owner (design approval) |
| SEC-02 | High (release) | No real-device AR test has ever been recorded | `DEVICE_TEST_MATRIX.md` | Phase 1 device session | Owner devices |
| SEC-03 | Medium | `track-event` rate limit keyed on the first `X-Forwarded-For` entry, probably client-settable | `supabase/functions/track-event/handler.ts` | Observe real headers on a staging project, key on the proxy-added value | Staging project (O-3) |
| SEC-04 | Medium | `<model-viewer key={src}>` remounts on URL change, but the listener effect depends only on `[ready]` → no load/error/AR events afterwards; stall timer then shows "timed out" | `src/components/three/ModelViewer.tsx` | Add `src` to the effect deps. Doesn't change AR modes or behaviour | FIXED on branch (not deployed): effect deps `[ready, src]`; unit test fails without the fix |
| SEC-05 | Medium (latent) | Storage read policy exposes any object whose path is referenced by a visible product row; path not tied to the product's business | `20261012192159_storage.sql` | New migration: require `storage_path` to start with `business_id || '/'` | NOT EXPLOITABLE: image/model write policies (`init_schema.sql` 332, 345) require `storage_path` in the product's own business folder; PGlite test proves a cross-business reference is refused. No migration needed |
| SEC-06 | Medium | Signed media URLs (12 h) never refreshed on long-open pages → expired model URL handed to AR | `useRefreshWhenStale` unused (`src/services/hooks.ts`) | Call it from `ProductPage` (after SEC-04) | FIXED on branch (not deployed): `useRefreshWhenStale` wired into ProductPage (refresh after 6 h on tab return) |
| SEC-07 | Medium | Path-mode QR codes encode `window.location.origin`; a QR downloaded on a preview URL or localhost is permanently wrong | `src/lib/urls.ts` | Configured public origin; block QR download on non-production origins | — |
| SEC-08 | Low | AR attempts counted per tap, labelled "activations" | `ProductPage.tsx` | In-flight guard; label "AR attempts" | FIXED on branch (not deployed): one event per launch attempt, 2 s guard; dashboard label rename still open (UI_BACKLOG 11) |
| SEC-09 | Low | One AR failure can show two toasts; WebXR → Scene Viewer fallback may show "failed" while AR still opens (unverified; applies to `main` — this branch has no WebXR) | `ProductPage.tsx` | Single toast source from `ar-status` | Device test |
| SEC-10 | Low | "Start AR" does nothing if storage is blocked and "don't show again" is ticked | `ArTips.tsx` | try/catch around `localStorage.setItem` | FIXED on branch (not deployed): try/catch around `localStorage.setItem` |
| SEC-11 | Low | Upload checks browser-only; any ZIP passes as USDZ; images have no magic-byte check; bucket allows 50 MB for images | `src/lib/files.ts`, storage bucket | Image magic bytes; accept storage doesn't verify contents (bucket is private) | — |
| SEC-12 | Low | Password reset redirect `/reset-password` may be missing from the Auth redirect allowlist; set-password form is shown to any signed-in session | `ResetPasswordPage.tsx`, Auth settings | Add URL to allowlist; enable secure password change | Owner (Auth) |
| SEC-13 | Low | Network error on `getUser()` treated as signed out | `services/supabase/auth.ts` | Distinguish auth vs network errors | — |
| SEC-14 | Low | `www.` / `admin.` / multi-level subdomains get the full app in hostname mode | `src/tenant/resolveTenant.ts` | Redirect `www` to root; 404 multi-level | With domain work |
| SEC-15 | Low | In-app notice only on product page (not the catalog page the QR opens) | `ProductPage.tsx` | Render in `PublicShell` | — |
| SEC-16 | Low | URLs built outside `src/lib/urls.ts`; preview-flag regex mangles query strings | `ShareActions.tsx`, `ArSection.tsx`, `CatalogPage.tsx`, others | Helpers in `urls.ts`; `URLSearchParams.delete` | — |
| SEC-17 | Low | Production build guard only runs when `VERCEL_ENV=production` | `src/services/backendConfig.ts` | Acceptable while Vercel is the only host | — |

## 5. Stale documents (would mislead the client)

These describe the removed custom WebXR session or the old analytics behaviour. `System_arch/HANDOFF.md` overrides them. **2026-10-13:** each now carries a "Superseded in part" banner, with the specific wrong statements struck through and corrected in place.

- `System_arch/audit/DEPLOYMENT_AND_HANDOVER.md`: says AR activations are counted once per page view. **Client-facing.**
- `System_arch/audit/CLIENT_SCOPE_ACCEPTANCE_MATRIX.md`, `IMPLEMENTATION_STATUS.md`, `tasks/P10-ar.md`: same claim, plus "done" rows for the removed session.
- `System_arch/audit/ARCHITECTURE_AND_DATA_FLOW.md`, `AR_COMPATIBILITY_AND_PHYSICS.md`: describe `useArExperience`, `webxrSession.ts`, "Precise placement" (none exist).
- `System_arch/audit/APPROVAL_REQUIRED.md`: A-1 and "already delivered: footprint preview / settle" refer to removed code. O-5 says deployment is open; `main` is live.
- `PRIORITIZED_ISSUES.md`, `IMPLEMENTATION_PLAN.md`, `UI_BACKLOG.md`: point at removed files.
- UI text "within 5%" vs code tolerance "5% or 1 cm" (`en.ts` vs `src/lib/scale.ts`).

## 6. Recommended sequence

| Phase | Work | Needs |
|---|---|---|
| 0.5 | Mark stale docs superseded; owner confirms Auth settings (SEC-01) | Owner: 5 min in Supabase dashboard |
| 1 | Small AR reliability fixes (SEC-04, 06, 08, 10, 15), no change to AR modes or scale; then a recorded device session | Owner's iPhone + Android phone |
| 2 | Staging Supabase project; live integration test (O-7); header test (SEC-03); apply O-1 + SEC-05 migrations to staging, then production with approval | Owner approval to create a free project + apply migrations |
| 3 | Test domain on the existing Vercel project, wildcard subdomains, SSL, `VITE_ROOT_DOMAIN`, QR origin (SEC-07, SEC-14) | Domain + DNS access |
| 4 | Compression decision (A-2) and optimized-model device check | Client decision |
| 5–7 | Security headers (enforce CSP), performance measurements, analytics reconciliation | — |
| 8–10 | Full test matrix, release plan, handover docs + user guide, sample-data removal (O-4) | Owner approval per step |

## 6b. Phase C/D results (2026-10-13, branch `chore/production-readiness`, local only)

| Check | Result | Kind |
|---|---|---|
| typecheck, lint (0 errors), build | pass | automated |
| `npm test` (unit + component + PGlite DB) | 118 passed, 13 skipped (live tests) | automated |
| PGlite DB suite | 22/22, incl. 10 new: draft registration, claim links (admin-only, hashed, single-use, expiring, replaced), no ownership by email match, cross-business storage/analytics/member isolation | automated, disposable Postgres |
| E2E (Playwright, demo mode) | 27/27; Scene Viewer intent at fixed scale on a **simulated** Android UA; no WebXR even when offered; one launch per double tap | automated, emulated browser |
| Live integration (staging) | written, **not run**: no staging project yet | BLOCKED |
| Real-device AR (iOS Quick Look, Android Scene Viewer) | not run | BLOCKED (no devices) |
| Vercel Preview isolation | not checked (no Vercel access) | BLOCKED (owner) |

## 7. Change log

| Date | Phase | Change |
|---|---|---|
| 2026-10-13 | C/D | AR native-only (ADR-0021), SEC-04/06/08/10 fixed, SEC-05 shown not exploitable, owner registration + claim links (ADR-0022, migration not applied), stale docs corrected, staging runbook. Local commits only
| 2026-10-13 | 0 | Owner reported live Auth settings; SEC-01 downgraded. Owner self-registration requested (scope change, see PRD X-01)
| 2026-10-13 | 0 | Baseline, live read-only audit, PRD and this file created. No code, schema or config changed |

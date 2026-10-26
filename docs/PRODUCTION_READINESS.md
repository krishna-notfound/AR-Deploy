# Production readiness

**Release gate: NOT READY TO SHIP** (updated 2026-10-20). Everything below is merged and live on `main` (`3ada1b9`, 2026-10-14), including native-only AR. Remaining: the client's acceptance test on their own devices; the client's Supabase Pro (obtained 2026-10-20, to be set up as staging and production per `OPERATIONS_RUNBOOK.md`); domain and SSL; custom SMTP; sample-data removal; client answers in `PRD.md`. Wherever this file says "on branch" or "not deployed", the change is now live.

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
| E2E (Playwright, demo mode) | 27/27 (latest full run after review fixes; one earlier run had 1 flaky failure, see 6c); Scene Viewer intent at fixed scale on a **simulated** Android UA; no WebXR even when offered; one launch per double tap | automated, emulated browser |
| Live integration (staging) | written, **not run**: no staging project yet | BLOCKED |
| Real-device AR (iOS Quick Look, Android Scene Viewer) | not run | BLOCKED (no devices) |
| Vercel Preview isolation | not checked (no Vercel access) | BLOCKED (owner) |

## 6c. Contract review fixes (2026-10-13, local only)

Fixed (smallest change each, tests added where logic changed):
- Route error page instead of React Router's raw error; reload once when an old build's page chunk is gone after a deploy (`vite:preloadError`); `vercel.json` no longer rewrites missing `/assets/*` to `index.html`.
- Slug fields accept hyphens while typing (`slugInput`).
- Platform/business analytics page past the API's 1000-row cap.
- Claim flow: pending link survives the email-confirmation tab (localStorage, 7 days); full reload into the dashboard after claim/registration; account opens its newest business.
- Registration form checks reserved addresses; `register_business` serialised per account (advisory lock) so parallel calls can't create two drafts.
- Portuguese-only material/description now shown; long contact emails/URLs wrap at 360 px.
- In-app browser notice on the catalog page too (QR landing); share links keep `?lang=` when dropping `?preview=`; AR metric labelled "AR launch attempts"; scale copy says "5% or 1 cm"; network errors no longer look like "signed out"; QR panel warns on preview/local addresses (SEC-07).

Known, not fixed (Low):
- Flaky E2E: `accounts-persistence.spec.ts` "corrupt stored data is reset safely" (demo mode only) failed once in a full run, then passed alone (4/4) and in the next full run (27/27). Watch it; not related to the changes above.
- Some public UI strings are English-only: "Try again", "Close dialog", photo button labels, raw service error text.
- Negative or invalid variant price differences are dropped silently.
- The catalog card shows the base price; the product page opens on the first variant's price.
- Product slugs of 66–70+ characters aren't length-checked in the editor (the DB rejects them with a generic message).
- The analytics table shows "no products" if only the product list fails to load.
- Image uploads are checked by type/extension, not magic bytes (private bucket; logos bucket enforces MIME).

## 6d. Live project work (2026-10-13, owner-approved steps A–D)

| Step | Result |
|---|---|
| A | Linked ref re-checked (`pmnjchhrgvajtjpadpqo`); dry run listed only the 2 approved migrations; `supabase db push` applied `20261013093006_publish_rules` and `20261013144121_owner_registration_and_claims`; history 7/7. New functions executable by `authenticated` only (anon gets 42501); `private.business_claims` RLS on, unreadable by API roles; 18 published products / 4 active businesses unchanged; anon catalog read 200. Advisors: no errors; expected WARNs (admin-checked SECURITY DEFINER RPCs), leaked-password protection off. `rls_auto_enable` warning gone |
| B | 4 QA users created via the Auth admin API (auto-confirmed, random in-memory password never printed or stored); `qa-admin` added to `platform_admins` (service role, not a client field) |
| C | Live suite 15 passed / 0 failed / 0 skipped |
| D | Each QA user id re-checked against its email, then deleted. After: 0 QA users, 3 users, 1 platform admin, 2 owner links, 5 businesses, 18 published products (same as before). No QA businesses, products, files, analytics, claims or memberships left |

Left alone (ambiguous, not from the test run): one logo file `business-logos/new/9407d3a5-….png` uploaded 2026-10-13 12:25 UTC from the "new business" form and never attached.

## 6e. Sample data in production (identified, NOT deleted)

| Business | Evidence it is sample data | Rows |
|---|---|---|
| `casa-lisboa`, `nordhaus`, `atelier-verde`, `oak-ember` | Demo seed names; backdated `created_at`; Unsplash photos; GitHub-hosted models; owners `@furnish.example` | 21 products, ~17,000 seeded analytics events, 4 logo files, 2 `@furnish.example` owner accounts |
| `digital-heroes-buisness` | Created 2026-10-13, 0 products, no owner, slug typo: **not** classified, owner to decide | — |

Deleting needs the owner's separate approval: delete the 4 businesses (products, images, models, variants, analytics and memberships cascade), their logo files via the Storage API, and the 2 `@furnish.example` auth users. Only after the real catalog is ready (the live demo uses them today).

## 8. Production release checklist

| # | Item | Status |
|---|---|---|
| 1 | Preview validation of this branch on a safe environment | BLOCKED: Preview shares the live database (see below) |
| 2 | No unresolved Critical/High security findings | OK (none open; SEC list above) |
| 3 | Rollback verified | OK: `supabase/rollback/20261013_publish_rules_and_claims_rollback.sql` (PGlite-tested); app rollback = Vercel "Promote" previous deployment / revert merge |
| 4 | QA accounts and test data cleaned | OK (6d) |
| 5 | Real-device AR: Android Scene Viewer + iOS Quick Look, true size | BLOCKED: no devices |
| 6 | Merge `chore/production-readiness` → `main` (deploys production) | Needs separate approval, after 1 and 5 |
| 7 | Production Auth: min password 12, leaked-password protection (if plan allows), sign-ups stay off | Needs separate approval |
| 8 | Sample data removal (6e) | Needs separate approval, after real catalog exists |
| 9 | Client domain, wildcard subdomains, SSL, `VITE_ROOT_DOMAIN` | BLOCKED: client domain |
| 10 | Compression switched on | DONE: owner decision 2026-10-26 (ADR-0038); on by default, device check of a heavy optimized model still listed in TEST_PLAN |
| 11 | Variants/materials meaning confirmed | BLOCKED: client decision (A-3, see PRD) |
| 12 | Handover docs + walkthrough video | docs in progress; video owner action |

**Why Preview is blocked:** Vercel Preview and Production share one value each for `VITE_DATA_MODE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Pushing the branch triggers a Preview build that reads and writes the live database (page views count as real analytics). A second free Supabase project is not possible while two are active (`pmnjchhrgvajtjpadpqo` and `bothonopxtznzviieoic`). Options: (a) add Preview-only `VITE_DATA_MODE=demo` and empty Supabase values (Preview then runs on built-in sample data; enough to device-test AR, safe for the live database), (b) pause/delete `bothonopxtznzviieoic` and create a staging project, (c) accept Preview on the live database.

## 6f. Client-review completion pass (2026-10-13, local only)

- Onboarding: step 1 display name (optional, Auth metadata, survives refresh), step 2 register a draft business or finish a claim. Sign-up handles projects without email confirmation (session returned → onboarding).
- Public pages: retry/close/photo labels and error messages localized (EN/PT); catalog card price = price the product page opens with.
- Editor: variant price differences validated (inline error, save blocked); product slug ≤ 70 enforced; duplicate-slug trimming fixed in both modes.
- Analytics view: loading and error state for the product list.
- Not re-run on the live database after this pass (needs new QA users, steps B–D); covered by PGlite + unit + E2E. Re-run the live suite before merging.

Local infrastructure: Docker is not installed, so `supabase start` (local Supabase) is unavailable; database behaviour is tested in PGlite (real Postgres, Supabase auth/storage stubbed), which cannot test Auth emails, Storage file serving or the Edge Function.

## 6g. Client preview deployment (2026-10-14, owner-approved)

- Branch `chore/production-readiness` pushed to GitHub (`677ad00`); Vercel built a **Preview** (READY): `ar-deploy-git-chore-production-readiness-track0.vercel.app` (branch alias) / `ar-deploy-4s0as2pew-track0.vercel.app` (deployment). Production unchanged (`main` `8026a37`, `ar-deploy-sage.vercel.app`).
- **Not isolated:** Preview uses the same `VITE_*` values as Production, so it reads and writes the live Supabase project `pmnjchhrgvajtjpadpqo` (verified: the public production bundle calls only that project, contains only the publishable key, no secret patterns).
- **Access:** preview URLs are behind Vercel Authentication (`ssoProtection: all_except_custom_domains`, HTTP 302 to Vercel login). The client needs a Vercel share link, or the owner disables Vercel Authentication for previews.
- Checks before deploy: typecheck, lint, build, 128 unit/DB tests (15 live skipped), 27/27 E2E (demo mode).
- Not yet verified on the preview: page rendering, sign-up, onboarding, uploads (no access + no approved test writes).

## 7. Change log

| Date | Phase | Change |
|---|---|---|
| 2026-10-26 | S1.5 | Business-logic fixes built on the branch (ADR-0033, migration `20261026041731`, 18 tasks). **Not applied** to `zggylkbgajamhriebdrg`: release needs the owner's go-ahead and the read-only pre-flight (role sets that will be widened, Postgres 15 or later, team email drift, invitation attempt maxima). Release order, live checks and rollback (loses analytics rows kept for deleted products): `docs/OPERATIONS_RUNBOOK.md` and `docs/TEST_PLAN.md`. Gate items before launch: set `EMBED_VIEWS_SINCE` to the apply date, subscribe the Resend webhook to `email.suppressed`, run the two-connection live checks |
| 2026-10-13 | review pass | Onboarding display name, public i18n, variant/slug validation, analytics states; decisions recorded (no directory, admin approval kept, no date ranges)
| 2026-10-13 | live A–D | Migrations applied to `pmnjchhrgvajtjpadpqo`, live suite 15/15, QA cleanup verified, sample data identified, release checklist, test plan
| 2026-10-13 | C/D | AR native-only (ADR-0021), SEC-04/06/08/10 fixed, SEC-05 shown not exploitable, owner registration + claim links (ADR-0022, migration not applied), stale docs corrected, staging runbook. Local commits only
| 2026-10-13 | 0 | Owner reported live Auth settings; SEC-01 downgraded. Owner self-registration requested (scope change, see PRD X-01)
| 2026-10-13 | 0 | Baseline, live read-only audit, PRD and this file created. No code, schema or config changed |

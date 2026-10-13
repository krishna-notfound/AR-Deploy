# Handoff: read this first in a new session (2026-10-13)

## Where things stand
- **Production-readiness programme (started 2026-10-13):** status, findings (SEC-xx) and release gate in `docs/PRODUCTION_READINESS.md`; requirements (R-xx) in `docs/PRD.md`. Branch `chore/production-readiness`.
- **Live:** Vercel project `ar-deploy` (team `track0`), auto-deployed from `main` on GitHub `krishna-notfound/AR-Deploy`. `main` is at `8026a37`.
  - **Use the production URL from the Vercel dashboard.** `ar-deploy.vercel.app` is someone else's site. `ar-deploy-track0.vercel.app` is the team alias and sits behind Vercel login.
  - The owner deploys through their existing project. **Never create another Vercel project or domain.**
- **Working branch:** `feature/ar-experience-2`, at the same commit as `main`.
- **Data:** Supabase project `pmnjchhrgvajtjpadpqo`.
  - All 7 migrations are live (the last two, `20261013093006_publish_rules` and `20261013144121_owner_registration_and_claims`, applied 2026-10-13 with owner approval; rollback in `supabase/rollback/`). Live API suite 15/15 the same day.
  - No separate staging project: the owner chose to test on this project, one approved step at a time (`docs/OPERATIONS_RUNBOOK.md`). The repo is linked to it (`supabase/.temp/project-ref`).
  - The Edge Function `track-event` is live.
  - 18 sample products and sample owner accounts are live (`audit/APPROVAL_REQUIRED.md` O-4).
- **Commits:** author `krishna <krishnagtkr@gmail.com>`, **no Claude co-author line**. Push to `main` only when the owner asks; each push deploys to production.

## AR: what is live and why (most important)
**Branch `chore/production-readiness` (NOT yet deployed): native viewers only.** Owner decision 2026-10-13 (commit c201d91):
- `ModelViewer.tsx`: `ar-modes="scene-viewer quick-look"`, `ar-scale="fixed"`, `ar-placement="floor"`. Android = Google Scene Viewer (intent `mode=ar_preferred`, so 3D fallback without ARCore; `resizable=false`, true size). iOS/iPadOS = Quick Look. Desktop/unsupported = interactive 3D viewer plus "view on a phone" hand-off (link + QR). No WebXR, no custom AR session, no custom physics.
- E2E 27/27 on this branch, including a simulated-Android Scene Viewer intent test (simulated user agent, not a real phone).
- The owner said informally that AR worked on their phone (details pending): **owner-reported, not verified.**
- **Risk:** the earlier "Scene Viewer first" attempt (8f1ee02, below) failed on the owner's phone, cause undiagnosed. **This change MUST get a real-device check (ARCore Android + iPhone) before any push to `main`.**

**Production (`main`, still live) = the original model-viewer flow**, byte-identical to commit `a6bc75b` on the product page:
- `src/components/three/ModelViewer.tsx`: `ar-modes="webxr scene-viewer quick-look"`, `ar-scale="fixed"`, `ar-placement="floor"`.
- The product page's "View in my home" opens the AR tips, then `activateAR()`.
- Android Chrome on ARCore phones: model-viewer's own in-browser WebXR. Scene Viewer as its fallback. iPhone: Quick Look.
- **The owner confirmed this flow works** and it was shown to the client. (Superseded on the branch by the native-only decision above.)

**Tried and rolled back (do not repeat without a device test first):**
1. **Custom WebXR session** (98c7545, three.js; removed in f171db3). It made AR **laggy**, for these reasons (from the code):
   - it downloaded and parsed the GLB a second time at launch;
   - it ran a second WebGL renderer next to model-viewer's;
   - it was chosen on every Android 7+ phone, because Chrome reports `immersive-ar` without checking ARCore.

   The code is in git history (98c7545 to c753f6a) if ever needed. ADR-0018 is withdrawn.
2. **Scene Viewer first** (`ar-modes="scene-viewer webxr quick-look"`, commit 8f1ee02, reverted in 8026a37). On the owner's phone **the Google AR app did not open; AR started in the browser instead.** Cause **not diagnosed**. Hypotheses to check *on the device* before trying again:
   - the old JS was cached (deploy had just finished);
   - the Google app is missing or disabled, so model-viewer falls back to WebXR;
   - a Chrome intent restriction.

   Ask for phone model, Chrome version, whether the Google app is installed, and a screen recording.

**Owner's AR wishes (pending, keep it light):**
- smoother and more realistic AR, "light physics", environment adaptation, true size;
- **no custom engine, no heavy code, no new buttons, keep the old flow**;
- **declined:** real-room lighting estimation (`xr-environment`);
- **constraint:** furniture must stay at true size (contract), so no auto-resizing to fit the room;
- the native viewers (Quick Look, Scene Viewer) already supply floor detection, shadows, smoothing and lighting. Any change must be one small model-viewer attribute, tested on the owner's phone **before** pushing to `main`.

**Analytics meaning:** `view` = once per page load; `model_interaction` = first rotate/zoom per page view; `ar_activation` = one per AR launch attempt (taps within 2 s of a launch ignored). It means "tried to open AR", not "AR opened" or "furniture placed", and it is **not** once per page view. Use the wording "AR launch attempts".

## Other work done this session (on `main`, live)
- Production build guard (`src/services/backendConfig.ts`): refuses demo mode, missing or non-https config, and secret keys.
- Safe DB error messages; logo cleanup limited to the business's own folder; signed media URLs last 12 h (`MEDIA_URL_TTL_SECONDS`).
- Editor:
  - scale-mismatch diagnosis;
  - Scene Viewer extension warning;
  - business locked once files are uploaded;
  - honest publish message for inactive catalogs;
  - model optimization built but **off** (`VITE_MODEL_OPTIMIZATION`, ADR-0019, client sign-off pending).
- Admin "AR readiness" panel (`src/features/ar/readiness.ts`): admin-only, kept.
- Product list search race fixed (`ProductFilters.tsx`).
- Report-only CSP in `vercel.json`.
- Tests:
  - PGlite migration and RLS tests (`supabase/tests/`, ADR-0020);
  - E2E checks that AR launches through model-viewer with one GLB download;
  - Playwright test budget 90 s (sample models load from raw.githubusercontent.com).
- Last full run: typecheck and lint pass; vitest 106 passed, 13 skipped (live tests); E2E 27/27 at 8f1ee02. After the revert, the E2E count on `main` is 26: the Android Scene Viewer test was reverted too. On `chore/production-readiness` it is 27/27 again (simulated-Android Scene Viewer intent test restored).

**Older audit docs described the removed custom session** as "done" and AR activations as "once per page view". They now carry a "Superseded in part (2026-10-13)" banner with in-place corrections (`audit/*`, `tasks/P10-ar.md`). **This file overrides them.**

## Open items (exact steps in `System_arch/audit/APPROVAL_REQUIRED.md`)
- **O-1:** apply the publish-rules migration (owner approval).
- **O-2:** Auth settings: sign-ups off, confirmations on, minimum password 12.
- **O-3:** analytics client-IP fix (needs a staging header test).
- **O-4:** remove sample data before the real handover.
- **O-6:** enforce the CSP after a live check.
- **O-7:** live integration test.
- **Client decisions:**
  - A-2: what "compression" means;
  - A-3: variants and specs;
  - A-4: extra physics features (out of scope);
  - A-5: the `/dashboard` owner surface is out of contract.
- **Real-device testing:** never done. See `audit/DEVICE_TEST_MATRIX.md`.
- **UI phase:** `audit/UI_BACKLOG.md`.

## Gotchas
- **Never run `npx vite`/`npm run dev` without demo env.** `.env.local` is Supabase mode, so pages write real analytics. One `view` event on `sheen-lounge-chair` was written by accident on 2026-10-13 at 09:50 UTC.
  - Safe: `VITE_DATA_MODE=demo VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= npx vite`.
  - Playwright forces demo mode, but reuses any server already on :5199. Stop stray servers by port (no `pkill` in Git Bash; use PowerShell `Get-NetTCPConnection`).
- **Git Bash heredocs** with `’` or `…` can fail: write a Python script with the Write tool and run it.
- **No `gh` CLI.** Deploy status: `curl https://api.github.com/repos/krishna-notfound/AR-Deploy/commits/<sha>/status`.
- **Vercel MCP** has no access to team `track0` (403).

# Handoff: read this first in a new session (updated 2026-10-29)

## Live state (checked 2026-10-27; re-check before relying on it, see CLAUDE.md "Facts and live state")
- **Site:** `main` is the live branch (owner, 2026-10-27). Vercel Production (`ar-deploy`, team `track0`) builds `main` and serves `sanctus.warpkit.online` (domain moved from the feature branch to Production on 2026-10-27), `builtbykrishna.dev`, `*.builtbykrishna.dev`, `www.builtbykrishna.dev` and `ar-deploy-sage.vercel.app`. Production env vars point at `zggylkbgajamhriebdrg` (set by the owner 2026-10-27, redeployed, checked in the built code). How to check which database a build uses: grep its JS chunks for `https://<ref>.supabase.co`; which deployment a domain serves: `npx vercel api "/v13/deployments/<domain>?teamId=track0"`. Hosting moves to the client's Vercel later.
- **Supabase `zggylkbgajamhriebdrg`:** all 19 migrations applied; 13 Edge Functions active. **2026-10-29 (owner's go-ahead):** migration `20261029074648_site_content.sql` applied (Editor tables and RPCs, `content.manage`, nullable country/city/category, answers up to 65,536 bytes) and `submit-application` redeployed (v9, validates the published form builder). Checked live: the public chrome read returns `{content: null, version: 0}` (nothing published yet); anon is refused on `admin_get_site_content` and on the `site_content` table; the function answers. `database.types.ts` regenerated from the live schema. `invite-member` redeployed the same day (v5, owner's go-ahead) so invitation emails list "Edit website content". **Live 2026-10-29:** `main` fast-forwarded to `179b4c3` (Content Editor, form builder, PT/EN everywhere); Vercel Production READY on `sanctus.warpkit.online`; checked in a browser: footer Terms link on the landing, `/terms` renders, the login PT switch turns the page Portuguese (`lang=pt-PT`, "Entrar"), no page errors. Nothing is published in the Editor yet, so public text is unchanged. `invite-member` redeployed 2026-10-26 19:43 UTC (v4, owner's go-ahead) so team invitation emails list "Handle 3D model requests"; the other functions deployed before the later `_shared` changes behave the same (refactor/type-only differences).
- **Not checkable from here:** Auth Site URL and redirect URLs. The only record is a 2026-10-20 QA note that the Site URL was the default `http://localhost:3000/`; it may have been fixed. Ask the owner before stating it either way. Same for the `APP_BASE_URL` secret's value (it is set) and Vercel env vars.
- **Testing environment (owner, 2026-10-29, ADR-0042):** the current site and `zggylkbgajamhriebdrg` are the testing setup with test data; production is set up fresh at go-live, and only with the client's explicit approval. Test writes are fine; wipes, resets, migrations and function deploys need the owner's go-ahead.
- **Test content:** catalog `idk` (products `idkidk` Astronaut, `chair` 17.5 MB Tripo chair).


## Content Editor and bilingual dashboards (2026-10-29, branch `feature/sanctus-brand-design-system`; NOT applied, NOT deployed)
- **What was built:** the website Editor at `/admin/editor` (ADR-0043): Terms and Privacy text in EN and PT, extra info pages with "Show in footer", the application form builder (move, hide or make optional the fields, up to 10 extra questions, every `apply.*` text), social links, Preview of the draft, Publish with history and Restore. New permission `content.manage` (17th; Owner and Admin, not Team). Also the whole dashboard, settings and sign-in screens in EN and PT-PT with one language switch on every screen (ADR-0044). Spec `docs/superpowers/specs/2026-10-29-content-editor-and-bilingual-dashboards-design.md`, plan next to it in `plans/`.
- **Waiting for the owner's go-ahead (checked in the repo 2026-10-29, nothing applied from here):**
  1. Migration `supabase/migrations/20261029074648_site_content.sql` (tables `site_content`, `site_content_versions`, their functions, the 17th permission, nullable `country`/`city`/`category` and a 64 KB answers limit on `business_applications`). Rollback: `supabase/rollback/20261029_site_content_rollback.sql`. Steps: `docs/OPERATIONS_RUNBOOK.md` "Content Editor".
  2. Redeploy of the Edge Function `submit-application` (reads the published form, enforces required questions and hidden fields; 503 `config_unavailable` when the form cannot be read).
  Order: migration, then `npm run db:types`, then the function, and only then may anyone publish an application form change. Until both are done, publish only Terms, Privacy, pages and social links. ADR-0042 applies: no wipe, reset, migration or function deploy without the owner's go-ahead.
- **Live site today:** has no Editor and no PT dashboards. `main` is untouched (push only when the owner asks).
- **Demo mode:** the Editor works fully (mock service, same validator). Playwright flows: `tests/e2e/content-editor.spec.ts` (desktop) and `content-editor.mobile.spec.ts` (Pixel 7), shared in `tests/e2e/editorFlows.ts`.
- **Gotchas:** the language is remembered per origin in `localStorage` `arfurn:lang` (the platform domain and each business subdomain separately). A Portuguese browser now opens the dashboards in Portuguese until the switch is used. `ServiceError.message` stays English for logs; the UI shows `errorText(error)`. A visit to `/apply` resumes the step saved in the tab, so tests and links should name `?step=`.

## Business-logic fixes, S1.5 (2026-10-26, same branch; migration `20261026041731` applied to `zggylkbgajamhriebdrg`, checked 2026-10-27)
- Fixes from the 2026-10-26 audit (ADR-0033): permission prerequisites, 2FA before permission on the Edge Functions, history that survives a deleted business, embed views and deleted-product analytics, team removal and email sync, email status integrity, and the application and owner-invitation fixes that came back when S3 was cancelled. Spec `docs/superpowers/specs/2026-10-26-business-logic-fixes-design.md`, plan `docs/superpowers/plans/2026-10-26-business-logic-fixes.md`.
- One migration `supabase/migrations/20261026041731_business_logic_fixes.sql` and one rollback `supabase/rollback/20261026_business_logic_fixes_rollback.sql`. New functions: `review-application` and `notify-business-owner` (`verify_jwt = true`).
- **Before applying:** the owner's go-ahead, then the read-only pre-flight in `docs/OPERATIONS_RUNBOOK.md` ("Business-logic fixes (S1.5)"). It shows the role sets the backfill will widen, checks Postgres is 15 or later, and lists team rows whose email differs from the login. Set `EMBED_VIEWS_SINCE` (`src/services/analytics.ts`) to the apply date, and subscribe the Resend webhook to `email.suppressed`.
- Order: migration, `db:types`, functions, frontend to the Preview, production only when the owner asks. Never `config push`. Live checks: `docs/TEST_PLAN.md` ("S1.5 live checks"), including the two-connection ones the test database cannot prove.
- Rollback loses the analytics rows kept for deleted products (the script header and the runbook say so).
- Still to land when this was written: Task 13 (account-security notices, closure attribution), Task 14 (demo parity) and the Task 15 Playwright journeys. Address history and redirects, the stale product save and the Email log page moved to S2 and S4 (`System_arch/tasks/P12-team-roles-and-addons.md`).

## Account settings and 2FA, S1 (2026-10-26)
- Settings hub at `/admin/settings/:section` and `/dashboard/settings/:section`, authenticator 2FA with recovery codes, emailed codes for risky actions, the Owner's 2FA policy and closure requests (ADR-0032).
- **2FA is enforced in the database access helpers**, not only in the app (`SecurityGate` is UX).
- **Applied to `zggylkbgajamhriebdrg` on 2026-10-26** and checked live (`docs/PROJECT_COMPLETION_STATUS.md`). Release order, dashboard settings, lockout recovery and rollback: `docs/OPERATIONS_RUNBOOK.md` ("Account settings and 2FA (S1)").
- `ADMIN_NOTIFICATION_EMAIL` is a Resend test address, so closure alerts reach no one until it is set to a real inbox.

## Platform team roles (2026-10-25, branch `feature/sanctus-brand-design-system`)
- **Roles:** Owner (`platform_admins`), Admin and Team (`platform_members`).
- **Permissions:** 15 per role, enforced by additive RLS through `public.platform_can()`.
- **Invitations:** link invitations to `/join`; only the SHA-256 of the secret is stored.
- **References:** spec `docs/superpowers/specs/2026-10-25-platform-team-rbac-design.md`, plan `docs/superpowers/plans/2026-10-25-platform-team-rbac.md`, ADR-0029, ADR-0030.
- **Applied to `zggylkbgajamhriebdrg` on 2026-10-25 and checked live.** The deploy steps are in `docs/OPERATIONS_RUNBOOK.md` ("Platform team roles"), and the rollback is `supabase/rollback/20261025_platform_team_roles_rollback.sql`.
- **Before the migration:** sign-in falls back to `platform_admins`, and Team & Access says it isn't switched on.
- **Demo mode:** `/demo` has "Continue as Admin (sample)" and "Continue as Team (sample)"; the sample invitation link is `/join#t=demo-invite-token`.
- **Next:** A1 is built (see below). Then the owner's business-logic pass, then add-ons A3 and A2 (`System_arch/tasks/P12-team-roles-and-addons.md`).

## Dashboard type (ADR-0031, 2026-10-25, same branch)
- **Where the dashboard look applies:** inside `DashboardShell`, and only there. The shell root and `<body>` (for portals) carry `data-surface="dashboard"`, which sets Inter (`--font-ui`) and the `--text-ui-*` sizes.
- **Shared components:** they branch on `useInDashboard()`. Outside the shell they render exactly the classes they used to.
- **Guards:**
  - `tests/visual/guard.spec.ts` (Playwright project `guard`) compares 7 owner-designed pages at 1440 and 390 with `maxDiffPixels: 0`;
  - `tests/e2e/a11y-dashboard.spec.ts` checks that dashboard pages have no text under 12px, no uppercase and no horizontal scroll at 390.
- **Design review:** `node scripts/design-review.mjs --port <dev port>` screenshots every dashboard page on the configured backend, read-only. `python scripts/design-sheet.py` pairs each screenshot with its Stitch screen in `design/review/pairs/` (git-ignored).
- **Gotcha:** `cn()` has no tailwind-merge. To override a component class from a caller, use the Tailwind 4 important suffix (`size-8!`).

## Next session: start here (2026-10-20)
1. **The client now has Supabase Pro.** Next job: set up their **staging** and **production** projects. Follow `docs/OPERATIONS_RUNBOOK.md` ("Separate staging project", then "Deploying"). First ask the owner for the project refs and to be invited. Never reuse `pmnjchhrgvajtjpadpqo` (previous demo) or `bothonopxtznzviieoic` (Shringaar) for this.
2. **Uncommitted changes on `main`:** doc and index edits from 2026-10-20, plus 6 project skills removed from `.claude/skills/`. Before committing, ask the owner which commit email to use: the personal Gmail must stay private and the repo is public (memory `commit-identity`).
3. **Client proposal:** the finished files are on the owner's Desktop (`AR Furniture - Proposal and User Guide …`). Source and rebuild steps: `~/Documents/AR-Furniture-Proposal-source/README.md`.
4. **Context clean-up done 2026-10-20:**
   - ponytail and taste-skill plugins disabled in `.claude/settings.json`;
   - 6 irrelevant skills moved out (write-swift, animate-expo, animation-vocabulary, find-animation-opportunities, improve-animations, apple-design);
   - Resend MCP removed.

   Everything is backed up in `~/.claude/backups/2026-10-20-kb-audit/`. To restore, copy back, or re-add Resend with `claude mcp add --transport http resend https://mcp.resend.com/mcp`.

## Where things stand
- **Production-readiness programme (started 2026-10-13):** status, findings (SEC-xx) and release gate in `docs/PRODUCTION_READINESS.md`; requirements (R-xx) in `docs/PRD.md`. Find any other doc through `System_arch/README.md`.
- **Live:** Vercel project `ar-deploy` (team `track0`), auto-deployed from `main` on GitHub `krishna-notfound/AR-Deploy` (public repo). `main` is at `3ada1b9` (2026-10-14); production URL `ar-deploy-sage.vercel.app`.
  - **Use the production URL from the Vercel dashboard.** `ar-deploy.vercel.app` is someone else's site. `ar-deploy-track0.vercel.app` is the team alias and sits behind Vercel login.
  - The owner deploys through their existing project. **Never create another Vercel project or domain.**
- **Branches:** `main` is the GitHub default and base branch (set by the owner 2026-10-14). Do feature work on short-lived branches cut from `main`. `chore/production-readiness` and `feature/design-supabase-foundation` still exist on GitHub, identical to `main`.
- **Data:** Supabase project `pmnjchhrgvajtjpadpqo`.
  - All 7 migrations are live (the last two, `20261013093006_publish_rules` and `20261013144121_owner_registration_and_claims`, applied 2026-10-13 with owner approval; rollback in `supabase/rollback/`). Live API suite 15/15 the same day.
  - No separate staging project: the owner chose to test on this project, one approved step at a time (`docs/OPERATIONS_RUNBOOK.md`). The repo is linked to it (`supabase/.temp/project-ref`).
  - The Edge Function `track-event` is live.
  - 18 sample products and sample owner accounts are live (`docs/PRODUCTION_READINESS.md`, sample-data section).
  - Accounts: the owner's platform admin is `admin@furnish.example` (renamed from a personal email). Client demo logins, with passwords printed in the client proposal: `demo.admin@furnish.example`, `owner.nordhaus@furnish.example`, `owner.casa@furnish.example`. Rotate them after the review.
  - Auth: production sign-ups are ON with email confirmation required. There is no custom SMTP, so outside users can't confirm.
  - Never touch Supabase project `bothonopxtznzviieoic`: it is the live Shringaar app (local backup in the owner's Backups folder).
- **Commits:** author `krishna` (local git identity; do not publish personal emails), **no Claude co-author line**. Push to `main` only when the owner asks; each push deploys to production.

## AR: what is live and why (most important)
**LIVE on `main` since 2026-10-14: native viewers only.** Owner decision 2026-10-13 (ADR-0021, commit c201d91), confirmed again on 2026-10-20 ("native only, no WebXR"):
- `ModelViewer.tsx`: `ar-modes="scene-viewer quick-look"`, `ar-scale="fixed"`, `ar-placement="floor"`. Android = Google Scene Viewer (intent `mode=ar_preferred`, so 3D fallback without ARCore; `resizable=false`, true size). iOS/iPadOS = Quick Look. Desktop/unsupported = interactive 3D viewer plus "view on a phone" hand-off (link + QR). No WebXR, no custom AR session, no custom physics.
- E2E 27/27 on this branch, including a simulated-Android Scene Viewer intent test (simulated user agent, not a real phone).
- The owner said informally that AR worked on their phone (details pending): **owner-reported, not verified.**
- **Risk:** the earlier "Scene Viewer first" attempt (8f1ee02, below) failed on the owner's phone, cause undiagnosed. **This change MUST get a real-device check (ARCore Android + iPhone) before any push to `main`.**

**Before 2026-10-14, production (`8026a37`) ran the original model-viewer flow**, byte-identical to commit `a6bc75b`. This is history, not live:
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

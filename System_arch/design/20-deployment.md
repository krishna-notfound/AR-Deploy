# 20 · Deployment: Vercel + Supabase

> **Live setup (ADR-0040, 2026-10-27):** `main` is the live branch; Vercel Production serves `sanctus.warpkit.online`, `builtbykrishna.dev` and `ar-deploy-sage.vercel.app` on the client database `zggylkbgajamhriebdrg`, which is the testing environment (ADR-0042; production is set up fresh at go-live). Sections below that describe a different split are history.
Architecture: static Vite SPA on Vercel, with Supabase Postgres, Auth and Storage (with RLS). No custom server. Database setup is in design/19.

## Vercel project settings
`vercel.json` (committed) sets:
- framework `vite`, build `npm run build`, output `dist`
- an SPA rewrite to `/index.html` (static files take precedence)
- immutable caching for `/assets/*`
- headers: `nosniff`, `strict-origin-when-cross-origin`, and `Permissions-Policy` that allows camera and XR for AR on every path; `frame-ancestors 'none'` on every path except `/embed/*`, which gets `frame-ancestors *` so any website can frame a public product (ADR-0026). The two sources do not overlap; `src/features/public/embed.test.tsx` checks the result.

| Setting | Value |
|---|---|
| Node.js | 24.x, pinned in `package.json` `engines` (Vercel follows it; supabase-js 2.117 needs ≥ 22; every local check ran on Node 24.21) |
| Install | `npm ci` (lockfile committed) |
| Production branch | `main` (create it from the reviewed feature branch) |
| Framework / build / output | `vite` / `npm run build` / `dist` (from `vercel.json`; overrides the dashboard) |

## Vercel account state (read-only inspection, 2026-10-13)
- **Team:** the connected Vercel MCP sees one team, `track0` (`team_tOPocMPMfQihQE0P4kMAurPU`). Deployments are created by user `krishnatechzero-1399`.
  - `GET /v2/user` returns "User not found" and the teams list is empty, so the connection is scoped to that team.
- **Projects:** there is **no project for this app**. The existing 7 projects (`shringaar-virtual-try-on*`, `portfolio*`, `tracker0`) are unrelated and were not touched.
- **Domains:** none registered in this scope, so the production domain still has to be chosen and added.

## Environment variables (Vercel → Settings → Environment Variables)
| Name | Production | Preview | Notes |
|---|---|---|---|
| `VITE_DATA_MODE` | `supabase` | `demo` (recommended) or `supabase` with a separate project | Only the exact values `demo` and `supabase` are accepted; anything else shows the setup-error screen. Read at **build time**. |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | – | Public. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | – | Public by design. The build refuses `sb_secret_` and service_role keys. |
| `VITE_ROOT_DOMAIN` | e.g. `furnish.app` | unset (path mode) | Turns on business subdomains. |

**Never** add `SUPABASE_SERVICE_ROLE_KEY` / `sb_secret_…` to Vercel. Nothing in this app needs it, and every `VITE_*` variable is shipped to browsers.

## Domains and tenant routing
- **Hosts:**
  - Apex `furnish.app`: landing page, `/demo`, `/login`, `/admin`, `/dashboard` and path-mode catalogs.
  - `www.furnish.app`: redirect to the apex.
  - `*.furnish.app`: business catalogs. `/` is the catalog and `/products/:slug` the product page.
- **Wildcard certificates:** add `*.furnish.app` to the Vercel project. Vercel needs the DNS challenge to issue wildcard certificates, so **either** move the domain's nameservers to Vercel, **or** keep your DNS provider and add `NS _acme-challenge → ns1/ns2.vercel-dns.com` plus a `CNAME * → cname.vercel-dns-0.com`.
- **Reserved subdomains** never resolve to a business: `www, admin, app, api, demo, login, mail, assets, static, cdn`. They are rejected as business slugs by both the app and the DB.
- **Sign-in host:** sign-in lives on the apex only. Supabase sessions are per-origin, so dashboards are not available on business subdomains (verified: `/admin` on a subdomain shows "Page not found").
- **Verified locally** (2026-10-13) against a production build with `VITE_ROOT_DOMAIN=furnish.test`, Chromium host mapping and `vite preview`. 10/10 passed:
  - apex and `www` show the landing page
  - a business subdomain shows its catalog, and product links and deep-link reloads work
  - unknown and inactive stores show their states
  - admin stays on the apex
  - copied catalog URLs use the subdomain
- **Not verified:** a real DNS/TLS deployment on Vercel.

## Supabase Auth settings for production (owner applies; not changed by Claude)
Written for the old dev project `pmnjchhrgvajtjpadpqo` (2026-10-13; not used by the live site, which uses `zggylkbgajamhriebdrg`; the live Auth URLs are not verified, see `System_arch/HANDOFF.md`). Replace `furnish.app` with the real domain.

| # | Dashboard page | Setting | Value |
|---|---|---|---|
| 1 | Authentication → URL Configuration (`/dashboard/project/_/auth/url-configuration`) | Site URL | `https://furnish.app` |
| 2 | same page | Redirect URLs (exact entries) | `https://furnish.app/login`, `https://www.furnish.app/login` (plus `/reset-password` and `/accept-invite`). **No wildcards on `vercel.app`:** anyone can create a Vercel project whose hostname matches `*-track0.vercel.app`, and an attacker-started password reset would then deliver the victim's tokens to that page (SEC-21). For Previews, add exact URLs of one stable branch alias (`https://ar-deploy-git-<branch>-track0.vercel.app/login` etc.), and only on a non-production Supabase project. Keep `localhost` entries off the production project. |
| 3 | Authentication → Sign In / Providers (`/auth/providers`) | Allow new users to sign up | **Off**. Accounts are created by a platform admin; a stray sign-up has no role and sees only public data, but shouldn't exist. |
| 4 | same page → Email provider | Confirm email | On (default). Minimum password length **12**; require lower, upper, digits. |
| 5 | same page → Email provider | Prevent use of leaked passwords (HaveIBeenPwned) | **On**. Requires the **Pro plan or above**; on Free it is unavailable. Treat that as a launch decision. |
| 6 | Authentication → Emails → SMTP Settings (`/auth/smtp`) | Enable custom SMTP | Host, port, user, password from your mail provider (Resend, Postmark, SES…). Sender `no-reply@furnish.app`, name "Furnish AR". |
| 7 | Authentication → Rate Limits (`/auth/rate-limits`) | Emails per hour | Starts at 30 after custom SMTP. Raise only if needed. |

**Why SMTP is a blocker:** the default sender delivers only to members of the Supabase organisation, at about 2 emails/hour, with no delivery guarantee. Confirmation and password emails to real business owners would fail with "Email address not authorized".

**Also needed:** the first real platform admin. Create the user (Authentication → Users → Add user, with auto-confirm), then run `insert into public.platform_admins (user_id) select id from auth.users where email = '<admin email>';`. Then a membership per business owner (design/19 §4).

## Analytics protection (LIVE since 2026-10-13)
- **Live components:**
  - Edge Function `track-event`: ACTIVE, version 1, `verify_jwt=false`
  - migration `20261012200810_analytics_rate_limit`
- **Events:** `view`, `ar_activation`, and `model_interaction` (the first rotate or zoom per product page view).
- **Rate limit:** 30 events per minute per visitor key. The key is the SHA-256 of `IP | UTC date | salt`.
- **Salt:** the optional secret `ANALYTICS_SALT` overrides it. When unset (current state), the salt is derived from the function's server-only secret key, so hashes are unguessable from outside. Set `ANALYTICS_SALT` to rotate hashes independently of key rotation.
- **Direct inserts are closed:** anon and authenticated have no INSERT on `product_analytics`.
- **Verified against the live API:**
  - all three event types are recorded
  - forged and direct inserts get 42501
  - a wrong business gets 422
  - a 70-event burst returns 429s, and only the accepted events are stored
  - the owner sees the counts; another owner sees zero
- **Remaining limit:** bots that rotate IPs. Use a WAF if that ever matters.

## Go-live checklist
1. ~~Apply the migrations and run the advisors.~~ Done 2026-10-13 on `pmnjchhrgvajtjpadpqo`.
2. Set the Supabase Auth settings (above). Create the first platform admin (SQL).
3. ~~Generate types.~~ Done (`database.types.ts` + drift check).
4. ~~Real-API tests.~~ Done: 10/10 live, 8/8 UI smoke. Re-run after any migration.
5. ~~Deploy analytics protection.~~ Done 2026-10-13 (function and migration live; salt derived server-side).
6. Create the Vercel project, set the env vars, and add the domains (apex, www, wildcard).
7. Smoke-test production: landing, `/login`, a business subdomain, a product page, and AR on a real iPhone and Android phone (P7-10).

## Release runbook
**Environments:**

| Where | `VITE_DATA_MODE` | Backend |
|---|---|---|
| Local `npm run dev` | unset → demo | none |
| Vercel Preview + Development | `demo` | none, so previews can never touch production data |
| Vercel Production | `supabase` + URL + publishable key | `pmnjchhrgvajtjpadpqo` (2026-10-13 plan; the live site now builds from a feature branch as a Preview and uses `zggylkbgajamhriebdrg`, see HANDOFF Live state) |

**First release** (needs a Vercel token or MCP connection allowed to write to team `track0`; see blockers):
1. Create project `ar-furniture` in team `track0`:
   - Git `krishna-notfound/AR-Deploy`, production branch `main`
   - framework Vite, build `npm run build`, output `dist`, install `npm ci`, root directory = repo root
2. Env vars:
   - Production: `VITE_DATA_MODE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_ROOT_DOMAIN` once a domain exists
   - Preview + Development: `VITE_DATA_MODE=demo` only
3. Deploy a preview from `feature/design-supabase-foundation` and verify the demo flows.
4. Merge into `main` (no force push). The production deployment builds from `main`.
5. Verify: deployment READY; commit SHA matches `main`; deep-link reloads; `/login` against Supabase; a published product, its 3D model and the analytics event; console free of errors.

**Later releases:** run the full gate (typecheck, lint, test, test:e2e, build), merge to `main`, then smoke-test the production URL.

**Database changes:**
1. Create the file with `npx supabase migration new <name>`.
2. Verify it locally (PGlite harness, design/19).
3. Apply it with approval. CLI: `supabase db push`. Or the MCP `apply_migration`, after which you rename the local file to the recorded version.
4. Run the advisors.
5. Regenerate types: `database.types.ts` and the drift check.

**Edge Function changes:** `deno check supabase/functions/track-event/index.ts`, then deploy (CLI `npx supabase functions deploy track-event`, or the MCP `deploy_edge_function` with `verify_jwt=false`).

**Rollback:**
- **App:** promote the previous production deployment in Vercel (Deployments → … → Promote / Instant Rollback). This is safe because the frontend has no data migrations.
- **Edge Function:** redeploy the previous version from Git.
- **Database:**
  - Prefer a forward fix: a new migration.
  - `supabase/rollback/20261012_p8_rollback.sql` drops **everything and all data**; use it only with a backup.
  - Restoring from a backup needs the Pro plan's PITR or a manual `db dump` taken beforehand.

**Troubleshooting:**

| Symptom | Likely cause | Check |
|---|---|---|
| "The backend is not configured" screen | Production env vars missing or misspelled; the build reads them at build time | Vercel env vars, then redeploy |
| Sign-in works but "not linked yet" | No `platform_admins` or `business_members` row | Owners tab (admin) or SQL in design/19 §4 |
| Dashboard shows a permission error | RLS denied the action (correct for other businesses) | The user's membership |
| Images or models don't load on a public page | Product unpublished or business inactive (private bucket); or a signed URL older than 1 h on a long-open tab | Publish state; reload the page |
| 3D model stuck, then "taking too long" | No download progress for 45 s (network/CORS) or a corrupt GLB | Open the file URL; check the GLB in a validator |
| No AR button on a phone | Device/browser lacks AR (`canActivateAR` false), or an in-app browser | Open in Safari/Chrome; iOS needs a USDZ for best results |
| Analytics not counting | Rate limit (30/min/visitor), unpublished product, or the function is down | Edge Function logs in the Supabase dashboard |
| Password reset email never arrives | Default SMTP only mails org members (about 2/h) | Configure custom SMTP (Auth table above) |

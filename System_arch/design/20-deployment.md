# 20 · Deployment: Vercel + Supabase
Architecture: static Vite SPA on Vercel, with Supabase Postgres, Auth and Storage (with RLS). No custom server. Database setup is in design/19.

## Vercel project settings
`vercel.json` (committed) sets:
- framework `vite`, build `npm run build`, output `dist`
- an SPA rewrite to `/index.html` (static files take precedence)
- immutable caching for `/assets/*`
- headers: `nosniff`, `strict-origin-when-cross-origin`, `frame-ancestors 'none'`, and `Permissions-Policy` that allows camera and XR for AR

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
Project `pmnjchhrgvajtjpadpqo`. Replace `furnish.app` with the real domain.

| # | Dashboard page | Setting | Value |
|---|---|---|---|
| 1 | Authentication → URL Configuration (`/dashboard/project/_/auth/url-configuration`) | Site URL | `https://furnish.app` |
| 2 | same page | Redirect URLs (exact entries) | `https://furnish.app/login`, `https://www.furnish.app/login`. For Vercel previews add `https://*-track0.vercel.app/**`. For local work add `http://localhost:5173/**`. |
| 3 | Authentication → Sign In / Providers (`/auth/providers`) | Allow new users to sign up | **Off**. Accounts are created by a platform admin; a stray sign-up has no role and sees only public data, but shouldn't exist. |
| 4 | same page → Email provider | Confirm email | On (default). Minimum password length **12**; require lower, upper, digits. |
| 5 | same page → Email provider | Prevent use of leaked passwords (HaveIBeenPwned) | **On**. Requires the **Pro plan or above**; on Free it is unavailable. Treat that as a launch decision. |
| 6 | Authentication → Emails → SMTP Settings (`/auth/smtp`) | Enable custom SMTP | Host, port, user, password from your mail provider (Resend, Postmark, SES…). Sender `no-reply@furnish.app`, name "Furnish AR". |
| 7 | Authentication → Rate Limits (`/auth/rate-limits`) | Emails per hour | Starts at 30 after custom SMTP. Raise only if needed. |

**Why SMTP is a blocker:** the default sender delivers only to members of the Supabase organisation, at about 2 emails/hour, with no delivery guarantee. Confirmation and password emails to real business owners would fail with "Email address not authorized".

**Also needed:** the first real platform admin. Create the user (Authentication → Users → Add user, with auto-confirm), then run `insert into public.platform_admins (user_id) select id from auth.users where email = '<admin email>';`. Then a membership per business owner (design/19 §4).

## Analytics protection (built and tested locally; NOT deployed)
**Problem.** Public view and AR events were direct table inserts, so anyone could add unlimited events.

**Built:**
- **Migration `20261012193902_analytics_rate_limit.sql`:**
  - adds `private.analytics_hits(visitor_key, window_start, hits)` in a schema the Data API doesn't expose, with RLS on and no policies
  - adds `public.record_event_limited(visitor_key, product_id, business_id, event_type)`: SECURITY DEFINER, `search_path=''`, EXECUTE for `service_role` only
    - counts every call (valid or not) in a 1-minute window per visitor key
    - returns `rate_limited` above **30/min**
    - otherwise records the event only for a published product of an active business with a matching `business_id`
    - opportunistically deletes counters older than 1 h
  - **drops the public insert policy and revokes INSERT** on `product_analytics` from anon and authenticated, so the limiter can't be bypassed
- **Edge Function `supabase/functions/track-event`:**
  - `handler.ts` holds the logic and `index.ts` wires it to Deno; `verify_jwt = false` in `config.toml` because browsers send the publishable key, which is not a JWT
  - it validates `{productId, businessId, type}` (UUIDs, `view|ar_activation`, body ≤ 1 KB)
  - visitor key = `sha256(first X-Forwarded-For IP | UTC date | ANALYTICS_SALT)`; **only this digest reaches the database**, and the raw IP is never stored or logged
  - responses: 204 recorded, 400 bad input, 422 not recordable, 429 + `Retry-After: 60` when limited, 500 if misconfigured or the DB fails
  - the service key is read inside the function from `SUPABASE_SECRET_KEYS`, falling back to `SUPABASE_SERVICE_ROLE_KEY`, and never leaves the runtime
- **Client:** `recordEvent` now calls `functions.invoke('track-event')`, and a 429 surfaces as `RATE_LIMITED`.

**Tests:**
- `handler.test.ts`: 11 cases (valid view/AR, digest-only key, same/different visitor and day, 429 after limit, invalid bodies, JSON/size/method errors, 422, CORS, fail-closed)
- unit tests for the client path
- PGlite: 98/98, including 17 rate-limit cases (recorded, draft/mismatch/inactive/unknown type invalid, malformed key not counted, 31st call limited with exactly 30 stored, invalid spam counted, other visitors unaffected, anon/authenticated can't call the function, direct inserts closed, counters hold only digest/window/count)
- `deno check` passes; the rollback script was updated and re-verified

**Deploy order (needs approval; until all three steps are done, events are not recorded):**
1. Set the Edge Function secret `ANALYTICS_SALT` (random, ≥ 32 chars; never commit it).
2. Deploy `track-event` (CLI `npx supabase functions deploy track-event`, or the MCP `deploy_edge_function`, which keeps `verify_jwt=false`).
3. Apply migration `20261012193902_analytics_rate_limit`.
4. Re-run the live suite (it now also asserts that direct inserts fail).

**Limits that remain:** bots that rotate IPs are counted per IP. Use Vercel/Cloudflare bot protection if that becomes a problem. One function call per event is about 500k/month on the free plan.

## Go-live checklist
1. ~~Apply the migrations and run the advisors.~~ Done 2026-10-13 on `pmnjchhrgvajtjpadpqo`.
2. Set the Supabase Auth settings (above). Create the first platform admin (SQL).
3. ~~Generate types.~~ Done (`database.types.ts` + drift check).
4. ~~Real-API tests.~~ Done: 10/10 live, 8/8 UI smoke. Re-run after any migration.
5. Deploy analytics protection: the salt secret, function and migration (above).
6. Create the Vercel project, set the env vars, and add the domains (apex, www, wildcard).
7. Smoke-test production: landing, `/login`, a business subdomain, a product page, and AR on a real iPhone and Android phone (P7-10).

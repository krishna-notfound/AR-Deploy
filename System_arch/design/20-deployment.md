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
| Node.js | 22.x (supabase-js 2.117 needs Node ≥ 22) |
| Install | `npm ci` (lockfile committed) |
| Production branch | `main` (create it from the reviewed feature branch) |

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

## Supabase Auth settings for production
- **URLs:** Site URL `https://furnish.app`. Redirect URLs `https://furnish.app/login`, plus each preview origin you use.
- **Sign-up:** turn off public sign-ups (accounts are created by admins). Turn on leaked-password protection and set a minimum password length.
- **Email:** custom SMTP before inviting real users (the default sender is rate-limited).

## Analytics abuse: proposal before public launch (not built)
**Problem.** `product_analytics` accepts public inserts, so anyone can add unlimited valid events for a published product. Postgres has no per-visitor identity to rate-limit on. Column grants already stop forged dates and ids.

**Proposal.** Record events through a Supabase Edge Function that rate-limits per hashed IP. About 1 SQL migration plus 1 function, with no new infrastructure.

1. **Migration** (apply only after approval):
   - Add `private.analytics_hits(key text, window_start timestamptz, hits int, primary key (key, window_start))` in a non-exposed `private` schema.
   - Add `public.record_event_limited(p_key text, p_product uuid, p_business uuid, p_type text) returns boolean`: SECURITY DEFINER, `search_path=''`, execute granted to `service_role` only. It upserts the 1-minute window counter and returns false above ~30 hits per key per minute. Otherwise it inserts the event (still checking published, matching business).
   - Revoke `insert` on `product_analytics` from `anon, authenticated`.
2. **Edge Function `track-event`:**
   - It accepts `{productId, businessId, type}` and computes `key = sha256(ip + utc_date + ANALYTICS_SALT)`. Only the hash is stored, so no IP is kept.
   - It calls `record_event_limited` with the service-role client, which is available only inside the function as `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEYS`.
   - It responds 204, or 429 when limited.
   - The IP is the first value of `x-forwarded-for`. Confirm the header on the deployed platform before relying on it.
3. **Client:** `recordEvent` calls `supabase.functions.invoke('track-event', …)` instead of the table insert.
4. **Costs and limits:**
   - One function call per product view or AR tap (500k/month on the free plan).
   - Hashing per IP and day lets one IP be counted for at most ~30 events per minute.
   - Bots that rotate IPs need a WAF or bot protection (Vercel Firewall can rate-limit the page, but not the Supabase endpoint).
5. **Alternative if this is too much:** accept the risk for a pilot, label analytics "approximate", and watch `product_analytics` growth.

## Go-live checklist
1. ~~Apply the migrations and run the advisors.~~ Done 2026-10-13 on `pmnjchhrgvajtjpadpqo`.
2. Set the Supabase Auth settings (above). Create the first platform admin (SQL).
3. ~~Generate types.~~ Done (`database.types.ts` + drift check).
4. ~~Real-API tests.~~ Done: 10/10 live, 8/8 UI smoke. Re-run after any migration.
5. Decide on analytics abuse (P8-17).
6. Create the Vercel project, set the env vars, and add the domains (apex, www, wildcard).
7. Smoke-test production: landing, `/login`, a business subdomain, a product page, and AR on a real iPhone and Android phone (P7-10).

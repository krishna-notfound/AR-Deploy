# Operations runbook

Environments, how to set up staging, and the rules that keep production safe. Deployment, rollback, backups and incident response are added as those phases complete (see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)).

## Environments

> **Current setup (owner decision 2026-10-13):** there is no separate staging project. Tests run on the live project `pmnjchhrgvajtjpadpqo`, one approved step at a time (below), and it is cleaned before launch. Vercel Preview and Production share the same `VITE_*` values (one value each, targets `production,preview`), so preview deploys also use the live database. The table shows the intended split if a staging project is added later.

| | Local | Staging | Production |
|---|---|---|---|
| Supabase project | none (demo mode) or staging | staging project (ref: _to be recorded_) | `pmnjchhrgvajtjpadpqo` |
| Frontend | `npm run dev` on localhost | Vercel **Preview** deployments | Vercel **Production** (`main` of `krishna-notfound/AR-Deploy`, project `ar-deploy`, team `track0`) |
| Env file | `.env.local` (git-ignored) | Vercel Preview env vars; locally `.env.staging.local` (git-ignored) | Vercel Production env vars |
| Sign-ups | n/a | on (testing owner registration) | **off** until the owner approves |
| Data | sample | synthetic QA data, disposable | real client data (sample data still present, O-4) |

Rules:
- Never run `npm run dev` with production values unless you intend to write production analytics (see HANDOFF gotchas).
- The repo is linked (`supabase/.temp/project-ref`) to **staging only**. Check before every `db push` / `functions deploy`: `cat supabase/.temp/project-ref` must print the staging ref.
- The Supabase MCP server connected to Claude Code points at **production**: read-only use only.
- Never put a secret / `service_role` key in a `VITE_*` variable or a committed file.

## Testing on the live project (current)

Repo linked to `pmnjchhrgvajtjpadpqo` (`cat supabase/.temp/project-ref`). Each step needs the owner's explicit OK.

| Step | Command / action | Expected outcome | Undo |
|---|---|---|---|
| A | `npx supabase db push --dry-run`, then `npx supabase db push` | Dry run lists only `20261013093006_publish_rules.sql` and `20261013144121_owner_registration_and_claims.sql`; afterwards `npx supabase migration list` shows 7 local = 7 remote; Advisors → Security: no new errors | `supabase/rollback/20261013_publish_rules_and_claims_rollback.sql` in the SQL editor (keeps business data) |
| B | 🔑 Dashboard → Authentication → Users → Add user (auto-confirm), one long throwaway password: `qa-admin@`, `qa-owner-a@`, `qa-owner-b@`, `qa-newcomer@furnish.example`; then SQL `insert into public.platform_admins (user_id) select id from auth.users where email = 'qa-admin@furnish.example';` | 4 confirmed users; 1 extra platform admin | Step D |
| C | `SUPABASE_IT_URL=https://pmnjchhrgvajtjpadpqo.supabase.co SUPABASE_IT_KEY=<publishable key> SUPABASE_IT_PASSWORD=<QA password> npx vitest run src/services/supabase/live.integration.test.ts` (password typed in your own terminal) | 15 passed, 0 skipped; afterwards `select count(*) from businesses where slug like 'qa-%'` = 0 | Tests delete their own businesses and files |
| D | 🔑 Delete the 4 QA users in the dashboard | `select count(*) from auth.users where email like 'qa-%@furnish.example'` = 0; `platform_admins` row removed by cascade | — |

Public sign-ups stay **off** for these tests; the `/signup` page itself is tested only once sign-ups are approved (needs custom SMTP for real owners).

## Separate staging project (optional, if created later)

🔑 = owner action in a dashboard or own terminal. Everything else can be run by the developer.

1. 🔑 **Create the project.** Supabase dashboard → New project, e.g. `ar-furniture-staging`, same region as production, free plan. Record the ref (the `xxxx` of `https://xxxx.supabase.co`) in the table above.
2. 🔑 **CLI login and link (own terminal, so no token or password enters a chat log).**
   ```
   cd <repo>
   npx supabase login
   npx supabase link --project-ref <staging-ref>     # asks for the staging database password
   cat supabase/.temp/project-ref                    # must print the staging ref
   ```
3. **Apply migrations to staging.** `npx supabase db push` (after re-checking step 2's ref). Then check the advisors in the dashboard (Advisors → Security / Performance).
4. 🔑 **Auth settings (staging dashboard → Authentication).**
   - Sign In / Providers → Email: allow new users to sign up **off** (owners are invited, ADR-0024; open sign-ups let anyone pre-register an owner's email, SEC-20), confirm email **on**, minimum password length **12**, secure password change **on**.
   - URL Configuration → Site URL `http://localhost:5173`; Redirect URLs: `http://localhost:5173/**` and exact entries for one stable Preview branch alias (`https://ar-deploy-git-<branch>-track0.vercel.app/login`, `/reset-password`, `/accept-invite`). Never a wildcard such as `https://ar-deploy-*-track0.vercel.app/**`: any Vercel user can claim a matching hostname and receive reset or invite tokens (SEC-21, design/20).
   - Emails: the built-in sender only delivers to members of your Supabase team, a few per hour. Enough for testing with your own address; real owners need custom SMTP (e.g. Resend) before production sign-ups.
5. 🔑 **QA users (staging dashboard → Authentication → Users → Add user, "auto confirm").** Same password for all: `qa-admin@furnish.example`, `qa-owner-a@furnish.example`, `qa-owner-b@furnish.example`, `qa-newcomer@furnish.example`. Then in the SQL editor: `insert into public.platform_admins (user_id) select id from auth.users where email = 'qa-admin@furnish.example';`
6. **Synthetic data.** `npm run db:sample-sql`, then run the generated SQL in the staging SQL editor (sample businesses, products, analytics).
7. **Analytics function.** `npx supabase functions deploy track-event` (linked = staging). Then the header test for SEC-03 (rate-limit key), see `System_arch/audit/APPROVAL_REQUIRED.md` O-3.
8. **Live integration test against staging.**
   ```
   SUPABASE_IT_URL=https://<staging-ref>.supabase.co SUPABASE_IT_KEY=<staging publishable key> SUPABASE_IT_PASSWORD=<QA password> \
     npx vitest run src/services/supabase/live.integration.test.ts
   ```
   It creates and deletes QA businesses and files on staging.
9. 🔑 **Vercel Preview isolation.** Vercel → project `ar-deploy` → Settings → Environment Variables:
   - `VITE_DATA_MODE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` scoped to **Preview** = staging values.
   - The same names scoped to **Production** = production values (unchanged).
   - Check what Preview uses **today** first: if it has production values, every preview deploy has been writing production analytics.
   - Verify: open a preview deployment, DevTools → Network, requests go to `<staging-ref>.supabase.co`.
10. **Local staging runs.** Create `.env.staging.local` (git-ignored) with the staging URL and publishable key, and start with `npx vite --mode staging`.

## Production changes

Every production change (migration, auth setting, Edge Function deploy, env var, push to `main`) needs the owner's explicit approval of a written plan: exact change, target, risk, rollback, and the staging evidence. Pending items and their rollback steps: `System_arch/audit/APPROVAL_REQUIRED.md` and [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Staging: what is needed (status 2026-10-13)

A client-review environment needs its own Supabase project. Today none exists:
- `pmnjchhrgvajtjpadpqo` = production (live site).
- `bothonopxtznzviieoic` = **another live application** (read-only check 2026-10-13: 8 users, 5 stores, 14 products, profiles, try-on assets). Not usable for staging.
- The free plan allows 2 active projects, both used.

Ways to get one (owner decides; none is done automatically):
1. **Client-owned Supabase account** (recommended for handover anyway): the client creates a free organization, invites the developer, and creates `ar-furniture-staging` there. Later, production can move to the client the same way.
2. **Supabase Pro** on the current organization (paid; allows more projects and branching).

Once the ref exists, follow "Separate staging project" below, then point Vercel **Preview** at it:
- Edit `VITE_DATA_MODE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` so their target is **Production only** (values unchanged).
- Add the same three names for **Preview** with the staging values (`VITE_DATA_MODE=supabase`).
- Check: `vercel api "/v10/projects/ar-deploy/env?teamId=track0"` lists each name twice (production / preview). After a preview deploy, DevTools → Network shows requests to the staging ref only.
- Fail-safe (`src/services/backendConfig.ts`): with **no** Preview variables the preview build runs in demo mode (built-in sample data, never a database); with `VITE_DATA_MODE=supabase` but a missing or malformed URL/key it shows a configuration error. It never falls back to production. Production builds refuse demo mode and secret keys.

## Deploying

- **Production** = push/merge to `main` of `krishna-notfound/AR-Deploy`; Vercel builds `ar-deploy` automatically. Needs the owner's approval each time.
- Before merging: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`, the live suite against staging (or the approved live run), and the device checklist in `docs/TEST_PLAN.md`.
- Database changes go first (`npx supabase db push` to the verified target), app second. Every migration so far is additive, so the old app keeps working against the new schema.
- After deploying: open the production URL, a catalog, a product (3D loads), sign in as admin, check the dashboard; check the commit SHA in Vercel → Deployments.

## Platform team roles (ADR-0029, ADR-0030)

Deploy only with the owner's explicit go-ahead, and only to the client project `zggylkbgajamhriebdrg`. Never touch `pmnjchhrgvajtjpadpqo`, and never run `supabase config push`.

1. Run the read-only preflight (`supabase/checks/preflight_readonly.sql`), and confirm that `platform_admins` lists the expected Owners.
2. Apply the migration: `npx supabase db push --linked`. This applies migrations only, and `20261025070915_platform_team_roles.sql` is the new one.
3. Deploy the functions: `npx supabase functions deploy invite-member manage-member accept-member-invite --project-ref zggylkbgajamhriebdrg`. The `verify_jwt` settings come from `supabase/config.toml` (true, true, false).
4. Required secrets: `APP_BASE_URL` (the site that hosts `/join`; invite-member refuses to send without it), `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TEST_RECIPIENTS`. The functions also read `SUPABASE_URL`, `SUPABASE_ANON_KEY` and the service key that Supabase provides.
5. Regenerate the types: `SUPABASE_PROJECT_REF=zggylkbgajamhriebdrg npm run db:types`.
6. **Rollback:** `supabase/rollback/20261025_platform_team_roles_rollback.sql`. Admin and Team members lose access, Owners are untouched, and access audit rows are kept.

## Rollback

| What | How | Data effect |
|---|---|---|
| App | Vercel → Deployments → previous production deployment → **Instant Rollback** (or revert the merge commit on `main`) | none |
| Migrations `20261013093006` + `20261013144121` | Run `supabase/rollback/20261013_publish_rules_and_claims_rollback.sql` in the SQL editor (tested in PGlite) | drops claim links; keeps businesses, products and owner links |
| Earlier migrations | `supabase/rollback/20261012_p8_rollback.sql` | **destructive** (drops all tables): backup first |
| Data | Supabase → Database → Backups (daily on paid plans; on Free take a manual dump: `npx supabase db dump --data-only -f backup.sql`) | — |

## Custom domain and business subdomains (when the client's domain is available)

Nothing below is done until the client provides the domain and approves each step.

1. **Vercel → ar-deploy → Domains:** add `<domain>`, `www.<domain>` (redirect to apex) and `*.<domain>`. Wildcard certificates need the domain's **nameservers moved to Vercel** (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`); with external DNS, Vercel cannot issue a wildcard certificate. Move any existing email (MX), SPF/DKIM and other records into Vercel DNS first.
2. **Env:** `VITE_ROOT_DOMAIN=<domain>` for Production → redeploy. Then `https://<slug>.<domain>` shows that business's catalog and `/products/<slug>` its products; the apex serves the landing page, `/login`, `/admin`, `/dashboard`. Reserved subdomains (`www`, `admin`, `app`, `api`, `demo`, `login`, `mail`, `assets`, `static`, `cdn`) are never business addresses.
3. **Supabase → Authentication → URL Configuration:** Site URL `https://<domain>`; redirect URLs `https://<domain>/login`, `https://<domain>/reset-password`, `https://<domain>/claim`.
4. **Email (before production sign-ups):** custom SMTP (e.g. Resend) with SPF/DKIM records on the sending domain; Supabase → Authentication → SMTP.
5. **QR codes:** download them again after step 2 (path-mode QR codes point to the Vercel address).
6. **Check:** HTTPS on apex, `www` and two business subdomains; unknown subdomain shows "catalog not found"; product pages and AR from a subdomain.
7. **Undo:** remove `VITE_ROOT_DOMAIN` and redeploy (back to `/catalog/<slug>` URLs).

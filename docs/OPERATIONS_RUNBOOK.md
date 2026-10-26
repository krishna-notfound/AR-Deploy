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

## Account settings and 2FA (S1)

Settings hub, profile, email and password change, authenticator-app 2FA, recovery codes, the Owner's Security policy and account closure requests (ADR-0032). Deploy only with the owner's explicit go-ahead, and only to the client project `zggylkbgajamhriebdrg`. Status: **applied to `zggylkbgajamhriebdrg` on 2026-10-26** (migrations, both functions, branch pushed to the Preview). The dashboard settings below are the owner's to switch on.

### Release order

1. **Preflight.** Run `supabase/checks/preflight_readonly.sql`. Confirm the Owner has an authenticator app ready, because the Owner will be asked to set up 2FA first (step 8).
2. **Dashboard settings** (see "Supabase dashboard settings" below), so the emails and the redirects work as soon as the code is live.

Steps 3 to 5 run in this order, one straight after the other, in one release window:

3. **Migrations.** Apply both in one go: `20261025163627_account_settings.sql` and `20261025180600_account_settings_optin_2fa.sql` (`npx supabase db push --linked`).
4. **Edge Functions**, straight after the migrations (`account-security` calls the new `service_*` functions) and before the frontend (the new app calls `account-security`): `npx supabase functions deploy account-security submit-application --project-ref zggylkbgajamhriebdrg`. `account-security` is new (`verify_jwt = true`). `submit-application` is updated (it now reads the staff recipients) and keeps `verify_jwt = false`. Both come from `supabase/config.toml`.
5. **Frontend**, straight after the functions: merge the frontend that has the 2FA gate (`src/auth/SecurityGate.tsx`). **Never leave the migrations live without that frontend.** The second migration makes the database refuse a person who has a verified factor, or whose group's policy is on, while they are signed in at `aal1`. Only the new app shows them the code step; with the old app they would see empty tables.
6. **Secrets.** `account-security` uses `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL` and `EMAIL_TEST_RECIPIENTS`, which already exist, and `ADMIN_NOTIFICATION_EMAIL` for closure alerts (if it is not set, no closure alert is sent). It also reads `SUPABASE_URL` and the service key (`SUPABASE_SECRET_KEYS`, or the legacy `SUPABASE_SERVICE_ROLE_KEY`), which Supabase provides. It does not use the anon key. No new secret.
7. **Types.** `SUPABASE_PROJECT_REF=zggylkbgajamhriebdrg npm run db:types`.
8. **Check after deploy.** Sign in as the Owner and open Settings. Turn 2FA on with an authenticator app and save the recovery codes. Sign out and in again and confirm the code step appears. Only then consider the Security policy switches. Send yourself an action code (Security, turn 2FA off) and confirm the email arrives. Then run the password check under "Supabase dashboard settings" (step 2) if it was not run yet.

### Release notes

- **New-application emails.** Every staff member with `applications.view` now gets one email per new application by default. Each person can turn it off under Settings → Notifications. Tell the team before the release.

### Supabase dashboard settings (the owner sets these)

Project `zggylkbgajamhriebdrg`. Change nothing else. Do not use the CLI for these (see "Never config push").

1. **Authentication → Multi-Factor (MFA).** Under TOTP (App Authenticator), turn on both **Enroll** and **Verify**. Leave the maximum at the default of 10 factors. Leave phone MFA off.
2. **Authentication → Sign In / Providers → Email.**
   - Turn on **Secure email change**, so a change must be confirmed from both the old and the new address.
   - Turn on **Secure password change** (sometimes shown as "Require current password when updating"). A password change then needs a recent sign-in.
   - Turn on **Require current password when updating** if it is listed as its own switch. Save.
   - **Test straight after saving.** This switch can also apply to the flows that set a password without knowing the old one. Right away, run a **forgot-password** reset (`/reset-password`, from the email code to a new password and a sign-in) and an **owner-invite onboarding** (invite a test owner, accept, set the password, reach the dashboard). If either fails, turn **Require current password when updating** off again at once, save, and repeat the test.
3. **Authentication → Emails → Notification emails** (security notifications). Turn on all four: **Password changed**, **Email address changed**, **MFA method added** and **MFA method removed**. Save each.
4. **Authentication → URL Configuration → Redirect URLs.** Add:
   - `https://sanctus.warpkit.online/dashboard/settings/account`
   - `https://sanctus.warpkit.online/admin/settings/account`

   Keep the existing entries (including `/reset-password`).
5. Not available on the current plan, so leave them: the **leaked password protection** check and **session time-boxes / inactivity timeout** (Pro plan only).

Supabase moves these screens now and then. If a label differs, find the setting by its name above and check it against the docs rather than skipping it.

### Owner lockout guard and recovery

- **Guard.** "Require 2FA for staff" cannot be saved until the Owner's own 2FA is on and the session is at `aal2` (the switch is disabled and says why, and the database refuses the update at `aal1` as well). The Owner cannot lock themselves out by turning the policy on.
- **When the Owner still loses access** (device lost, recovery codes lost, and the staff policy on), no screen can help, since only the Owner can change the policy. Recover from the Supabase SQL editor, which runs as the database owner. Look up the Owner's user id first: `select user_id from public.platform_admins;`.
  1. Clear the policy: `update public.platform_settings set require_2fa_staff = false, require_2fa_business = false where id;` The audit trigger writes a `platform_security_policy_changed` row with no actor.
  2. Remove the lost second factor. Opt-in 2FA means a verified factor still needs `aal2` even with the policy off, so clearing the policy alone is not enough. In the dashboard, open Authentication → Users → the Owner → remove the factor. Or in SQL: `delete from auth.mfa_factors where user_id = '<owner id>';` then `delete from private.recovery_codes where user_id = '<owner id>';`.
  3. The Owner signs in with the password, sets 2FA up again, saves the new recovery codes and turns the policy back on.
- **Alternative that undoes the whole opt-in rule at once:** run `supabase/rollback/20261025_account_settings_optin_2fa_rollback.sql`. Policy-off then means no 2FA is enforced for anyone. Use it only if many people are locked out, and re-apply the migration afterwards.
- **A team member or business owner** who loses both device and recovery codes: the Owner uses **Reset 2FA** on the person's detail page (the team member's page, or the business's page for its owner). An emailed code is needed. No SQL.

### Rollback

Run in the SQL editor as the database owner, **in this order**:

1. `supabase/rollback/20261025_account_settings_optin_2fa_rollback.sql` first. It restores the policy-only 2FA rule and the ungated own security activity, and drops `caller_has_verified_factor()` and `caller_mfa_satisfied()`.
2. `supabase/rollback/20261025_account_settings_rollback.sql` next. It drops profiles, the policy, action and recovery codes and closure requests, and restores the access helpers without the 2FA clause. (If the first step was skipped it also drops `caller_has_verified_factor()` and `caller_mfa_satisfied()`.) If hosted Storage refuses to delete the empty `avatars` bucket, the script only raises a notice and the rest still commits; delete the bucket in the dashboard then. The platform-team-roles rollback, if wanted, comes after this one.

What stays: audit rows, the wider audit `event_type` check, the email-log kinds, the `avatars` bucket when it still holds files (empty it through the Storage API, then drop it), and TOTP factors in Supabase Auth. Businesses that a pending closure took offline stay `inactive`. List them first: `select business_id, previous_business_status from public.account_closure_requests;`. The `account-security` function can be deleted from Edge Functions afterwards. Restore the previous frontend with Vercel Instant Rollback.

### Never `config push`

Never run `supabase config push` from this repo. It would push the local development Auth settings (`supabase/config.toml`) over the hosted project's Auth, including the settings above. Change Auth only in the dashboard.

## Rollback

| What | How | Data effect |
|---|---|---|
| App | Vercel → Deployments → previous production deployment → **Instant Rollback** (or revert the merge commit on `main`) | none |
| Migrations `20261013093006` + `20261013144121` | Run `supabase/rollback/20261013_publish_rules_and_claims_rollback.sql` in the SQL editor (tested in PGlite) | drops claim links; keeps businesses, products and owner links |
| Migrations `20261025163627` + `20261025180600` (account settings, 2FA) | Run `supabase/rollback/20261025_account_settings_optin_2fa_rollback.sql` first, then `supabase/rollback/20261025_account_settings_rollback.sql` (see "Account settings and 2FA (S1)") | drops profiles, the 2FA policy, codes and closure requests; keeps audit rows, TOTP factors and the avatars bucket if it has files |
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

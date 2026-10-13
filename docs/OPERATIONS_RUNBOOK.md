# Operations runbook

Environments, how to set up staging, and the rules that keep production safe. Deployment, rollback, backups and incident response are added as those phases complete (see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)).

## Environments

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

## Staging setup (one-time)

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
   - Sign In / Providers → Email: allow new users to sign up **on**, confirm email **on**, minimum password length **12**, secure password change **on**.
   - URL Configuration → Site URL `http://localhost:5173`; Redirect URLs: `http://localhost:5173/**` and the Vercel Preview pattern (check the exact preview hostname in Vercel, e.g. `https://ar-deploy-*-track0.vercel.app/**`).
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

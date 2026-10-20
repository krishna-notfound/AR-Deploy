# Security audit: Sanctus (branch `feature/sanctus-brand-design-system`)

Date: 2026-10-20. Scope: `supabase/migrations` (9 files), `supabase/functions` (5 functions + `_shared`), `src/` (auth, services, routing), `dist/`, `vercel.json`, git history, local env files.
Method: read-only code review, plus throwaway reproductions in this folder:

- `probe.cjs` applies all 9 migrations to PGlite, with **Supabase-style default privileges** (`alter default privileges in schema public grant all ... to anon, authenticated, service_role`). It then runs 44 grant and RLS probes as `anon`, `authenticated` (owner, stranger) and admin. Output: `probe-out.txt`, where all 44 behave as described.
- `repro-edge.mts` runs the real Edge Function handlers with in-memory deps and no network. Output: `repro-edge-out.txt`.
- The existing suites (`npx vitest run supabase/tests supabase/functions`) pass: 6 files, 75 tests (`vitest-out.txt`).

No live system was contacted, so live Auth settings, Vercel env and the Supabase edge header behaviour are **unverified**. Findings that depend on them are labelled hypotheses.

IDs start at **SEC-20** so they don't collide with the existing tracker IDs SEC-01 to SEC-17 in `docs/PRODUCTION_READINESS.md`. Cross-references are given where a finding overlaps one of them.

Severity scale: P0 = exploitable now with critical impact; P1 = account or tenant takeover under realistic preconditions; P2 = abuse or integrity issue with moderate impact; P3 = hardening.

---

## Summary

| ID | Sev | Confidence | Title |
|---|---|---|---|
| SEC-20 | P1 (conditional) | High in code, medium in platform | provision-owner links any account that already exists for the owner's email (pre-account takeover). This re-opens SEC-01, and the old `email_confirmed_at` guard was dropped |
| SEC-21 | P1 (hypothesis) | Medium | The documented Auth redirect wildcard `https://*-track0.vercel.app/**` matches hostnames that any Vercel user can claim, so reset and magic-link tokens can leak and lead to account takeover |
| SEC-22 | P2 | High in code, platform unverified | The rate-limit key is the first `X-Forwarded-For` entry. It is client-choosable in `submit-application` (new) and in `track-event` (SEC-03) |
| SEC-23 | P2 | High | `submit-application` is an unauthenticated mail relay: arbitrary recipient, attacker text in the subject. It can be used for spam or phishing and to exhaust the Resend quota, which blocks owner invitations |
| SEC-24 | P3 | High | Only `frame-ancestors` is enforced in the CSP. The report-only policy has no reporting endpoint. HSTS and COOP are left at defaults |
| SEC-25 | P3 | High | Plaintext live secrets in local ignored files (`.env.qa`, `MUSE_QA_PROMPT.local`). A Resend key value was exposed in this audit session's output, so rotate it |
| SEC-26 | P3 | High | Set-password screens work for any signed-in session without re-authentication, and other sessions are never revoked (extends SEC-12) |
| SEC-27 | P3 | High (repro) | Owners can change the public `name`, point `logo_url` at any https host, and edit `created_at` and draft `published_at`. There are no column-level UPDATE grants |
| SEC-28 | P3 | High | Admin-only integrity nits: unchecked `applicationId` in provision-owner, the dead Origin fallback, and the send-test-email `status` action can move `email_log.status` backwards |

No P0. The database layer (RLS, grants, SECURITY DEFINER functions, storage policies) held against every bypass attempted. See "Checked and found OK".

---

## SEC-20: provision-owner links any account that already exists for the owner's email (pre-account takeover)

- **Severity:** P1 when public sign-ups are enabled on the target project; P3 while they are off.
- **Confidence:** High for the code path (reproduced). Medium for the GoTrue behaviour (not run against a live project).
- **Location:**
  - `supabase/functions/provision-owner/handler.ts:304-313`: `userIdByEmail` → `createLink` → `linkOwner(link.userId)`.
  - `handler.ts:353-358`: if the invite is refused, it falls back to `magiclink`.
  - `supabase/migrations/20261020091428_applications_and_owner_access.sql:241-280`: `service_user_id_by_email` and `service_link_owner` have no check of confirmation, creator or password state.
  - The same migration drops `admin_add_business_member` (line 14), which had the `email_confirmed_at is null → refuse` guard (`20261013093006_publish_rules.sql:287-289`).
- **Preconditions:**
  - Self sign-up is possible on the project. The repo's `supabase/config.toml` has `enable_signup = true` (lines 176 and 221) and `enable_confirmations = false`.
  - `docs/OPERATIONS_RUNBOOK.md:50` tells staging to set "allow new users to sign up **on**".
  - `docs/DECISIONS.md:19` makes the client project `zggylkbgajamhriebdrg` the dev and integration target with no staging.
  - The live settings of that project are unknown to this audit. HANDOFF O-2 says sign-ups should be off.
  - The attacker knows or guesses the applicant's email. They can learn it because they applied themselves, or because it is the business's public address.
- **Attack:**
  1. The attacker signs up `owner@client.example` with a password they choose.
     - **Confirmations off:** the account is confirmed at once. GoTrue then refuses the `invite`, `magiclink` succeeds for the attacker's account, and `service_link_owner` links it. The attacker signs in with their own password at any time and is the business owner. The real owner gets a working magic link into the same account.
     - **Confirmations on:** the account stays unconfirmed. When the real owner clicks the invite or magic link, GoTrue confirms the email, and the attacker's password becomes valid. In the window before the owner sets a new password on `/accept-invite`, or indefinitely if they skip that step, the attacker can sign in. Because sessions are not revoked on password change (SEC-26), a session obtained in that window survives.
  2. Admin approves the application and provisions `owner@client.example`.
- **Impact:** Full owner rights over a tenant: catalogue edits, publishing, private media. The attacker can also change the password (`secure_password_change = false`) and lock the real owner out.
- **Evidence:** `repro-edge-out.txt`:

  ```
  [provision] status 200 {"owner":"linked","email":{"status":"accepted","attempt":1}} | calls: generateLink:invite -> generateLink:magiclink -> linkOwner:00000000-0000-0000-0000-0000000000ee
  ```

  The handler links the pre-existing account without asking anything about it. The only guard is `email_is_admin` at line 305.
- **Root cause:** Owner identity is "whoever owns an account with that email string". The account's provenance (created by this invite, or not) is never checked. The previous mitigation (confirmed-only) was removed together with the old function.
- **Recommended fix:** Use all three of the following.
  1. Return the provenance from SQL and refuse (or recreate) accounts the platform did not create. In a new migration:

     ```sql
     create or replace function public.service_user_by_email(p_email text)
     returns table (id uuid, confirmed boolean, invited boolean, has_password boolean)
     language sql stable security definer set search_path = '' as $$
       select u.id, u.email_confirmed_at is not null, u.invited_at is not null, coalesce(u.encrypted_password, '') <> ''
       from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
     $$;
     revoke execute on function public.service_user_by_email(text) from public, anon, authenticated;
     grant execute on function public.service_user_by_email(text) to service_role;
     ```

     In `handler.ts`, before `createLink`, apply these rules:
     - existing account, unconfirmed and not invited: `auth.admin.deleteUser(id)`, then a fresh `invite`. This throws away the attacker's password.
     - existing account, confirmed, not linked to any business, not admin: return `409 { error: 'account_exists' }` unless the admin sends `confirmExisting: true` after checking out of band.
     - existing account that already owns another business: allow, which is today's behaviour.
  2. In `AcceptInvitePage.tsx`, after `auth.updatePassword(...)` succeeds, call `supabase.auth.signOut({ scope: 'others' })` through the auth service. This kills any session created before the owner set their password.
  3. Make "sign-ups off" a checked release gate on every project that holds real owners. Set `enable_signup = false` in `config.toml` as well, so local and default stay closed.
- **Regression test:**
  - In `provision-owner/handler.test.ts`: `userIdByEmail` returns an existing unconfirmed, non-invited id. Expect `deleteUser` to be called and then `generateLink('invite')`. Also expect `linkOwner` never to receive the pre-existing id.
  - Confirmed and unlinked: expect 409 `account_exists`.

## SEC-21: Auth redirect wildcard can match attacker-controlled Vercel hostnames (token theft)

- **Severity:** P1 if the documented allowlist entry is live.
- **Confidence:** Medium. This is a hypothesis: the live allowlist was not inspected, and no Vercel project was created to prove it.
- **Location:**
  - `System_arch/design/20-deployment.md:56`: "For Vercel previews add `https://*-track0.vercel.app/**`", plus `http://localhost:5173/**` on the production project.
  - `docs/OPERATIONS_RUNBOOK.md:51`: `https://ar-deploy-*-track0.vercel.app/**`.
  - `src/services/supabase/client.ts:9`: `createClient(url, key)` uses the default implicit flow. Tokens arrive in the URL fragment, which `AcceptInvitePage.tsx:16-18` confirms for invites.
- **Preconditions:**
  - The wildcard entry is in the project's Redirect URLs.
  - A hostname matching `*-track0.vercel.app` (or `ar-deploy-*-track0.vercel.app`) is free. Any Vercel account can create a project named, for example, `ar-deploy-x-track0`. Its production alias `ar-deploy-x-track0.vercel.app` has no dots inside the `*`, so it matches the glob.
- **Attack:**
  1. The attacker calls `POST /auth/v1/recover` with the public publishable key, the victim's email and `redirect_to=https://ar-deploy-x-track0.vercel.app/`.
  2. The victim (an admin or owner) receives a genuine Supabase email and clicks it.
  3. The access and refresh tokens land on the attacker's page and the attacker takes over the account. Magic-link and invite emails behave the same way.
  4. PKCE does **not** help here: the attacker started the flow, so the attacker holds the code verifier.
- **Impact:** Platform-admin takeover gives the attacker every tenant, every application and every applicant's PII.
- **Root cause:** A pattern entry in the redirect allowlist for a shared public domain (`vercel.app`).
- **Recommended fix:**
  - Use only exact entries: production `https://<domain>/login`, `/reset-password` and `/accept-invite`.
  - For previews, use a dedicated Vercel branch alias with exact paths, for example `https://ar-deploy-git-<branch>-track0.vercel.app/reset-password`, and only on a non-production Supabase project. Never put a wildcard on production.
  - Remove `http://localhost:5173/**` from production.
  - Also set `APP_BASE_URL` per environment (design/23 already says this).
- **Regression test:** Add a release-checklist item that diffs the dashboard Redirect URLs against an exact allowlist file, and fails on any `*` and on any `localhost` in production.

## SEC-22: Rate limits keyed on the client-choosable first `X-Forwarded-For` entry

- **Severity:** P2.
- **Confidence:** High that the code trusts the first entry. Platform behaviour (append or overwrite) is unverified; SEC-03 already flags this for track-event.
- **Location:**
  - `supabase/functions/_shared/http.ts:15` (`clientIp`), used by `submit-application/handler.ts:147`.
  - `supabase/functions/track-event/handler.ts:70-72`.
  - Race: `submit-application/handler.ts:148-150`. The count and the insert are not atomic, so parallel requests all pass `countRecent`.
- **Preconditions:** The Supabase edge appends to `X-Forwarded-For` instead of replacing it. This is common for proxies.
- **Impact:**
  - The 5-per-hour application limit and the 30-per-minute analytics limit are both void.
  - Unlimited applications feed SEC-23 and fill the admin queue.
  - A single client can inflate any published product's view, AR and interaction counts. No PII is stored (visitor hash only).
- **Evidence:** `repro-edge-out.txt`:

  ```
  [submit-application] 20 requests from one real IP with rotating first XFF entry: 20 accepted, 40 emails sent (limit is 5/hour/IP)
  [submit-application] control, fixed XFF: 5/8 accepted
  [track-event] 100 requests, rotating first XFF entry -> 100 distinct rate-limit keys
  ```

- **Root cause:** The leftmost `X-Forwarded-For` value is client-supplied whenever a proxy appends.
- **Recommended fix:** Use a single helper in `_shared/http.ts`. Prefer the header the platform sets and overwrites, and otherwise use the **right-most** entry, the hop added by the trusted edge. Confirm which header that is on a staging deploy, which is the existing O-3 step.

  ```ts
  export const clientIp = (req: Request) =>
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean).at(-1) ||
    'unknown'
  ```

  Then make track-event import it instead of its own copy. For the race, add a global safety net in SQL, for example a `private.rate_buckets` upsert inside a `service_submit_application()` definer function, the same pattern as `record_event_limited`. Also add a global per-hour cap.
- **Regression test:** In handler tests, send requests that differ only in the first `X-Forwarded-For` entry and expect the same key and a 429 after the limit. Fire 10 concurrent submissions and expect at most 5 inserts (needs the SQL limiter).

## SEC-23: `submit-application` is an unauthenticated mail relay and can exhaust the email quota

- **Severity:** P2.
- **Confidence:** High.
- **Location:**
  - `submit-application/handler.ts:162-194`: confirmation sent to `applicantEmail` and an admin notification.
  - `_shared/email-templates.ts`: the `application_confirmation` subject is `We received ${businessName}`, and the body repeats the name.
  - `verify_jwt = false` (`config.toml:427`). There is no CAPTCHA, only a honeypot (`handler.ts:133`).
- **Preconditions:** None beyond the public endpoint. SEC-22 removes the per-IP limit, and an IP pool does the same anyway.
- **Impact:**
  - Anyone can make the platform send mail from the Sanctus or client domain to any address, with 80 characters of attacker text in the subject and body. Example: "We received Your invoice is overdue, call +1…". That enables spam, phishing and harassment, and burns domain reputation through spam complaints that feed Resend suppression.
  - Each submission sends 2 emails. The free plan is 100 per day (design/23:43), so about 50 submissions a day stop owner invitations and admin notices: a denial of service on onboarding. Admin notification floods are a nuisance on top.
- **Evidence:** In the run above, 20 spoofed submissions produced 40 sends. The subject text comes from `businessName` (handler → `renderEmail`).
- **Root cause:** An unauthenticated endpoint sends mail to a recipient the caller supplies.
- **Recommended fix:**
  1. Add a bot check (for example Cloudflare Turnstile, verified server-side in the handler). This needs an ADR, per CLAUDE.md.
  2. Keep attacker text out of the subject. Use `We received your application (ref ${reference})` and leave the business name only in the body, escaped as it already is.
  3. Add a global cap in SQL: no more than N `application_confirmation` rows in `email_log` per hour. Above the cap, log the attempt as `blocked` with `error = 'global_cap'`.
  4. Send admin notifications as an hourly digest, or cap them.
  5. Optionally add a double opt-in: only email the applicant after they click a link, or show the reference on screen and send no confirmation.
- **Regression test:** Handler test where the deps report "cap reached". Expect `status: 'blocked'` and no `fetch` call. Template test: the confirmation subject does not contain `businessName`.

## SEC-24: CSP enforcement and security headers

- **Severity:** P3. React renders no unsafe HTML sinks (no `dangerouslySetInnerHTML` or `innerHTML` anywhere in `src`), so this is defence in depth.
- **Confidence:** High.
- **Location:** `vercel.json` headers.
  - Enforced: `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy: frame-ancestors 'none'`, and `Permissions-Policy`.
  - The full policy is only `Content-Security-Policy-Report-Only`, with no `report-to` or `report-uri`, so violations are only logged to the visitor's console and nobody learns of them.
  - No `Strict-Transport-Security` is set explicitly. Vercel's default lacks `includeSubDomains` and `preload`, which matters once tenant subdomains exist.
  - No `Cross-Origin-Opener-Policy`.
- **Impact:** No CSP backstop if an XSS ever lands. For example, a future Markdown description would have nothing behind it.
- **Recommended fix:**
  - Add `report-to` (or `report-uri`) to the report-only policy, check it live with Scene Viewer and Quick Look launches, then promote it to enforcing.
  - Add `{ "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" }` once every subdomain is HTTPS, and `{ "key": "Cross-Origin-Opener-Policy", "value": "same-origin-allow-popups" }`.
  - Keep `img-src` tight. This also blocks the external-logo tracking in SEC-27.
- **Regression test:** A Playwright test that asserts the response headers on `/` and on one deep route.

## SEC-25: Plaintext live secrets in local ignored files

- **Severity:** P3 for the repo, since nothing is committed. The exposed key needs action now.
- **Confidence:** High.
- **Location:** No values are reproduced here.
  - `.env.qa` holds `RESEND_API_KEY` (line 7, live `re_` format), `VERCEL_AUTOMATION_BYPASS_SECRET`, `SANCTUS_ADMIN_PASSWORD` and `MUSE_OWNER_PASSWORD`.
  - `MUSE_QA_PROMPT.local` lines 24-25 contain passwords in backticks.
  - `.env.local` and `.env.local.old-project-backup` hold only `VITE_*` public values (URL and publishable key), which is fine.
- **Git:**
  - `.gitignore:29-31` (`.env`, `.env.*`, `!.env.example`) and `:13` (`*.local`) cover all of these. `git check-ignore` confirms it.
  - `git log --all --diff-filter=A` shows only `.env.example` was ever added.
  - A `git grep` over every revision found key-like patterns only in test fixtures (`src/services/backend.test.ts`, `sb_secret_abc` and `sb_secret_x`).
  - `AR-attachment/` is untracked but **not ignored**. It contains images only and no secrets, but it is easy to commit by accident.
- **Disclosure:** While I was checking `.env.qa`, a faulty redaction in my grep printed the `RESEND_API_KEY` value into this audit session's tool output. It was not written to any file. Treat that key as exposed: rotate it in Resend and update the Edge Function secret.
- **Impact:** A stolen laptop, backup or sync, or an AI-session transcript, yields the platform admin password, a Vercel protection bypass and a mail-sending key.
- **Recommended fix:**
  - Rotate the Resend key.
  - Move QA credentials to a password manager or an OS keychain and inject them at run time.
  - Keep `.env.qa` free of production credentials, and use dedicated QA accounts on a non-production project.
  - Add `AR-attachment/` to `.gitignore`, or commit it intentionally.
- **Regression test:** A pre-commit secret scan (for example gitleaks) in CI. Introducing it needs an ADR.

## SEC-26: Password can be set from any session without re-authentication; other sessions survive

- **Severity:** P3. It raises SEC-20 and SEC-21 to a persistent takeover.
- **Confidence:** High.
- **Location:**
  - `src/features/auth/AcceptInvitePage.tsx:65-81`: `updatePassword` and then `completeOwnerOnboarding`, available to any signed-in non-admin.
  - `ResetPasswordPage.tsx` is the same (SEC-12).
  - `supabase/config.toml:228` sets `secure_password_change = false` (the runbook wants it on).
  - No `signOut({ scope: 'others' })` is called anywhere in `src`.
  - `public.complete_owner_onboarding()` (`20261020091428…sql:320-346`) can be called directly without setting a password. That marks the invitation accepted and makes provision-owner's resend return `already_accepted` (`handler.ts:335`). Probe `[obs] invited owner completes onboarding via RPC…` was allowed.
- **Impact:**
  - A stolen session (XSS, shared device) can change the password, so the takeover becomes permanent.
  - A session an attacker obtained before the owner reset their password stays valid.
- **Recommended fix:**
  - Enable "secure password change" on every project.
  - After any successful password set, call `signOut({ scope: 'others' })`.
  - Only render `SetPassword` on `/accept-invite` when the session came from an invite or magic-link redirect (the fragment had `type=invite|magiclink`) or `accepted_at` is null.
  - On `/reset-password`, only render it when supabase-js raised `PASSWORD_RECOVERY`.
- **Regression test:** A component test: after setting the password, `signOut` is called with `scope: 'others'`. Another component test: a session without the recovery event sees no set-password form.

## SEC-27: Owners can change public identity fields and timestamps (no column-level UPDATE grants)

- **Severity:** P3.
- **Confidence:** High (reproduced).
- **Location:**
  - `20261012192143_init_schema.sql:380` and `:387-389`: `grant ... update ... to authenticated` on whole tables.
  - The guard trigger (`:224-241`) only protects `slug` and `status`.
- **Evidence:** In `probe-out.txt`, these were all allowed with 1 row affected:
  - `owner renames public business (name)`
  - `owner sets external logo_url host` (`https://tracker.example/p.png`)
  - `owner back-dates businesses.created_at`
  - `owner sets published_at on a draft product` (overwritten when it is published)
- **Impact:**
  - After activation, an owner can rename the catalogue to impersonate another brand.
  - They can embed a third-party logo URL that logs every catalogue visitor's IP. CSP `img-src` is report-only, so nothing stops it.
  - Owners can also edit audit-relevant timestamps.
- **Recommended fix:** In a new migration, keep RLS as is and narrow the grants:

  ```sql
  revoke update on public.businesses from authenticated;
  grant update (name, slug, status, logo_url, description, contact_email, contact_phone, contact_website,
                contact_address, accent_color, default_currency) on public.businesses to authenticated;
  revoke update on public.products from authenticated;
  grant update (slug, name, short_description, description, material, cta_label, cta_url, category, price, currency,
                status, width, height, depth, dimension_unit, weight_value, weight_unit) on public.products to authenticated;
  -- logo must be this business's own upload in the public bucket (prefix is per project; use a check or a trigger):
  -- check (logo_url is null or logo_url like 'https://%.supabase.co/storage/v1/object/public/business-logos/%')
  ```

  `slug` and `status` stay in the grants because admins use the Data API for them. The trigger still blocks owners. Decide with the client whether renaming needs admin review. If so, extend `guard_business_admin_fields` to `name`.
- **Regression test:** PGlite: an owner `update ... set created_at` / `published_at` is denied (permission denied for column); an admin status change still works.

## SEC-28: Admin-only integrity nits in Edge Functions

- **Severity:** P3.
- **Confidence:** High.
- **Findings:**
  - `provision-owner/handler.ts:300`: `applicationId` from the request body is written to `audit_events` and `email_log` without a check that the application's `business_id` equals `businessId`. Fix: look up `business_applications where id = applicationId and business_id = businessId`, and otherwise store null.
  - `provision-owner/handler.ts:272-277`: the Origin fallback for `redirectTo` is dead in practice. It is only used when the email config is incomplete, and then the email is `blocked`. It still accepts any `https://` origin. Fix: remove it and return 503 when `APP_BASE_URL` is unset.
  - `send-test-email/index.ts:137-140`: `updateStatus` overwrites `email_log.status` for any `provider_message_id`, which bypasses the forward-only rank in `service_record_email_event`. Fix: route it through the same rank logic, for example a `service_set_email_status(id, status)` with the rank check.
  - `track-event/index.ts:11` and `send-test-email/index.ts:99` call `JSON.parse(SUPABASE_SECRET_KEYS)` without try/catch, unlike the shared `serviceKeyFrom`. A malformed secret crashes boot. Use `serviceKeyFrom` everywhere.

---

## Known open items re-confirmed (not new IDs)

- **D2** (`docs/PRODUCTION_AUDIT_AND_PLAN.md:120`): Preview deployments share the production Supabase project, and `DECISIONS.md:19` uses the client project for development. Preview and Production env separation is therefore **not** reasonable for real owner data yet. The design target is right (design/20:107 "Preview + Development: `VITE_DATA_MODE=demo` only"; design/23 per-environment secrets) but is not in place. It combines with SEC-21: the only Supabase project ends up with preview wildcards.
- **SEC-11:** Storage MIME limits are enforced from the client-declared Content-Type, not the bytes. The buckets do have server-side `allowed_mime_types` and `file_size_limit` (`20261012192159_storage.sql:22-28`), and SVG is excluded from the public logo bucket. Files are served from `*.supabase.co`, not the app origin, so there is no app-origin XSS. One caveat: `on conflict (id) do nothing` means a pre-existing bucket keeps its old limits. Verify them on each project.
- **SEC-03** is subsumed by SEC-22. **SEC-12** is extended by SEC-26. **SEC-01** is re-opened by SEC-20.

## Checked and found OK

**Database and RLS** (`probe.cjs`, 44 probes, all as expected under Supabase-style default privileges)
- RLS is enabled on all 12 public tables. `product_analytics_daily` is `security_invoker`. The private tables (`analytics_hits`, `email_provider_events`) have RLS on and the schema has no `USAGE` for anon or authenticated.
- anon has SELECT only on `businesses`, `products`, `product_images`, `product_models` and `product_variants`.
- `audit_events`, `business_applications`, `email_log` and `platform_admins` are SELECT-only for authenticated, and RLS limits them to admins (or to the user's own row for `platform_admins`). No client role can insert into `product_analytics`, `audit_events` or `business_applications`.
- An owner cannot:
  - change their business's `status` or `slug` (trigger 42501);
  - read or update another business;
  - insert, move or delete memberships;
  - write `platform_admins` (so no self-promotion to admin);
  - insert products into another business, move products across businesses, or use `save_product` on another business's product id;
  - add images to another business's products, or reference another business's storage file from their own product (WITH CHECK on the folder, which closes SEC-05);
  - upload into another business's folder or the admin `new/` folder, or rename their own object into another business's folder;
  - read another business's private media, analytics, applications, email log or audit trail.
- `business_members.role` is constrained to `'owner'`, with a unique index of one owner per business. There is no client-writable `is_admin` or approval field anywhere.
- SECURITY DEFINER functions all `set search_path = ''`.
  - `admin_*` functions check `is_platform_admin()` first: stranger calls get `platform_admin_only`.
  - `service_*` and `record_event_limited` have EXECUTE revoked from public, anon and authenticated (calls get "permission denied").
  - Trigger functions in `private` are not callable.
  - `is_platform_admin` and `is_business_member` are invoker functions over RLS'd tables, so they cannot be used as an oracle for other users. No IDOR through parameters.
  - `admin_user_emails` is capped at 200 ids. `admin_review_application` enforces the transition graph, a reason on reject, and idempotent repeats, and it creates only `draft` businesses with empty contact fields.
- Publish invariants (gallery image needed, server-stamped `published_at`) are enforced by deferred constraint triggers. The owner cannot bypass them through PATCH.
- URL columns are `^https?://` only (or `/x`, not protocol-relative), so no `javascript:` or `data:`. `accent_color` is a strict hex regex, so no CSS injection. Sizes are bounded.

**Edge functions**
- `provision-owner` and `send-test-email` run with `verify_jwt = true`. In addition, the server re-checks the caller through `auth.getUser(token)` and a `platform_admins` lookup with the service role. There is no reliance on client claims.
- The invite or action link is never returned in the response, logged or stored. It goes only into the email, and the template requires https and escapes it.
- Provisioning refuses platform-admin emails. Resend has a cooldown (60 s) and a cap (10).
- `resend-webhook`:
  - Uses the svix HMAC-SHA256 over `id.timestamp.body` with the base64 secret.
  - Comparison is constant-time. The early length check leaks only the fixed length.
  - Tolerance is ±300 s.
  - Replay is dropped by the `svix_id` primary key.
  - It refuses requests when the secret is unset, and caps the body at 64 KB.
- Bodies are size-capped (track 1 KB, submit 20 KB, provision 4 KB). Errors returned to clients are generic codes; details go only to `console.error`, truncated.
- CORS `*` is acceptable because auth uses a bearer header, not cookies, so there is no CSRF.
- The service key is read only inside functions and never echoed.
- Idempotency: `submission_key` is unique, Resend `Idempotency-Key` is set per workflow and attempt, and webhook events are processed once.
- `track-event`:
  - Takes UUID and enum input.
  - Records only for a product that is published in an active business.
  - Every call counts toward the visitor limit.
  - Stores no IP or user agent, only a daily-salted hash kept about 1 hour, plus a raw event with no personal data.

**Client**
- There is no `dangerouslySetInnerHTML`, `innerHTML` or `eval` in `src`.
- `?next=` is used only via React Router `<Navigate>` after a `startsWith('/admin' | '/dashboard')` check (`LoginPage.tsx:28`, `DemoAccounts.tsx:33,38`). Same-origin path only, so no open redirect.
- Roles come from the `platform_admins` and `business_members` tables (`services/supabase/auth.ts:70-81`), never from `user_metadata`. `RequireRole` is UX only, as documented.
- External links use `rel="noopener noreferrer"`. `mailto:` and `tel:` use DB-constrained values.
- The production build guard refuses `sb_secret_` and `service_role` keys (`backendConfig.ts`).
- `dist/` (built 2026-10-20 17:35) contains only the publishable key and the URL. Matches for `sb_secret_` and `service_role` are the guard's own strings. The `re_…_` matches are three.js `EXT_texture_*` names. There are no `whsec_` strings, no JWTs and no Resend or Vercel secrets.

**Git hygiene**
- `.env*` (except `.env.example`) and `*.local` are ignored. No env or credential file was ever committed. The history scan shows only test fixtures.

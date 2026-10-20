# Sanctus: full audit, security hardening and production readiness

| | |
|---|---|
| **Date** | 2026-10-20 |
| **Branch** | `feature/sanctus-brand-design-system` (base `d9101ae`, changes uncommitted) |
| **Scope** | Whole repository: SPA, Supabase migrations and RLS, Edge Functions, docs. Live systems were not modified. |
| **Method** | Four independent reviews (security, correctness and user journeys, human-centred UX in a real browser, over-engineering), then verified fixes with regression tests and a full re-run of every gate |
| **Detailed findings** | [`findings/security.md`](findings/security.md), [`findings/correctness.md`](findings/correctness.md) (includes the full route inventory), [`findings/ux-human-centred.md`](findings/ux-human-centred.md), [`findings/ponytail.md`](findings/ponytail.md) |

Status words used throughout: **Verified working**, **Verified failing**, **Partially verified**, **Not tested**, **Blocked by configuration or access**, **Requires product decision**.

---

## 1. Executive summary

- **No P0 found.** The database layer held up: 44 RLS and grant probes as anonymous, owner and admin users found no bypass. An owner cannot change a status or slug, cross into another business, edit memberships, make themselves admin, or reach another business's storage.
- **Two P1 security issues were found in the invitation and sign-in path. The code side of both is fixed:**
  - SEC-20: the owner invitation could link an account somebody else had pre-registered.
  - SEC-21: the docs recommended a wildcard redirect URL on `vercel.app`.

  Their live side depends on Supabase Auth settings that only an Administrator can change, and that is currently **Blocked by access**.
- **Correctness:**
  - All 17 P2 defects were confirmed, and 16 of them are fixed in code with tests.
  - COR-07 needs a migration. COR-05's audit row and COR-16's database hardening also need one; their user-facing parts are fixed.
- **UX:**
  - 1 P1 is fixed: the site navigation links did not scroll.
  - 12 of the P2s are fixed.
  - The 2 remaining P2s (UX-10, UX-11) are **Requires product decision** or planned work.
- **Gates:**
  - Typecheck, lint, build and `npm audit` are clean.
  - Unit and component tests: 215 passed, up from 174.
  - Database (PGlite) tests: 25/25.
  - End-to-end: 31/31 at the last run; the final re-run is recorded in section 8.
- **Release decision: not ready for production cutover yet.**
  - The application code is in a releasable state for the Preview.
  - Production is blocked by:
    - client-side configuration (Auth settings, email secrets, sending domain);
    - a real-device AR check;
    - the owner's go-ahead on three small migrations (section 13).

> **Action for the account holder:** during this audit, the value of `RESEND_API_KEY` from the local `.env.qa` file was printed into a tool log of the review session. It was not written to any file or commit. Rotate the key in Resend (API Keys → revoke → create) and update `.env.qa` and any Edge Function secret that uses it.

---

## 2. Architecture and route inventory

**Stack:** Vite 8, React 19, TypeScript 6, Tailwind 4 and React Router 8. The backend is Supabase only: Postgres with RLS, Auth, Storage, and Deno Edge Functions. Hosting is on Vercel.

The SPA reads data only through `src/services`. A demo implementation (`mock`, in localStorage) and a Supabase implementation sit behind the same `CatalogService` interface.

**Edge Functions:**

| Function | Who can call it | What it does |
|---|---|---|
| `submit-application` | Public | Validation, idempotency, duplicate check, rate limit, audit, emails |
| `provision-owner` | Platform admin, checked again on the server | Invitations via `auth.admin.generateLink` |
| `resend-webhook` | Resend, verified by svix signature | Delivery status updates |
| `send-test-email` | Admin | Test send |
| `track-event` | Public | Analytics events, rate-limited |

The full route inventory is in [`findings/correctness.md`](findings/correctness.md) (first table). For each route it lists the role, data dependencies, actions, error states and covering tests. Summary:

| Surface | Routes | Role | Notes |
|---|---|---|---|
| Public | `/`, `/catalog/:slug`, `/products/:slug/:product`, `/apply`, `/accept-invite`, `/login`, `/reset-password`, 404 | anyone | EN/PT through `t()`. Only active businesses are visible (RLS). |
| Super Admin | `/admin` overview, applications (list, detail), businesses (list, new, detail), products (list, new, edit), analytics, catalogs and QR, audit log (`/admin/activity`), settings | platform admin | English only. Every privileged write is enforced by RLS or by an Edge Function. |
| Owner | `/dashboard` overview, products, add/edit product, analytics, catalog and QR, business settings | business owner (one per business) | Scoped by `business_members` in RLS. Not limited by the UI alone. |

---

## 3. Feature verification matrix

| Feature | Status | Evidence |
|---|---|---|
| Landing page, EN/PT, navigation | Verified working | e2e `landing.spec.ts`. Section links verified after the fix in a browser (After-UX01 screenshot). |
| Public catalogue: browse, filter, search, empty and error states | Verified working (demo) | e2e `public.spec.ts`. COR-08 regression test. |
| Product page: photos first, 3D viewer | Verified working (demo) | e2e and the UX browser pass |
| Variant switching shows the variant's own photo or model | Verified failing, **Requires product decision** | UX-11. The data model has no media per variant yet (planned "sub-project 3"). |
| Native AR handoff (Scene Viewer, Quick Look) | Partially verified | Attributes present. Placement and scale need a real phone (Not tested). |
| AR "true to size" claim | Verified working (after the COR-10 fix) | Copy is now qualified when a separate USDZ was never measured. |
| QR codes (catalogue URL) | Verified working | e2e `qr-copy.spec.ts` |
| Apply wizard: validation, draft survives refresh, Back button, success screen | Verified working | e2e `applications.spec.ts`, mobile spec, `ApplyPage.test.tsx` |
| Application review: start review, approve, reject, reopen | Verified working (demo), Partially verified (Supabase) | e2e. The 2026-10-20 Preview QA on the client project passed 13/13 before this audit. |
| Owner invitation: provision, resend, remove | Verified working in code and tests. **Blocked by configuration** for real delivery. | handler tests (14), mock tests. Emails are logged as "Not sent: email service not configured" until the secrets are set. |
| Invitation acceptance and password set | Partially verified | Component tests (COR-15). The real-link round trip needs email and Auth redirect configuration. |
| Owner dashboard: products, uploads, publish rules | Verified working (demo) | e2e `product-crud`, `model-optimize`. New `ProductEditorForm.test.tsx`. |
| Business CRUD and status | Verified working | e2e `business-crud`. COR-04 and COR-05 regression tests. |
| Audit log | Verified working | e2e. Rows now name the business and application (UX-15). |
| Analytics | Partially verified | Unit tests. "Views" and "AR launch attempts" are recorded as separate event types. Live numbers were not checked. |
| Resend delivery webhook | Verified working (unit), **Blocked by configuration** (live) | Signature, replay and idempotency tests. The webhook is not yet created in Resend. |
| RLS and storage isolation | Verified working | 44 probes (security review) and the PGlite migration suite, 25/25 |

---

## 4. User-journey findings (summary)

- **Visitor.** The navigation links did not scroll (UX-01). The 404 page ignored Portuguese (UX-03). The pages scrolled sideways by 6 px at 360 px wide (UX-04). Many tap targets were under 44 px (UX-30). The catalogue showed "0 products" while loading or after a failed load (COR-08). All fixed. **Still open:** a variant does not change the photo (UX-11); there are three overlapping 3D/AR controls on phones (UX-10).
- **Applicant.** The browser Back button left the wizard (UX-17). The success screen did not say what happens next and could promise an email that was not sent (UX-18). "(optional)" was untranslated. All fixed. The success screen survives a reload, and opening `/apply` again starts a fresh form.
- **Admin.**
  - Fixed: after approving, the "invite owner" step was out of view (UX-14).
  - Fixed: the audit rows did not name the business (UX-15).
  - Fixed: the overview did not show pending applications (UX-16).
  - Fixed: saving the business form silently re-activated a catalogue that had just been deactivated (COR-04).
  - Fixed: an address change had no warning (COR-05).
  - Fixed: a failed product load looked like "No products yet" (COR-06).
  - Fixed: the resend was always in English (COR-14).
  - Partially fixed: the same email could own two businesses and break onboarding (COR-16). It is now refused at provisioning; the database hardening still needs a migration.
- **Owner.**
  - Fixed: the slug in the dialog went stale after publishing (COR-11).
  - Fixed: the publish errors were lost on the first save (COR-12).
  - Fixed: parallel uploads overwrote each other (COR-13).
  - Fixed: errors stuck after a valid value was entered (UX-02).
  - Fixed: publish rules appeared one round at a time (UX-12).
  - Fixed: the cm/in switch silently changed the numbers (UX-13).
- **Everyone signed in.**
  - Fixed: a network blip signed the user out and lost unsaved work (COR-01).
  - Fixed: a failed business lookup trapped the owner on a blank login (COR-02).
  - Fixed: "Switch account" bounced straight back (COR-03).
  - Fixed: logout did not wait for sign-out (COR-17).
  - Fixed: invitation acceptance could block for good on reload or `same_password` (COR-15).

---

## 5. Security assessment

The full write-up is in [`findings/security.md`](findings/security.md), with the location, preconditions, evidence, root cause, fix and test for each finding.

| ID | Sev. | Finding | Status |
|---|---|---|---|
| SEC-20 | P1 (P3 while sign-ups are off) | `provision-owner` linked any pre-existing account for the owner's email, so someone who pre-registered that address would own the business. | **Code fixed and tested:** an account not created by an invitation is refused (`account_not_invited`), and an email that already owns a business is refused (`email_owns_business`). Local `config.toml` sign-ups are off, and the runbook now says off. **Live: Blocked by access.** Confirm "Allow new users to sign up" is off on the client project. |
| SEC-21 | P1 (if the live allowlist has a wildcard) | The docs told readers to add `https://*-track0.vercel.app/**` as an Auth redirect. Any Vercel user can claim a matching hostname and receive reset or invite tokens. | **Docs fixed** (design/20, runbook): exact URLs only, no wildcard on `vercel.app`, no localhost on production. **Live allowlist: Blocked by access.** |
| SEC-22 | P2 | The rate limits key on the first `X-Forwarded-For` entry, which a client may control (20 of 20 spoofed submissions were accepted in the reproduction). | **Open.** Which entry is trustworthy depends on how Supabase's edge sets the header. A wrong guess would put every visitor in one rate-limit bucket. Needs a controlled test on the Preview (section 15). |
| SEC-23 | P2 | The public form sends an email to any address it is given, with applicant text in it (spam/phishing relay), and could use up the Resend quota. | **Fixed:** the confirmation email no longer contains any applicant-supplied text (regression test). Quota exhaustion is still limited only by the rate limit (see SEC-22). |
| SEC-24 | P3 | The CSP is report-only. HSTS and COOP are at defaults. | Open. Recommended once the production domain is known. |
| SEC-25 | P3 | Plaintext QA credentials sit in the git-ignored `.env.qa` and `MUSE_QA_PROMPT.local`. Nothing was ever committed (history checked). | Open (operational). Rotate after QA. |
| SEC-26 | P3 | Setting a password did not sign out other sessions. | **Fixed:** other sessions are signed out after a password is set on `/accept-invite` and `/reset-password`, and a failure of that step does not block the user. |
| SEC-27 | P3 | Owners can update every column of their business (UPDATE grants cover whole tables), e.g. the logo pointing at any https host. | Open. Needs a migration with column-level grants (owner approval). |
| SEC-28 | P3 | Admin-only data-integrity gaps in the Edge Functions. | Open (low risk; admin only). |

**Checked and OK:** RLS on every table. Owners cannot reach other businesses. Admin-only functions check the caller. Service-only functions are not callable from the browser. Invite links are never returned or logged. The webhook check is constant-time, with a 5-minute tolerance and replay protection. There is no unsafe HTML. `?next=` stays on-site. The built bundle contains only the publishable key. Git history has no secrets. `npm audit` shows 0 vulnerabilities.

**Still open from earlier audits:** Preview deployments share a Supabase project with development, and there is no separate staging (D2).

---

## 6. Confirmed defects and severity

| Severity | Found | Fixed in this pass | Remaining |
|---|---|---|---|
| P0 | 0 | 0 | 0 |
| P1 | 3 (SEC-20, SEC-21, UX-01) | 3 in code/docs | Live settings for SEC-20 and SEC-21 (access) |
| P2 | 17 correctness, 2 security, 14 UX | 16 correctness, 1 security, 12 UX | COR-07 (migration), SEC-22 (live test), UX-10 and UX-11 (product decision / planned work) |
| P3 | 38 correctness, 5 security, about 12 UX | About 15 (editor, admin, public, i18n, accessibility) | Listed with fixes in the findings files |

Defects introduced and caught during this pass:
- The new success screen hid the form on a later visit to `/apply`. It is now kept per history entry.
- A second "Invite owner" button was ambiguous. It is renamed "Go to owner invitation".
- A render/effect race in the business form could drop a keystroke. It is now resolved inside the state updater.

---

## 7. UX, accessibility and localisation: Human-Centred Design & Friction Audit

The full audit is in [`findings/ux-human-centred.md`](findings/ux-human-centred.md). For each issue it gives the screen, role, user goal, flaw, why a real person gets confused, severity and estimated frequency (labelled as estimates), the recommended change and acceptance criteria. It also includes a test log of 205 screenshots across 1440, 390 and 360 px in EN and PT.

**Most consequential, now fixed:**
- **UX-01 (P1):** navigation links did not scroll to their section, so the site felt broken on the first click.
- **UX-12:** publish rules appeared one round at a time, so owners went through three cycles of "fix and retry".
- **UX-13:** the cm/in switch silently changed real-world dimensions. That is an AR scale risk.
- **UX-14 and UX-16:** admins could approve and then miss the owner-invitation step.
- **UX-17 and UX-18:** applicants lost their place with Back and did not know what happens next.

**Open, needing a decision:**
- **UX-10:** desktop shows "3D" and "View in 3D / AR". Phones show three overlapping 3D/AR controls. AR changes need the owner's go-ahead and a device test (ADR-0021).
- **UX-11:** choosing a finish changes the price but not the photo. Needs per-variant media (planned).
- **Portuguese dialect:** the copy mixes European and Brazilian forms. This is open client decision C6; the landing copy is the client's reference text.
- **"catalog" vs "catalogue":** pick one.
- **Product contact link:** the per-product "Contact seller / Contactar a loja" link is kept, as recorded in ADR-0023. The client should confirm it, given the "no store-contact CTA" scope.

**Passed:** no images without alt text, no unlabelled inputs, visible focus everywhere, the unsaved-changes guard works, reduced motion is respected, and all text colour tokens meet WCAG AA. One exception: white text on the fallback bronze accent is 4.35:1, which is open (P3).

**Brand:** the Sanctus palette, Cormorant Garamond and Jost are used as specified. The new 404 page now uses the brand serif and the public layout.

---

## 8. Test commands and actual results

| Command | Before this pass | After |
|---|---|---|
| `npm run typecheck` | exit 0 | exit 0 |
| `npm run lint` (oxlint, 0 errors required) | 0 errors | 0 errors, 22 advisory warnings |
| `npm test` (vitest, unit and component) | 174 passed, 15 skipped | **215 passed, 15 skipped** (3 consecutive full runs green after the final fixes) |
| `npx vitest run supabase/tests` (PGlite migration and RLS) | 25/25 | 25/25 |
| `npm run build` | ok | ok |
| `npm audit` (all and `--omit=dev`) | 0 vulnerabilities | 0 vulnerabilities |
| `npm run test:e2e` (Playwright, desktop and mobile, demo mode) | 31/31 | 31/31 after the fixes. The final re-run after the last two edits is recorded in [`TEST_RUN.md`](TEST_RUN.md). |
| Post-fix browser check (demo, 1440 / 390 / 360, EN/PT) | n/a | No horizontal overflow on `/`, `/apply` or the catalogue at 360 and 390 px. The About link lands its section under the header. The PT 404 shows "Página não encontrada". |

The 15 skipped tests are the live Supabase integration tests. They need credentials and are not run in CI by design.

---

## 9. Implemented fixes and changed files

55 tracked files changed (+1,269 / −412), plus 9 new files. Nothing was committed or deployed.

| Area | Files | Fixes |
|---|---|---|
| Owner invitations (Edge Function) | `supabase/functions/provision-owner/{handler,index}.ts` | SEC-20, COR-16 (`account_not_invited`, `email_owns_business`), COR-14 (resend language) |
| Email templates | `supabase/functions/_shared/email-templates.ts` | SEC-23 |
| Supabase local config, docs | `supabase/config.toml`, `System_arch/design/20-deployment.md`, `docs/OPERATIONS_RUNBOOK.md` | SEC-20 (sign-ups off), SEC-21 (no wildcard redirects) |
| Services | `catalogService.ts`, `supabaseCatalogService.ts`, `mock/mockCatalogService.ts`, `services/index.ts`, `lib/format.ts` | New error messages, resend language, one business per email in demo, local-day date filters (COR-49), demo helpers re-exported (no UI import of `services/mock`) |
| Auth | `auth/AccountProvider.tsx`, `auth/RequireRole.tsx`, `services/supabase/auth.ts`, `features/auth/*`, `DashboardShell.tsx` | COR-01, 02, 03, 15, 17, SEC-26, translated auth errors, removal of sign-up leftovers |
| Product editor | `features/products/**`, `components/ui/ImageUpload.tsx`, `lib/files.ts` | COR-11, 12, 13, 18, 19, 21, 23, UX-02, 12, 13 |
| Public site | `features/public/**`, `features/marketing/**`, `app/router.tsx` (404 routes), new `PublicNotFoundPage.tsx`, `tapTarget.ts` | UX-01, 03, 04, 30, COR-08, 09, 10, "Catalog not found" onward link |
| Admin and apply | `features/admin/**`, `features/businesses/**`, `features/applications/labels.tsx`, `features/apply/ApplyPage.tsx`, `lib/urls.ts`, `components/ui/Form.tsx` | COR-04, 05, 06, 26, UX-14 to UX-18, remove-owner double-click guard, URL builders, translated "(optional)", heading levels |
| i18n | `src/i18n/dictionaries/en.ts`, `pt.ts` | New keys in both languages (auth errors, reset page, apply success, 404, optional) |

---

## 10. Regression coverage added

| Test file | Covers |
|---|---|
| `supabase/functions/provision-owner/handler.test.ts` (+3) | Pre-registered account refused, email already owning a business refused, resend language |
| `supabase/functions/send-test-email/handler.test.ts` (+1) | No applicant text in the confirmation email |
| `src/services/mock/service.test.ts` (+1) | One business per owner email (demo parity) |
| `src/lib/lib.test.ts` (+1) | Local-day date bounds (run under a non-UTC time zone) |
| `src/test/auth.test.tsx` (new), `src/services/supabase/auth.test.ts` (rewritten) | COR-01, COR-02, COR-15, COR-17, `same_password`, other sessions signed out, 401 vs 5xx |
| `src/features/products/editor/ProductEditorForm.test.tsx` (new, 6) | UX-12, COR-12, UX-02, COR-13 (models and photos), UX-13 |
| `src/features/public/publicPages.test.tsx` (new, 8) | COR-08, COR-09, COR-10, 404 in EN and PT, "Catalog not found" link |
| `src/features/businesses/BusinessForm.test.tsx` (new) | COR-04, COR-05 |
| `src/features/admin/BusinessDetailPage.test.tsx` (new) | COR-06 |
| `src/features/apply/ApplyPage.test.tsx` (new, 4) | UX-17 (Back), reload resume, UX-18 (success after reload), fresh form on a new visit |

---

## 11. External configuration and access blockers

These need the client project's **Administrator** role (the current role is Developer) or the client themselves.

| # | Item | Why |
|---|---|---|
| B1 | Auth → Sign In / Providers → Email: **allow new users to sign up: off** | SEC-20 defence in depth |
| B2 | Auth → URL Configuration: exact Site URL and redirect URLs (`/login`, `/reset-password`, `/accept-invite`). **No wildcards on `vercel.app`.** Remove localhost on production. | SEC-21; invitation and reset links |
| B3 | Auth → leaked-password protection on, secure password change on, minimum length 12 | Account security |
| B4 | Edge Function secrets: `RESEND_API_KEY` (a **new, rotated** key), `EMAIL_FROM`, `APP_BASE_URL`, `ADMIN_NOTIFICATION_EMAIL`, `EMAIL_TEST_RECIPIENTS`, `RESEND_WEBHOOK_SECRET` | Without them no email is sent (shown honestly as "Not sent") |
| B5 | A verified sending domain in Resend (DNS records added by the client) | Real recipients |
| B6 | Create the Resend webhook pointing at `resend-webhook` | Delivered and Bounced statuses |
| B7 | Custom SMTP for Supabase Auth (Resend SMTP) | The built-in mailer is rate-limited and reaches only team members |
| B8 | Deploy the updated `provision-owner` Edge Function to the client project | The SEC-20, COR-16 and COR-14 server fixes take effect only after deploy (no database change needed) |

---

## 12. Unverified assumptions and residual risks

- **SEC-22:** how Supabase's edge populates `X-Forwarded-For` was not verified. Until it is, the per-IP limits on applications and analytics may be bypassable.
- **Account provenance check (SEC-20 fix):** it relies on `auth.users.invited_at` being set by `generateLink('invite')`. That is Supabase's documented behaviour, but it was not exercised against the live project in this pass. One consequence: an account created by hand in the dashboard (for example a QA user) cannot be made owner of a new business. That is intended.
- **AR placement and scale on real phones** were not tested. iPhone USDZ files are not measured (now stated honestly in the copy).
- Live Supabase behaviour was not re-run after these changes. Demo mode, unit tests, PGlite and e2e were. The earlier Preview QA (13/13) predates this pass.
- The UX severities are the reviewers' judgement; the frequencies are estimates, not measured user research.

---

## 13. Prioritised remaining work

1. **Rotate the Resend API key** (exposed in a review log).
2. Client access items B1 to B8 (section 11). Then run a full real-email invitation round trip on the Preview.
3. **Migrations, after the owner's approval.** The SQL is drafted below. None has been applied or committed as a migration file.
   - **COR-16 hardening:** make `complete_owner_onboarding()` safe when a user has more than one pending membership (`with u as (update … returning business_id) select business_id from u limit 1`).
   - **COR-05 audit:** add a `business_slug_changed` audit event in `private.audit_business_change` (full SQL in `findings/correctness.md` and the admin-fix notes).
   - **COR-07:** add a `public_business_state(slug)` SECURITY DEFINER RPC that returns only `status` and `name`. Visitors to a paused catalogue then see "currently unavailable" instead of "not found".
   - **SEC-27:** column-level UPDATE grants for owners on `businesses` (name, description, contact, logo only).
4. **SEC-22:** controlled header test on the Preview, then key the rate limits on the verified client-IP source.
5. **Product decisions:**
   - UX-10: one clear 3D action plus a separate AR action. Needs the owner's go-ahead and a device test.
   - UX-11: per-variant photos and models (sub-project 3).
   - The Portuguese dialect (C6).
   - "Contact the store" link: keep or remove.
6. **SEC-24:** enforce the CSP and add HSTS once the production domain is fixed.
7. **Ponytail simplification** (about 325 lines, see `findings/ponytail.md`). Applied here: dead-code removals (sign-up leftovers, the unreachable SVG branch) and the `services/mock` import rule. The rest is refactoring with no behaviour change. Do it as a separate PR so it doesn't mix with fixes.
8. **Remaining P3s** in the findings files.

---

## 14. Release-readiness decision

| Gate | Status |
|---|---|
| Build and type checks | Verified working |
| Critical automated tests (unit, PGlite, e2e) | Verified working |
| Authentication and role authorisation | Verified working in code and tests. Live Auth settings: **Blocked by access** (B1 to B3). |
| RLS and storage isolation | Verified working (44 probes, PGlite suite) |
| Environment separation | Partially verified. Preview and development share a project, with no staging (D2). |
| Database migration readiness | Verified working for the applied migrations. Three more are proposed and **Require product decision** (owner approval). |
| Email and invitation workflows | **Blocked by configuration** (B4 to B7). Failures are logged honestly. |
| Error handling and observability | Partially verified. UI error states fixed. There is no central error reporting service. |
| Backup and recovery | Not tested in this pass. See the runbook; it depends on the client's Supabase plan. |
| Dependency and secret hygiene | Verified working (0 vulnerabilities, clean history, publishable key only), **except** the Resend key that must be rotated. |
| Accessibility and responsive usability | Partially verified. The main issues are fixed. Two P3 items are open (bronze fallback contrast, PT dialect). |
| Real-device AR validation | **Not tested** (needs a physical Android phone and iPhone) |
| Deployment and rollback procedure | Documented (runbook). Not exercised in this pass. |
| Privacy, retention, client operational decisions | **Requires product decision** (retention of applications and email logs, contact link, dialect) |

**Decision: not ready for the production cutover.** The code is ready for a Preview round with the client once B4 and B8 are done. Production needs B1 to B7, the key rotation, the real-device AR check and the owner's decision on the proposed migrations.

---

## 15. Exact next actions

1. Rotate the Resend API key and put the new value into `.env.qa` and, later, the Edge Function secrets.
2. Review this diff, then commit it on `feature/sanctus-brand-design-system`. Do not push to `main`.
3. Deploy the updated `provision-owner` function to the client project: `npx supabase functions deploy provision-owner --project-ref zggylkbgajamhriebdrg --use-api`.
4. Once Administrator access is granted (or the client does it), apply B1 to B7.
5. On the Preview, run the real invitation round trip: apply, approve, invite, receive the email, set the password, sign in, open the dashboard. Also check the webhook moves the status to Delivered.
6. SEC-22 test on the Preview:
   1. Send 6 applications from one machine with different `X-Forwarded-For` values, using a throwaway `@resend.dev` applicant.
   2. If more than 5 are accepted, switch the key to the edge-supplied client IP and re-test.
   3. Remove the test applications afterwards (with approval).
7. Decide on the three migrations in section 13. Once approved, create them with `npx supabase migration new`, add PGlite tests, and apply them to the client project.
8. Real-device AR check on one Android phone and one iPhone, recording measured size against the stated size.
9. Client decisions:
   - 3D/AR controls (UX-10);
   - variant media (UX-11);
   - Portuguese dialect;
   - the "Contact the store" link;
   - data retention.

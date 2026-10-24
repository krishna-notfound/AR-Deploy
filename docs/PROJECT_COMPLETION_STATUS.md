# Sanctus: project completion status

**Last updated:** 2026-10-24
**Branch:** `feature/sanctus-brand-design-system`. Local head: `a350156`. Pushed head: `ea6f0ae`.
**Data:** the client dev project `zggylkbgajamhriebdrg`, used by the Preview. The live project `pmnjchhrgvajtjpadpqo` and `main` are untouched.

This is the single place for **what is done, what is blocked and what decides the release**. Detailed evidence is linked, not repeated.

## 1. Completed and verified

| Area | What | Commits | Evidence |
|---|---|---|---|
| Brand and landing | Sanctus design system, EN/PT landing | `ff0820e` | e2e `landing.spec.ts` |
| Onboarding | Apply wizard, admin review (approve or reject), one owner per business, invitation, password setup, audit log | `71aed48`, `e2c1e74` | e2e `applications.spec.ts`. Preview QA: apply → approve → invite → accept passed in the real UI (`docs/SANCTUS_DASHBOARD_TEST_RESULTS.md`). |
| Invitation security | Pre-registered accounts and second businesses refused (SEC-20, COR-16). Other sessions signed out after a password is set (SEC-26). | `e2c1e74` | `provision-owner` handler tests. Deployed to zggyl. |
| Owner dashboard | Next steps, draft and paused notices, catalogue preview, product QR (ADR-0025), AR readiness, analytics labelled "AR launch attempts" | `a1e8392`, `422481b` | Journeys A–G on the Preview: 98 PASS (`docs/dashboard-audit/qa-journeys.md`) |
| Variant media | Photos, GLB and USDZ per finish; `?variant=` links | `a1e8392` | Migration `20261020143507` applied to zggyl. Journey C passed. 8 PGlite tests. |
| 3D/AR hardening | GLB/USDZ content checks, Scene Viewer extension warning, no duplicate AR events, error states | `a1e8392` | `docs/SANCTUS_3D_AR_QA_REPORT.md` |
| Owner isolation | RLS and storage isolation | n/a | About 100 PGlite probes, plus REST checks with the QA owner's own session on the Preview (0 rows elsewhere) |
| Copy and motion | No dash placeholders in tables, analytics or emails. JS smooth scrolling respects reduced motion (CSS already did). | `608b2ad` | Unit tests |
| Test stability | Worker cap and timeouts; the suite went from intermittent timeouts to stable | `f00f7c7` | 4 consecutive full runs green |
| Public Preview | Vercel protection off (owner request, 2026-10-22). `main` and production unchanged. | n/a | https://ar-deploy-git-feature-sanctus-brand-design-system-track0.vercel.app opens with no login |

## 2. Implemented, but not yet verified externally

| Item | Status | Why not verified |
|---|---|---|
| **Website embedding** (ADR-0026): `/embed/products/...`, a framable public product view, and a dashboard "Embed on your website" snippet. AR opens the full page in a new tab. | Built, with 9 tests. Checked in a local iframe (demo mode, 1280 and 390 px). | Not pushed yet, so the Preview doesn't have it. The `frame-ancestors` headers only apply on Vercel. They're covered by a unit test of `vercel.json`, but need a check on a deployed Preview. |
| **Security hardening migration** `20261024065538_security_hardening.sql`: owner column allow-list (SEC-27), https media URLs (OWN-06), storage path shape (OWN-02), blank names and negative price differences (OWN-03), AR events need a model (OWN-04), slug-change audit (COR-05), safe multi-membership onboarding (COR-16) | Prepared. 19 PGlite tests (50 of 50 pass); rollback script tested. | **Not applied.** It needs owner approval, plus the read-only pre-check `supabase/checks/20261024_security_hardening_precheck.sql` run on the target first. |
| Email templates (no applicant text, plain sign-off) | In code | `submit-application`, `send-test-email` and `provision-owner` need redeploying to carry the latest template text. No email is sent until the secrets exist (section 3). |

## 3. Blocked (exact missing input)

| # | Blocker | Needed from | Exact input |
|---|---|---|---|
| B1 | **Auth Site URL and redirect allow-list.** The Site URL is still `http://localhost:3000`, so invitation links land there (seen in QA). | Owner go-ahead (Admin access now available) | Site URL = the Preview branch URL for now. Exact redirect URLs: `https://ar-deploy-git-feature-sanctus-brand-design-system-track0.vercel.app/login`, `…/reset-password`, `…/accept-invite`. No wildcards on `vercel.app` (SEC-21). |
| B2 | Auth security settings | Owner go-ahead | Sign-ups **off**, leaked-password protection **on**, minimum password length 12, secure password change on |
| B3 | Email secrets (only Supabase's built-in secrets exist today) | Owner or client | A **new** `RESEND_API_KEY` (the old one was exposed in a log and should be rotated), plus `EMAIL_FROM` (sender name and address), `ADMIN_NOTIFICATION_EMAIL` (admin inbox), `APP_BASE_URL`, `EMAIL_TEST_RECIPIENTS` and `RESEND_WEBHOOK_SECRET` |
| B4 | Sending domain | Client (DNS) | Verify a domain in Resend. Until then, mail only reaches the Resend account's own address. |
| B5 | Resend webhook and Supabase Auth SMTP | After B3 and B4 | Webhook pointed at `…/functions/v1/resend-webhook`, and SMTP through Resend for Auth emails such as password reset |
| B6 | Real email tests: application confirmation, invitation, password recovery | After B1 to B5 | n/a |
| B7 | **Meshy-generated model** for the end-to-end model test | Owner | The actual GLB (and USDZ if available) file. No Meshy model exists in the repo or `AR-attachment/`. |
| B8 | Real-device AR: Scene Viewer, Quick Look, true scale | A person with an ARCore Android phone and an iPhone | Steps are in `docs/SANCTUS_3D_AR_QA_REPORT.md`, section 7 |
| B9 | Push the branch so the Preview gets embedding, and check the embed headers there | Owner authorisation to push | n/a |

## 4. Client decisions still open

These are not to be decided silently.

- **Product categories:** a fixed furniture list today, versus multi-industry (C10).
- **Store-contact link:** keep or remove the per-product "Contact the store" link. It is kept under ADR-0023, but the scope says no store contact.
- **Portuguese:** pt-PT or pt-BR (the copy currently mixes both).
- **iOS:** is a USDZ mandatory per product and per finish, or is the phone-generated one acceptable?
- **Domain:** the production domain, and whether catalogues use subdomains.
- **Sender identity and admin inbox:** see B3.
- **Analytics:** count every page view (today) or unique daily visitors.
- **Landing quote attribution "— SANCTUS":** this is the client's reference copy, so the dash was kept.

## 5. Test results (current tree, `a350156`, 2026-10-24)

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass (0 errors, advisory warnings only) |
| `npm test` | **311 passed, 15 skipped** (the live integration suite needs credentials). 4 consecutive runs green. |
| `npx vitest run supabase/tests` | **50 passed** (includes the prepared migration) |
| `npm run build` | pass |
| `npm run test:e2e` (demo mode, desktop and mobile) | **31 passed** |
| Preview journeys (on `a1e8392` and `422481b`) | 98 PASS, 0 open FAIL, 5 BLOCKED (devices, other-tenant writes), 1 NOT TESTED (on purpose) |

## 6. Known defects and limitations

- DUX-06: the editor shows the publish checklist only after the first publish attempt. All problems now appear together in one pass.
- Native AR doesn't work inside iframes, by browser design: the embed opens the Sanctus page for AR.
- Any website may embed a published product. There is no per-business list of allowed sites.
- Preview and dev share one Supabase project (D2). There is no separate staging.
- SEC-22: whether the rate limit's `X-Forwarded-For` keying can be spoofed is unverified on the live edge.

## 7. Next actions, in order

1. Owner: approve B1 and B2 (Auth settings), provide B3 (new Resend key, sender, admin inbox) and authorise B9 (push).
2. Apply B1 to B5, redeploy the three email functions, then run B6.
3. Run the pre-check, then apply the security hardening migration after approval.
4. B7 (Meshy model) and B8 (device AR) tests.
5. Client decisions (section 4).

## 8. Production release conditions

The production release requires all of the following:
- B1 to B8 are done and verified;
- the security hardening migration is applied;
- the production domain is configured, with Auth URLs for that domain;
- separate production Supabase credentials (not the Preview's);
- Vercel protection reviewed for production;
- the owner's explicit approval to merge into `main` and switch the live site to the client project.

None of this has been done, and production is **not** ready.

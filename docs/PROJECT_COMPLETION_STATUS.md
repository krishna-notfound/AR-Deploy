# Sanctus: project completion status

**Last updated:** 2026-10-24
**Branch:** `feature/sanctus-brand-design-system`, pushed. Tested code commit: `26c03a5`. Later commits change only docs and config.
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
| Website embedding (ADR-0026) | `/embed/products/...` and a dashboard snippet | `a350156` | Live on the Preview: `/embed/*` sends `frame-ancestors *` and every other path sends `'none'`. Rendered inside a cross-origin page on desktop and Pixel 7, with the AR link opening the full page in a new tab. |
| Security hardening migration `20261024065538` | Owner column allow-list, https media, path shape, AR events need a model, slug audit, safe onboarding | `8df5b42` | Pre-check clean, then applied to zggyl on 2026-10-24. Live checks passed afterwards (owner product save, settings save, unpublish and re-publish, view and AR attempt 204). Generated types unchanged, no new advisor findings. |
| Auth settings (zggyl) | Site URL = Preview; exact redirects for `/login`, `/reset-password` and `/accept-invite` (plus localhost for dev); public sign-up refused (`signup_disabled` verified); minimum password length 12 | n/a | Verified by sign-in (200) and a sign-up probe (422) |
| Email functions redeployed | `submit-application`, `provision-owner`, `send-test-email` | n/a | Preflight 204 |
| Email delivery (Resend) | All secrets set: a new sending-only key "Sanctus server 2026-10-24" (temporary, the owner will replace it), the test sender `onboarding@resend.dev`, the Preview as `APP_BASE_URL`, a test admin inbox, and the signed webhook | n/a | 2026-10-24 on the Preview: applicant confirmation, admin notification and owner invitation all reached **delivered** through the signed webhook (`email_log`, application `ABE43EC0` and business "QA Preview Atelier 10201001") |
| Password reset | `/reset-password` crashed on the Preview ("Something went wrong": the page uses `t()` but its route sat outside the `LanguageProvider`). Moved under the public layout. Auth emails now go through Resend SMTP. | `26c03a5` | e2e regression test. On the Preview, 2026-10-24: a reset for the QA owner's test inbox was **delivered** by Resend (sender "Sanctus"), and its link opened the Preview's "Choose a new password" form. The password was not changed. |
| Leaked-password protection | `password_hibp_enabled = true` on zggyl | n/a | Management API read-back |
| Public Preview | Vercel protection off (owner request, 2026-10-22). `main` and production unchanged. | n/a | https://ar-deploy-git-feature-sanctus-brand-design-system-track0.vercel.app opens with no login |

## 2. Implemented, but not yet verified externally

| Item | Status | Why not verified |
|---|---|---|
| **Platform team roles: Owner, Admin and Team (ADR-0029, ADR-0030)** | **Applied to `zggylkbgajamhriebdrg` on 2026-10-25** (migration plus `invite-member`, `manage-member`, `accept-member-invite`, and `provision-owner` redeployed). Live check passed: the invitation email was delivered with a working link; `/join` created the account; the Team role sees only its places and has no Publish or Delete; deactivating ends access; the history recorded each step; reusing the link is refused. Two test members (`delivered+team…@resend.dev`, deactivated) remain in the project. Built on the branch and tested in demo mode: 15 role permissions enforced by RLS, link invitations to `/join`, the Team & Access page, role permissions, member detail and access history. Migration `20261025070915_platform_team_roles.sql` and 3 Edge Functions are written and tested, but **not applied**. Until they are, the Preview works as before: Owners sign in through `platform_admins`, and Team & Access says it isn't switched on yet. | Applying it to `zggylkbgajamhriebdrg` needs the owner's go-ahead (plan Task 18). Invitation emails then reach real inboxes only once a sending domain is verified (B4). |

## 3. Blocked (exact missing input)

| # | Blocker | Needed from | Exact input |
|---|---|---|---|
| B1 | ~~Auth Site URL and redirects~~ **Done 2026-10-24** | n/a | n/a |
| B2 | ~~Leaked-password protection~~ **Done 2026-10-24** (`password_hibp_enabled = true`, set through the Supabase Management API) | n/a | n/a |
| B3 | ~~Resend key and webhook~~ **Done 2026-10-24** (temporary key; the old exposed "Sanctus server (Edge Functions)" key was revoked 2026-10-24). Still open: the real sender address and admin inbox (client decision). | Owner and client | n/a |
| B4 | Sending domain | Client (DNS) | Verify a domain in Resend. Until then, mail only reaches the Resend account's own address. |
| B5 | Webhook **done**. Auth SMTP through Resend **set 2026-10-24** (`smtp.resend.com:465`, user `resend`, the server key, sender "Sanctus" <onboarding@resend.dev>, Auth email limit 30 per hour). Still open: switch the SMTP sender to the verified domain, so Auth emails reach real inboxes. | After B4 | Auth → SMTP → sender address on the verified domain |
| B6 | Application, admin, invitation and password-reset emails **delivered** (test inboxes). Still open: delivery to real inboxes (needs B4). | After B4 | n/a |
| B7 | **Meshy-generated model** for the end-to-end model test | Owner | The actual GLB (and USDZ if available) file. No Meshy model exists in the repo or `AR-attachment/`. |
| B8 | Real-device AR: Scene Viewer, Quick Look, true scale | A person with an ARCore Android phone and an iPhone | Steps are in `docs/SANCTUS_3D_AR_QA_REPORT.md`, section 7 |
| B9 | ~~Push and check embedding on the Preview~~ **Done 2026-10-24** | n/a | n/a |

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

## 5. Test results

Dashboard clarity pass A1, on the branch at tree `32ae117` (2026-10-25):
- `npm test`: **564 passed, 15 skipped**. One run had an auth timing flake; that file passed 3 of 3 on its own and the next full run passed.
- Playwright desktop + mobile: **98 passed**. This includes `a11y-dashboard.spec.ts` (no text under 12px, no uppercase, no horizontal scroll at 390).
- Pixel guard: **14/14**, run with `--workers=1`. Under parallel load it can fail on glyph edges.
- Typecheck, lint (0 errors) and build pass.
- Every dashboard page was also checked against its Stitch screen on real client data, read-only.

Team roles, on the branch (2026-10-25): `npm test` **439 passed, 15 skipped** (database rules on PGlite included), `npm run test:e2e` **38 passed** (6 new team journeys), typecheck, lint and build pass.

Earlier run (tree `26c03a5`, 2026-10-24):

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass (0 errors, advisory warnings only) |
| `npm test` | **311 passed, 15 skipped** (the live integration suite needs credentials). 3 consecutive runs green after two load-sensitive tests were made deterministic. |
| `npx vitest run supabase/tests` | **50 passed** (includes the prepared migration) |
| `npm run build` | pass |
| `npm run test:e2e` (demo mode, desktop and mobile) | **32 passed** (adds the reset-password regression test) |
| Preview journeys (on `a1e8392` and `422481b`) | 98 PASS, 0 open FAIL, 5 BLOCKED (devices, other-tenant writes), 1 NOT TESTED (on purpose) |

## 6. Incident log

- **2026-10-24, Auth settings on zggyl (dev project, not live).** `supabase config push` auto-applied the repo's local-dev Auth config without prompting. It changed the Site URL and redirects, turned off MFA (TOTP) and email confirmations, set the email rate limit to 1 s, and **disabled email login** (`[auth.email] enable_signup` is the provider switch). All of it was reverted from a corrected config within about 30 minutes. Sign-in is verified working again, and sign-up still refused.
- A newer CLI version also flipped `storage.analytics`; that was restored to on.
- Still different from before: the SMS and phone OTP template text, which has no effect because both features are disabled.
- `supabase/config.toml` now carries a warning not to push it.

## 7. Known defects and limitations

- DUX-06: the editor shows the publish checklist only after the first publish attempt. All problems now appear together in one pass.
- Native AR doesn't work inside iframes, by browser design: the embed opens the Sanctus page for AR.
- Any website may embed a published product. There is no per-business list of allowed sites.
- Preview and dev share one Supabase project (D2). There is no separate staging.
- SEC-22: whether the rate limit's `X-Forwarded-For` keying can be spoofed is unverified on the live edge.

## 8. Next actions, in order

1. Owner: go-ahead to apply team roles to the client project (migration plus 3 functions, `docs/OPERATIONS_RUNBOOK.md`), then a live invite-and-join test.
1. Owner: manual test on the Preview, including B7 (Meshy model).
2. Client: sending domain, sender address and admin inbox (B3, B4), then switch the Resend and SMTP sender to it.
3. B7 (Meshy model) and B8 (device AR) tests.
4. Client decisions (section 4).

## 9. Production release conditions

The production release requires all of the following:
- B1 to B8 are done and verified;
- the production domain is configured, with Auth URLs for that domain;
- separate production Supabase credentials (not the Preview's);
- Vercel protection reviewed for production;
- the owner's explicit approval to merge into `main` and switch the live site to the client project.

None of this has been done, and production is **not** ready.

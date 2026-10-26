# Test plan

Three kinds of evidence, never mixed: **automated** (local, demo mode or disposable Postgres), **live integration** (real Supabase API), **real device** (a physical phone, recorded). Only the last can verify AR.

## Automated (run before every commit)

| Command | Covers | Latest result (2026-10-13, branch `chore/production-readiness`) |
|---|---|---|
| `npm run typecheck`, `npm run lint`, `npm run build` | types, lint (0 errors), production bundle | pass |
| `npm test` | unit + component + PGlite database tests (migrations, RLS, publish rules, registration, claim links, cross-business isolation, rollback script) | 121 passed, 15 skipped (live suite) |
| `npm run test:e2e` | Playwright, demo mode, desktop + emulated Pixel 7: catalog, product page, 3D fallback, Scene Viewer intent on a **simulated** Android UA, no WebXR, one launch per double tap, PT/EN, in-app notice, admin CRUD, QR | 27/27 (one earlier run had a flaky demo-only failure, see PRODUCTION_READINESS 6c) |

## Live integration (real Supabase API)

`src/services/supabase/live.integration.test.ts`: 15 tests. Roles from tables, owner uploads into own folder, cross-business isolation, private draft files, owners can't change address/status or manage owners, publish → public + signed URLs, analytics insert-only + owner-only reads, rate limit, unpublish hides files, unreferenced files removed, logo bucket refuses SVG, draft registration invisible to public, contact-email match grants nothing, claim link single use.

**Latest run:** 2026-10-13 on `pmnjchhrgvajtjpadpqo` (owner-approved), 15 passed / 0 failed / 0 skipped, after migrations `20261013093006` and `20261013144121` were applied. QA users created with a throwaway in-memory password and deleted afterwards; no QA businesses, products, files, analytics, claims or memberships left (read-only check). How to re-run: `docs/OPERATIONS_RUNBOOK.md`.

## Real-device AR checklist

Status: **BLOCKED**, no physical device available and no safe preview URL yet (Preview shares the live database). Record every run in `System_arch/audit/DEVICE_TEST_MATRIX.md`: device model, OS version, browser + version, Google app installed (Android), URL + commit, product, result, screen recording link.

Use a product with a GLB **and** a USDZ whose scale shows "True-to-size model", plus one product without a USDZ.

### Android (Chrome, ARCore phone)
1. Open the product page; the model loads in 3D; "View in my home" is visible.
2. Tap it → AR tips appear → "Start AR". **Expected:** the Google app's Scene Viewer opens (not AR inside Chrome). If Chrome shows AR itself, that is a FAIL (WebXR must not be used).
3. Furniture appears on the floor at true size: measure one dimension with a tape measure, within 5% or 1 cm of the product page value. Pinch-to-resize is disabled (`resizable=false`).
4. Back to the page: the page is usable, no stuck spinner.
5. Tap "View in my home" twice quickly: only one Scene Viewer launch; in the dashboard the "AR launch attempts" count rises by 1, not 2 (check after ~1 minute).
6. On a phone **without** ARCore (if available): Scene Viewer's 3D view opens, or the page shows "AR failed" and the 3D viewer still works.
7. If the Google app does not open: note phone model, Chrome version, whether the Google app is installed/enabled, and record the screen (the earlier "Scene Viewer first" attempt failed this way, cause unknown).

### iPhone / iPad (Safari)
1. Product page loads the 3D model; tap "View in my home" → tips → "Start AR". **Expected:** Apple Quick Look opens with the USDZ.
2. True size: measure as above. Quick Look allows pinch-scaling by default; note whether the initial size is correct.
3. Product **without** USDZ: note what happens (model-viewer may convert the GLB; slow or failing is a finding, not a pass).
4. Close Quick Look: back on the page, usable.

### Both platforms
- **Model URL refresh:** open a product page, leave the tab in the background for 6 h+ (or overnight), return, then start AR. **Expected:** AR opens (the page fetched fresh 12 h signed URLs on return). Only meaningful for products whose files are stored in Supabase (the sample products use external URLs).
- **In-app browsers:** open a catalog link from Instagram, Facebook and WhatsApp. **Expected:** the notice to open in Safari/Chrome on the catalog and product pages; copy-link works.
- **Fallback:** on a computer, no AR button; 3D viewer + "view on a phone" QR that opens the same product.
- **Never claimed:** wall detection, collisions, room fit, guaranteed occlusion.

## S1.5 live checks (after the release, with the owner's OK)

Run on `zggylkbgajamhriebdrg` with accounts and businesses labelled "QA", and Resend test addresses (`delivered@resend.dev`, `bounced@resend.dev`). Automated coverage (PGlite, handler, component and demo e2e tests) is in the suites named in the spec §14. These checks prove what the test database cannot: hosted Auth, the real functions, real email and two connections at once. Record each result in `docs/PRODUCTION_READINESS.md`.

**Staff access and closure**
| Check | Expected |
|---|---|
| With "Require 2FA for staff" on, an `aal1` Admin calls `provision-owner`, `invite-member` (invite and resend), `send-test-email`, `review-application` and `notify-business-owner` | 403 `aal2_required` each; no membership, login or email created |
| An Admin with `records.view` reads `account_signed_in` rows of other people through the API | 0 rows; the Owner sees them; the Audit log hides sign-ins until "Show sign-ins" is ticked (Owner only) |
| A Team member whose role has no permissions reads profiles | only their own |
| Save a role with `products.publish` only | the editor shows `products.edit` and `products.view` ticked and locked, and the toast names them |
| Request closure as a QA owner, then remove that owner | the request is gone, the business keeps its status, and Activate was refused while it was open |
| Staff password of 11 characters on `/join` | refused, "Use at least 12 characters." |

**Applications and owners**
| Check | Expected |
|---|---|
| Reject a QA application (a Resend test address) with and without "Include the reason in the email" ticked | one `application_decision` email each, the reason only when ticked, and the toast "Application rejected. The applicant was emailed." |
| Reject an application that another tab already rejected | no second email |
| Approve, delete the draft business, then reopen the application | it shows the business as deleted and reopens as under review |
| Submit a second application with the same email, and one with a name like "Casa, Lda." against a business "Casa" | the reviewer sees "Possible duplicates" above the actions; Approve still works |
| The businesses list | every row shows Needs owner, Invite pending (or "email not sent") or Owner active; the filter works |
| A QA owner who never finished onboarding signs in at `/login` | the badge changes to "Owner active" and Resend is hidden |
| Resend the owner invitation 11 times for one recipient (spread over time past the 60 s guard) | the 11th gets "Ten invitations were sent … after {time}" |
| **Two connections:** two resends at the same moment | one goes through, the other gets the cooldown, and only one code is minted |
| **Two connections:** provision two different emails for one business at the same moment | one succeeds, the other gets `business_has_owner`, and the second email has no login |
| **Two connections:** six submissions from one IP at the same moment | five accepted or refused as duplicates, the sixth 429 |
| Five duplicate submissions, then a sixth | 429 `rate_limited`, and no duplicate lookup for the sixth |

**Analytics and products**
| Check | Expected |
|---|---|
| Load the embed on a test page | an `embed_view` row; the analytics page shows page and embed views apart, and the note about earlier loads |
| Delete a QA product that has events | a "Deleted products" row keeps its views; deleting the business removes its events |
| Lisbon versus São Paulo profile around local midnight | the day bucket follows the viewer's time zone |
| Overview as a role without `products.view` but with `analytics.view` | no false "No product activity yet" |

**Email and team**
| Check | Expected |
|---|---|
| Invite a team member at `bounced@resend.dev` | the invite shows "Email failed" after the webhook |
| Subscribe the webhook to `email.suppressed`, then send to a suppressed address | the email status is `bounced` with the reason `suppressed`; a later `delivered` does not replace it |
| Pause a QA business as an Admin | one `business_notice` to the owner; calling the function twice sends one; the owner sees the row under "Changes by the platform team" and cannot read other businesses' rows |
| Remove a deactivated QA team member, then invite the same email as a business owner | works; the removed person can no longer sign in to the dashboard |
| Change a QA team member's login email | the team row follows; an `access_member_email_changed` row exists |
| Owner reset of 2FA, Restore and Complete closure (Task 13) | each toast says whether the notice email was sent; a blocked address shows "Email can't be sent to this address yet." |
| A staff member deletes their own account (Task 13) | the team gets a `team_notice` email; their past actions show as "Deleted user ({role})" |
| Cancel a closure request as the owner (Task 13) | the inbox gets "Closure request cancelled"; the status returns |

**Rollback rehearsal** (optional, on a copy): run the rollback script, confirm the audit and email rows remain, and that `select count(*) from public.product_analytics where product_id is null` was the number of rows lost.

## Pending manual checks

| Check | Needs |
|---|---|
| `/signup` email confirmation flow | Production sign-ups stay off. Needs approval + custom SMTP (Resend) before real owners |
| Admin creates a claim link in the UI and an owner redeems it in a browser | A test owner account; can run on the live site with approval |
| Subdomain routing + SSL | Client domain and DNS access |
| Optimized model (compression) in Scene Viewer + Quick Look | Client sign-off (A-2) and devices |

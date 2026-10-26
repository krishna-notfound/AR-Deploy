# APP audit (applications and onboarding)
Scope read: `src/features/apply/ApplyPage.tsx`, `src/services/applicationRules.ts`, `supabase/functions/_shared/application.ts`,
`supabase/functions/submit-application/{handler,index}.ts`, `supabase/functions/provision-owner/{handler,index}.ts`,
`supabase/functions/_shared/{email,email-templates}.ts` (invitation/application kinds), `src/features/admin/{ApplicationDetailPage,ApplicationsPage}.tsx`,
`src/features/applications/*`, `src/features/businesses/BusinessOwnersPanel.tsx`, `src/features/auth/{AcceptInvitePage,ResetPasswordPage,authErrors}.ts(x)`,
`src/services/supabase/{auth,supabaseCatalogService}.ts` (owners/applications/invokeFunction), `src/services/mock/mockCatalogService.ts` (owners/applications),
migrations `20261020091428_applications_and_owner_access.sql`, `20261024065538_security_hardening.sql` (§6 onboarding, guard),
`20261025070915_platform_team_roles.sql` (§4 widen checks, §5 policies, §7 triggers, role permissions), `supabase/config.toml` (auth/otp),
design/24, ADR-0024, PRD X-01, completion status §4/§7, security review accepted risks.
Tests run: `npx vitest run supabase/functions/provision-owner/handler.test.ts supabase/functions/submit-application/handler.test.ts` (28/28 pass).
`register_business` / claim links: dropped by `20261020091428:11-16`; no `/claim` or `/signup` route or caller remains in `src/` (checked).

## Findings

### APP-01 Rejected applicants are never told; the "we will email you our decision" promise is false — High — CONFIRMED
- Where: `supabase/functions/_shared/email-templates.ts:181` ("We will email you when your application has been reviewed"),
  `src/i18n/dictionaries/en.ts:287` (`apply.done.next2`: "We send our decision by email to {email}"),
  `supabase/migrations/20261020091428_applications_and_owner_access.sql:150-212` (`admin_review_application` sends nothing),
  `src/features/admin/ApplicationDetailPage.tsx:256` ("The reason is kept with the application and shown in its history"),
  `supabase/functions/_shared/email.ts:4-14` (no decision/rejection email kind exists).
- What happens: an admin rejects an application with a reason → only an audit row is written. The applicant gets no email, ever.
  On approval the applicant hears something only if an admin later invites an owner (and only at the invited address, which
  may differ from the applicant's). An approved-but-not-yet-invited applicant and every rejected applicant wait forever.
  The reason the admin is forced to type is never shown to the person it is about.
- Expected rule: the applicant-facing copy (success page and confirmation email) promises a decision email; honesty rule in CLAUDE.md
  ("UI claims something not true").
- Fix sketch: either add a `application_decision` (rejected) email sent from a function after `admin_review_application` (needs an
  Edge Function, since the RPC can't send mail; optionally include or omit the reason by an admin checkbox), or change both copies
  to "If approved, you receive an invitation; we do not send rejections". Owner/client decision on which.
- Live check: reject a test application on the Preview; `email_log` gets no row for that application after `application_confirmation`/`admin_notification`.

### APP-02 `accepted_at` is set only by the /accept-invite page, so real owners can show "Invitation pending · has not set a password yet" forever — Medium — CONFIRMED
- Where: `supabase/migrations/20261024065538_security_hardening.sql:257-284` (only writer of `accepted_at`),
  `src/features/auth/AcceptInvitePage.tsx:156` (only caller, grep of `src/`), `src/features/auth/ResetPasswordPage.tsx:65,88` (no onboarding call),
  `src/features/businesses/BusinessOwnersPanel.tsx:43,109-123,136`, `supabase/functions/provision-owner/handler.ts:112`,
  `supabase/migrations/20261020091428_applications_and_owner_access.sql:273` (`invited_at` set once, never on resend).
- What happens: (a) the owner sets a password on /accept-invite, `complete_owner_onboarding` fails ("Reload the page"), they instead
  sign in from /login → dashboard works; or (b) an invited owner who lost or let the 1-hour code expire uses "Forgot password" →
  recovery code → sets a password → dashboard works. In both cases `accepted_at` stays null: the admin sees "Invited <first invite date>
  · has not set a password yet" and an amber "Invitation pending" badge for an owner who is using the product; "Resend invitation" stays
  offered (it emails a sign-in code titled "New invitation code"); and the Owner's "Reset 2FA" support action is hidden (`canReset`
  requires `acceptedAt`), so an active owner who locks themselves out of 2FA can't be helped from the UI. The "Invited" date also never
  reflects the latest resend.
- Expected rule: design/24 step 5 ("`complete_owner_onboarding()` records `accepted_at`"); the panel's labels must be true.
- Fix sketch: SQL/service: record acceptance on any successful owner sign-in (e.g. call `complete_owner_onboarding()` idempotently from
  `getCurrentUser` for a business_admin with a pending membership, or derive "accepted" from `auth.users.last_sign_in_at`/password set);
  UI: base the label on `lastSignInAt` too; update `invited_at` (or show the last invitation attempt date) on resend.
- Live check: with a test owner, verify the invite code, set a password, close the tab before onboarding finishes (or use reset-password), sign in at /login, then view the business's Owner card.

### APP-03 Approved application whose business was deleted is a dead end with no explanation — Medium — CONFIRMED
- Where: `supabase/migrations/20261020091428_applications_and_owner_access.sql:49` (`business_id ... on delete set null`), `:178-181`
  (approved is terminal), `src/services/applicationRules.ts:11` (`approved: []`), `src/features/admin/ApplicationDetailPage.tsx:68,150,209,240`.
- What happens: an admin approves, then deletes the draft business (e.g. approved by mistake, or a cleanup). The application keeps
  status "Approved" with `business_id = null`: the detail page shows no business record, no owner panel, no "next step", no action
  buttons, and no notice that the business was deleted. It can't be reopened, re-approved or rejected. There is also no "undo approval":
  the only way to reverse a mistaken approval is deleting the business, which lands here. (The applicant can file a new application,
  since only open statuses block duplicates.)
- Expected rule: brief "dead end / stuck state"; design/24 lifecycle assumes an approved application always has a business.
- Fix sketch: SQL: allow `approved → under_review` (or a `withdrawn`/`closed` status) when `business_id is null`, and audit it; UI: show
  "The business created from this application was deleted on <date>" (audit `business_deleted` carries the id) with that action.
- Live check: not needed (visible from code); optional on demo after the mock models the same.

### APP-04 Re-applying after approval (or with a slightly different name) creates a duplicate business, and the reviewer is never warned — Medium — CONFIRMED
- Where: `supabase/functions/submit-application/index.ts:15,27-37` (duplicate = same email AND same name AND status submitted/under_review),
  `supabase/functions/submit-application/handler.ts:60-61`, `supabase/migrations/20261020091428_applications_and_owner_access.sql:190-193`
  (approve always inserts a new business; `unique_business_slug` silently suffixes `-2`), `src/features/admin/ApplicationDetailPage.tsx`
  (no "other applications from this email / existing business with this name" panel), `src/services/mock/mockCatalogService.ts:440-443` (same rule).
- What happens: an applicant who already has an approved application (or business) applies again — or applies twice for "Casa Lda" and
  "Casa, Lda." — and both are accepted. Approving the second creates "Casa" with slug `casa-2`; the owner invite for the same email then
  fails with `email_owns_business`, leaving an ownerless draft. Two concurrent submissions with different keys also both pass the
  check (no DB constraint). Re-applying after rejection is allowed (fine), but the admin isn't shown the earlier rejection either.
- Expected rule: ADR-0024 "refuses a second open application for the same business and email" (met literally), but nothing guards the
  approved case; data-integrity rule in the brief (duplicates).
- Fix sketch: function: also refuse (or flag) when an approved application/existing business matches the email or normalized name;
  UI: on the detail page list prior applications from the same email and businesses with a similar name/slug before Approve.
- Live check: submit twice on the Preview with the same email after approving the first; both rows appear.

### APP-05 Invitation attempt cap is per business for life, counts blocked attempts, spans owners, and is bypassed by remove + re-invite — Medium — CONFIRMED
- Where: `supabase/functions/provision-owner/index.ts:71-80` (`workflow = invite:<businessId>`, all rows ever),
  `supabase/functions/provision-owner/handler.ts:69-95` (provision path: no cap, no cooldown), `:113-116` (resend: cap 10 and 60 s),
  `:141-146` (blocked "email_not_configured" attempts are logged under the same workflow), `src/services/supabase/supabaseCatalogService.ts:499`.
- What happens: every attempt (including `blocked` ones while email was misconfigured or the test sender refused the recipient) counts
  toward 10 for that business, across every owner it ever had. After 10, "Resend invitation" fails forever with "Contact the owner
  directly" — but there's no other way to give them a code. The workaround is to remove the owner and invite the same email again, which
  goes through `provision` and skips both the cap and the cooldown. So the limit blocks honest admins and doesn't stop repeated sends.
- Expected rule: ADR-0024 / design/24 "Resend invitation: 60-second cooldown and at most 10 attempts per business" (intended as abuse
  protection; should apply consistently and not create a permanent stuck state).
- Fix sketch: function: count only non-blocked attempts for the current owner (filter by recipient or since `invited_at`), apply the same
  cooldown/cap on the provision path, and use a rolling window (e.g. 10 per 24 h) instead of a lifetime total.
- Live check: not needed (handler tests already show the cap; the bypass is visible in `handler.ts:69-95`).

### APP-06 Approved-but-never-invited / never-accepted owners are invisible outside each detail page — Medium — CONFIRMED
- Where: `src/features/applications/labels.tsx:5-10` (single "Approved" badge), `src/features/admin/ApplicationsPage.tsx:74-208`
  (status tabs only; no owner state), `src/features/admin/BusinessesListPage.tsx` (no owner column/filter), `src/features/businesses/BusinessOwnersPanel.tsx:109-123`.
- What happens: an admin approves several applications and gets interrupted. The list shows every one as "Approved" whether the owner
  was never invited, invited with a failed/blocked email, invited but never accepted (code expired), or active. The only place the state
  appears is the Owner card on each detail page, so stuck onboardings are found only by opening every row.
- Expected rule: brief question "what an approved-but-never-accepted owner looks like to the admin"; design/24 step 4 makes inviting the
  owner the required next step after approval.
- Fix sketch: service/UI: return owner state with the list (`admin_list_business_members` per row, or a view) and show "Needs owner",
  "Invitation pending", "Email not sent", "Active"; add a filter on Applications (approved) and Businesses.
- Live check: not needed.

### APP-07 Approval UI assumes the approver can also see the business and invite the owner — Low — CONFIRMED
- Where: `supabase/migrations/20261025070915_platform_team_roles.sql:182-183` (approve needs only `applications.approve`), `:600-612`
  (`admin_set_role_permissions` has no dependency check), `src/features/admin/ApplicationDetailPage.tsx:65,68,100,150-160,232-233`,
  `src/features/businesses/BusinessOwnersPanel.tsx:150-151`.
- What happens: with an edited role that has `applications.approve` but not `businesses.view`, approving succeeds and the page then shows
  "Business not found." with Retry on the business it just created; without `owners.manage`, the toast says "Next: invite the owner" and
  "Go to owner invitation" scrolls to "No owner yet." with no form. Default roles are fine (admin has all; team can't approve).
- Expected rule: no dead buttons / honest UI (CLAUDE.md).
- Fix sketch: UI: tailor the post-approve toast/notice to `can('owners.manage')` and `can('businesses.view')`; or enforce permission
  dependencies (approve ⇒ businesses.view) in `admin_set_role_permissions` (TEAM area).
- Live check: not needed.

### APP-08 Concurrent owner provisioning: raw 500 and an orphan invited account — Low — CONFIRMED
- Where: `supabase/functions/provision-owner/handler.ts:85-91` (code/account created before linking),
  `supabase/migrations/20261020091428_applications_and_owner_access.sql:266-273` (`select ... for update` locks nothing when no row exists),
  `:19` (unique index), `supabase/functions/provision-owner/index.ts:65-69` (only a message containing `business_has_owner` is mapped).
- What happens: two admins invite different emails to the same ownerless business at once. Both pass the check; the second insert hits
  `business_members_one_owner_idx` (message names the index, not `business_has_owner`) → `linkOwner` throws → 500 "The request could not
  be completed". Supabase Auth already created the second person's invited account, which is now an orphan (it can later be linked
  elsewhere, since `invited` is true).
- Expected rule: one owner per business (ADR-0024) with a clean `business_has_owner` refusal.
- Fix sketch: SQL: lock the business row (`select ... from businesses where id = ... for update`) in `service_link_owner`, or catch
  `unique_violation` and raise `business_has_owner`.
- Live check: not needed.

### APP-09 If the audit insert fails after storing an application, no confirmation or admin alert is ever sent — Low — CONFIRMED
- Where: `supabase/functions/submit-application/handler.ts:67-75`, `supabase/functions/submit-application/index.ts:73-76,106-108`.
- What happens: the row is inserted, then `audit()` throws → the outer catch returns 500 → the wizard shows "failed"; the visitor
  retries with the same `submissionKey` → `findByKey` returns 200 immediately, skipping both emails. The application sits unseen with
  no admin notification and no applicant confirmation.
- Expected rule: design/24 step 2 "Email failures never undo the stored application" (and the alert should go out once the row exists).
- Fix sketch: function: make the audit write non-fatal (log and continue, like emails), or on a key replay send any email kinds missing
  from `email_log` for that application.
- Live check: not needed.

### APP-10 /accept-invite with an existing session skips the code and offers to set the password of whoever is signed in — Low — CONFIRMED
- Where: `src/features/auth/AcceptInvitePage.tsx:35-43,128-161`.
- What happens: any signed-in business owner (already active, or a different person on a shared browser) who opens an invitation link
  lands on "Set your password" for the current session's account, with the current business's name; submitting changes that account's
  password. The invitation's email and code are never checked. Only platform staff are redirected.
- Expected rule: ADR-0027 (the invite page verifies the email + code).
- Fix sketch: UI: if the signed-in user's membership is already accepted, redirect to /dashboard; otherwise show "You're signed in as
  <email>. Not you? Sign out" before the password step.
- Live check: not needed.

### APP-11 The duplicate check runs before the rate limit, and the "daily" submitter hash is permanent — Low — CONFIRMED
- Where: `supabase/functions/submit-application/handler.ts:38-40,60-65`, `supabase/migrations/20261020091428_applications_and_owner_access.sql:44`.
- What happens: anyone can submit unlimited valid forms to test whether email X has an open application for business Y (409 vs 200)
  without the 5/hour limit applying to the probe. The column comment says "Salted daily hash", but the hash has no date, so it is a
  stable per-IP identifier across all of a visitor's applications.
- Expected rule: ADR-0024 rate limit; the migration's own privacy comment.
- Fix sketch: function: rate-limit before the duplicate lookup; include the UTC date in the hash input (or fix the comment).
- Live check: not needed.

### APP-12 PRD still lists owner sign-up, draft registration and claim links as verified — Low — CONFIRMED
- Where: `docs/PRD.md:84` (X-01), against `supabase/migrations/20261020091428_applications_and_owner_access.sql:1-16` (dropped by ADR-0024).
- What happens: the requirements matrix says a removed flow is "VERIFIED (live API)", which misleads anyone checking scope.
- Fix sketch: docs: mark X-01 superseded by ADR-0024 (apply → approve → admin-provisioned owner).
- Live check: not needed.

### APP-13 Demo provisioning differs from the real function on an existing owner — Low — CONFIRMED
- Where: `src/services/mock/mockCatalogService.ts:385-414` vs `supabase/functions/provision-owner/handler.ts:73-74,112-116`.
- What happens: in demo mode `provisionOwner` for a business whose owner already exists re-sends without the cooldown, the 10-attempt cap
  or the `already_accepted` refusal; the real function routes it through `resend()` and enforces all three. Not reachable from the current
  panel (the form only shows without an owner), so this only matters for tests built on the mock.
- Fix sketch: mock: delegate the existing-owner path to `resendOwnerInvitation`.
- Live check: not needed.

## Ideas (optional, max 5 lines)
- Let the admin add an internal note on approve (the RPC already stores `p_reason` for approvals; the UI never sends one).
- Show "code expires <time>" (last attempt + 1 h) on the Owner card so admins know when a resend is needed.

# S1.5: Business-logic fixes

**Status:** Slimmed by the owner on 2026-10-26; see the plan's "Moved out of S1.5". Design for owner review (2026-10-26). It is based on the 2026-10-26 business-logic audit (`docs/audits/2026-10-26-business-logic/`: APP, BIZ, PROD, PUB, ANA, TEAM, MAIL and LIVE) and its binding `RULINGS.md`. The owner's later decision moves some findings into S2 and S4 (see §1.4). S3 (the application form builder) was cancelled by the owner on 2026-10-26 ("keep form as it is … I don't want a form builder now"), so the application findings once folded into it are specified here again (R-W2-9 to R-W2-11). Where a ruling and a fix sketch differ, the ruling wins. Where the owner's decision and a ruling differ, the owner's decision wins.
**Source:** the owner asked for every audit fix to be built.
**Working rules:**
- Build on a branch cut from `feature/sanctus-brand-design-system`. S1 is not on `main` yet: commit `9691fab` is not an ancestor of `main`.
- Work spec-driven and test-first.
- Build for real Supabase (client dev project `zggylkbgajamhriebdrg`). Demo mode is the test harness. It must keep working with no env vars, and it follows each new rule in the same requirement (mock services). W8 covers the demo differences that already exist.
- Hard rules that shape every design below:
  - one new migration, with RLS and explicit grants;
  - no custom backend server: Edge Functions only, with `verify_jwt` on wherever a person calls the function;
  - no new dependency, and no `VITE_*` secrets;
  - URLs are built only in `src/lib/urls.ts`;
  - the S1 2FA helpers (`private.mfa_satisfied`, `public.caller_mfa_satisfied()`, the gated `platform_can` / `is_platform_admin` / `is_business_member`) are the only access checks. They are never re-implemented.

## 1. Goal, scope, non-goals and duplicates

### 1.1 Goal
Make each platform rule hold in the database and the Edge Functions, not only in the UI. Make each screen and email say what is really true. Order of work: security and High findings first, then data integrity, then honesty and consistency, then demo parity.

### 1.2 Scope
Every audit finding that is not deferred (§1.3) or folded (§1.4): 74 requirements in 8 workstreams (§2–§9). The coverage table is in §15.

### 1.3 Non-goals (deferred, not built; RULINGS "Deferred")
- **PROD-13:** categories are furniture-only while applications accept other industries. Client decision C10.
- **ANA-05:** views can be inflated, and the visitor key comes from `X-Forwarded-For`. Known SEC-03 and the open "Analytics" decision. The ANA-04 split keeps counting every view.
- **TEAM-20:** Team's `products.edit` changes live products without review. Owner decision; documented as it is (§12).
- **PUB-09 (part):** server-rendered link-preview meta. Needs an edge renderer.
- **PUB-04 (part):** signed media URLs stay valid for up to 12 h in pages that are already open. Accepted and documented. The "not-found replaces the stale page" half is built (R-W4-8).
- No background sweeps, no scheduler, no server-side HTML. The slug redirects (R-W3-1/2) happen in the browser.

### 1.4 Folded into S2/S4 (owner decision; not specified here)
**S3 cancelled (owner, 2026-10-26):** "keep form as it is … I don't want a form builder now". APP-04, APP-11 and APP-09 = MAIL-14, which were folded into S3, are back in S1.5 as R-W2-9, R-W2-10 and R-W2-11 (§3). The application form itself stays as it is.

| ID | Problem (one line) | Target |
|---|---|---|
| PUB-02 = BIZ-03 | A paused or draft catalog shows "Catalog not found" instead of "unavailable" (ruling 9, `public_catalog_state`). | S2 (Catalog & public page) |
| MAIL-02 (part 2) | There is no plain Email log page for `records.view`. The "Email failed" state on team invitations stays here (R-W7-3). | S2 (platform site controls) |
| MAIL-19 | Switching off "New business applications" doesn't stop alerts when your address is the admin inbox. | S2 |
| PUB-09 (part) | Pages don't set their own title and description in the browser. The `X-Robots-Tag: noindex` header stays here (R-W4-12). | S2 |
| PROD-03 | Unsaved editor uploads stay in Storage (ruling 14). | S4 (3D model requests) |
| ANA-03 | Overview readiness takes the best finish and hides finishes with no USDZ. | S4 |
| PROD-12 | Demo uploads skip the "choose the business first" and storage-path rules. | S4 |

### 1.5 Duplicate map (RULINGS; each group is built once, under the first ID)
- **Applications:** APP-01 = MAIL-01, APP-05 = MAIL-06 (+ MAIL-15 in the same requirement), APP-03 = BIZ-07 (+ LIVE L1), APP-06 = LIVE L5 (+ L2), APP-09 = MAIL-14.
- **Public pages and businesses:** PUB-01 = PROD-01 (+ L3), PUB-03 = PROD-06, with BIZ-04 as the business-slug twin (R-W3-1 and R-W3-2 share one mechanism). PUB-06 = BIZ-11.
- **Closure, team and email:** BIZ-02 = TEAM-07, TEAM-08 = MAIL-10, TEAM-05 = MAIL-03 (ruling 22), TEAM-14 = MAIL-17.
- **Permissions and numbers:** ANA-01 = TEAM-10, TEAM-02 = PROD-04 (+ TEAM-03 and the storage part of BIZ-06), ANA-06 = BIZ-12.
- **LIVE L4** (photo-only products are published): this is the rule. Publishing needs at least one gallery image, and a model is optional (`publish_rules`). No change here. The readiness labels go to S4 (ANA-03).

### 1.6 Verification notes (checked against the code on 2026-10-26)
- Every finding listed for building was re-checked at its cited lines, and all are still present. Spot checks: `service_user_can` has no MFA term and `provision-owner/index.ts:22` uses it. `send-test-email` reads `platform_admins` directly. Preview flags are set at `ProductEditorForm.tsx:333` and `useProductActions.tsx:87`. `accept-member-invite` checks `< 8`. Product analytics are deleted with the product (`on delete cascade`). The webhook gives `bounced` and `delivered` the same rank. `apply.done.next2` still promises a decision email.
- No finding was wrong or already fixed.
- `audit_events_event_type_check` is a regex (`^[a-z][a-z0-9_]{2,59}$`, `20261025163627:409`), so new event names need no constraint change. `email_log_kind_check` does need a change (§10.4).
- `src/features/marketing/LandingPage.tsx` is the owner's own design and has uncommitted owner edits: **no task edits it.** R-W4-11 leaves its line 82 as it is (it already goes through `catalogLocalPath`; only the `?category=` suffix is hand-built).

## 2. W1 Security and closure integrity

**R-W1-1 (TEAM-01, ruling 20). Every Edge Function a person calls checks the 2FA rule before it checks a permission.**
- **Layer:** Edge Functions `provision-owner`, `invite-member` (all actions, resend included), `send-test-email`, and the new `review-application` and `notify-business-owner`.
- **Rule:** each function builds a caller client from the anon key plus the caller's `Authorization` header, like `manage-member` does. It then calls `public.caller_mfa_satisfied()`, followed by the gated helper:
  - `platform_can('owners.manage')` for provision-owner;
  - `is_platform_admin()` for invite-member and send-test-email.
- `service_user_can` is no longer called from any function. It is kept for rollback and gets a comment marking it "not 2FA-aware; do not use for caller checks".
- **Acceptance:**
  - With "Require 2FA for staff" on, or with a staff member who has a verified factor, an `aal1` session calling `provision-owner {action:"provision"}` gets **403 `{error:"aal2_required"}`**. No membership row, no auth user and no email are created.
  - The same holds for `invite-member` `invite` and `resend`, and for `send-test-email`.
  - At `aal2` with the permission, the call works as today.
  - Without the permission at `aal2`, the call gets 403 `forbidden`.

**R-W1-2 (BIZ-01, ruling 7). A closure request belongs to the owner's membership.**
- **Layer:** migration (trigger and function changes), account-security, UI.
- **Rule:** an `AFTER DELETE` trigger on `business_members`, `private.void_closure_on_owner_removed`, deletes any `account_closure_requests` row with `user_id = old.user_id and business_id = old.business_id`. It writes `account_closure_voided` with `{subject_id, business_id, reason:'owner_removed'}` and `business_id` set. The business status is not changed.
- `service_closure_target` returns `{error:'not_found'}` unless the requester is still a member of `business_id`.
- `private.undo_closure` restores a status only while the requester is still a member (otherwise it deletes the request and logs).
- `complete_closure` in account-security refuses `not_found` before it deletes anything.
- **Acceptance (PGlite):**
  - Owner A requests closure, and A's membership is then deleted. The request row is gone, `account_closure_voided` exists, and the business is still `inactive`.
  - `service_closure_target(A)` → `not_found`. `cancel_account_closure()` as A → `not_found`, and the status is unchanged.
  - After owner B is linked, nothing A does can change the status.
- **UI:** the owner-removal dialog shows "This owner asked to close their account on {date}. Removing them cancels that request. The catalog stays {status label}." when a request is open.

**R-W1-3 (BIZ-02 = TEAM-07, ruling 8). An open closure is visible to staff, and the business can't be activated around it.**
- **Layer:** migration (trigger), service, UI.
- **Rule:** a `BEFORE UPDATE OF status` trigger on `businesses`, `private.guard_activate_during_closure`, applies to `anon` and `authenticated`. It raises `closure_pending` (errcode `P0001`) when `new.status = 'active'`, `old.status <> 'active'`, a request exists for `new.id`, and `app.account_closure` is not `on`. The Owner is included: only `cancel_account_closure` and `service_restore_closure` (which set `app.account_closure`) can bring the business back.
- Setting `draft` or `inactive` stays allowed, and `closure_follow_status` keeps recording it.
- **Acceptance:** an Admin (or the Owner) PATCHes `status:'active'` → the error maps to "This business has an open closure request. Only the platform Owner can restore it or complete it." Cancel and restore still work.
- **UI:**
  - The businesses list and the business detail page load closures for everyone with `businesses.view` (`admin_list_closure_requests` already allows this).
  - They show a read-only "Closure requested on {date}" badge.
  - The Activate action is hidden while a request is open, and the tooltip shows the message above.
  - Only the Owner sees Complete and Restore.
  - The copy "The catalog is offline…" is derived from the real `status` (R-W3-6).

**R-W1-4 (MAIL-09, ruling 26). Other people's security activity is readable only by the Owner.**
- **Layer:** migration (policy), service, UI.
- **Rule:** the "Platform members read audit events" policy is recreated so that its `else` branch also requires `event_type not like 'account\_%'`. The Owner's existing `is_platform_admin()` policy and the own-events policy are unchanged.
- `getAuditEvents` leaves out `account_signed_in` unless the filter "Show sign-ins" is ticked. The filter appears only for the Owner.
- **Acceptance:**
  - An Admin with `records.view` gets 0 `account_%` rows for other users through the API, and still sees their own.
  - The Owner sees all of them.
  - The Audit log page lists no "Account signed in" rows by default.

**R-W1-5 (TEAM-17, ruling 24, adjusted). Staff read profiles only when their role needs to.**
- **Layer:** migration (policy).
- **Rule:** "Platform members read profiles" is replaced. A row is readable when one of these holds:
  - it is the caller's own row (existing policy);
  - `is_platform_admin()`;
  - the row is a staff profile (it has a `platform_members` row or a `platform_admins` row) and `platform_can('access.view') or platform_can('records.view')`;
  - the row belongs to a business owner and `platform_can('businesses.view')`.
- The ruling named `members.view`, which is not one of the 15 permissions. The adjustment is explained in §16.
- **Acceptance:** a Team member whose role has zero permissions reads only their own profile. Default Team (`businesses.view`) reads business owners' profiles but not staff profiles. Default Admin reads both.

**R-W1-6 (TEAM-18, ruling 25).**
- **Layer:** migration.
- **Rule:** `my_platform_access()` returns the fixed list of 15 keys for an Owner, whatever the role sets hold.
- **Acceptance:** after Admin's and Team's sets are both narrowed to `{}`, the Owner's `permissions` still has length 15.

**R-W1-7 (TEAM-09, ruling 23). Staff passwords need 12 characters.**
- **Layer:** `accept-member-invite` handler and `JoinPage`.
- **Rule:** length 12–72, using the shared `PASSWORD_MIN`/`PASSWORD_MAX`.
- **Acceptance:**
  - An 11-character password gets 422 `invalid_request`.
  - The UI says "Use at least 12 characters." before submitting.

**R-W1-8 (TEAM-11). An email can't be invited as a business owner while it has any platform-team row.**
- **Layer:** migration (`service_link_owner`) and provision-owner.
- **Rule:** `service_link_owner` raises `email_is_admin` (errcode 23514) when `platform_members.email = lower(auth.users.email)` for `p_user_id`, with any status.
- `provision-owner` checks the same email before it creates an auth user.
- Removing the member (R-W6-1) clears the way.
- **Acceptance:** with a pending team invitation for `rita@x.pt`, provisioning her as an owner gets 409 `email_is_admin`, and no auth user is created.

**R-W1-9 (APP-10). The invitation page never sets the password of whoever happens to be signed in.**
- **Layer:** UI (`AcceptInvitePage`, EN/PT).
- **Rule:**
  - A signed-in business owner whose membership is already accepted is redirected to `/dashboard`.
  - A signed-in owner with a pending membership sees "You're signed in as {email}. If this invitation is for someone else, sign out first." with a Sign out button, above the password step.
  - Staff are redirected, as today.
- **Acceptance:** a component test with an accepted session asserts the redirect and that the password form is never rendered.

## 3. W2 Applications and onboarding

**R-W2-1 (APP-01 = MAIL-01, ruling 1). A rejected applicant is told, in their language.**
- **Layer:** new Edge Function `review-application`, service (supabase and mock), UI, email templates.
- **Rule:**
  - Every review action goes through `review-application` (§10.3). The function calls `admin_review_application` with the caller's JWT, so the gated permission check stays in SQL.
  - On `reject`, it sends `application_decision` to `business_applications.applicant_email` in `language`.
  - The reason is included only when `includeReason = true`. The reviewer ticks "Include the reason in the email", which is off by default.
  - Approve, start review and reopen send nothing (the owner invitation is the approval notice).
  - The `email_log` row carries `application_id`, `workflow = application:<id>:decision` and `kind = application_decision`.
  - An email failure never undoes the rejection.
- **Acceptance:**
  - Reject with the box unticked → one `email_log` row, and the rendered text has no reason.
  - Ticked → the text includes "Reason: {reason}".
  - The PT application gets the PT copy (§11.2).
  - The toast is worded from the email status (§11.1).
- **Copy:** the apply success page and the confirmation email are changed to the true promise (§11.2).

**R-W2-2 (APP-03 = BIZ-07, L1, ruling 2). An approved application whose business was deleted says so and can be reopened.**
- **Layer:** migration (a column, a trigger and a new transition), review-application, UI.
- **Rule:**
  - New column `business_applications.business_deleted_at timestamptz`. It is set by `BEFORE DELETE` on `businesses` (`private.mark_application_business_deleted`) for rows with `business_id = old.id`.
  - `admin_review_application` gets the action `reopen`. It moves `approved → under_review` only when `business_id is null`, needs `applications.approve`, and writes `application_status_changed` (`from approved`, `to under_review`, metadata `{action:'reopen'}`). Any other state raises `reopen_not_allowed`.
  - The redefinition writes the explicit check `is_platform_admin() or platform_can(<per action>)` in place of the earlier `widen_admin_check` text substitution.
- **Acceptance:**
  - Deleting the business sets `business_deleted_at`.
  - Reopen → `under_review`. Approving again creates a new draft business.
  - Reopen while a business exists → `reopen_not_allowed`.
- **UI:**
  - The card shows "Business deleted on {date}". For L1, where no date is known, it shows "The business created from this application was deleted."
  - A **Reopen for review** button is shown with `applications.approve`.
  - The business delete dialog adds: "The owner's sign-in stays, but they lose access. The application that created it shows as 'Business deleted'."

**R-W2-3 (APP-02, ruling 5). Any successful owner sign-in accepts the membership.**
- **Layer:** migration (`record_sign_in`), service, UI.
- **Rule:**
  - `record_sign_in` sets `accepted_at = now()` on the caller's pending `business_members` rows, and writes `owner_onboarding_completed` with `{via:'sign_in'}`. This happens before the 60-second rate-limit check and is idempotent.
  - `ResetPasswordPage` calls `completeOwnerOnboarding()` after a successful password set when the role is `business_admin`.
  - The Owner card shows "Last invitation sent {date}" from the newest reserved attempt (R-W2-4), not `invited_at`.
- **Acceptance:**
  - An owner who never finished `/accept-invite` signs in at `/login` → `accepted_at` is set, the badge reads "Owner active", Resend is hidden, and Reset 2FA is offered.
  - The same happens after the reset-password path.

**R-W2-4 (APP-05 = MAIL-06, MAIL-15, ruling 4). The owner-invitation limit is a rolling, per-recipient limit, and attempts are reserved atomically.**
- **Layer:** migration (`private.owner_invite_attempts` and two `service_*` functions) and provision-owner.
- **Rule:** provision and resend both call `service_reserve_owner_invite(business, recipient, actor)` before `generateLink`. Under `pg_advisory_xact_lock('owner_invite:'||business)` it:
  - refuses with `cooldown` and `retry_at` when a non-blocked attempt for that business is less than 60 s old;
  - refuses with `too_many_invitations` and `retry_at` (the oldest counted attempt plus 24 h) when there are 10 or more attempts for that business and `lower(recipient)` in the last 24 h whose `outcome` is not `blocked`;
  - otherwise inserts a reservation and returns `{reservation_id, attempt}`.
- `attempt` is monotonic per business, seeded from `max(email_log.attempt)` for `invite:<business>`. It is the Idempotency-Key suffix.
- After the send, `service_finish_owner_invite(reservation_id, outcome)` stores `accepted`, `sent`, `failed` or `blocked`.
- Removing and re-inviting the same email counts in the same window.
- **Acceptance (handler and PGlite):**
  - The 11th attempt in 24 h for the same recipient → 429 `{error:"too_many_invitations", retryAt}`, and the UI says "Ten invitations were sent to this owner in the last 24 hours. You can send the next one after {time}."
  - Blocked attempts don't count.
  - Two parallel resends → one goes through and the other gets `cooldown`, so only one code is ever minted.
  - Remove + re-invite doesn't reset the count.

**R-W2-5 (APP-06 = L5, L2, ruling 6). The businesses list shows owner state on every row.**
- **Layer:** migration (`admin_list_owner_states()`), service, UI.
- **Rule:** the new function is security definer and gated on `platform_can('businesses.view')` (otherwise `{error:'forbidden'}`). It returns `[{business_id, state: 'needs_owner'|'invite_pending'|'owner_active', last_invited_at, email_failed}]`.
  - `email_failed` is true when the newest attempt's outcome is `failed` or `blocked`, or its `email_log` row is `bounced` or `complained`.
- The list gets a column with the values "Needs owner", "Invite pending" (or "Invite pending · email not sent") and "Owner active", plus a filter on it.
- **Acceptance:** live business "idk" (L2) shows "Needs owner". The four L5 businesses show "Invite pending".

**R-W2-6 (APP-07). The approval result matches what the approver can do.**
- **Layer:** UI.
- **Rule:**
  - With `owners.manage` and `businesses.view`: today's toast and "Go to owner invitation".
  - Without `owners.manage`: "Approved. A draft business was created. Someone with 'Invite and remove business owners' must invite the owner."
  - Without `businesses.view`: the business card and owner panel are replaced by "A draft business was created. Your role can't open businesses."
  - Prerequisites (R-W3-3) make `applications.view` implied by approve and reject.
- **Acceptance:** component tests for the three permission sets. No "Business not found" and no dead scroll target.

**R-W2-7 (APP-08). Concurrent provisioning gives a clean refusal and leaves no orphan login.**
- **Layer:** migration (`service_link_owner`) and provision-owner.
- **Rule:** `service_link_owner` locks the business row (`select … from businesses where id = … for update`) before the membership check. It catches `unique_violation` and raises `business_has_owner`.
- When provision-owner created the auth user in this same request and linking then fails, it deletes that user.
- **Acceptance:** two parallel provisions with different emails give one 200 and one 409 `business_has_owner`. The second email has no auth user afterwards.
  - With R-W2-4 in place, a second provision inside 60 s usually stops earlier, at the reservation (429 `cooldown`), before any auth user exists. The handler test fakes the reservation as granted to reach the link race; the PGlite test races `service_link_owner` on two connections (§16).

**R-W2-8 (APP-12, ruling 32).**
- **Layer:** docs.
- **Rule:** `docs/PRD.md` X-01 is marked "Superseded by ADR-0024 (apply → approve → admin-provisioned owner)".

**R-W2-9 (APP-04, ruling 3). The reviewer is warned about possible duplicates before deciding.**
- **Layer:** migration (`private.normalize_business_name(text)`, `admin_application_duplicates(uuid)`), service (supabase and mock), UI.
- **Rule:**
  - `private.normalize_business_name(text) → text` is `immutable`. It lower-cases and trims, folds the Portuguese accents with `translate()` (á à â ã ä é è ê ë í ì î ï ó ò ô õ ö ú ù û ü ç ñ → plain letters; no `unaccent` extension), drops one trailing legal-form word (`lda`, `limitada`, `unipessoal`, `sa`, `ltd`, `limited`, `llc`, `inc`), then removes every character that is not `a-z` or `0-9`. An empty result never matches anything.
  - `admin_application_duplicates(p_application_id uuid) → jsonb` is security definer, gated on `is_platform_admin() or platform_can('applications.view')` (otherwise `{error:'forbidden'}`; an unknown id gives `{error:'not_found'}`). It returns `{applications:[…], businesses:[…]}`, at most 10 of each, newest first:
    - `applications`: other applications (never the one asked about) with status `submitted`, `under_review` or `approved`, whose `lower(applicant_email)` equals this one's or whose normalized business name equals this one's. Each item is `{id, reference, business_name, status, created_at, match:'email'|'name'|'both'}`.
    - `businesses`: businesses (never the one this application created) whose normalized name equals this one's, or whose owner's (`business_members` role `owner`) `auth.users.email` equals `lower(applicant_email)`. Each item is `{id, name, status, match:'owner_email'|'name'|'both'}`. The owner's email itself is never returned.
  - The warning never blocks a review action. The existing 409 `duplicate_application` at submission is unchanged.
  - The mock implements the same rule, with the same normalization in `src/services/applicationRules.ts` (`normalizeBusinessName`).
- **Acceptance:**
  - "Casa, Lda.", "casa lda" and "Cása" normalize to `casa`; "Lda" alone normalizes to `''` and matches nothing.
  - An application from an email with an earlier approved application lists it with `match:'email'`; "Casa, Lda." against an existing business "Casa" lists the business with `match:'name'`; a business whose owner's login email is the applicant email lists `match:'owner_email'`.
  - Rejected applications and the application itself are never listed.
  - A caller without `applications.view` gets `{error:'forbidden'}`; anon can't execute the function.
  - The detail page shows the panel above the review actions, and Approve still works with the panel shown.
- **UI (English, §11.1):**
  - The panel "Possible duplicates" shows on the application detail page only when there is at least one match.
  - Application rows link to `applicationAdminPath(id)`. Business rows link to `businessAdminPath(id)` only for a caller with `businesses.view`; otherwise the name is plain text.
  - While loading: "Checking for possible duplicates…". On an error: "Couldn't check for possible duplicates. You can still review this application." Neither blocks the review actions.

**R-W2-10 (APP-11). The rate limit comes before the duplicate lookup, counts every attempt, and the submitter hash is daily.**
- **Layer:** migration (`private.application_attempts`, `service_application_attempt`) and submit-application.
- **Decision (audit evidence):** the column comment (`20261020091428:44`, "Salted daily hash of the submitter's IP, used only for rate limiting") states the privacy intent, so the hash gets the UTC date; the comment is kept and becomes true. Moving the check alone would not stop the probe, because the limit counted stored rows and a 409 probe stores none; so the limit counts attempts.
- **Rule:**
  - The handler order is: validate → key replay (R-W2-11) → rate limit → duplicate lookup → insert. A key replay is never rate-limited (it is the retry of an attempt that already counted).
  - `submitterHash(ip, salt, day)` = `sha256Hex('application|' + day + '|' + ip + '|' + salt)`, where `day` is the UTC date `YYYY-MM-DD`. The stored `submitter_hash` is today's hash.
  - `private.application_attempts (id bigint identity, submitter_hash text not null, created_at timestamptz default now())`, indexed on `(submitter_hash, created_at)` and on `created_at`. RLS on; revoke all from public, anon and authenticated; grants to `service_role` only.
  - `service_application_attempt(p_hashes text[], p_max int default 5) → boolean` (service_role only). Under `pg_advisory_xact_lock(hashtext('application_attempt:' || p_hashes[1]))` it deletes attempts older than 2 hours, counts the attempts of the last hour whose hash is in `p_hashes`, returns false when the count is `p_max` or more, and otherwise inserts `p_hashes[1]` and returns true.
  - The handler passes today's hash and, when the hour before `now` started on the previous UTC day, that day's hash as well, so the hourly window holds across midnight.
  - A refused attempt (429) is not recorded. A duplicate refusal (409) is recorded, because the attempt passed the limit first.
  - The demo has no client IP, so the mock has no rate limit (unchanged).
- **Acceptance (handler and PGlite):**
  - Five attempts that each get 409 `duplicate_application`, then a sixth from the same IP in the hour → 429 `rate_limited`, and the duplicate lookup is not called for the sixth.
  - The same IP gives different hashes on two UTC dates.
  - Five attempts at 23:40–23:59 UTC, then one at 00:20 UTC → 429.
  - A key replay after five attempts → 200 with the stored row.
  - `service_application_attempt` deletes rows older than 2 hours; two parallel calls at count 4 let exactly one through.
- **Copy:** none new. The wizard keeps `apply.rateLimited` and `apply.duplicate` (EN/PT).

**R-W2-11 (APP-09 = MAIL-14). An audit failure after the insert is not fatal, and a key replay sends the emails that are missing.**
- **Layer:** submit-application.
- **Rule:**
  - The `application_submitted` audit write is in a try/catch: a failure is logged (no personal data) and the emails are still sent. The response is 200 with the stored row.
  - `findByKey` returns the stored row's `id`, `reference`, `applicant_email`, `business_name`, `language` and `created_at`.
  - On a key replay (`findByKey` hit), when the row's `created_at` is more than 30 seconds before `now`:
    - if the application has no `application_submitted` audit row, the handler writes it (non-fatal);
    - it builds the same workflow list as the first attempt (applicant confirmation, admin inbox, opted-in staff) and sends each workflow that has no `email_log` row for this `application_id`. The Idempotency-Key stays the workflow, so Resend never delivers one twice;
    - every email uses the stored row (address, business name, language), never the replayed body.
  - A replay within 30 seconds (a double click while the first request is still sending) returns the stored row and sends nothing.
  - The `duplicate_key` path (a concurrent retry) returns the stored row and sends nothing, as today.
  - A `failed` or `blocked` `email_log` row counts as present: a replay never retries a failed send.
- **Acceptance (handler):**
  - The audit throws → 200, both emails are sent, and the error log has no email address.
  - A replay 5 minutes later with no `email_log` rows → the confirmation (in the stored language) and the admin alert are sent once each, and the missing audit row is written.
  - A replay with the confirmation already logged → only the admin alert is sent.
  - A replay 10 seconds after the insert → 200 and nothing sent.
  - The replayed body carries a different email address → the stored address is used.
- **Copy:** none new. Replayed emails use the existing `application_confirmation` (EN/PT, with the §11.2 line) and `admin_notification` (EN) templates.

## 4. W3 Business lifecycle and addresses

**R-W3-1 (BIZ-04, ruling 10). A retired catalog address stays with its business forever, and old addresses redirect to the new one.**
- **Layer:** migration (table, triggers, `unique_business_slug`, `public_slug_redirect`), service, UI.
- **Rule:**
  - `public.business_slug_history(slug pk, business_id null → businesses on delete set null, retired_at)`.
  - A trigger adds `old.slug` on every slug change and on delete (the business row is deleted, and its slug row stays with `business_id null`).
  - `BEFORE INSERT OR UPDATE OF slug` on `businesses` raises `slug_retired` when the slug is in history and `business_id is distinct from new.id`. A business taking back its own old slug removes that history row.
  - `unique_business_slug` skips history slugs.
  - Backfill: every `business_slug_changed.metadata.from` that is not a current slug. Slugs of businesses deleted before this migration can't be recovered (§13).
  - The public catalog page calls `public_slug_redirect(slug)` after `NOT_FOUND`. When the business is `active`, it replaces the location with the new slug through `catalogLocalPath` / `catalogPublicUrl`. This covers path mode, subdomain mode and embed routes.
- **Acceptance:**
  - Change `casa` to `casa-lisboa` → `/catalog/casa` lands on `/catalog/casa-lisboa`.
  - Another business choosing `casa` gets the field error "This address was used before and still belongs to another catalog. Choose another address."
  - After deletion, `casa` is still refused for everyone.
  - The redirect returns nothing for a non-active business, so the "not found" behaviour is left to S2.
- **Copy:** the business slug confirmation changes to "Old links and printed QR codes that use {old} will redirect to the new address while the catalog is live. The old address stays reserved for this business."

**R-W3-2 (PUB-03 = PROD-06, ruling 10). A product's old addresses redirect within its business, and changing a published product's address is confirmed.**
- **Layer:** migration (table, triggers, function), service, UI.
- **Rule:**
  - `public.product_slug_history(business_id, slug, product_id → products on delete cascade, retired_at, pk(business_id, slug))`, filled when a product's slug changes.
  - The new slug of a product is refused with `product_slug_retired` when another product in the business owns it in history. A product taking back its own old slug removes the row.
  - `public_slug_redirect(business_slug, product_slug)` returns the current slugs only when the product is published and the business is active.
  - The product and embed pages redirect on `NOT_FOUND` through `productLocalPath` / `productEmbedLocalPath` / tenant helpers, keeping `?variant=`.
  - Saving a published product with a changed slug opens a confirmation (§11.1).
- **Acceptance:**
  - Rename `sofa` to `sofa-oslo` while published → the old product URL and the embed redirect, and `?variant=<id>` is kept.
  - A second product taking `sofa` gets "Another product in this catalog used this address before, and its old links still lead there. Choose another address."
  - After the product is deleted, `sofa` is free.

**R-W3-3 (TEAM-02 = PROD-04, TEAM-03, the storage part of BIZ-06, ruling 11, adjusted). A permission includes the permissions it needs.**
- **Layer:** migration (`admin_set_role_permissions`, backfill, storage policies), UI.
- **Prerequisites (closed transitively):**
  - `products.edit` → `products.view`; `products.publish` and `products.delete` → `products.edit`.
  - `businesses.edit` → `businesses.view`; `businesses.status` → `businesses.edit` (adjusted; see §16); `businesses.delete` → `businesses.edit` and `products.delete`.
  - `owners.manage` → `businesses.view`.
  - `applications.approve` and `applications.reject` → `applications.view`.
- **Rule:**
  - `admin_set_role_permissions` adds the closure of the prerequisites and returns `{ok, added:[…]}`. The audit row's `added` lists them.
  - The migration normalises the existing role sets the same way and audits `access_permissions_changed` with `{reason:'prerequisites'}`. A pre-flight query (§13) shows the owner what will change first.
  - Storage delete policies:
    - media can be deleted with `products.edit` or `products.delete` or `businesses.delete`;
    - logos with `businesses.edit` or `businesses.delete`.
- **UI:**
  - The role editor shows "Includes: {labels}" under each permission, and ticks and locks the prerequisites.
  - Buttons are gated on their permission ("View products" and "View QR code" in the businesses list need `products.view`).
  - "Create business (active)" needs `businesses.status`; otherwise only "Save as draft" is offered.
- **Acceptance:**
  - Saving Team = `{products.publish}` stores `{products.view, products.edit, products.publish}`.
  - A role with `{businesses.view, businesses.delete}` saved through the RPC deletes a business, and its logo and media objects are gone.
  - PGlite checks the closure and the policies.

**R-W3-4 (BIZ-06, ruling 12). Deletion leaves no logo behind, and a partial sweep is reported.**
- **Layer:** service (supabase and mock), UI.
- **Rule:**
  - After `createBusiness`, a logo under `new/` is moved to `<id>/` and `logo_url` is updated. If the move fails, the business is kept and the toast says "Business created. The logo couldn't be moved into the business folder; upload it again."
  - `removeFolder` pages past 1000 objects and returns the count of files it could not list or remove.
  - `deleteBusiness` and `deleteProduct` return `{removedFiles, failedFiles}`.
- **Acceptance:**
  - With storage remove failing for 2 files, the toast reads "Business deleted, but 2 files could not be removed from storage." (or "Product deleted, but …").
  - After create-with-logo and delete, `business-logos/new/` is empty.

**R-W3-5 (BIZ-05).**
- **Layer:** UI (`BusinessForm`, `BusinessDetailPage`).
- **Rule:**
  - Without `businesses.edit`, the form renders read-only, with no Save, no logo upload and no slug or status fields. It shows the note "You can view this business. Editing needs 'Create and edit businesses'."
  - The status select shows only with `businesses.status`.
  - Storage RLS errors on logo upload map to `teamFail('forbidden')`.
- **Acceptance:** a default Team member sees no editable inputs.

**R-W3-6 (BIZ-08 and the derived-copy part of BIZ-02).**
- **Layer:** UI (`CatalogStatusNotice`, `BusinessOverviewPage`, `AccountSection`).
- **Rule:**
  - While the owner's own closure request is open, the notice says "Your catalog is offline because you asked to close your account. To keep it, cancel the request in My account." The "paused, contact the platform team" notice is not shown then.
  - Every "offline" sentence is chosen from the real `status`.

**R-W3-7 (BIZ-09).**
- **Layer:** `validation.ts` (`validateBusiness`), `BusinessForm` `maxLength`, `slugInput`.
- **Rule:** the limits mirror the CHECKs: name 80, slug 63, email 320, phone 50, address 500. The description uses one limit, 1000, in the form, the application and SQL `left()`. The DB cap of 5000 stays.
- **Acceptance:** a 501-character address gets the field error "Use 500 characters or fewer." before any request.

**R-W3-8 (PUB-06 = BIZ-11).**
- **Layer:** UI.
- **Rule:** the admin list and the detail page use `catalogLocalPath(b, { preview: b.status !== 'active' })`. The button is labelled "Preview catalog" when the business is not active, and "Open catalog" otherwise.

## 5. W4 Products and public pages

**R-W4-1 (PUB-01 = PROD-01, L3).**
- **Layer:** `src/lib/urls.ts`, UI.
- **Rule:**
  - A new helper `needsPreview(product, business)` is true when the product isn't published or the business isn't active. The editor Preview and the table's "Open product page" both use it.
  - The product page banner depends on the cause:
    - business not active → the existing `catalog.previewBanner`;
    - product is a draft → `product.draftPreview`.
- **Acceptance:** the owner of a draft business with a published product opens it from the table and sees the page with "Preview. Customers cannot see this catalog until it is activated." This is the L3 case.

**R-W4-2 (PROD-02, ruling 13). A stale save is refused.**
- **Layer:** migration (`save_product`), service (supabase and mock), UI.
- **Rule:**
  - The signature and grants are unchanged. `p_product` may carry `expected_updated_at`. When it is present and differs from the row's `updated_at` (`select … for update`), `save_product` raises `product_changed_elsewhere` (P0001).
  - The service always sends the `updatedAt` the editor loaded, and runs no media cleanup after a refused save.
- **Acceptance:** two sessions; A saves, then B saves → B gets "Someone else changed this product. Reload to see their changes." A's files still exist, and B's form keeps its values.

**R-W4-3 (PROD-08).**
- **Layer:** migration (`save_product`), service.
- **Rule:** when the product row isn't visible to the caller, `save_product` raises `product_not_found` (P0002). It raises 42501 only when the row is visible but the update matches no row.
- **Acceptance:** saving after the product was deleted elsewhere → "This product no longer exists. It may have been deleted."

**R-W4-4 (PROD-07).**
- **Layer:** `validateProductDraft`, editor `maxLength`, `mapDbError`.
- **Rule:**
  - price and price delta ≤ 2,147,483,647 minor units;
  - each dimension < 1,000,000;
  - SKU ≤ 100;
  - variant name ≤ 200 characters per language;
  - description and material `maxLength` matching the byte caps (description 8000 characters per language, material 900);
  - 22003 maps to `VALIDATION` "A number is too large."

**R-W4-5 (PROD-10).**
- **Layer:** `formModel.ts`.
- **Rule:** an unnamed option with a price difference or a non-default swatch also triggers "Every option needs an English name."

**R-W4-6 (PROD-11).**
- **Layer:** `VariantsEditor`.
- **Rule:** removing a saved option that has its own photos or 3D files asks first (§11.1). Unsaved or empty options are removed at once.

**R-W4-7 (PROD-09, ruling 15).**
- **Layer:** UI.
- **Rule:**
  - The first option is labelled "Default (shown first)".
  - The options hint adds "Visitors see the first option first, with its price and photos. Reordering changes that."
  - When the first option has a price difference, the table shows "{public price} with the default option" under the base price.
  - No schema change.

**R-W4-8 (PUB-04, the built part).**
- **Layer:** `ProductPage`, `EmbedProductPage`.
- **Rule:** a refetch that returns `NOT_FOUND` replaces stale data with the not-found view. The AR button goes with it.
- The signed-URL window is documented in SECURITY_REVIEW (§13).

**R-W4-9 (PUB-05).**
- **Layer:** `CatalogPage`.
- **Rule:** `useRefreshWhenStale(products.refetch, MEDIA_REFRESH_MS, products.data)`.

**R-W4-10 (PUB-07).**
- **Layer:** `validation.ts`, `ProductPage`.
- **Rule:** saving fails with "Add a button label, or remove the link." when `cta.url` is set and `cta.label.en` is empty. Public pages fall back to `t('product.contactStore')` for an empty label.

**R-W4-11 (PUB-08).**
- **Layer:** `urls.ts`, public pages (not `LandingPage`, see §1).
- **Rule:**
  - `catalogLocalPath(b, { preview?, category? })` replaces the hand-built strings at `ProductPage.tsx:71` (which keeps `preview`). `LandingPage.tsx:82` is left unchanged (owner's file).
  - Public routes whose slug parameters aren't lower case `<Navigate replace>` to the lower-case path built by the helpers.
- **Acceptance:** `/catalog/Casa-Lisboa` → `/catalog/casa-lisboa`.

**R-W4-12 (PUB-09, the noindex part).**
- **Layer:** `vercel.json`.
- **Rule:** `X-Robots-Tag: noindex` is sent for `/embed/(.*)` and, with `has: [{type:'query', key:'preview'}]`, for every path.

**R-W4-13 (PUB-10).**
- **Layer:** `CatalogPage`.
- **Rule:** sort by `localized(p.name)` with `localeCompare(…, lang)`.

**R-W4-14 (PROD-05, ruling 32).**
- **Layer:** docs.
- **Rule:**
  - CLIENT_HANDOVER §Options, §Known limitations and the unit-switch line describe the real behaviour: options can have their own photos and 3D files, and the unit switch offers to convert.
  - PRD R-09 is set to its shipped state.
  - design/19 Storage gets 12 h signed URLs, delete removes files, and the publish image rule in SQL.

## 6. W5 Analytics and dashboard numbers

**R-W5-1 (ANA-01 = TEAM-10).**
- **Layer:** UI (`AdminOverviewPage`).
- **Rule:**
  - Views and AR stats, the chart and "Most viewed" render only with `analytics.view`; otherwise "You don't have access to analytics."
  - The product counts need `products.view`, and the business counts need `businesses.view`.
  - `PendingApplications` needs `applications.view`.
  - Every link is shown only when its target page's permission is held. "Most viewed" rows link to edit only with `products.edit`.
- **Acceptance:** Team without `applications.view` never sees "No applications awaiting review".

**R-W5-2 (ANA-02, ruling 16).**
- **Layer:** migration (`analytics_daily`), service, UI.
- **Rule:**
  - `public.analytics_daily(p_tz text, p_days int default 30, p_business uuid default null)` is security invoker, so RLS applies.
  - It buckets by `(created_at at time zone p_tz)::date` over the last `p_days` local days.
  - `p_tz` is checked against `pg_timezone_names`, otherwise `invalid_timezone`. `p_days` must be 1–366.
  - The service passes `usePreferences().timezone` (demo: the browser zone) and pages with `range`.
  - The chart axis, tooltip and table use `formatDate(iso, 'en', prefs)`.
- **Acceptance (PGlite):** an event at 2026-10-26 01:30 UTC lands on 25 Oct for `America/Sao_Paulo` and on 26 Oct for `Europe/Lisbon`.

**R-W5-3 (ANA-04, ruling 17).**
- **Layer:** migration (event type, view, `record_event_limited`), track-event, UI.
- **Rule:**
  - New event `embed_view`: the `product_analytics_event_type_check` is extended, `record_event_limited` accepts it, and track-event's `EVENT_TYPES` gains it.
  - The view gains `embed_views` as its last column.
  - The embed sends `embed_view`, and the product page sends `view`, so a visit that goes from the embed to the page counts once on each surface.
  - Labels: "Product page views" and "Embed views".
  - The AR rate is `ar / (views + embed_views)`, shown as "{n.nn} AR launches per view". It is never a percentage.
  - Rows from before the change can't be split; the analytics page notes "Embed loads before {release date} are counted as page views."
- **Acceptance:** one embed load → `embed_views` +1 and `views` +0.

**R-W5-4 (ANA-11, ruling 18).**
- **Layer:** migration, `summarize`, UI.
- **Rule:**
  - `product_analytics.product_id` becomes nullable. The composite FK becomes `on delete set null (product_id)`.
  - A new FK `business_id → businesses on delete cascade` is added.
  - `summarize` adds null-product rows to the totals and the series, and lists them as one "Deleted product" row.
  - The product delete dialog adds "Its past views stay in your totals as 'Deleted product'."
- **Acceptance:** deleting a product with 500 views leaves the 30-day total unchanged.

**R-W5-5 (ANA-10, ruling 19).**
- **Layer:** migration (product audit trigger, policies), service, UI.
- **Rule:**
  - `private.audit_product_change` writes `product_created`, `product_published`, `product_unpublished`, `product_slug_changed` and `product_deleted`, with `{name}` and `business_id`.
  - It skips deletes cascaded from a business delete (the business row is no longer visible).
  - Recent activity on both Overviews reads these events plus `business_status_changed`.
  - Read access:
    - staff use the new policy "Platform members read catalogue activity": `product_%` events need `products.view`, and `business_created`, `business_status_changed` and `business_deleted` need `businesses.view`;
    - owners use R-W7-2's policy.
- **Acceptance:** unpublishing a product shows "{name} was unpublished", and "was published" is never shown for a draft. A paused catalog and a deleted product appear in the feed.

**R-W5-6 (ANA-06 = BIZ-12).**
- **Layer:** migration (view), service.
- **Rule:**
  - `public.business_product_counts` (security invoker; `business_id, total, published, drafts`; `grant select` to authenticated) feeds the list, the delete dialog and the totals.
  - The products and businesses reads in analytics page with `range` until fewer than 1000 rows come back.
- **Acceptance (PGlite and unit):** 1,200 products → the counts are exact.

**R-W5-7 (ANA-07).**
- **Layer:** shared `MostViewedList`.
- **Rule:** it filters out products with `views + embedViews = 0` on every dashboard.

**R-W5-8 (ANA-12).**
- **Layer:** UI.
- **Rule:** the "Published" hint shows "In your catalog" when active, "Catalog not public yet" for a draft, and "Catalog paused" when inactive.

## 7. W6 Team lifecycle

**R-W6-1 (TEAM-04, ruling 21).**
- **Layer:** migration (`admin_remove_member`), manage-member, UI.
- **Rule:**
  - `admin_remove_member(p_member)` is Owner-only through `owner_or_deny`, so it is 2FA-gated. It needs `status = 'deactivated'` (otherwise `not_deactivated`) and refuses `self`.
  - It deletes the invites and the row, and writes `access_member_removed` with `{member_id, email_sha256, role}`. It returns `{ok, user_id}`.
  - `manage-member {action:"remove"}` calls it with the caller's JWT. Then, with the service role, it ends sessions and deletes the auth user when there is no `business_members` row and no `platform_admins` row.
- **UI:** a Remove button on deactivated members (§11.1).
- **Acceptance:** after removal, inviting the same email as a business owner or a team member works.

**R-W6-2 (TEAM-05 = MAIL-03, ruling 22).**
- **Layer:** migration (a trigger on `auth.users`, backfill).
- **Rule:**
  - `AFTER UPDATE OF email ON auth.users` runs `private.sync_member_email`, which is security definer and never raises (exceptions are caught and logged as a warning).
  - It sets `platform_members.email = lower(new.email)` for that `user_id`, and writes `access_member_email_changed` with `{member_id, from, to}`.
  - When the new address is already another member's row, nothing changes and the event carries `{conflict:true}`.
  - The backfill syncs drifted rows.
  - Staff alerts (`submit-application`) then use the current address with no code change.
- **Acceptance (PGlite):** updating `auth.users.email` changes the member row and writes the audit row.

**R-W6-3 (TEAM-08 = MAIL-10).**
- **Layer:** migration (`service_request_closure`), account-security, email.
- **Rule:**
  - For staff, `service_request_closure` writes `access_member_closed` with `{member_id, email_sha256, role, reason:'self_closure'}` before the account is deleted.
  - account-security emails each Owner a `team_notice` (§11.3).
  - Attribution survives through R-W7-1.
- **Acceptance:** after an Admin deletes their own account, Access history shows "Admin closed their own account", and the Owner has an `email_log` row.

**R-W6-4 (TEAM-06).**
- **Layer:** migration (event metadata), service (supabase and mock).
- **Rule:**
  - A member's Access history filters `metadata->>member_id = <id>`, or `event_type = 'access_denied' and actor_id = <user_id>`.
  - `access_invite_expired_attempt` gains `member_id` in `service_accept_invite`.
  - There is no `ilike` search on email.
- **Acceptance:** `delivered+a_b@resend.dev` shows its events, and `an@x.pt` doesn't show `jan@x.pt`'s.

**R-W6-5 (TEAM-14 = MAIL-17).**
- **Layer:** migration (`platform_invites.note`), invite-member, `_shared/team.ts`.
- **Rule:**
  - The bullets in the invitation email come from `platform_role_permissions` for the role at send time, with the labels from `permissions.ts`, mirrored in `_shared/team.ts`.
  - The note is stored on the invite (≤ 500 characters), and resend reuses the latest note.
- **Acceptance:** with `products.publish` removed from Admin, the email doesn't mention publishing. A resend keeps the note.

**R-W6-6 (TEAM-15).**
- **Layer:** migration (`admin_list_members` / `admin_get_member` gain `has_2fa`), account-security, UI.
- **Rule:** Reset 2FA is shown only when `has_2fa` is true (a verified factor or stored recovery codes). The function answers 409 `nothing_to_reset`, sends no email and writes no event.

**R-W6-7 (TEAM-16).**
- **Layer:** migration (`my_platform_access`), auth service, `LoginPage`.
- **Rule:** a deactivated member gets `{role:null, status:'deactivated'}`. The login page says "Your platform access was turned off by the Owner. Contact them if you need it back."

**R-W6-8 (TEAM-12).**
- **Layer:** `AccountProvider`.
- **Rule:** platform access is refetched on the same focus, visibility and interval cadence as the security state, and after any `PERMISSION` error. A changed role or permission set updates the nav and shows "Your access changed. This page was updated."

**R-W6-9 (TEAM-13).**
- **Layer:** service, UI.
- **Rule:**
  - `already_member` is mapped by the existing member's status, taken from the loaded list:
    - invited → "This person already has an invitation. Use Resend on their row."
    - deactivated → "This person was deactivated. Reactivate them, or remove them to start over."
    - active → the existing copy.
  - The revoke toast says "Invitation revoked. Use Resend to send them a new link."
  - "Pending invitations" counts only live invites (sent or pending, and not expired).

## 8. W7 Email and history

**R-W7-1 (MAIL-08, ruling 28).**
- **Layer:** migration (trigger, FK), UI.
- **Rule:**
  - `BEFORE INSERT` on `audit_events` runs `private.snapshot_audit_event`. It adds `metadata.business_name` (from `businesses`, when `business_id` is set and the name isn't already there) and `metadata.actor_label`. The label is Owner, Admin, Team, Business owner or User, from the actor's rows at insert. No email and no name is stored.
  - The FK `audit_events.business_id → businesses` is dropped, so history keeps the id after a delete. `actor_id` keeps `on delete set null`.
  - `audit_business_change` also sets `business_id` on `business_deleted`.
  - UI:
    - a null actor with a label → "Deleted user ({label})";
    - no label → "System";
    - a business that no longer exists → "{business_name} (deleted)", not a link.
- **Acceptance:** after a business is deleted, its earlier rows still filter by the business and show its name.

**R-W7-2 (MAIL-11, ruling 27).**
- **Layer:** migration (policy), new Edge Function `notify-business-owner`, UI, email.
- **Rule:**
  - New policy "Business owners read platform changes to their business" (select for authenticated): `is_business_member(business_id)`, and `event_type` in (`business_status_changed`, `business_slug_changed`, `product_created`, `product_published`, `product_unpublished`, `product_slug_changed`, `product_deleted`, `account_closure_voided`).
  - After a staff user pauses or activates a business, or unpublishes or deletes a product, the service calls `notify-business-owner {businessId}`. This is fire-and-forget: a failure never undoes the action.
  - The function, with the 2FA check and staff only, finds that business's audit rows from the last 10 minutes that the caller authored, with `actor_label` in Owner, Admin or Team and one of these types:
    - `business_status_changed` to `inactive` or `active`;
    - `product_unpublished`;
    - `product_deleted`.
  - It sends one `business_notice` per row to the business owner. The language is the source application's language, otherwise EN. The workflow `business_notice:<audit_id>` is the dedupe key, so a row is never emailed twice.
  - The owner dashboard shows "Changes by the platform team": the last 20 such rows, read-only, with the empty state "No changes by the platform team."
- **Acceptance:** an Admin pauses a business → one email to the owner, and calling the function twice sends one. The owner sees the row. The owner can't read other businesses' rows.

**R-W7-3 (MAIL-02, part 1, ruling 29).**
- **Layer:** migration (`service_record_email_event`), UI.
- **Rule:**
  - On `bounced`, `complained` or `failed` for a `team_invitation` row (workflow `team_invite:<member>`), the member's newest invite with status `sent`, created no later than the log row, becomes `email_failed`, with `last_email_result` set to the event.
  - The Team page and the member page show "Email failed" (the existing label).
- **Acceptance:** a bounce webhook for an invite → the invite status is `email_failed`.

**R-W7-4 (MAIL-12).**
- **Layer:** migration.
- **Rule:**
  - Ranks: blocked 0, failed 1, accepted 1, sent 2, delayed 3, delivered 4, bounced 5, complained 5.
  - `email.suppressed` maps to `bounced` with `error = 'suppressed'`.
  - An event that matches no log row is stored with `private.email_provider_events.applied = false`.
  - `AFTER INSERT OR UPDATE OF provider_message_id` on `email_log` applies pending events in `received_at` order.
- **Acceptance:** `delivered` after `bounced` leaves it `bounced`. `sent` before the log row is applied when the row arrives.

**R-W7-5 (MAIL-13).**
- **Layer:** migration (`service_apply_provider_status`), send-test-email.
- **Rule:** the status check writes only through the rank rule. `opened`, `clicked`, `scheduled` and unknown events write nothing.

**R-W7-6 (MAIL-04).**
- **Layer:** account-security, UI.
- **Rule:**
  - `owner_reset_2fa`, `restore_closure` and `complete_closure` return `notice: {status, error?}`.
  - The toasts say "…. They were emailed." only when the status is `accepted`. Otherwise they say "…, but the notice email was not sent: {reason}."

**R-W7-7 (MAIL-05).**
- **Layer:** account-security, `ActionCodeDialog`.
- **Rule:**
  - A `blocked` send returns `email_blocked` (the code is voided, as in S1). A transient failure stays `email_failed`.
  - The dialog shows "Email can't be sent to this address yet. Contact the Sanctus team." and disables Resend for the session.
  - The S1 rule that voided codes count toward the 5-per-hour limit is kept on purpose (§16).

**R-W7-8 (MAIL-07).**
- **Layer:** UI.
- **Rule:**
  - The business History and Email activity panels render only with `records.view`. Otherwise they say "This business's history needs 'View the audit log and email log'."
  - On an application, a member without `records.view` sees "Showing application events only."

**R-W7-9 (MAIL-16).**
- **Layer:** migration (`service_log_account_event` gains `p_business_id default null`, dropped and recreated with the same grants; `app.actor_id` honoured by `audit_business_change`), account-security.
- **Rule:**
  - `account_closure_requested` stores `business_id`. The closure's status change is attributed to the requester.
  - With no admin inbox set, a `blocked` `closure_request` row is logged.
  - The new action `cancel_closure` (the app calls it in place of the RPC) runs `cancel_account_closure` with the caller's JWT, then alerts the inbox: "Closure request cancelled".

## 9. W8 Demo parity and labels (ruling 31, done last)
- **R-W8-1 (APP-13):** the mock `provisionOwner` for a business that already has an owner goes through `resendOwnerInvitation`, with the cooldown, the cap of 10 per 24 h per recipient, and `already_accepted`.
- **R-W8-2 (BIZ-10):**
  - The mock closure sets `inactive`, remembers the previous status and restores it.
  - Complete deletes the business.
  - The seed request points at an existing business.
  - A business delete clears owners and `application.businessId`, and sets `businessDeletedAt`.
  - Signed-out visitors can't read non-active businesses.
- **R-W8-3 (ANA-08):** `summarize` skips rows whose day isn't in the series.
- **R-W8-4 (ANA-09):** the mock `recordEvent` applies the published, active, has-model and 30-per-minute checks, and returns `VALIDATION` / `RATE_LIMITED`.
- **R-W8-5 (TEAM-19):** the mock team checks real owner memberships, applies the 5-per-hour resend limit and the `self` refusal, and searches access history as R-W6-4 does.
- **R-W8-6 (MAIL-18):**
  - `EMAIL_KIND_LABEL` gains `team_invitation` "Team invitation", `security_code` "Security code", `security_notice` "Security notice", `closure_request` "Closure request", `application_decision` "Application decision", `business_notice` "Business notice" and `team_notice` "Team notice".
  - The mock leaves `platform_security_policy_changed` out of Security activity.
  - The mock resend subject is "New invitation code".

## 10. Data model

### 10.1 One migration
Create it with `npx supabase migration new business_logic_fixes`, which gives `supabase/migrations/<timestamp>_business_logic_fixes.sql`.

Rollback: `supabase/rollback/20261026_business_logic_fixes_rollback.sql`. It:
- restores the earlier function bodies and policies;
- drops the new tables, triggers and views;
- re-adds the FK on `audit_events.business_id` as `not valid` (deleted ids remain);
- restores the analytics cascade FK, which needs `delete from product_analytics where product_id is null` first and is documented as data loss;
- keeps every audit and email row.

**Tables**
| Table | Columns | RLS and grants |
|---|---|---|
| `public.business_slug_history` | `slug text pk` (same format check as `businesses.slug`), `business_id uuid null → businesses on delete set null`, `retired_at timestamptz default now()` | RLS on; revoke all from public/anon/authenticated; `grant select to authenticated`. Policy: `is_platform_admin() or platform_can('businesses.view') or is_business_member(business_id)`. No API writes (definer triggers). |
| `public.product_slug_history` | `business_id → businesses on delete cascade`, `slug text`, `product_id → products on delete cascade`, `retired_at`; `pk (business_id, slug)` | Same pattern. Policy: `is_platform_admin() or platform_can('products.view') or is_business_member(business_id)`. |
| `private.application_attempts` | `id bigint identity`, `submitter_hash text not null`, `created_at timestamptz default now()`; indexes `(submitter_hash, created_at)` and `(created_at)` | RLS on; revoke all from public/anon/authenticated; `grant select, insert, delete to service_role`. R-W2-10. |
| `private.owner_invite_attempts` | `id`, `business_id → businesses on delete cascade`, `recipient text check (= lower)`, `attempt int`, `actor uuid → auth.users on delete set null`, `outcome text null check in ('accepted','sent','failed','blocked')`, `created_at`; index `(business_id, recipient, created_at desc)` | RLS on; revoke all from public/anon/authenticated; `grant select, insert, update to service_role`. |

**Columns and constraints**
- `business_applications.business_deleted_at timestamptz` (backfill: none; L1 has no date).
- `private.platform_invites.note text check (char_length(note) <= 500)`.
- `private.email_provider_events.applied boolean not null default true`.
- `email_log.attempt` check widened to `1..100000`.
- `email_log_kind_check` (§10.4).
- `product_analytics`:
  - `product_id` is nullable;
  - the composite FK becomes `on delete set null (product_id)`;
  - a new FK on `business_id → businesses on delete cascade`;
  - the event check adds `embed_view`.
- `audit_events`: the FK on `business_id` is dropped.

**Views**
- `product_analytics_daily` (`create or replace`) appends `embed_views`.
- `public.business_product_counts` (security invoker; `grant select to authenticated`).

**New functions** (security definer, `set search_path = ''`, `revoke … from public`, explicit grants)
| Function | Grant | Purpose |
|---|---|---|
| `public_slug_redirect(p_business_slug text, p_product_slug text default null) → jsonb` | anon, authenticated | `{business_slug, product_slug?}` for a retired slug of an active business (and a published product), else null. It returns nothing about non-active businesses. |
| `analytics_daily(p_tz, p_days, p_business) → table` (security **invoker**) | authenticated | R-W5-2 |
| `admin_list_owner_states() → jsonb` | authenticated | R-W2-5 |
| `admin_application_duplicates(p_application_id uuid) → jsonb` | authenticated | R-W2-9 |
| `service_application_attempt(p_hashes text[], p_max int default 5) → boolean` | service_role | R-W2-10 |
| `private.normalize_business_name(text) → text` (`immutable`, not definer) | none (execute revoked from public, anon, authenticated; called by definer functions) | R-W2-9 |
| `admin_remove_member(p_member uuid) → jsonb` | authenticated | R-W6-1 |
| `service_reserve_owner_invite(uuid, text, uuid)`, `service_finish_owner_invite(uuid, text)` | service_role | R-W2-4 |
| `service_apply_provider_status(text, text) → boolean` | service_role | R-W7-5 |
| Private triggers: `guard_retired_business_slug`, `retire_business_slug`, `guard_retired_product_slug`, `retire_product_slug`, `void_closure_on_owner_removed`, `guard_activate_during_closure`, `mark_application_business_deleted`, `audit_product_change`, `snapshot_audit_event`, `apply_pending_email_events`, `sync_member_email` (on `auth.users`) | none (execute revoked from public, anon, authenticated) | as cited |

**Redefined** (`create or replace`, same signature and grants unless noted):
- **Slugs and applications:** `private.unique_business_slug`, `service_link_owner`, `admin_review_application` (+ `reopen`).
- **Access:** `record_sign_in`, `my_platform_access`, `admin_set_role_permissions`, `admin_list_members`, `admin_get_member`, `service_accept_invite`.
- **Closure:** `service_closure_target`, `private.undo_closure`, `service_request_closure`, `service_log_account_event` (dropped and recreated with `p_business_id`; grants restated).
- **Email:** `service_record_email_event`.
- **Analytics and products:** `record_event_limited`, `save_product`.
- **Audit:** `private.audit_business_change`.

**Policies**
- **Audit events:**
  - recreated: "Platform members read audit events" (R-W1-4);
  - new: "Platform members read catalogue activity" (R-W5-5) and "Business owners read platform changes to their business" (R-W7-2).
- **Profiles:** "Platform members read profiles" is replaced (R-W1-5).
- **Storage:** "Platform members delete media" and "Platform members delete logos" are recreated (R-W3-3).
- **New tables:** the select policies on the two history tables.

**Backfill**
- Role-set prerequisite normalisation, with an audit row.
- `platform_members.email` sync.
- `business_slug_history` from `business_slug_changed`.

### 10.2 Error keys raised by SQL (mapped in `ACCOUNT_RULES` / `DB_RULES`)
| Key | Code | Field or copy |
|---|---|---|
| `closure_pending` | P0001 | "This business has an open closure request. Only the platform Owner can restore it or complete it." |
| `slug_retired` | P0001 | field `slug`: "This address was used before and still belongs to another catalog. Choose another address." |
| `product_slug_retired` | P0001 | field `slug`: "Another product in this catalog used this address before, and its old links still lead there. Choose another address." |
| `product_changed_elsewhere` | P0001 | "Someone else changed this product. Reload to see their changes." |
| `product_not_found` | P0002 | "This product no longer exists. It may have been deleted." |
| `reopen_not_allowed` | 22023 | "Only an approved application whose business was deleted can be reopened." |
| `email_is_admin` | 23514 | the existing provision-owner copy |
| `invalid_timezone` | 22023 | "Your time zone setting isn't recognised. Choose it again in Preferences." |

### 10.3 Edge Functions
All of them:
- follow the `handler.ts` (pure, injected) plus `index.ts` layout;
- take the caller from `getUser()`;
- check 2FA first (R-W1-1);
- have no secrets in logs.

| Function | `verify_jwt` | Input → output |
|---|---|---|
| **`review-application`** (new) | true | `{applicationId, action:'start_review'\|'approve'\|'reject'\|'reopen', reason?, includeReason?}` → `{ok:true, status, businessId?, email?:{status, error?}}`; errors `aal2_required` 403, `forbidden` 403, `reason_required`/`invalid_transition`/`reopen_not_allowed` 422, `application_not_found` 404. Secrets: the existing email set. |
| **`notify-business-owner`** (new) | true | `{businessId}` → `{ok:true, sent:n, skipped:n}`; staff only (`is_platform_admin() or is_platform_member()` through the caller client); dedupe via `email_log.workflow`. |
| `provision-owner` | true | adds 2FA, reservation (`cooldown`/`too_many_invitations` with `retryAt`), `email_is_admin` before account creation, and orphan cleanup |
| `invite-member` | true | gated owner check on every action; permission-built bullets; stored note |
| `manage-member` | true | `+ {action:'remove', memberId}` → `{ok, loginDeleted}` |
| `send-test-email` | true | gated owner check; status through `service_apply_provider_status` |
| `account-security` | true | `notice` in responses; `email_blocked`; `nothing_to_reset`; `cancel_closure`; staff self-closure `team_notice` |
| `accept-member-invite` | false (unchanged) | password 12–72 |
| `track-event` | false (unchanged) | accepts `embed_view` |
| `submit-application` | false (unchanged) | rate limit before the duplicate lookup through `service_application_attempt`, dated submitter hash (R-W2-10); non-fatal audit and replay completion (R-W2-11). Same input and output. |
| `resend-webhook` | false (unchanged) | forwards `email.suppressed` |

`supabase/config.toml` gets `[functions.review-application]` and `[functions.notify-business-owner]` with `verify_jwt = true`.

### 10.4 Email kinds and audit types
- `email_log_kind_check` = the existing 9 + **`application_decision`**, **`business_notice`** and **`team_notice`** (also added to `EmailKind` in `_shared/email.ts`).
- `audit_events_event_type_check`: no change (regex). New event types:
  - **closure and applications:** `account_closure_voided`, `application_status_changed` (reused for reopen);
  - **products:** `product_created`, `product_published`, `product_unpublished`, `product_slug_changed`, `product_deleted`;
  - **team access:** `access_member_removed`, `access_member_closed`, `access_member_email_changed`.
- Each new type gets a label in `labels.tsx` / `teamLabels.tsx`.

## 11. Copy

### 11.1 Dashboards (English only)
**Applications**
- Reject modal checkbox: "Include the reason in the email". Hint: "Off: the applicant is told the application was not approved, with no reason."
- Reject toast:
  - "Application rejected. The applicant was emailed."
  - or "Application rejected, but the email was not sent: {reason}."
- Possible duplicates (R-W2-9):
  - Panel title: "Possible duplicates". Intro: "Check these before you decide. This is only a warning; every action stays available."
  - Application row: "Application {reference} · {businessName} · {status label} · {match}", where {match} is "same email", "same business name" or "same email and business name".
  - Business row: "Business {name} · {status label} · {match}", where {match} is "its owner uses this email", "same business name" or "same business name, and its owner uses this email".
  - Loading: "Checking for possible duplicates…". Error: "Couldn't check for possible duplicates. You can still review this application."

**Businesses and closure**
- Closure badge: "Closure requested on {date}".
- Activate tooltip during closure: the `closure_pending` copy.
- Owner state values: "Needs owner", "Invite pending", "Invite pending · email not sent", "Owner active".

**Products and the role editor**
- Product slug confirmation:
  - Title: "Change the address of a published product?"
  - Body: "Old links, QR codes and embeds that use /{old} will redirect to /{new}. The old address stays reserved for this product."
  - Buttons: "Change address" / "Cancel".
- Option removal confirmation:
  - Title: "Remove {name}?"
  - Body: "Its photos and 3D files are deleted when you save. Links to this option will open the first option."
  - Buttons: "Remove option" / "Cancel".
- Role editor: "Includes: {labels}". Toast after save when prerequisites were added: "Saved. Also added: {labels}, which {it needs|they need}."

**Team**
- Remove member:
  - Title: "Remove {email} from the team?"
  - Body: "Their access record and login are deleted. Past actions stay in the audit log as 'Deleted user ({role})'. They can be invited again later."
  - Button: "Remove member".
  - Toast: "{email} was removed."
- The remaining team copy is inline in R-W6-6 to R-W6-9.

### 11.2 Applicant-facing and public (EN / PT)
| Key | EN | PT |
|---|---|---|
| `application_decision` subject | Your Sanctus application for {businessName} | A sua candidatura à Sanctus para {businessName} |
| … body | Thank you for applying to list {businessName} on Sanctus. After review, we are not able to approve this application. | Obrigado pela sua candidatura para apresentar {businessName} na Sanctus. Após análise, não nos é possível aprovar esta candidatura. |
| … reason line (only when ticked) | Reason: {reason} | Motivo: {reason} |
| … closing | You are welcome to apply again if your situation changes. | Pode candidatar-se novamente se a sua situação mudar. |
| Confirmation email line (replaces "We will email you when…") | If we approve it, you will receive an invitation to set up your catalog. If we can't, we will tell you by email. | Se for aprovada, receberá um convite para configurar o seu catálogo. Se não for possível, informamos por email. |
| `apply.done.next2` | We email our decision to {email}. If approved, you receive an invitation to set up your catalog. | Enviamos a nossa decisão para {email}. Se for aprovada, recebe um convite para configurar o seu catálogo. |
| `invite.signedInAs` | You're signed in as {email}. If this invitation is for someone else, sign out first. | Tem sessão iniciada como {email}. Se este convite for para outra pessoa, termine a sessão primeiro. |
| `invite.signOut` | Sign out | Terminar sessão |

**`business_notice` (owner; the application's language, else EN)**
| Event | Subject EN / PT | Body EN / PT |
|---|---|---|
| paused | Your Sanctus catalog has been paused / O seu catálogo Sanctus foi pausado | The Sanctus team paused the public catalog of {businessName}. Customers who open its link or QR code can't see it for now. Your products and settings are kept. / A equipa Sanctus pausou o catálogo público de {businessName}. Quem abrir o link ou o código QR não o consegue ver por agora. Os seus produtos e definições são mantidos. |
| live | Your Sanctus catalog is live / O seu catálogo Sanctus está disponível | The Sanctus team made the catalog of {businessName} public. Customers can now open it from its link and QR code. / A equipa Sanctus tornou público o catálogo de {businessName}. Os clientes já o podem abrir pelo link e pelo código QR. |
| product unpublished | A product was unpublished from your catalog / Um produto foi retirado do seu catálogo | The Sanctus team unpublished {productName}. It is kept as a draft in your dashboard. / A equipa Sanctus retirou {productName} do catálogo. Fica guardado como rascunho no seu painel. |
| product deleted | A product was removed from your catalog / Um produto foi eliminado do seu catálogo | The Sanctus team deleted {productName}, with its photos and 3D files. / A equipa Sanctus eliminou {productName}, com as suas fotos e ficheiros 3D. |

Every notice ends with: "You can see this change under 'Changes by the platform team' in your dashboard. Contact the Sanctus team if you have questions." / "Pode ver esta alteração em 'Alterações da equipa da plataforma' no seu painel. Contacte a equipa Sanctus se tiver dúvidas." The dashboard card itself stays English: "Changes by the platform team".

### 11.3 Staff emails (English)
- **`team_notice`:**
  - Subject: "{email} left the Sanctus team".
  - Body: "{email} ({role}) deleted their Sanctus account on {date}. Their access ended and their sessions were signed out. Their past actions show as 'Deleted user ({role})' in the audit log."
- **Inbox closure cancel:**
  - Subject: "Closure request cancelled: {businessName}".
  - Body: "The owner of {businessName} cancelled their account-closure request. The catalog is back to {status}."

## 12. Documented as is (TEAM-20)
- **Who documents it:** SECURITY_REVIEW and CLIENT_HANDOVER.
- **What they say:** "Team members with 'Create and edit products' change published products directly; there is no review step. Remove that permission if Team should only prepare drafts."

## 13. Release order, docs and risks

### 13.1 Release order
**Migration**
1. Get the owner's go-ahead for `zggylkbgajamhriebdrg`. Run the read-only pre-flight queries and show the owner the results:
   - role sets missing prerequisites (and what will be added);
   - `platform_members` rows whose email differs from `auth.users`;
   - business slugs from `business_slug_changed` that will be reserved;
   - `email_log.attempt` maxima.
2. Apply the migration with `supabase db push`. Never use `config push`.
3. Run `npm run db:types`.

**Edge Functions and frontend**
4. Deploy the functions: the new `review-application` and `notify-business-owner`, then `submit-application`, `provision-owner`, `invite-member`, `manage-member`, `send-test-email`, `account-security`, `accept-member-invite`, `track-event` and `resend-webhook`. No new secrets.
5. Subscribe the Resend webhook to `email.suppressed`.
6. Release the frontend to the Preview, then to `sanctus.warpkit.online`. Push to `main` only when the owner asks.

**Compatibility while versions are mixed:**
- An old frontend still works against the new DB:
  - `save_product` without `expected_updated_at` skips the check;
  - a direct `admin_review_application` call still works (it sends no email);
  - the embed sends `view`.
- An old frontend's Activate on a closing business gets the generic error until the new UI ships.

### 13.2 Docs to update
- **New ADR:**
  - `System_arch/decisions/ADR-0033-business-logic-fixes.md` covers:
    - address history and reservation;
    - permission prerequisites;
    - audit snapshots and the dropped business FK;
    - embed views;
    - deleted-product analytics.
  - Add its row to `decisions/README.md`.
- **Design files:**
  - design/19: storage, slug history, analytics, audit, access map;
  - design/23: kinds, ranks, suppressed;
  - design/24: review function, reopen, invitation limit;
  - design/14: redirects.
- **docs:**
  - SECURITY_REVIEW: R-W1-1, R-W1-4, R-W1-5, the PUB-04 window, TEAM-20;
  - OPERATIONS_RUNBOOK: release order, pre-flight, webhook event, rollback;
  - TEST_PLAN, PRD (X-01, R-09, R-28/R-30 labels), CLIENT_HANDOVER (W4-14, TEAM-20, owner notices);
  - PRODUCTION_READINESS, `System_arch/Task.md` and the P13 task file;
  - HANDOFF (live state).

### 13.3 Risks
- **Backfill widens access.** Normalising role sets can add permissions, for example edit for a role that has publish. Mitigation: the pre-flight shows it, and the owner approves or narrows the sets first. The change is audited.
- **The Owner can't Activate a closing business directly** (by design). The UI explains it. Restore stays available.
- **Deleted businesses' slugs from before this migration aren't reserved**, because their slug was never recorded. Their old QR codes could open a new store that takes the slug. Mitigation: the pre-flight lists businesses deleted before the migration, and the owner can reserve known slugs by hand.
- **Embed views before the release are counted as page views**, and history can't be split. Labelled on the analytics page.
- **Email notices to owners are best-effort.** They are called by the client after the change, so a closed tab means no email. The dashboard list is the durable record.
- **The `auth.users` trigger** runs inside Supabase Auth's update. It never raises, and a PGlite test asserts that an exception inside it doesn't block the email change.
- **Rolling back the analytics FK** deletes deleted-product rows. That is stated in the rollback script header.

## 14. Testing (test-first)
- **PGlite** (new `supabase/tests/businessLogicFixes.test.ts`, the same harness as `accountSettings.test.ts`):
  - **Closure:** removing an owner voids the request; after removal the closure functions do nothing; `closure_pending` for an Admin and the Owner, while cancel and restore pass; `closure_follow_status` still records draft/inactive.
  - **Privacy and access:** `account_%` events are hidden from an Admin with `records.view`; profiles visibility for the four cases in R-W1-5; Owner permissions = 15; deactivated status.
  - **Slugs:** business slug retire, refuse, reclaim and delete-reserve; `unique_business_slug` skips history; product slug history and refusal; `public_slug_redirect` as anon for active, inactive and draft businesses and for unpublished products.
  - **Permissions and storage:** prerequisite closure on save and on backfill; storage delete with `businesses.delete` only.
  - **Applications and invitations:**
    - `reopen` transitions and `business_deleted_at`;
    - `service_link_owner` lock, `email_is_admin` and `business_has_owner`;
    - reservation cooldown, the 24-hour limit and blocked exclusion, plus parallel reserve (two connections);
    - `record_sign_in` accepts memberships;
    - `normalize_business_name` cases and `admin_application_duplicates` matches, exclusions and gate (R-W2-9);
    - `service_application_attempt`: the limit, the two-hash window, the 2-hour clean-up and a parallel call at count 4 (R-W2-10).
  - **Products:** `save_product` with a stale `expected_updated_at`, and `product_not_found`.
  - **Analytics:** `analytics_daily` time-zone buckets and RLS; `embed_view` accepted and counted; product delete keeps the analytics rows; `business_product_counts` with more than 1000 products.
  - **Audit and email:** product audit events and the cascade skip; the snapshot trigger fields; owners can read only their business's whitelisted events; webhook ranks, suppressed and the pending-event apply; the team-invite `email_failed` update; `service_apply_provider_status`.
  - **Team:** the email-sync trigger (including a conflict and a swallowed exception); `admin_remove_member`; `access_member_closed`; `has_2fa`.
  - **Grants:** anon can't execute any `service_*` function or read `owner_invite_attempts`; the history tables have no API writes.
  - **Rollback:** apply, then roll back, then re-apply.
- **Function handlers (Vitest, injected):**
  - `review-application`: each action, the email with and without the reason, EN/PT, email failure keeps the rejection, `aal2_required`.
  - `notify-business-owner`: only the caller's recent staff rows, dedupe, language choice.
  - `provision-owner`: `aal2_required`, `cooldown`/`too_many_invitations` with `retryAt`, orphan delete, `email_is_admin` before account creation.
  - `submit-application`: the rate limit before the duplicate lookup, the dated hash and the midnight window (R-W2-10); the non-fatal audit, the replay completion, the 30-second guard and the stored address (R-W2-11).
  - `invite-member`: gated resend, permission-built bullets, note kept on resend.
  - `manage-member remove`, `send-test-email` (gated and rank-safe), `account-security` (`notice`, `email_blocked`, `nothing_to_reset`, `cancel_closure`, `team_notice`), `accept-member-invite` length 12, `track-event` `embed_view`, `email-templates` for the 3 new kinds in EN/PT.
- **Service and component tests:**
  - **Service layer:** `mapDbError` keys (§10.2) and 22003; `summarize` with the deleted-product bucket and the out-of-window skip; `needsPreview`; the `catalogLocalPath` category option.
  - **Owner and admin screens:**
    - the owner-removal closure warning;
    - closure badge and hidden Activate;
    - the read-only BusinessForm;
    - Overview gating per permission;
    - the role editor's "Includes";
    - the product slug and option-removal confirmations;
    - Most viewed filter, Published hint, AR rate wording;
    - the "Changes by the platform team" card states;
    - AuditTimeline "Deleted user ({label})".
  - **Team and auth screens:**
    - AcceptInvitePage redirect and banner;
    - JoinPage 12;
    - Access history filter;
    - `already_member` mapping;
    - the deactivated login message.
  - Every component test covers loading, empty and error states.
- **Playwright (demo, 1440 and 390):**
  - extend `applications.spec` (reject with and without the reason, reopen after a business delete, the "Possible duplicates" panel on a seeded re-application);
  - `business-crud.spec` (slug change → old URL redirects; owner-state column; delete toast);
  - `product-crud.spec` (published slug confirm; option removal confirm; stale-save message via two contexts);
  - `public.spec` (lower-case redirect; product redirect keeps `?variant`; draft-business preview banner);
  - `team.spec` (remove member; role editor prerequisites);
  - `settings.spec` (closure cancel through the function);
  - a11y routes unchanged, with the pixel guard staying 14/14.
- **Live checks after deploy** (dev project, QA accounts labelled "QA", owner's OK):
  - **Staff access and closure:**
    - With the staff 2FA policy on, an aal1 Admin calling `provision-owner` → 403.
    - An Admin reading `account_signed_in` rows of others through the API → 0.
    - Request closure as a QA owner, remove the owner → the request is gone; Activate refused while a request is open.
  - **Applications and owners:**
    - Reject a QA application to a Resend test address, with and without the reason → `email_log` `application_decision`.
    - L1 shows "deleted" and reopens.
    - The businesses list shows the L2 and L5 states.
    - Sign in as a QA owner who never finished onboarding → "Owner active".
  - **Addresses and products:**
    - Change a QA business slug → the old URL redirects, and a second business is refused the old slug.
    - Publish in a draft business → "Open product page" previews.
  - **Analytics:**
    - Embed load on a test page → `embed_view` row.
    - The Lisbon versus São Paulo bucket around midnight.
  - **Email and team:**
    - Bounce a team invite to `bounced@resend.dev` → "Email failed".
    - Pause a QA business → the owner gets `business_notice` and sees the row.
    - Remove a deactivated QA member, then invite the email as an owner.

## 15. Coverage
"folded" = moved to S2/S4 (§1.4; S3 was cancelled and its findings are back in W2); "deferred" = RULINGS deferred (§1.3); "explained" = no change needed.

| ID | WS | Req | | ID | WS | Req | | ID | WS | Req |
|---|---|---|---|---|---|---|---|---|---|---|
| APP-01 | W2 | R-W2-1 | | PROD-01 | = PUB-01 | R-W4-1 | | TEAM-01 | W1 | R-W1-1 |
| APP-02 | W2 | R-W2-3 | | PROD-02 | W4 | R-W4-2 | | TEAM-02 | W3 | R-W3-3 |
| APP-03 | W2 | R-W2-2 | | PROD-03 | folded S4 | — | | TEAM-03 | = TEAM-02 | R-W3-3 |
| APP-04 | W2 | R-W2-9 | | PROD-04 | = TEAM-02 | R-W3-3 | | TEAM-04 | W6 | R-W6-1 |
| APP-05 | W2 | R-W2-4 | | PROD-05 | W4 | R-W4-14 | | TEAM-05 | W6 | R-W6-2 |
| APP-06 | W2 | R-W2-5 | | PROD-06 | = PUB-03 | R-W3-2 | | TEAM-06 | W6 | R-W6-4 |
| APP-07 | W2 | R-W2-6 | | PROD-07 | W4 | R-W4-4 | | TEAM-07 | = BIZ-02 | R-W1-3 |
| APP-08 | W2 | R-W2-7 | | PROD-08 | W4 | R-W4-3 | | TEAM-08 | W6 | R-W6-3 |
| APP-09 | W2 | R-W2-11 | | PROD-09 | W4 | R-W4-7 | | TEAM-09 | W1 | R-W1-7 |
| APP-10 | W1 | R-W1-9 | | PROD-10 | W4 | R-W4-5 | | TEAM-10 | = ANA-01 | R-W5-1 |
| APP-11 | W2 | R-W2-10 | | PROD-11 | W4 | R-W4-6 | | TEAM-11 | W1 | R-W1-8 |
| APP-12 | W2 | R-W2-8 | | PROD-12 | folded S4 | — | | TEAM-12 | W6 | R-W6-8 |
| APP-13 | W8 | R-W8-1 | | PROD-13 | deferred | — | | TEAM-13 | W6 | R-W6-9 |
| BIZ-01 | W1 | R-W1-2 | | PUB-01 | W4 | R-W4-1 | | TEAM-14 | W6 | R-W6-5 |
| BIZ-02 | W1 | R-W1-3 (+R-W3-6) | | PUB-02 | folded S2 | — | | TEAM-15 | W6 | R-W6-6 |
| BIZ-03 | = PUB-02, folded S2 | — | | PUB-03 | W3 | R-W3-2 | | TEAM-16 | W6 | R-W6-7 |
| BIZ-04 | W3 | R-W3-1 | | PUB-04 | W4 (part; rest deferred) | R-W4-8 | | TEAM-17 | W1 | R-W1-5 |
| BIZ-05 | W3 | R-W3-5 | | PUB-05 | W4 | R-W4-9 | | TEAM-18 | W1 | R-W1-6 |
| BIZ-06 | W3 | R-W3-4 (storage part R-W3-3) | | PUB-06 | W3 | R-W3-8 | | TEAM-19 | W8 | R-W8-5 |
| BIZ-07 | = APP-03 | R-W2-2 | | PUB-07 | W4 | R-W4-10 | | TEAM-20 | deferred (documented §12) | — |
| BIZ-08 | W3 | R-W3-6 | | PUB-08 | W4 | R-W4-11 | | MAIL-01 | = APP-01 | R-W2-1 |
| BIZ-09 | W3 | R-W3-7 | | PUB-09 | W4 (noindex; rest folded S2 / deferred) | R-W4-12 | | MAIL-02 | W7 (part 1; part 2 folded S2) | R-W7-3 |
| BIZ-10 | W8 | R-W8-2 | | PUB-10 | W4 | R-W4-13 | | MAIL-03 | = TEAM-05 | R-W6-2 |
| BIZ-11 | = PUB-06 | R-W3-8 | | ANA-01 | W5 | R-W5-1 | | MAIL-04 | W7 | R-W7-6 |
| BIZ-12 | = ANA-06 | R-W5-6 | | ANA-02 | W5 | R-W5-2 | | MAIL-05 | W7 | R-W7-7 |
| L1 | = APP-03 | R-W2-2 | | ANA-03 | folded S4 | — | | MAIL-06 | = APP-05 | R-W2-4 |
| L2 | with APP-06 | R-W2-5 | | ANA-04 | W5 | R-W5-3 | | MAIL-07 | W7 | R-W7-8 |
| L3 | with PUB-01 | R-W4-1 | | ANA-05 | deferred | — | | MAIL-08 | W7 | R-W7-1 |
| L4 | explained (§1.5) | — | | ANA-06 | W5 | R-W5-6 | | MAIL-09 | W1 | R-W1-4 |
| L5 | = APP-06 | R-W2-5 | | ANA-07 | W5 | R-W5-7 | | MAIL-10 | = TEAM-08 | R-W6-3 |
| | | | | ANA-08 | W8 | R-W8-3 | | MAIL-11 | W7 | R-W7-2 |
| | | | | ANA-09 | W8 | R-W8-4 | | MAIL-12 | W7 | R-W7-4 |
| | | | | ANA-10 | W5 | R-W5-5 | | MAIL-13 | W7 | R-W7-5 |
| | | | | ANA-11 | W5 | R-W5-4 | | MAIL-14 | = APP-09 | R-W2-11 |
| | | | | ANA-12 | W5 | R-W5-8 | | MAIL-15 | W2 | R-W2-4 |
| | | | | | | | | MAIL-16 | W7 | R-W7-9 |
| | | | | | | | | MAIL-17 | = TEAM-14 | R-W6-5 |
| | | | | | | | | MAIL-18 | W8 | R-W8-6 |
| | | | | | | | | MAIL-19 | folded S2 | — |

## 16. Adjustments to rulings and fix sketches
- **Ruling 24 (TEAM-17)** names `members.view`, which is not one of the 15 permissions. Staff profiles are therefore readable with `access.view` or `records.view` (the pages that show staff names), and business owners' profiles with `businesses.view`.
- **Ruling 11** says `businesses.status` needs `businesses.view`. The update RLS needs `businesses.edit`, and the existing label already says "Needs 'Create and edit businesses'", so the prerequisite is `businesses.edit` (which implies view). Also added, within the ruling's "at least": `owners.manage` → `businesses.view`, and approve/reject → `applications.view`.
- **Ruling 17's "capped wording"** is read as a "per view" ratio, never a percentage, so a value above 1 can't read as more than 100%.
- **MAIL-05 fix sketch** ("don't count blocked attempts"): not taken. S1 counts voided codes on purpose (`20261025163627:591`). Returning `email_blocked` and disabling Resend removes the useless retries instead.
- **MAIL-08 fix sketch:** the audit `business_id` FK is dropped (history keeps the id), and the actor is a role label only (no email or name). This matches the hashed-email rule of rulings 21 and 28.
- **Ruling 3 (APP-04)** names approved and under-review applications. `submitted` ones are matched too: they are open as well, and the audit's concurrent case (two submissions with different keys) is two `submitted` rows.
- **APP-11 fix sketch** ("rate-limit before the duplicate lookup"): taken, and the limit now counts attempts (`private.application_attempts`), because a 409 probe stores no application row and would otherwise never reach the limit. The hash takes the UTC date (the column comment's intent), and the hourly window checks both dates around midnight.
- **APP-09 / MAIL-14 fix sketches** ("audit non-fatal" or "send what is missing on replay"): both are taken. A replay within 30 seconds of the insert sends nothing, so a double click can't race the first request's sends.
- **R-W2-7 with R-W2-4:** the reservation runs before `generateLink`, so a second provision for the same business inside 60 s gets 429 `cooldown` and creates no account. The row lock and the orphan delete in R-W2-7 cover a second provision after the cooldown (or after a `blocked` first attempt) that races the link.

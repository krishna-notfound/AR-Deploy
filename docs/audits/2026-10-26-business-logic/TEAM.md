# TEAM audit
Scope read: ADR-0029, ADR-0030, `docs/superpowers/specs/2026-10-25-platform-team-rbac-design.md` (§2–4, §6.2–6.3, §10), `supabase/migrations/20261025070915_platform_team_roles.sql` (all), `20261025163627_account_settings.sql` (§2 helpers, profiles, §5–6 closure), `20261025180600_account_settings_optin_2fa.sql` (function list), `20261024065538_security_hardening.sql` (guard_business_admin_fields), init_schema public policies; Edge Functions `invite-member`, `manage-member`, `accept-member-invite`, `provision-owner`, `account-security` (closure, owner reset), `submit-application` (staff alert recipients), `_shared/team.ts`; `src/auth/usePermission.tsx`, `RequireRole`, `AccountProvider` (load/refresh), `src/app/router.tsx`, `src/components/layout/nav.ts`; `src/features/team/*` (TeamPage, MembersTable, InvitationsTable, InvitationPanel, MemberDetailPage, AccessHistory, useMemberActions, permissions); admin pages' `can()` gates (Overview, Businesses list/detail, BusinessForm, BusinessOwnersPanel, ProductTable, ProductEditorForm, ApplicationDetail, AuditLog, Settings sections); `src/services/supabase/{auth,supabaseTeam,supabaseCatalogService}.ts`, `src/services/mock/mockTeam.ts`; `src/features/join/JoinPage.tsx`, `LoginPage.tsx`; `docs/SECURITY_REVIEW.md` accepted risks, P12 deferred list, PROJECT_COMPLETION_STATUS.

Per-permission summary (UI gate vs DB): `businesses.view`, `applications.view/approve/reject`, `products.view`, `products.delete`, `analytics.view`, `records.view`, `access.view`, `owners.manage` (remove) and the Owner-only team functions match one-to-one for the **default** role sets. Mismatches appear for `businesses.edit` (create is "active" → needs `businesses.status`), `products.publish` (needs `products.edit` in RLS), the `*.delete` permissions (storage cleanup needs `*.edit`), and `owners.manage` via `provision-owner` (not 2FA-gated). Details below.

## Findings

### TEAM-01 `provision-owner` (owners.manage) ignores the staff 2FA rule: a password-only session can invite or re-invite business owners — High — CONFIRMED
- Where: `supabase/functions/provision-owner/index.ts:20-24` (caller check = `service_user_can(user, 'owners.manage')`), `supabase/migrations/20261025070915_platform_team_roles.sql:820-832` (`service_user_can` has no aal/`mfa_satisfied` term), versus `supabase/migrations/20261025163627_account_settings.sql:227-238` (`platform_can` was redefined to `... and private.mfa_satisfied('staff')`, `service_user_can` was not); `provision-owner/handler.ts:57,69-96` (links the owner and emails a code using the service role). Same pattern, lower impact: `invite-member/index.ts:139-142` `isOwner` reads `platform_admins` directly, so the **resend** path (`invite-member/handler.ts:68-81`) never passes through a gated check (the invite path does, via `admin_invite_member`). `send-test-email/index.ts:28` does the same.
- What happens: the policy "Require 2FA for staff" is on (or an Admin has opted into 2FA). Someone who has only the Admin's (or Owner's) password signs in at `aal1`. RLS correctly shows them nothing. But a direct `POST /functions/v1/provision-owner {action:"provision", businessId, email:"attacker@…"}` passes the `owners.manage` check, links that email as the single owner of any business that has no owner yet (for example a just-approved application), and emails the attacker an invitation code. Result: they take over a tenant without the second factor.
- Expected rule: SECURITY_REVIEW §S1: "The database access helpers … answer false unless the JWT is `aal2`, when the policy switch for the group is on. Every RLS policy and admin function that uses them refuses an `aal1` session." Opt-in 2FA: "the same helpers also demand `aal2` whenever the caller has a verified factor".
- Fix sketch (SQL + function): make `service_user_can` take the caller's aal, or (simpler) call `platform_can('owners.manage')` through a client that carries the caller's JWT (as `manage-member` does). Do the same for the `invite-member` resend check (call a gated `is_platform_admin()` with the caller's token) and for `send-test-email`.
- Live check: on the dev project, turn on the staff 2FA policy, sign in as an Admin at aal1, call `provision-owner` with a draft business that has no owner. Expected today: 200 and an owner linked.

### TEAM-02 Role permissions can be saved in combinations that leave visible but dead buttons — Medium — CONFIRMED (publish, create) / SUSPECTED (RETURNING cases)
- Where: `src/features/team/RolePermissionsPage.tsx` and `src/domain/permissions.ts` have no dependency rules (grep: none). Pairs:
  - `products.publish` without `products.edit`: `ProductTable.tsx:67,81-86` shows Publish/Unpublish, but `platform_team_roles.sql:215-217` lets members update products only with `products.edit` → 0 rows → "no permission" (`supabaseCatalogService.ts:670-678`).
  - `businesses.edit` without `businesses.status`: `BusinessForm.tsx:77,264-266` "Create business" sends `status: 'active'`, and `platform_team_roles.sql:877-891` raises `Only platform admins can change a catalog address or status`. The edit-mode "Catalog status" select (`BusinessForm.tsx:210-218`) is shown to the same user, and saving a change is refused by the widened guard (`platform_team_roles.sql:180-181`). Only "Save as draft" works.
  - `products.edit` without `products.view` / `businesses.edit` without `businesses.view`: Add product and Create business are shown (`AdminOverviewPage.tsx:53-62`), but the insert's RETURNING (`save_product`, `.insert().select('*')` at `supabaseCatalogService.ts:708`) has to pass a SELECT policy that the role lacks for drafts. SUSPECTED.
  - `BusinessesListPage.tsx:93-94` shows "View products" and "View QR code" to a role without `products.view`, and they lead to the "no access" page.
- What happens: the Owner narrows a role, for example Team = view plus `products.publish`. The member sees a Publish button that always fails.
- Expected rule: CLAUDE.md "No dead buttons". The permission copy already admits one dependency ("Needs 'Create and edit businesses'", `permissions.ts:22`) but nothing enforces it.
- Fix sketch (UI, and optionally SQL): gate each button on the full set it needs (`publish` → `products.edit`+`products.publish`; "Create business" → `businesses.status`, otherwise offer draft only; the status select → `businesses.status`). On the Role permissions page, auto-tick and lock the prerequisites (`*.view` for anything on that page, `products.edit` for publish).
- Live check: on the dev project, set Team = {products.view, products.publish}, sign in as Team, press Publish.

### TEAM-03 Deleting with `businesses.delete` / `products.delete` alone leaves the files in Storage — Medium — CONFIRMED
- Where: `supabaseCatalogService.ts:736-744` (deleteBusiness lists and removes the `product-media` and `business-logos` folders) and `:814-818` (deleteProduct → `removeUnreferencedMedia`), errors ignored at `:607-612`; the storage policies `platform_team_roles.sql:284-299` allow delete only with `businesses.edit` (logos) and `products.edit` (media), and listing needs `businesses.view`/`products.view`.
- What happens: the Owner gives a role `businesses.delete` (or `products.delete`) without the edit permissions. The member deletes a business. The rows cascade, the storage list or remove is refused, and the error is swallowed. The UI reports success, while GLB/USDZ/images (product-media is private, but the logo bucket is public) stay forever with no row pointing at them.
- Expected rule: the `businesses.delete` warning: "Deletes the business, its products and media. This can't be undone." (`permissions.ts:27`); brief "Missing consequence".
- Fix sketch (SQL): add `platform_can('businesses.delete')` / `platform_can('products.delete')` to the storage delete and select policies for those buckets (or make the prerequisite permissions mandatory, TEAM-02). Surface a failed sweep (as complete_closure does).
- Live check: dev project, a role with {businesses.view, businesses.delete}, delete a business with a logo, then look in the bucket.

### TEAM-04 No way to remove a member: an ex-staff email is locked out of business ownership for good — Medium — CONFIRMED
- Where: the only member functions are `platform_team_roles.sql:852-855` (invite, set role, deactivate, reactivate, revoke invite, list, get). There is no delete, and the API roles have no write grant (`:138-142`). The separation trigger checks **any** row whatever its status (`:327-341`, `platform_member_not_business_owner` `:343-357`); `provision-owner/index.ts:25-33` `isPlatformStaff` also matches any row (and returns `email_is_admin`). A deactivated member has no console role (`auth.ts:85-104`), so they can't reach Settings → Delete account either. `MemberDetailPage.tsx:57` says "They may have been removed."
- What happens: a former Team member (deactivated) later applies to list their own furniture business. Approval works, but "Invite owner" answers `email_is_admin`, and the DB trigger refuses them too. The Owner has no button to fix it; only SQL in the dashboard does. Old invited-but-revoked rows also pile up in the list, with no way to clear them.
- Expected rule: ADR-0029 Separation is about *simultaneous* roles ("an email can't be both a platform member and a business owner"); brief "Dead end".
- Fix sketch (SQL + UI): add `admin_remove_member(member)` (Owner, not self, audited `access_member_removed`; deletes the row and invites, ends sessions) and show it for deactivated or never-accepted members. Optionally let the separation checks ignore `deactivated` rows.
- Live check: not needed (code path is unambiguous).

### TEAM-05 Staff email change is never copied to `platform_members.email` — Medium — CONFIRMED
- Where: `platform_members.email` is written only at invite (`platform_team_roles.sql:21,450`); there is no trigger on `auth.users` update (grep: only the insert trigger at `account_settings.sql:74`). The S1 email change is offered to every role (`AccountSection.tsx:48`, `supabaseAccount.ts:381-390`). Readers of the stale copy: `member_json` (`platform_team_roles.sql:410`), `admin_invite_member` duplicate check (`:440`), `service_inspect_invite`/`service_accept_invite` (`:763,800`), the new-application alert recipients (`submit-application/index.ts:88-94` uses `platform_members.email`), and the member page's access history (keyed on email, TEAM-06).
- What happens: Ana (Admin) changes her login from `ana@old.pt` to `ana@new.pt`. Team & Access still shows `ana@old.pt`. Every new-application alert, which carries the applicant's details, goes to the old mailbox (possibly no longer hers). Inviting `ana@old.pt` again says "already has platform access". Inviting `ana@new.pt` creates a second row whose acceptance then hits the unique `user_id` constraint (500).
- Expected rule: consistency; design/23 email recipients should be the account's real address.
- Fix sketch (SQL): a trigger `after update of email on auth.users` that syncs `platform_members.email` (lower-cased), or read the email from `auth.users` everywhere and keep the column only for invitations not yet accepted.
- Live check: dev project, change a test Team member's email, then submit an application and see who gets the alert.

### TEAM-06 A member's "Access history" is empty or wrong for many emails — Medium — CONFIRMED
- Where: `MemberDetailPage.tsx:236` passes the member's email as the search; `AccessHistory.tsx:38,46`; `supabaseTeam.ts:206` runs `ilike('metadata->>email', '%' + q.replace(/[%_]/g, '') + '%')`. Events without `metadata.email` (`access_denied` `platform_team_roles.sql:374`, `access_invite_expired_attempt` `:792`) never match. The mock searches actor, member and details (`mockTeam.ts:266-273`).
- What happens:
  - `joao_silva@x.pt`: the `_` is stripped, so the search is `%joaosilva@x.pt%` and the member page shows "no history", although invited, accepted and role-change events exist.
  - `an@x.pt`: it also matches `jan@x.pt` and `dan@x.pt`, so other people's events are shown as Ana's.
  - The member's own refused attempts and expired-link attempts never appear on their page.
- Expected rule: spec §6.3 member page "access history" of that person; brief "Honesty: wrong data shown as true".
- Fix sketch (service + SQL): filter by `metadata->>member_id = <id>` (already written by every access event except denied), or by exact `eq('metadata->>email', email)`; escape `_`/`%` instead of deleting them. For `access_denied`, also match `actor_id = member.userId`.
- Live check: on the dev project, invite `delivered+a_b@resend.dev` and open their page.

### TEAM-07 Admins can't see a pending closure but can re-activate the closing business — Medium — CONFIRMED
- Where: `BusinessDetailPage.tsx:48-52` and `BusinessesListPage.tsx:47-49` load closures only for `can('owner')`, while the Activate/Deactivate action is shown with `businesses.status`+`businesses.edit` (`BusinessDetailPage.tsx:77,87`, `BusinessesListPage.tsx:95-100`). `account_settings.sql:948-963` (`closure_follow_status`) then records the Admin's "active" as the status to restore. The DB meanwhile lets any `businesses.view` member read closure requests (`account_settings.sql:830-831`, `admin_list_closure_requests` `:1003`), which contradicts the UI comment "nobody else sees or loads them".
- What happens: a business owner asks to close their account, and their catalog goes offline. An Admin, seeing only an "inactive" business with no banner, presses "Activate catalog". The catalog is public again against the owner's request until the Owner completes the closure.
- Expected rule: ADR-0032/SECURITY_REVIEW: "A business owner's request takes the business offline … only the Owner … completes it."
- Fix sketch (UI + SQL): show a read-only "Closure requested" notice to anyone with `businesses.view` (the DB already allows the read) and hide or refuse Activate while a request exists (a guard in `guard_business_admin_fields` or a check constraint via trigger: no `active` while a closure row exists, except under `app.account_closure`).
- Live check: dev project, a test business owner requests closure, then an Admin opens the business.

### TEAM-08 Staff self-deletion erases attribution and leaves no access record — Medium — CONFIRMED
- Where: `account-security/handler.ts:226-240` (staff: logs `account_deleted` with a hashed email, then `deleteUser`); `audit_events.actor_id … on delete set null` (`20261020091428_applications_and_owner_access.sql:75`); `platform_members.user_id … on delete cascade` (`platform_team_roles.sql:20`). No `access_*` event is written, and the Owner isn't emailed (the admin alert at `handler.ts:214-224` is for business closures only).
- What happens: a Team member who approved applications and deleted products presses "Delete account". Every audit row they authored becomes actor "—", the member disappears from Team & Access, and the Access history (filtered to `access%`) shows nothing about it. The Owner can't tell who did what, or that the person left.
- Expected rule: ADR-0029 "Audit: every access change is written to `audit_events` with an `access_` prefix"; the audit log's own promise "Who did what, recorded by the server" (`AuditLogPage.tsx:79`).
- Fix sketch (SQL + function): write `access_member_closed` (member_id, email, role) before deletion, and notify the Owner. Store `actor_email` in audit metadata (or keep a tombstone) so attribution survives `set null`.
- Live check: not needed.

### TEAM-09 Staff accounts accept 8-character passwords at `/join` — Medium — CONFIRMED (code) / SUSPECTED (hosted Auth minimum)
- Where: `accept-member-invite/handler.ts:56` (`password.length < 8`), `JoinPage.tsx:102` ("Use at least 8 characters"), versus `ResetPasswordPage.tsx:15` `MIN_PASSWORD_LENGTH = 12` and `AccountSection` `PASSWORD_MIN`. `supabase/config.toml:187` `minimum_password_length = 6` for local dev; the hosted value is unknown.
- What happens: a new Admin, the most privileged invitee, sets `abcd1234`; a business owner must use 12 characters.
- Expected rule: SECURITY_REVIEW accepted risks: "The minimum password length in the app is 12."
- Fix sketch (function + UI): use the shared `PASSWORD_MIN` (12) in both the handler and JoinPage.
- Live check: on the dev project, open a test invite and try an 8-character password.

### TEAM-10 Owner-configured role sets make Overview, Catalogs and Analytics show partial data as complete — Medium — CONFIRMED
- Where: `AdminOverviewPage.tsx:26-29` loads analytics, products, businesses and activity for everyone. The stats (`:75-90`) and "Most viewed" are not gated, and `PendingApplications` (`:152-176`) always queries and says "No applications awaiting review". The public RLS (`init_schema.sql:261,299`) still returns active businesses and published products, so the totals look plausible. Links "Open analytics" and "View applications" lead to "no access" pages.
- What happens: the Owner removes `applications.view` from Team. Team's Overview then says "No applications awaiting review" while 12 are waiting; "Drafts 0" for a role without `products.view`. It is wrong data shown as true. The default sets aren't affected.
- Expected rule: spec §6.2 "Overview: the cards and panels each show only when their permission allows it."
- Fix sketch (UI): wrap each panel and stat in `can()` (applications → `applications.view`, stats → `analytics.view`/`products.view`/`businesses.view`), and don't render links to pages the role can't open.
- Live check: dev project, remove `applications.view` from Team, open Overview as Team.

### TEAM-11 A pending team invitation can be overtaken by an owner invitation, leaving an unusable link — Medium — CONFIRMED
- Where: `provision-owner/index.ts:25-33` (`isPlatformStaff` looks up by **user id**, and is only reached when an auth user exists, `handler.ts:77-78`); the trigger `platform_team_roles.sql:334` matches `platform_members.user_id`, which is null until acceptance; `service_accept_invite` then refuses (`:803-805` → `business_owner`).
- What happens: the Owner invites `rita@x.pt` to the team (not accepted yet). Separately, an Admin approves an application by the same email and invites her as business owner, which succeeds because no staff row has her user id. Rita's team link now always fails with "This email owns a business…". The team row still says "Invitation sent".
- Expected rule: spec D5 "One email can't be both … The database refuses it in both directions."
- Fix sketch (function/SQL): in `provision-owner` and `service_link_owner`, also refuse an email with a `platform_members` row (`email = lower(:email)` and status ≠ deactivated), with error `email_is_admin`.
- Live check: not needed.

### TEAM-12 Role and permission changes don't reach the member's open console until the next auth event — Low — CONFIRMED
- Where: platform access is loaded in `auth.ts:85-88` only from `AccountProvider` `load` (`AccountProvider.tsx:307-325`), on auth events (sign-in, about one token refresh per hour). The S1 mid-session re-check refreshes only the security state (`:215-237`). `useMemberActions.tsx:116` tells the Owner "This applies to their next action."
- What happens: Ana is demoted to Team. Her open tab keeps the Admin buttons (Delete, Publish, Applications), and each one fails with "no permission" or shows empty tables until she reloads. The DB part is correct.
- Fix sketch (UI): refetch `my_platform_access` in the same stale-on-focus refresh, or after any `forbidden` answer.
- Live check: not needed.

### TEAM-13 `already_member` and "Pending invitations" mislead after revoke, expiry or a half-failed invite — Low — CONFIRMED
- Where: `useMemberActions.tsx:60` says "You can invite them again later", but after a revoke the row stays `invited` and `admin_invite_member` returns `already_member` (`platform_team_roles.sql:441-448`), shown as "This email already has platform access." (`catalogService.ts:216`). The same happens when `invite-member` saved the member but failed before the invite (500 at `invite-member/index.ts:158`). `TeamPage.tsx:36` counts every `invited` member as a "Pending invitation", even with a revoked or expired link. A deactivated, accepted member re-invited also gets "already has platform access".
- Fix sketch (UI/service): map `already_member` by status ("already invited: use Resend" / "deactivated: use Reactivate"), change the revoke copy to "Use Resend to send a new link", and count only live invites as pending.
- Live check: not needed.

### TEAM-14 Invitation email promises fixed abilities, whatever the role's real permissions — Low — CONFIRMED
- Where: `_shared/team.ts:16-24` `ROLE_SUMMARY` (static: "Review and approve business applications", "Manage businesses and their owners", …), used by `invite-member/handler.ts:83-89`; the role sets can be edited (`admin_set_role_permissions`).
- What happens: the Owner narrows Admin to view-only. The invitation still tells the invitee they will approve applications and manage owners.
- Fix sketch (function): build the bullet list from `platform_role_permissions` for the role at send time (labels as in `permissions.ts`).
- Live check: not needed.

### TEAM-15 "Reset 2FA" is offered, and the "your 2FA was reset" email is sent, for members with no 2FA — Low — CONFIRMED
- Where: `MemberDetailPage.tsx:84,127` (shown for any non-Owner member with a user id); `account-security/handler.ts:243-255,364-367` (deletes zero factors, then logs and emails `2fa_reset_by_owner`).
- Fix sketch (UI + function): show it only when the member has a verified factor or recovery codes (expose via `admin_list_members`), and have the function answer `nothing_to_reset` instead of emailing.
- Live check: not needed.

### TEAM-16 A deactivated member who signs in is told "This account does not manage a business" — Low — CONFIRMED
- Where: `LoginPage.tsx:94-97` (any signed-in account with no role); `auth.ts:101-104` returns `user: null` for a deactivated member; `my_platform_access` returns null (`platform_team_roles.sql:116-121`).
- Fix sketch (SQL/UI): have `my_platform_access` (or a small `my_access_status`) report `deactivated`, and say "Your platform access was turned off by the Owner."
- Live check: not needed.

### TEAM-17 Any active member, even one with zero permissions, reads every user's profile — Low — CONFIRMED
- Where: `account_settings.sql:96-98` ("Platform members read profiles" with `is_platform_member()`), versus the stated rule `platform_team_roles.sql:92` "is_platform_member … navigation only; data access is decided by platform_can". Profiles hold names, timezone, notification and onboarding flags of business owners too.
- Fix sketch (SQL): gate with `platform_can('businesses.view') or is_platform_admin()`, or limit it to staff rows plus the business owners the caller can already see.
- Live check: not needed.

### TEAM-18 `my_platform_access` gives the Owner the union of the role sets, not all 15 permissions — Low — CONFIRMED
- Where: `platform_team_roles.sql:113-115` (`distinct permission from platform_role_permissions`), versus the comment "Owner gets every permission" (spec §6.2) and `auth.ts:91-94` (the fallback gives all 15). It is harmless today only because `useCan` short-circuits on `role === 'owner'` (`usePermission.tsx:21`). Any future direct read of `permissions` would hide features from the Owner after a role is narrowed.
- Fix sketch (SQL): return the constant list of 15 keys for an Owner.
- Live check: not needed.

### TEAM-19 Demo team rules differ from the real ones — Low — CONFIRMED
- Where: `mockTeam.ts:145` (the business-owner check matches `businesses.contact.email`, while the real check matches actual `business_members` users, `platform_team_roles.sql:437`). The mock has no 5-per-hour resend limit (`service_create_member_invite` `:697`), no `self` refusal, and a different access-history search (TEAM-06).
- Fix sketch (mock): model owner membership and the rate limit; search like the real service.
- Live check: not needed.

### TEAM-20 Team's `products.edit` changes live, published products with no review — Low — SUSPECTED (owner decision)
- Where: `platform_team_roles.sql:215-217,223-254` (update and media writes need only `products.edit`); `products_publish_permission` (`:304-322`) guards only the status flip. The Team role description says "usually with view and edit access only", and the live check notes "Team … has no Publish".
- What happens: a Team member can rename, re-price, replace photos of, or remove the GLB from a live product, and the public catalog changes at once. If the owner meant "Team prepares drafts, Admin publishes", the rule doesn't do that.
- Fix sketch (SQL, if intended): require `products.publish` (or Owner/business owner) for updates to a product while `status = 'published'`, or route Team edits into a draft revision.
- Live check: ask the owner.

## Ideas (optional, max 5 lines)
- Show on the Role permissions page which members lose what (spec §6.3 asks for an "N Admin and M Team members lose…" confirmation; confirm that it is wired).
- A cooldown on Resend that matches the server's 5-per-hour limit (spec §6.3.4) instead of letting the 6th attempt fail.

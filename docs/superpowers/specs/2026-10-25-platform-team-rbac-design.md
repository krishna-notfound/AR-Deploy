# Platform team roles and link invitations: design

- **Date:** 2026-10-25
- **Status:** Approved in conversation (sections 1–3). Awaiting written-spec review.
- **Branch:** `feature/sanctus-brand-design-system`
- **Supabase:** client project `zggylkbgajamhriebdrg`. Migration and function deploys need the owner's explicit go-ahead.
- **Decision records to add:**
  - **ADR-0029:** platform team roles. It lifts the "never build team roles" rule in `CLAUDE.md` and PRD X-03 for *platform* roles only.
  - **ADR-0030:** link-based team invitations.

## 1. Goal

The platform Owner decides who can use the admin console, gives each person a role (Admin or Team), and controls what each role is allowed to do. The database enforces all of this, and every access change is recorded.

Business accounts don't change. Each business keeps exactly one owner, with no business-side teams or roles.

**Success criteria:**
- The Owner can invite someone by email. That person opens the link, creates an account and lands in `/admin`, seeing only what their role permits.
- An Admin or Team member can't read or change anything outside their role's permissions. The database refuses it, whatever the app shows.
- Deactivating a member or removing a permission takes effect on that member's next request.
- No action can change Owner access, or let a member raise their own access.
- Every invite, acceptance, revocation, role change, permission change, deactivation and refused attempt appears in the access history. No token or secret is ever logged.

## 2. Decisions (from the brainstorm)

| # | Decision |
|---|---|
| D1 | It ships today. Scope is cut to what can be secured and tested today. |
| D2 | Permissions belong to the **role**, not the person. The Owner edits one set for Admin and one for Team. There's no per-person override and no custom role builder. |
| D3 | There are **15 permissions**, one for each feature that exists today. No permission exists for a feature that doesn't. |
| D4 | **Owner** = everyone in `public.platform_admins`, so today's admins become Owners. Owner can't be granted, changed or removed from the app; only the database can change it. Team & Access, permissions and Settings are Owner only and can't be delegated. |
| D5 | One email can't be both a platform member and a business owner. The database refuses it in both directions. |
| D6 | The screens are built in the existing dashboard style (ADR-0028). Stitch is optional, only as a reference for the email and the Team page. |
| D7 | **Approach A, additive:** the existing Owner rules stay untouched, and new permission rules for Admin and Team are added next to them. |
| D8 | Team invitations are **links**. The email opens `/join`, where the person creates their account. Business-owner invitations keep the 8-digit codes (ADR-0027). |

## 3. Roles and permissions

### 3.1 Roles

| Role | Stored in | Can do |
|---|---|---|
| Owner | `public.platform_admins` (unchanged) | Everything, always: every existing rule and function, plus Team & Access and Settings |
| Admin | `public.platform_members.role = 'admin'` | The Admin permission set |
| Team | `public.platform_members.role = 'team'` | The Team permission set |
| Business owner | `public.business_members` (unchanged) | Their own business only (unchanged) |

### 3.2 The 15 permissions

The keys are fixed and stored as text. The database rejects any other value.

| Group | Key | What it allows (UI label, then what is enforced) | Admin default | Team default | Warning |
|---|---|---|---|---|---|
| Businesses & applications | `businesses.view` | View businesses: read `businesses` (all rows, any status) | ✓ | ✓ | |
| | `businesses.edit` | Create and edit businesses: insert and update `businesses`, including admin-only fields | ✓ | | |
| | `businesses.status` | Activate or deactivate businesses: change `businesses.status` | ✓ | | |
| | `businesses.delete` | Delete businesses: delete `businesses` (cascades to its products) | ✓ | | ⚠ "Deletes the business, its products and media. Can't be undone." |
| | `owners.manage` | Invite, resend and remove business owners: `provision-owner` and the owner-member functions | ✓ | | |
| | `applications.view` | View applications: read `business_applications` and their email attempts | ✓ | ✓ | |
| | `applications.approve` | Approve applications: `admin_review_application` with the approve and start-review actions | ✓ | | |
| | `applications.reject` | Reject applications: `admin_review_application` with reject | ✓ | | |
| Products & catalogues | `products.view` | View products and catalogues: read every product and media table, any status | ✓ | ✓ | |
| | `products.edit` | Create and edit products, upload media and 3D: `save_product`, product and media writes, `storage.objects` writes on product paths | ✓ | ✓ | |
| | `products.publish` | Publish and unpublish: change `products.status` to or from `published` | ✓ | | |
| | `products.delete` | Delete products: delete `products` | ✓ | | ⚠ "Deletes the product and its media. Can't be undone." |
| Insight & records | `analytics.view` | View analytics: read `product_analytics`, business and platform summaries | ✓ | ✓ | |
| | `records.view` | View the audit log and email log: read `audit_events` (non-access events) and `email_log` | ✓ | | |
| | `access.view` | View access history: read access events in `audit_events` | ✓ | | |

**Notes:**
- As agreed in the brainstorm, Admin defaults to all 15. Team defaults to the four view permissions (`businesses.view`, `applications.view`, `products.view`, `analytics.view`) plus `products.edit`. The Owner can narrow either set.
- **Reset to defaults** restores this table.
- Owner-only, and never in the list: Team & Access management, role-permission editing, Settings, demo-data reset.

### 3.3 Hard rules (the database enforces all of them)

1. Only an Owner can invite, change roles, revoke invitations, deactivate or reactivate members, and edit role permissions.
2. No function can create, change or remove an Owner row. `platform_admins` has no write grant for `authenticated`.
3. A member can't change their own membership or permissions; rule 1 already covers this. The check is also written explicitly, as defence in depth.
4. Only the 15 known keys can be stored (a check constraint plus the function's validation).
5. A platform member can't become a business owner, and a business owner can't become a platform member.
6. Only an `active` member gets permissions. `invited` and `deactivated` members get none.
7. Audit events can be inserted only through server functions. The app has no update or delete grant on them.

## 4. Data model (one new migration, `npx supabase migration new platform_team_roles`)

```sql
create type public.platform_role as enum ('admin', 'team');
create type public.member_status as enum ('invited', 'active', 'deactivated');
create type public.invite_status as enum ('pending', 'sent', 'email_failed', 'accepted', 'expired', 'revoked');

create table public.platform_members (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users (id) on delete cascade,   -- null until accepted
  email         citext not null unique,                                     -- lower-cased
  full_name     text check (char_length(full_name) <= 120),
  role          public.platform_role not null,
  status        public.member_status not null default 'invited',
  invited_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  activated_at  timestamptz,
  deactivated_at timestamptz,
  updated_at    timestamptz not null default now()
);

create table public.platform_role_permissions (
  role        public.platform_role not null,
  permission  text not null check (permission in (/* the 15 keys */)),
  primary key (role, permission)
);  -- seeded with the defaults in §3.2

create table private.platform_invites (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.platform_members (id) on delete cascade,
  token_hash    bytea not null unique,           -- sha256(secret); the secret itself is never stored
  status        public.invite_status not null default 'pending',
  expires_at    timestamptz not null,            -- created_at + 7 days
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  last_email_at timestamptz,
  last_email_result text,                        -- 'accepted' | 'failed: <reason, 200 chars>'
  accepted_at   timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid references auth.users (id) on delete set null
);
```

**Details:**
- **Pending invitations:** a member has at most one pending invitation (`pending`, `sent` or `email_failed`). A resend or new invite marks the earlier one `revoked`.
- **Read access to invitations:** `private.platform_invites` can't be reached by `anon` or `authenticated`. It is read through `admin_list_member_invites(member_id)`, which is Owner only and never returns `token_hash`.
- **Expiry** is evaluated on read and on accept: `status in (pending, sent, email_failed) and now() > expires_at` counts as `expired`. A nightly job isn't needed.
- **`citext`:** needs the `citext` extension. If it isn't enabled, use `text` with a `lower(email)` unique index instead (decided when the plan is written, after checking the project).

### 4.1 The permission check

```sql
create function private.can(p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
      or exists (
        select 1 from public.platform_members m
        join public.platform_role_permissions rp on rp.role = m.role
        where m.user_id = (select auth.uid()) and m.status = 'active' and rp.permission = p_permission);
$$;
-- plus public.is_platform_member() (any active member, for navigation) and
-- public.my_platform_access() returning { role: 'owner'|'admin'|'team', permissions text[] } for the app.
```

### 4.2 Added rules (permissive, ORed with the existing Owner rules)

| Table | Added for members |
|---|---|
| `businesses` | select: `can('businesses.view')`; insert and update: `can('businesses.edit')`; delete: `can('businesses.delete')` |
| `business_members` | select: `can('businesses.view')` |
| `business_applications` | select: `can('applications.view')` |
| `products`, `product_images`, `product_models`, `product_variants`, `product_variant_images`, `product_variant_models` | select: `can('products.view')`; insert and update: `can('products.edit')`; delete on products: `can('products.delete')`; media delete: `can('products.edit')` |
| `product_analytics` | select: `can('analytics.view')` |
| `email_log` | select: `can('records.view')` |
| `audit_events` | select: `(event_type like 'access_%' and can('access.view')) or (event_type not like 'access_%' and can('records.view'))` |
| `storage.objects` | the same paths as today's admin rules: insert, update and delete with `can('products.edit')` (product media) or `can('businesses.edit')` (business logos) |
| `platform_members`, `platform_role_permissions` | select: Owner, or your own row or your own role's rows. **No write rules at all**; writes happen only in functions |

**Triggers and functions that check `is_platform_admin()` today** get `or private.can('<perm>')`:
- `guard_business_admin_fields` and `save_product`: `products.edit`;
- a new check in the products update trigger: a status change to or from `published` needs `products.publish` (Owner or member);
- `admin_review_application`: approve or start-review needs `applications.approve`, reject needs `applications.reject`;
- `admin_list_business_members`, `admin_user_emails`: `businesses.view`;
- `service_link_owner` and the `provision-owner` caller check: `owners.manage`.

The plan lists every function, verified against the migrations.

**Separation:** `service_link_owner` and `admin_add_business_member` refuse a user who is in `platform_members`. `invite_member` refuses an email that belongs to a user in `business_members`.

### 4.3 Functions (all `security definer`, `search_path = ''`; each writes an audit event)

| Function | Caller | Behaviour |
|---|---|---|
| `admin_invite_member(email, role, note)` | Owner | Validates the email; refuses an existing member (any status except `deactivated` with no user, which is reused) and a business owner. Upserts the member as `invited` and returns the member id. **Doesn't create the token**: the edge function does, see §5 |
| `admin_set_member_role(member_id, role)` | Owner | Admin ↔ Team. Refuses changing itself |
| `admin_deactivate_member(member_id)` / `admin_reactivate_member(member_id)` | Owner | Changes the status. On deactivate, the edge function also calls `auth.admin.signOut(user_id)` |
| `admin_revoke_member_invite(member_id)` | Owner | Pending invitation → `revoked`. A member who was never activated stays `invited` with no live invitation |
| `admin_set_role_permissions(role, permissions text[])` | Owner | Replaces the role's set atomically and validates the keys. Audit metadata: `{role, added[], removed[]}` |
| `admin_list_members()` / `admin_get_member(id)` / `admin_list_member_invites(id)` | Owner | Joined with `auth.users.last_sign_in_at` (real data only) |
| `service_create_member_invite(member_id, token_hash, expires_at, actor)` | service_role only | Revokes earlier pending invitations and inserts the new one. Rate limit: at most 5 invitations per member per rolling hour; otherwise it raises `rate_limited` |
| `service_record_invite_email(invite_id, result)` | service_role only | Sets `sent` or `email_failed` and `last_email_*` |
| `service_inspect_invite(token_hash)` | service_role only | Returns `{email, role, invited_by_name, expires_at, state}`, or `invalid` |
| `service_accept_invite(token_hash, user_id)` | service_role only | Locks the row; checks the invitation is pending and not expired; the user's email must equal `member.email`; the user must not be in `business_members`. Sets the member `active` with `user_id`, the invitation `accepted`. Returns `ok` or the reason |
| `my_platform_access()` | authenticated | `{role, permissions}` for the caller, or null |

**Access audit event types** (`event_type`):
- `access_invite_created`, `access_invite_email_sent`, `access_invite_email_failed`, `access_invite_accepted`, `access_invite_revoked`, `access_invite_expired_attempt`;
- `access_role_changed`, `access_permissions_changed`, `access_member_deactivated`, `access_member_reactivated`;
- `access_denied`.

Metadata never contains tokens or hashes. It can hold `{member_id, email, from_role, to_role, added, removed, reason}`.

`access_denied` is written by the Owner-only functions and the edge functions when a non-Owner calls them. Ordinary read rules can't log refusals.

## 5. Server functions (Supabase Edge, following `provision-owner`: handler and index, tested with injected dependencies)

### 5.1 `invite-member`

Endpoint: `POST { action: 'invite', email, role, note? } | { action: 'resend', memberId }`.

1. **Auth:** the caller's JWT must belong to an Owner. Otherwise it returns 403 and writes `access_denied`.
2. **Invite:** calls `admin_invite_member` as the caller. **Resend:** loads the member, which must be `invited`.
3. **Token:** `secret = 32 random bytes, base64url`, `hash = sha256(secret)`. Calls `service_create_member_invite`, which may return 429 `rate_limited`.
4. **Email:** `renderEmail('team_invitation', 'en', { role, note, actionUrl: `${APP_BASE_URL}/join#t=${secret}`, expiresAt, inviterName })`, sent through Resend and logged in `email_log` (workflow `team_invite:<member_id>`). The body is never logged.
5. Records `sent` or `email_failed`, then returns `{ memberId, status: 'sent' | 'email_failed', sentAt, expiresAt }`. **It never returns the secret.**

### 5.2 `accept-member-invite` (public, no JWT needed for `inspect`)

| Action | Request | What it does |
|---|---|---|
| inspect | `POST { action: 'inspect', token }` | hash → `service_inspect_invite` → `{ email, role, invitedBy, expiresAt, state: 'valid' \| 'expired' \| 'revoked' \| 'used' \| 'invalid', accountExists }`. Rate-limited per IP (20 per 5 minutes; it reuses the `track-event` limiter pattern) |
| create | `POST { action: 'create', token, fullName, password }` | Re-inspects. If no auth user exists for the email, `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })`, then `service_accept_invite`. If one exists, returns `409 account_exists` and the page switches to "sign in to accept". The password rules are Supabase Auth's: HIBP is on and the minimum length matches the project setting. A weak or breached password returns the reason |
| accept | `POST { action: 'accept', token }` with the caller's JWT | For an existing account. Calls `service_accept_invite(hash, caller)`. The email must match |

Opening the link (GET of `/join`) consumes nothing. The secret sits in the URL fragment, so it never reaches Vercel's logs or the referrer header. The page reads it, then removes it from the address bar with `history.replaceState`.

### 5.3 Deactivation sign-out

The member functions are reached through a small `manage-member` edge action, `{ action: 'deactivate' | 'reactivate' | 'set_role' | 'revoke_invite', memberId, role? }`. It calls the SQL function as the caller and, on deactivate, `auth.admin.signOut(userId, 'global')`. The rules already block the member's data on their next request; signing them out also ends the session.

## 6. App (React)

### 6.1 Structure

```
src/features/team/
  TeamPage.tsx              # /admin/team, tabs: Members | Invitations | Access history
  MembersTable.tsx, InvitationsTable.tsx, AccessHistory.tsx
  InviteMemberDialog.tsx    # form → review → result
  InvitationPanel.tsx       # side panel (full screen on mobile)
  MemberDetailPage.tsx      # /admin/team/:memberId
  RolePermissionsPage.tsx   # /admin/team/permissions
  permissions.ts            # the 15 keys, groups, labels, descriptions, warnings, defaults (single source for the UI)
  teamLabels.tsx            # role and status pills
  *.test.tsx
src/features/join/JoinPage.tsx   # /join (public, uses AuthLayout from ADR-0028)
src/auth/usePermission.ts        # can(perm) for the UI; RequirePermission guard
```

**Services:** new methods on `CatalogService` (types in `catalogService.ts`, implemented in `services/mock` and `services/supabase`):
- `getMyAccess()`;
- `listMembers()`, `getMember(id)`, `listMemberInvites(id)`;
- `inviteMember(input)`, `resendMemberInvite(id)`, `revokeMemberInvite(id)`;
- `setMemberRole(id, role)`, `deactivateMember(id)`, `reactivateMember(id)`;
- `getRolePermissions()`, `setRolePermissions(role, perms)`;
- `getAccessEvents(query)`;
- `inspectInvite(token)`, `acceptInviteCreate(...)`, `acceptInviteExisting(token)`.

The UI never imports `services/mock` or `services/supabase` directly.

### 6.2 Who is signed in

- `Session` / `AppUser` gains `platform: { role: 'owner' | 'admin' | 'team'; permissions: Permission[] }` when the user is a platform user. `role: 'super_admin'` stays as the app-level role for every platform user, so routing doesn't change. Owner gets every permission.
- `services/supabase/auth.ts` resolves it with `my_platform_access()` in place of the `platform_admins` select.
- **Navigation (`nav.ts`):** each item declares the permission it needs. Overview is always shown; Applications needs `applications.view`; Businesses `businesses.view`; All Products `products.view`; Analytics `analytics.view`; Catalogs & QR `products.view`; **Team & Access** Owner only; Audit log `records.view` or `access.view`; Settings Owner only.
- **Routes:** each admin route is wrapped in `RequirePermission`. A blocked route shows the "You don't have access to this page. Ask the platform owner." state.
- **Overview:** the cards and panels each show only when their permission allows it.
- **Action buttons** (publish, delete, approve and so on) are hidden without the permission, using the same `can()`.

### 6.3 Screens

These follow the approved section 2 of the brainstorm; this section is the complete behaviour list.

1. **Team & Access** (`/admin/team`)
   - 4 stat cards: Active · Pending invitations · Admins · Team.
   - Tabs: Members, Invitations, Access history.
   - Search by name or email (debounced 200 ms, kept in the URL `?q=`). Filters: role and status, kept in the URL.
   - **Members table columns:** monogram, name, email, role, status, joined or invited, last sign-in.
   - **Row menu, showing only valid actions:**
     - View;
     - Change role (active or invited Admin/Team);
     - Resend invitation (invited);
     - Revoke invitation (invited with a live invitation);
     - Deactivate (active);
     - Reactivate (deactivated).
   - The Owner rows show an "Owner" pill and no menu.
   - Paginated at 25 per page.
   - States: loading skeleton, empty ("No team members yet" plus Invite), no results, error with retry, and no access.
2. **Invite member** (dialog)
   - **Step 1:** Email (required, format checked on blur and submit); Role as Admin/Team radio cards, each with a one-line description and the role's current permissions listed read-only, plus a link "Edit role permissions →"; Note (optional, at most 500 characters, plain text, escaped in the email).
   - **Step 2, review:** email, role, permission list, note; then **Send invitation** or Back.
   - **Step 3, result:**
     - *sent:* "Invitation sent to x at 14:02. The link expires on 1 Nov 2026." with View invitation, Resend and Revoke;
     - *email_failed:* "Invitation saved but the email wasn't delivered: <reason>." with Retry and Revoke. This is a warning, not success.
   - Server errors (already a member, business owner, rate limited, no permission) are shown inline on step 1.
   - Buttons show a loading state and are disabled while sending.
3. **Role permissions** (`/admin/team/permissions`, Owner only)
   - Three groups; each row has the label, a description and ⚠ text where relevant. Two checkbox columns (Admin, Team); the Owner column reads "All".
   - The unsaved-changes bar shows a count of changes, with **Save**, **Cancel** and **Reset to defaults**.
   - Saving any removal opens a confirmation: "N Admin and M Team members lose: …. This applies on their next action."
   - Leaving with unsaved changes asks for confirmation (the existing `useBlocker` pattern from the product editor).
4. **Invitation panel**
   - Shows email, role, permission summary, invited by, created, last email attempt with its result, status pill, expiry, and accepted time.
   - **Resend:** disabled while a cooldown is active; the server's rate-limit message is shown. **Revoke:** with confirmation.
   - Statuses: Pending, Sent ("Accepted by the email provider. That doesn't mean it was read."), Email failed, Accepted, Expired, Revoked.
5. **Invitation email:** `team_invitation`, added to `_shared/email-templates.ts`, in English. It contains:
   - the wordmark and "You're invited to Sanctus";
   - "Hi," and the inviter's note in a quoted block, if there is one;
   - "The Sanctus team has invited you to join the platform as **Admin**.";
   - 3 or 4 plain bullets from the role's permission groups;
   - an **Accept invitation** button;
   - "This link works once and expires on {date}.";
   - "Not expecting this? You can ignore this email, or contact the platform owner.";
   - a footer.

   The text version is included. Nothing in it is a secret apart from the link itself.
6. **Member detail** (`/admin/team/:memberId`)
   - Shows name, email, role, status, permissions inherited from the role (grouped), joined, last sign-in (or "Never"), invitation history (from `listMemberInvites`) and this member's access events.
   - **Change role** confirms with a diff of the permissions they gain and lose.
   - **Deactivate** confirms: "Ana loses access immediately and is signed out on every device."
   - Reactivate and Revoke invitation are also available.
7. **Access history** (tab)
   - Shows access events only, filtered by date range, member, action and outcome (ok or denied).
   - Columns: time, actor, member, action, old → new role, outcome, details.
   - Paginated. Read-only, with no edit or delete anywhere.
8. **Join** (`/join`)
   - Reads `#t`, then calls `inspect`. Shows: invited email (read-only), role, invited by, expiry. Fields: full name, password, confirm password. Button: **Create account**. Then it signs in with the password and redirects to `/admin`.
   - States: checking; invalid ("This link isn't valid"); expired ("This invitation has expired. Ask the platform owner to send a new one."); revoked; used ("Already accepted" plus Sign in); account exists ("Sign in to accept", which accepts with the JWT after sign-in); error.
   - English only, in the `AuthLayout` split layout.

### 6.4 Demo mode

- The mock service gets 3 demo platform logins (Owner, Admin and Team) on `/demo`, plus sample members and invitations labelled "Sample data".
- Mock invite "sends" without email and shows the honest demo label "Demo: no email is sent".
- Mock `/join` accepts a demo token.

### 6.5 Mobile (390px)

- Tables become card lists.
- The panel and dialogs become full screen.
- The permission grid becomes a role switch (Admin/Team) above one checklist.
- No horizontal scroll; 44px touch targets.

## 7. Errors

| Code from server | Message |
|---|---|
| `already_member` | This email already has platform access. |
| `business_owner` | This email owns a business. Business owners can't join the platform team. |
| `forbidden` | You don't have permission to do this. |
| `owner_protected` | The platform owner can't be changed here. |
| `rate_limited` | Too many invitations for this person. Try again in {n} minutes. |
| `invite_invalid` / `invite_expired` / `invite_revoked` / `invite_used` | The /join states in §6.3 |
| `email_mismatch` | You're signed in as {x}, but this invitation is for {y}. Sign out and try again. |
| `weak_password` | The message from Supabase Auth |
| `email_failed` | Invitation saved but the email wasn't delivered: {reason}. |

## 8. Testing

1. **Database (local Supabase, `supabase start`; never the hosted project for tests):** a SQL test script runs as each of Owner, Admin, Team, a deactivated Admin, an invited member (not accepted), a business owner and anon. For every one of the 15 permissions it checks one allowed and one refused operation for that role.

   Escalation cases:
   - a member calls each `admin_*` function → forbidden, and `access_denied` is written;
   - a member updates `platform_members` or `platform_role_permissions` directly → refused;
   - writes to `platform_admins` → refused;
   - an unknown permission key → refused;
   - accept with a mismatched email, an expired, revoked or used token, or a business-owner email → refused;
   - a sixth resend within an hour → `rate_limited`.

   It also checks that no audit metadata contains a token or hash.
2. **Edge functions:** unit tests with injected dependencies, following the `provision-owner` tests:
   - an Owner-only check;
   - the secret never appears in the response, logs or audit;
   - email failure → `email_failed`;
   - inspect, create and accept paths.
3. **App unit tests:** `permissions.ts` defaults, nav filtering, `RequirePermission`, invite dialog validation and steps, the unsaved-changes guard, every state of the join page, and email rendering (`team_invitation`, note escaping).
4. **Browser tests (demo mode):**
   - Owner invites → result → the Invitations tab shows it;
   - an Admin login sees only the permitted nav, and a blocked URL shows the no-access state;
   - a Team login can't see Publish or Delete;
   - deactivate, then reactivate;
   - permission save with a confirmation;
   - `/join` with the demo token creates and enters.
5. **Full checks:** typecheck, lint, all unit tests, build, and the whole browser suite.

## 9. Rollout

1. ADR-0029 and ADR-0030; update PRD X-03 and the `CLAUDE.md` hard rule (platform roles allowed; business-side teams still out).
2. Build on the branch, with all checks green in demo mode, then push to the Preview.
3. **⚑ Owner go-ahead:** apply the migration to `zggylkbgajamhriebdrg`, deploy `invite-member`, `accept-member-invite` and `manage-member`, and regenerate the types (`npm run db:types`).
4. Live check on the Preview:
   - invite a real address;
   - accept through `/join`;
   - log in as Team and check the permitted and blocked areas;
   - deactivate → the next request is refused and the session ends;
   - check the access history.

   Results are reported honestly. Delivery to real inboxes needs the verified sending domain (still pending from the owner).
5. **⚑ Owner go-ahead** before merging to `main`.

## 10. Out of scope

- The ~20 brief permissions without a feature (email templates, announcements, security events, integrations, report export).
- The Communications and Notifications pages.
- Ownership transfer or promotion to Owner.
- Per-person permissions and custom roles.
- Copying the invitation link (only the hash is stored).
- Business-side teams or roles.
- Translating the team screens into Portuguese (the dashboards are English only).

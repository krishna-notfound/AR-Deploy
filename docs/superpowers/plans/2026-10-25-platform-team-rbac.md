# Platform Team Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The platform Owner can invite Admin and Team members by link, set what each role may do from 15 fixed permissions, and deactivate members. Postgres enforces it, and every change is recorded in an access history.

**Architecture:** One additive migration:
- **Owners** stay in `platform_admins` with their existing rules untouched.
- **Admin and Team members** live in `platform_members`. They get extra permissive RLS rules and function checks through `private.can(permission)`.
- **Three edge functions** (`invite-member`, `accept-member-invite`, `manage-member`) handle the link secrets (only the SHA-256 is stored) and the Resend email.
- **The React side** adds `src/features/team/` and `src/features/join/` behind the existing service layer, with demo-mode equivalents.

**Tech Stack:** Postgres/Supabase (RLS, security definer SQL), Deno edge functions (tested with Vitest through injected deps), React 19 + TypeScript 6 + Tailwind 4 + React Router 8, Vitest, PGlite for migration tests, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-platform-team-rbac-design.md` (read it before starting; section numbers below refer to it).

## Global Constraints

- **Migration:** one new migration made with `npx supabase migration new platform_team_roles`.
  - Never apply it to a hosted project, and never run `supabase config push`.
  - Never touch the old project `pmnjchhrgvajtjpadpqo`.
  - Applying it to `zggylkbgajamhriebdrg` is Task 18 and needs the owner's explicit go-ahead.
- **Never edit existing policies or existing migration files.** New rules are added as new permissive policies, and changed functions use `create or replace` in the new migration.
- **Every new SQL function:**
  - is `security definer` with `set search_path = ''`;
  - has `revoke execute ... from public, anon` and an explicit grant;
  - `admin_*` functions are granted to `authenticated`, `service_*` functions to `service_role` only.
- **Permission keys (exactly these 15):** `businesses.view`, `businesses.edit`, `businesses.status`, `businesses.delete`, `owners.manage`, `applications.view`, `applications.approve`, `applications.reject`, `products.view`, `products.edit`, `products.publish`, `products.delete`, `analytics.view`, `records.view`, `access.view`.
- **Defaults:** Admin has all 15. Team has `businesses.view`, `applications.view`, `products.view`, `analytics.view`, `products.edit`.
- **Invite links:**
  - the secret is 32 random bytes in base64url;
  - the stored value is `sha256Hex(secret)` (existing `_shared/http.ts` helper), in a `text` column;
  - the URL is `${APP_BASE_URL}/join#t=<secret>`;
  - expiry is 7 days;
  - at most 5 invitations per member per rolling hour.
- **Secrets never appear in:** a response body, `console.*`, `email_log`, `audit_events.metadata` or an error message.
- **Email:** stored lower-cased (`text` with `check (email = lower(email))` and a unique index). No `citext`.
- **Audit event types** (prefix `access_`, which `audit_events.event_type` allows: `^[a-z_]{3,60}$`):
  - `access_invite_created`, `access_invite_email_sent`, `access_invite_email_failed`, `access_invite_accepted`, `access_invite_revoked`;
  - `access_role_changed`, `access_permissions_changed`, `access_member_deactivated`, `access_member_reactivated`;
  - `access_invite_expired_attempt` (written by `service_accept_invite` when it returns `invite_expired`);
  - `access_denied`.
- **App:**
  - the UI gets data only from `src/services` (never imports `services/mock/*` or `services/supabase/*`);
  - URLs come only from `src/lib/urls.ts`;
  - the dashboards and the `/join` page are English only;
  - no new npm dependency;
  - no dead buttons;
  - every data view has loading, empty and error states;
  - ADR-0028 style: existing tokens and components, Cormorant/Jost, 2px corners, no blur.
- **Commits:** author `krishna <krishnagtkr@gmail.com>`, no co-author line (`git -c user.name=krishna -c user.email=krishnagtkr@gmail.com commit`). Push only the `feature/sanctus-brand-design-system` branch.
- **Done means:** `npm run typecheck`, `npm run lint` (0 errors), `npm test` and `npm run build` pass. Playwright runs only in Task 17, because port 5199 is shared.

## Review Focus

1. **A member calls the REST API directly**, skipping the app (for example a Team member issuing `PATCH /products?id=...` with `status=published`). It must be refused. Task 2 adds the test "team cannot publish through a direct update".
2. **Invitation link opened twice** (the email scanner, then the person). The first open must consume nothing. Task 7 adds "inspect twice then create succeeds".
3. **Owner invites an email with different casing or spaces** ("  Ana@Studio.com ") when `ana@studio.com` already exists. It must be refused as a duplicate. Task 3 adds "invite is case and space insensitive".
4. **Removing a permission while a member has the page open.** The next save must fail with "You don't have permission to do this", not a raw database error. Task 10 adds "maps 42501 to forbidden".
5. **Deactivated member with a still-valid token.** Their next data read must return nothing and writes must fail. Task 2 adds "deactivated admin reads zero businesses".

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_platform_team_roles.sql` | Tables, `can()`, added policies, function updates, admin and service functions (Tasks 1–3 append to it) |
| `supabase/rollback/20261025_platform_team_roles_rollback.sql` | Drops everything the migration added (Task 3) |
| `supabase/tests/platformTeam.test.ts` | PGlite tests for the migration (reuses the `as()` pattern from `migrations.test.ts`; copies its stubs) |
| `supabase/functions/_shared/team.ts` | Permission keys, role summary bullets for the email, token helpers (`newInviteSecret`, `hashSecret`) |
| `supabase/functions/_shared/email-templates.ts` (+ `email.ts` EmailKind) | `team_invitation` template |
| `supabase/functions/invite-member/{handler,index}.ts` (+ test) | Invite and resend |
| `supabase/functions/accept-member-invite/{handler,index}.ts` (+ test) | Inspect, create and accept |
| `supabase/functions/manage-member/{handler,index}.ts` (+ test) | Set role, deactivate, reactivate, revoke invite (+ sign-out) |
| `src/domain/types.ts` | Team types (Task 9 Interfaces) |
| `src/services/catalogService.ts` | Service methods (Task 9) |
| `src/services/mock/*` | Demo implementation and sample data |
| `src/services/supabase/supabaseCatalogService.ts`, `auth.ts` | Supabase implementation |
| `src/features/team/permissions.ts` | Labels, groups, descriptions, warnings and defaults for the UI |
| `src/auth/usePermission.ts` | `useCan()`, `RequirePermission` |
| `src/features/team/*` | Team screens |
| `src/features/join/JoinPage.tsx` | `/join` |
| `System_arch/decisions/ADR-0029-platform-team-roles.md`, `ADR-0030-link-team-invitations.md` | Decisions (Task 1) |

---

### Task 1: Decisions and the membership tables, with `can()`

**Files:**
- Create: `System_arch/decisions/ADR-0029-platform-team-roles.md`, `System_arch/decisions/ADR-0030-link-team-invitations.md`
- Modify:
  - `System_arch/decisions/README.md` (2 rows);
  - `docs/PRD.md` (X-03: "team roles" → "business-side team roles"; add a line linking to ADR-0029);
  - `CLAUDE.md` (hard rule: "team roles" → "business-side team roles (platform roles: ADR-0029)").
- Create: `supabase/migrations/<ts>_platform_team_roles.sql` (via `npx supabase migration new platform_team_roles`)
- Test: `supabase/tests/platformTeam.test.ts`

**Interfaces:**
- Produces, in SQL:
  - types `public.platform_role ('admin','team')`, `public.member_status ('invited','active','deactivated')`, `public.invite_status ('pending','sent','email_failed','accepted','expired','revoked')`;
  - tables `public.platform_members`, `public.platform_role_permissions`, `private.platform_invites` (columns per spec §4, with `token_hash text`);
  - `private.can(p_permission text) returns boolean`;
  - `public.is_platform_member() returns boolean` (active member or Owner);
  - `public.my_platform_access() returns jsonb`: `{"role":"owner"|"admin"|"team","permissions":[...]}`, or null.
- Produces, in tests: `as(uid, fn, role)` and the seeded users `OWNER_U`, `ADMIN_U`, `TEAM_U`, `DEACT_U`, `INVITED_U`, `BIZ_OWNER_U`, `STRANGER_U`, plus `BIZ` and one product row.

- [ ] **Step 1: Write the ADRs.**
  - ADR-0029 uses the context, decision and consequences from spec §1–3.
  - ADR-0030 is the link design from spec §5.2, and why it differs from ADR-0027 (consumed only on POST, with the secret in the fragment).
  - Use the existing ADR format (see `ADR-0027-email-codes-instead-of-links.md`).
- [ ] **Step 2: Write the failing tests** in `supabase/tests/platformTeam.test.ts`.
  - **Setup:** in `beforeAll`, apply every migration (the same loop as `migrations.test.ts`), then seed:
    - users;
    - `platform_admins(OWNER_U)`;
    - members: ADMIN_U `admin`/`active`, TEAM_U `team`/`active`, DEACT_U `admin`/`deactivated`, INVITED_U `team`/`invited`;
    - `business_members(BIZ, BIZ_OWNER_U)`.
  - **Tests:**
    - `it('seeds the default permissions')`: `select role, permission from platform_role_permissions` as service: 15 admin rows and exactly the 5 team keys.
    - `it('my_platform_access reports each role')`:
      - OWNER_U → role `owner` with all 15;
      - ADMIN_U → `admin` with 15;
      - TEAM_U → `team` with 5;
      - DEACT_U, INVITED_U, BIZ_OWNER_U and STRANGER_U → `null`.
    - `it('can() is false for deactivated and invited members')`: `can('products.view')` as DEACT_U and as INVITED_U → false.
    - `it('rejects unknown permission keys')`: inserting `('team','products.nuke')` as postgres → throws `check`.
    - `it('members cannot write membership tables')`: as ADMIN_U, `update platform_members set role='admin'` and `insert into platform_role_permissions` → throws (no grant) or affects 0 rows; `insert into platform_admins` → throws.
    - `it('a member reads only their own membership row')`: as TEAM_U, `select count(*) from platform_members` → 1. As OWNER_U → 4.
- [ ] **Step 3: Run** `npx vitest run supabase/tests/platformTeam.test.ts`. Expected: FAIL (relation `platform_role_permissions` does not exist).
- [ ] **Step 4: Implement** the types, the tables (spec §4, email check, `updated_at` trigger using the existing `public.set_updated_at()`), the seed `insert` for the defaults, RLS enabled on both public tables, grants (select only to `authenticated`, nothing for `anon`), select policies (Owner via `is_platform_admin()`; a member: `user_id = auth.uid()`; role permissions: Owner, or `role = (own active role)`), and the three functions from spec §4.1. `private.platform_invites` has no grants for `anon` or `authenticated`.
- [ ] **Step 5: Run** the same command. Expected: PASS. Then run `npx vitest run supabase/tests/migrations.test.ts`. Expected: PASS (nothing existing broke).
- [ ] **Step 6: Commit**

```bash
git add System_arch/decisions docs/PRD.md CLAUDE.md supabase/migrations supabase/tests/platformTeam.test.ts
git -c user.name=krishna -c user.email=krishnagtkr@gmail.com commit -m "Platform team roles: decisions, membership tables and the can() check (ADR-0029, ADR-0030)"
```

### Task 2: Added rules on existing tables, function checks and separation

**Files:**
- Modify: `supabase/migrations/<ts>_platform_team_roles.sql` (append)
- Test: `supabase/tests/platformTeam.test.ts`

**Interfaces:**
- Consumes: `private.can(text)` (Task 1).
- Produces: one added policy for each table and operation in spec §4.2. The new versions of the following each accept `private.can('<perm>')` as well as `is_platform_admin()`:
  - `guard_business_admin_fields` (latest body is in `20261024065538_security_hardening.sql`): `businesses.edit` for admin-only fields, plus `businesses.status` when `status` changes;
  - `save_product` (latest in `20261020143507_variant_media.sql`): `products.edit`;
  - `admin_review_application`: approve or start-review → `applications.approve`; reject → `applications.reject`;
  - `admin_list_business_members`, `admin_user_emails`: `businesses.view`;
  - `admin_add_business_member`, `admin_create_business_claim`: `owners.manage`.

  New trigger `private.products_publish_permission()` (before update on `products`): a status change to or from `published` by `authenticated` needs `is_platform_admin() or can('products.publish') or is_business_member(business_id)`. Separation: `service_link_owner` and `admin_add_business_member` raise `platform_member_cannot_own` when the user is in `platform_members`.

- [ ] **Step 1: Write the failing tests** as a `describe('permission matrix')` table. For each row, run one allowed and one refused operation:

| Permission | Allowed as | Refused as | Operation |
|---|---|---|---|
| `businesses.view` | TEAM_U | DEACT_U, STRANGER_U | `select count(*) from businesses` → 1 vs 0 |
| `businesses.edit` | ADMIN_U | TEAM_U | `update businesses set name='X' where id=BIZ` → 1 row vs 0 |
| `businesses.status` | ADMIN_U | TEAM_U | `update businesses set status='inactive'` |
| `businesses.delete` | ADMIN_U | TEAM_U | `delete from businesses where id=BIZ` (inside a transaction that is rolled back) |
| `applications.view` | TEAM_U | DEACT_U | `select count(*) from business_applications` |
| `applications.approve` / `.reject` | ADMIN_U | TEAM_U | `select admin_review_application(...)` → ok vs throws 42501 |
| `products.view` | TEAM_U | DEACT_U | select products (including drafts) |
| `products.edit` | TEAM_U | DEACT_U | `select save_product(...)` |
| `products.publish` | ADMIN_U | TEAM_U | `update products set status='published'` |
| `products.delete` | ADMIN_U | TEAM_U | delete product |
| `analytics.view` | TEAM_U | DEACT_U | select `product_analytics` |
| `records.view` | ADMIN_U | TEAM_U | select `email_log`, and non-access `audit_events` |
| `access.view` | ADMIN_U | TEAM_U | select `audit_events where event_type like 'access_%'` |
| `owners.manage` | ADMIN_U | TEAM_U | `select admin_create_business_claim(BIZ)` → ok vs throws 42501 |

  For the `businesses.status` row, first (as postgres) remove `businesses.status` from the Admin set inside the test transaction. Then ADMIN_U can still rename the business but `update businesses set status='inactive'` raises `forbidden`.

  Also add:
  - `it('team cannot publish through a direct update')`;
  - `it('deactivated admin reads zero businesses')`;
  - `it('business owner still edits own products and nothing else')`: the existing behaviour is unchanged;
  - `it('owner keeps full access')`;
  - `it('a platform member cannot be linked as business owner')`: `service_link_owner(BIZ2, TEAM_U, ...)` as `service_role` → throws `platform_member_cannot_own`.
- [ ] **Step 2: Run** `npx vitest run supabase/tests/platformTeam.test.ts`. Expected: the matrix rows FAIL for members.
- [ ] **Step 3: Implement** the policies, the replaced functions and the trigger. Policy names start with `Platform members` (for example `"Platform members read products"`).
  - Storage: add policies for insert, update and delete on `storage.objects`. Mirror the path checks of the existing admin policies in `20261012192159_storage.sql`, replacing the `is_platform_admin()` term with `private.can('products.edit')` for product paths and `private.can('businesses.edit')` for logo paths.
- [ ] **Step 4: Run** `npx vitest run supabase/tests`. Expected: PASS (both files).
- [ ] **Step 5: Commit** with the message "Platform team roles: permission rules on businesses, applications, products, media, analytics and records".

### Task 3: Member management and invitation functions in SQL, plus rollback

**Files:**
- Modify: `supabase/migrations/<ts>_platform_team_roles.sql` (append)
- Create: `supabase/rollback/20261025_platform_team_roles_rollback.sql`
- Test: `supabase/tests/platformTeam.test.ts`

**Interfaces (Postgres functions; the errors are raised as `raise exception '<code>' using errcode = 'P0001'`, except `forbidden`, which uses errcode `42501`):**
- `admin_invite_member(p_email text, p_role platform_role, p_note text default null) returns uuid`: the member id. Errors: `forbidden`, `invalid_email`, `already_member`, `business_owner`.
- `admin_set_member_role(p_member uuid, p_role platform_role) returns void`. Errors: `forbidden`, `not_found`, `owner_protected` (the target's user is in `platform_admins`), `self`.
- `admin_deactivate_member(p_member uuid) returns uuid` (the `user_id` or null) / `admin_reactivate_member(p_member uuid) returns void`.
- `admin_revoke_member_invite(p_member uuid) returns void`.
- `admin_set_role_permissions(p_role platform_role, p_permissions text[]) returns void`. Errors: `forbidden`, `unknown_permission`.
- `admin_list_members() returns setof jsonb`: one object per member: `{id,userId,email,fullName,role,status,invitedBy,createdAt,activatedAt,deactivatedAt,lastSignInAt,invite:{status,expiresAt}|null}`. **Owners are included** with `role:'owner'`, status `active`, and `id` = `user_id`.
- `admin_get_member(p_member uuid) returns jsonb` / `admin_list_member_invites(p_member uuid) returns setof jsonb`: `{id,status,createdAt,expiresAt,createdBy,lastEmailAt,lastEmailResult,acceptedAt,revokedAt}`. Never includes `token_hash`.
- `service_create_member_invite(p_member uuid, p_token_hash text, p_expires_at timestamptz, p_actor uuid) returns uuid`. Errors: `rate_limited` (more than 5 created for this member in the last hour).
- `service_record_invite_email(p_invite uuid, p_ok boolean, p_detail text) returns void`.
- `service_inspect_invite(p_token_hash text) returns jsonb`: `{state, email, role, invitedBy, expiresAt, userExists}` (state is `valid|expired|revoked|used|invalid`).
- `service_accept_invite(p_token_hash text, p_user uuid) returns text`: `ok` or one of `invite_invalid|invite_expired|invite_revoked|invite_used|email_mismatch|business_owner`.
- `service_log_access_denied(p_actor uuid, p_action text) returns void`.
- Each `admin_*` function calls `service_log_access_denied` (written inside the function) before raising `forbidden`.

- [ ] **Step 1: Write the failing tests:**
  - `it('only the owner can invite')`: as ADMIN_U → throws `forbidden`, and an `access_denied` audit row exists with `actor_id=ADMIN_U`.
  - `it('invite is case and space insensitive')`: owner invites `'  Ana@Studio.com '`, then `'ana@studio.com'` → the second throws `already_member`; the stored email is `ana@studio.com`.
  - `it('refuses business owners')`: inviting the email of BIZ_OWNER_U → `business_owner`.
  - `it('owner cannot be changed')`: `admin_set_member_role(<owner id>,'team')` → `owner_protected`.
  - `it('rejects unknown permissions and audits changes')`: `admin_set_role_permissions('team', ['products.view','x'])` → `unknown_permission`. With valid keys, the audit row has metadata `{role:'team', added:[...], removed:[...]}`.
  - `it('rate limits invitations')`: 5 `service_create_member_invite` calls succeed; the 6th → `rate_limited`. Creating a new one revokes the previous one (only 1 is `pending`).
  - `it('accepts once, with the right email only')`: inspect → `valid`; accept with STRANGER_U → `email_mismatch`; accept with a user whose email matches → `ok`, and the member becomes `active` with `user_id` set; a second accept → `invite_used`; an expired invite (`expires_at` in the past) → `invite_expired`; a revoked one → `invite_revoked`.
  - `it('never stores the secret in audit metadata')`: after every call above, `select count(*) from audit_events where metadata::text like '%<hash>%'` → 0.
  - `it('rollback removes everything')`: apply the rollback script in a fresh PGlite with every migration applied → `platform_members` does not exist, and the existing tests' `is_platform_admin()` behaviour is intact. Follow the existing rollback tests in `migrations.test.ts:742`.
- [ ] **Step 2: Run** `npx vitest run supabase/tests/platformTeam.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the functions and the rollback script. The rollback drops in reverse order and restores the previous bodies of the replaced functions by re-running their latest `create or replace` from the earlier migration files.
- [ ] **Step 4: Run** `npx vitest run supabase/tests`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Platform team roles: owner-only member functions, invitation storage (hash only), rate limit, rollback".

### Task 4: Shared team helpers and the invitation email

**Files:**
- Create: `supabase/functions/_shared/team.ts`
- Modify: `supabase/functions/_shared/email.ts` (`EmailKind` adds `'team_invitation'`), `supabase/functions/_shared/email-templates.ts`
- Test: `supabase/functions/_shared/email-templates.test.ts`, `supabase/functions/_shared/team.test.ts`

**Interfaces:**
- Produces:
  - `PERMISSIONS: readonly string[]` (the 15);
  - `ROLE_SUMMARY: Record<'admin'|'team', string[]>`: email bullets. Admin: "Review and approve business applications", "Manage businesses and their owners", "Create, publish and manage products", "View analytics and records". Team: "View businesses and applications", "Create and edit products", "View analytics";
  - `newInviteSecret(): string` (32 bytes from `crypto.getRandomValues`, base64url, no padding);
  - `hashSecret(secret: string): Promise<string>` (= `sha256Hex`).
- `TemplateData` adds `role?: 'admin'|'team'`, `note?: string`, `expiresAt?: string` (ISO), `inviterName?: string`.

- [ ] **Step 1: Write the failing tests:**
  - `newInviteSecret` matches `/^[A-Za-z0-9_-]{43}$/`, and two calls differ;
  - `hashSecret('a')` equals the known SHA-256 hex of "a";
  - `renderEmail('team_invitation','en',{role:'admin', actionUrl:'https://x.app/join#t=abc', expiresAt:'2026-11-01T12:00:00Z', note:'<b>hi</b>', inviterName:'Owner'})`:
    - the subject is `You're invited to Sanctus`;
    - the HTML contains `as <strong>Admin</strong>`, the 4 Admin bullets, `&lt;b&gt;hi&lt;/b&gt;` (escaped), `Accept invitation`, `1 November 2026`, and `contact the platform owner`;
    - the text version contains the URL.
  - `renderEmail` throws when `note` is longer than 500 characters.
- [ ] **Step 2: Run** `npx vitest run supabase/functions/_shared`. Expected: FAIL.
- [ ] **Step 3: Implement.** Copy from spec §6.3 item 5; the expiry date is formatted `d MMMM yyyy` in English (`Intl.DateTimeFormat('en-GB', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'})`).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "Team invitation email and invite-secret helpers".

### Task 5: `invite-member` edge function

**Files:**
- Create: `supabase/functions/invite-member/handler.ts`, `index.ts`, `handler.test.ts`

**Interfaces:**
- `export interface InviteDeps`:
  - `callerId(req): Promise<string|null>`;
  - `isOwner(userId): Promise<boolean>`;
  - `rpcAsCaller(req, fn, args): Promise<{data, error}>`;
  - `createInvite(memberId, hash, expiresAt, actor): Promise<{ok:true, inviteId} | {ok:false, error:'rate_limited'}>`;
  - `recordEmail(inviteId, ok, detail)`;
  - `memberById(id)`;
  - `send: SendDeps`;
  - `config`;
  - `audit(event)`;
  - `logDenied(actor, action)`;
  - `now(): Date`.
- `export async function handleInviteMember(req: Request, deps: InviteDeps): Promise<Response>`.
- **Request:** `{action:'invite', email, role, note?}` or `{action:'resend', memberId}`.
- **200 response:** `{memberId, status:'sent'|'email_failed', sentAt, expiresAt, error?}`.
- **Errors:** 401 `unauthenticated`, 403 `forbidden`, 409 `already_member|business_owner`, 422 `invalid_email|invalid_role|note_too_long`, 429 `rate_limited`, 503 `not_configured`.

- [ ] **Step 1: Write the failing tests** (mirror `provision-owner/handler.test.ts`):
  - a non-owner → 403, `logDenied` called, and no email sent;
  - invite → the email body contains `/join#t=`, and the response JSON, logs and audit contain neither the secret nor its hash;
  - `expiresAt` = now + 7 days;
  - the provider fails → 200 with `status:'email_failed'` and an `access_invite_email_failed` audit event;
  - resend of an `active` member → 409 `not_invited`;
  - `rate_limited` → 429.
- [ ] **Step 2: Run** `npx vitest run supabase/functions/invite-member`. Expected: FAIL.
- [ ] **Step 3: Implement** the handler, then `index.ts`, wiring the real deps like `provision-owner/index.ts`:
  - `isOwner` reads `platform_admins` with the service client;
  - `rpcAsCaller` creates a client with the caller's `Authorization` header for `admin_invite_member`, so the SQL Owner check also runs;
  - the email workflow id is `team_invite:<memberId>`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "invite-member edge function (owner only; link secret never returned or logged)".

### Task 6: `manage-member` edge function

**Files:**
- Create: `supabase/functions/manage-member/handler.ts`, `index.ts`, `handler.test.ts`

**Interfaces:**
- Request: `{action:'set_role', memberId, role} | {action:'deactivate'|'reactivate'|'revoke_invite', memberId}`.
- Response: 200 `{ok:true}`. Errors are mapped from the SQL codes (403 `forbidden`, 409 `owner_protected|self`, 404 `not_found`).
- Deps: `rpcAsCaller`, `signOutUser(userId): Promise<void>` (`admin.auth.admin.signOut(userId,'global')`).

- [ ] **Step 1: Write the failing tests:**
  - deactivate calls `admin_deactivate_member`, then `signOutUser` with the returned user id;
  - a sign-out failure still returns 200 with `{ok:true, signOut:'failed'}` (the database already blocks access);
  - SQL `forbidden` → 403;
  - an unknown action → 400.
- [ ] **Step 2: Run** `npx vitest run supabase/functions/manage-member`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "manage-member edge function (role, deactivate with global sign-out, reactivate, revoke)".

### Task 7: `accept-member-invite` edge function

**Files:**
- Create: `supabase/functions/accept-member-invite/handler.ts`, `index.ts`, `handler.test.ts`

**Interfaces:**
- **Request:**
  - `{action:'inspect', token}`;
  - `{action:'create', token, fullName, password}`;
  - `{action:'accept', token}`, with the caller's JWT.
- **Inspect response:** `{state, email?, role?, invitedBy?, expiresAt?, accountExists?}`. The email is returned only when the state is `valid`.
- **Create response:** 200 `{ok:true, email}`; 409 `account_exists`; 422 `weak_password` with `{message}` from Auth; 410 `invite_expired|invite_revoked|invite_used`; 404 `invite_invalid`.
- **Accept response:** 200 `{ok:true}`; 403 `email_mismatch`; 409 `business_owner`; the 410 and 404 codes as above.
- **Deps:**
  - `inspect(hash)`;
  - `createUser({email, password, fullName}): Promise<{ok:true, userId} | {ok:false, error:'exists'|'weak_password', message}>`;
  - `accept(hash, userId)`;
  - `callerId(req)`;
  - `rateLimit(ip): Promise<boolean>`: 20 per 5 minutes; reuse the `record_event_limited` approach, or an in-memory map per instance. In-memory is acceptable because the 256-bit secret makes guessing infeasible; note this in a comment.
  - `audit`.

- [ ] **Step 1: Write the failing tests:**
  - `it('inspect twice then create succeeds')`: two inspects, then create → `ok`; `accept` is called exactly once;
  - create when the user already exists → 409 `account_exists`, and `accept` is not called;
  - a weak password → 422 with Auth's message;
  - an expired token on create → 410, and no user is created;
  - accept with a mismatched email → 403;
  - a missing or overlong token (more than 100 characters) → 404 `invite_invalid` without calling the database;
  - the rate limit is exceeded → 429.
- [ ] **Step 2: Run** `npx vitest run supabase/functions/accept-member-invite`. Expected: FAIL.
- [ ] **Step 3: Implement** the handler, and `index.ts` (`createUser` uses `admin.auth.admin.createUser({email, password, email_confirm:true, user_metadata:{display_name: fullName}})`; `display_name` is what `auth.ts` reads).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "accept-member-invite edge function (inspect consumes nothing; create or accept once)".

### Task 8: Register the functions and config

**Files:**
- Modify: `supabase/config.toml`: add `[functions.invite-member]`, `[functions.manage-member]` and `[functions.accept-member-invite]` with `verify_jwt` matching `provision-owner` (true for invite and manage; **false** for `accept-member-invite`, which checks the JWT itself for `accept`). Local file only; never pushed.
- Modify: `docs/OPERATIONS_RUNBOOK.md`: the deploy commands for the 3 functions, and `APP_BASE_URL` being required.

- [ ] **Step 1:** Add the config blocks and the runbook section.
- [ ] **Step 2:** Run `npx vitest run supabase`. Expected: PASS.
- [ ] **Step 3: Commit** with the message "Config and runbook for the team functions".

### Task 9: Domain types, service interface and demo implementation

**Files:**
- Modify: `src/domain/types.ts`, `src/services/catalogService.ts`, `src/services/mock/mockCatalogService.ts`, `src/services/mock/seed.ts`, `src/services/mock/db.ts`
- Create: `src/features/team/permissions.ts`
- Test: `src/services/mock/service.test.ts`, `src/features/team/permissions.test.ts`

**Interfaces (Produces; used by Tasks 10–17):**

```ts
// src/domain/types.ts
export type Permission =
  | 'businesses.view' | 'businesses.edit' | 'businesses.status' | 'businesses.delete' | 'owners.manage'
  | 'applications.view' | 'applications.approve' | 'applications.reject'
  | 'products.view' | 'products.edit' | 'products.publish' | 'products.delete'
  | 'analytics.view' | 'records.view' | 'access.view'
export type PlatformRole = 'owner' | 'admin' | 'team'
export type MemberRole = Exclude<PlatformRole, 'owner'>
export interface PlatformAccess { role: PlatformRole; permissions: Permission[] }
export type MemberStatus = 'invited' | 'active' | 'deactivated'
export type InviteStatus = 'pending' | 'sent' | 'email_failed' | 'accepted' | 'expired' | 'revoked'
export interface PlatformMember {
  id: ID; userId: ID | null; email: string; fullName: string | null; role: PlatformRole; status: MemberStatus
  invitedBy: string | null; createdAt: string; activatedAt: string | null; deactivatedAt: string | null
  lastSignInAt: string | null; invite: { status: InviteStatus; expiresAt: string } | null
}
export interface MemberInvite {
  id: ID; status: InviteStatus; createdAt: string; expiresAt: string; createdBy: string | null
  lastEmailAt: string | null; lastEmailResult: string | null; acceptedAt: string | null; revokedAt: string | null
}
export interface InviteOutcome { memberId: ID; status: 'sent' | 'email_failed'; sentAt: string; expiresAt: string; error?: string }
export type RolePermissions = Record<MemberRole, Permission[]>
export type AccessAction = 'invite_created' | 'invite_email_sent' | 'invite_email_failed' | 'invite_accepted' | 'invite_revoked'
  | 'role_changed' | 'permissions_changed' | 'member_deactivated' | 'member_reactivated' | 'denied'
export interface AccessEvent { id: ID; at: string; actor: string | null; member: string | null; action: AccessAction
  fromRole?: PlatformRole; toRole?: PlatformRole; outcome: 'ok' | 'denied'; details: string }
export interface AccessQuery { q?: string; action?: AccessAction; outcome?: 'ok' | 'denied'; from?: string; to?: string; page?: number }
export type InviteState = 'valid' | 'expired' | 'revoked' | 'used' | 'invalid'
export interface InviteInspection { state: InviteState; email?: string; role?: MemberRole; invitedBy?: string; expiresAt?: string; accountExists?: boolean }
// User gains:  platform?: PlatformAccess   (set for role 'super_admin')
```

```ts
// CatalogService additions (catalogService.ts)
getMyAccess(): Promise<Result<PlatformAccess | null>>
listMembers(): Promise<Result<PlatformMember[]>>
getMember(id: ID): Promise<Result<PlatformMember>>
listMemberInvites(id: ID): Promise<Result<MemberInvite[]>>
inviteMember(input: { email: string; role: MemberRole; note?: string }): Promise<Result<InviteOutcome>>
resendMemberInvite(id: ID): Promise<Result<InviteOutcome>>
revokeMemberInvite(id: ID): Promise<Result<void>>
setMemberRole(id: ID, role: MemberRole): Promise<Result<void>>
deactivateMember(id: ID): Promise<Result<void>>
reactivateMember(id: ID): Promise<Result<void>>
getRolePermissions(): Promise<Result<RolePermissions>>
setRolePermissions(role: MemberRole, permissions: Permission[]): Promise<Result<void>>
getAccessEvents(query?: AccessQuery): Promise<Result<Page<AccessEvent>>>
inspectInvite(token: string): Promise<Result<InviteInspection>>
acceptInviteCreate(input: { token: string; fullName: string; password: string }): Promise<Result<{ email: string }>>
acceptInviteExisting(token: string): Promise<Result<void>>
```

Errors use the existing `Result` error shape. The codes are the spec §7 keys (`already_member`, `business_owner`, `forbidden`, `owner_protected`, `rate_limited`, `invite_*`, `email_mismatch`, `weak_password`, `email_failed`), and the message is the spec §7 sentence.

`permissions.ts` exports:
- `PERMISSION_GROUPS: { title: string; items: { key: Permission; label: string; description: string; warning?: string }[] }[]` (labels and warnings from spec §3.2);
- `DEFAULT_ROLE_PERMISSIONS: RolePermissions`;
- `ALL_PERMISSIONS: Permission[]`;
- `ROLE_LABEL: Record<PlatformRole, string>`;
- `ROLE_DESCRIPTION: Record<MemberRole, string>`: Admin "Runs day-to-day operations with the permissions you set."; Team "Helps with assigned tasks, usually with view and edit access only.".

**Demo data** (mock seed, labelled sample):
- members: an Owner (`admin@platform.example`, the existing `SUPER_ADMIN`), Ana Ribeiro (admin, active), João Costa (team, active), Marta Lopes (team, invited, invitation `sent`, expires in 6 days), Pedro Alves (admin, deactivated);
- 6 access events;
- the demo token `demo-invite-token` maps to Marta.

The mock `inviteMember` returns `status:'sent'` and records an event. It never sends anything.

- [ ] **Step 1: Write the failing tests:**
  - `permissions.test.ts`: there are 15 unique keys, and the defaults match the Global Constraints exactly;
  - in `service.test.ts`, `describe('team (mock)')`:
    - `inviteMember` duplicate (case-insensitive) → `already_member`;
    - invite then `listMembers` includes the new member with `status:'invited'`;
    - `setRolePermissions('team', [...])` then `getRolePermissions()` reflects it;
    - an unknown permission → `forbidden`/`unknown_permission`;
    - `setMemberRole` on the Owner → `owner_protected`;
    - `inspectInvite('demo-invite-token')` → valid, email `marta@…`;
    - `acceptInviteCreate` with it → ok, and Marta becomes `active`;
    - a second inspect → `used`.
- [ ] **Step 2: Run** `npx vitest run src/services/mock src/features/team`. Expected: FAIL.
- [ ] **Step 3: Implement** the types, the interface and the mock (keep mock state in the existing `db.ts` store so `resetDemoData` resets it).
- [ ] **Step 4: Run.** Expected: PASS. Also run `npm run typecheck` (the Supabase service must have the methods; add stubs that throw `not implemented` only until Task 10, in the same task branch. Task 10 replaces all of them).
- [ ] **Step 5: Commit** with the message "Team domain types, service interface and demo implementation".

### Task 10: Supabase implementation and account resolution

**Files:**
- Modify: `src/services/supabase/supabaseCatalogService.ts`, `src/services/supabase/auth.ts`, `src/services/supabase/auth.test.ts`
- Test: `src/services/supabase/team.test.ts` (mocked `sb`, following `auth.test.ts`)

**Interfaces:**
- Consumes: the Task 9 interface, and the SQL and edge function contracts from Tasks 3 and 5–7.
- `auth.getCurrentUser()` replaces the `platform_admins` select with `sb.rpc('my_platform_access')`. When it is non-null: `user: {...base, role:'super_admin', platform: {role, permissions}}`.

- [ ] **Step 1: Write the failing tests:**
  - `my_platform_access` → `{role:'team', permissions:['products.view']}` → a user with `platform.role === 'team'`;
  - null plus a business member → business user (unchanged);
  - `listMembers` maps the jsonb camelCase rows;
  - `inviteMember` posts to `functions.invoke('invite-member', {body:{action:'invite',…}})`;
  - the 409 `already_member` body → `Result` error code `already_member`;
  - `it('maps 42501 to forbidden')`: an RPC error with code `42501` → error code `forbidden` with the message "You don't have permission to do this.";
  - `inspectInvite` posts `{action:'inspect', token}` without needing a session.
- [ ] **Step 2: Run** `npx vitest run src/services/supabase`. Expected: FAIL.
- [ ] **Step 3: Implement** the RPCs for reads and permissions:
  - `admin_list_members`, `admin_get_member`, `admin_list_member_invites`, `admin_set_role_permissions`;
  - role permissions are read with `from('platform_role_permissions').select('role, permission')`;
  - access events are read from `audit_events` with `event_type like 'access_%'`, joined to emails with the existing `admin_user_emails`.

  Edge functions handle invite, resend, manage and accept.
- [ ] **Step 4: Run.** Expected: PASS, plus `npm run typecheck`.
- [ ] **Step 5: Commit** with the message "Supabase implementation of team services; platform role from my_platform_access".

### Task 11: Permission-aware app: session, navigation, routes and actions

**Files:**
- Create: `src/auth/usePermission.ts`, `src/auth/usePermission.test.tsx`
- Modify:
  - `src/auth/AccountProvider.tsx`: the demo `Session` gains `{role:'super_admin', platformRole?: PlatformRole}`; demo users get `platform` from `service.getMyAccess()`;
  - `src/auth/accounts.ts`: demo Admin and Team users;
  - `src/features/demo/DemoAccounts.tsx`: buttons "Continue as Admin (sample)" and "Continue as Team (sample)";
  - `src/components/layout/nav.ts`: `NavItem.requires?: Permission | Permission[] | 'owner'`; add the Team & Access item (`/admin/team`, icon `Users`, `requires:'owner'`);
  - `src/components/layout/DashboardShell.tsx`: filter the nav items;
  - `src/app/router.tsx`: wrap each admin route, and add `/admin/team`, `/admin/team/permissions`, `/admin/team/:memberId` and the public `/join`;
  - the admin pages' action buttons: `AdminOverviewPage`, `ApplicationDetailPage` (approve/reject), `BusinessesListPage`/`BusinessDetailPage` (create, edit, status, delete, owner actions), `ProductTable`/`ProductEditorPage` (publish, delete, edit), `AdminSettingsPage` (Owner).

**Interfaces:**
- `useCan(): (p: Permission | 'owner') => boolean`. Business users → false for every platform permission. The Owner → true for everything.
- `<RequirePermission need={Permission | Permission[] | 'owner'}>`: with an array, any one is enough. Otherwise it renders `ErrorState` with the title "You don't have access to this page" and the body "Ask the platform owner if you need it."

**Route requirements:**

| Route | Needs |
|---|---|
| `/admin` | Always open |
| `applications/*` | `applications.view` |
| `businesses` and `businesses/:id` | `businesses.view` |
| `businesses/new` | `businesses.edit` |
| `products` | `products.view` |
| `products/new` and `products/:id/edit` | `products.edit` |
| `analytics` | `analytics.view` |
| `catalogs` | `products.view` |
| `activity` | `records.view` or `access.view` |
| `settings` | Owner |
| `team/*` | Owner |

- [ ] **Step 1: Write the failing tests** (`usePermission.test.tsx`, rendering with a demo session):
  - Team: the nav shows "Analytics" (Team has `analytics.view`) and lacks "Team & Access", "Settings" and "Audit log";
  - Team visiting `/admin/settings` sees "You don't have access to this page";
  - Team on the product list sees no "Publish" or "Delete" actions;
  - Admin sees Applications and Approve;
  - the Owner sees "Team & Access".
- [ ] **Step 2: Run** `npx vitest run src/auth`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src` (every existing test must still pass; the existing super-admin demo maps to Owner). Expected: PASS.
- [ ] **Step 5: Commit** with the message "Permission-aware dashboard: navigation, routes and actions follow the platform role".

### Task 12: Team & Access page (members, invitations, access history, invitation panel)

**Files:**
- Create: `src/features/team/TeamPage.tsx`, `MembersTable.tsx`, `InvitationsTable.tsx`, `AccessHistory.tsx`, `InvitationPanel.tsx`, `teamLabels.tsx`, `TeamPage.test.tsx`

**Interfaces:**
- Consumes: the Task 9 service, `useCan`, and the existing `PageHeader`, `StatGroup`, `Tabs` (`variant="pill"`), `DataTable`, `Pagination`, `SearchInput`, `Badge`, `Menu`, `Modal`, `States`, `ConfirmProvider`, `Monogram`.
- Produces: `RoleBadge({role})`, `MemberStatusBadge({status})`, `InviteStatusBadge({status})`.
  - Badge tones: owner = neutral dark; admin = bronze; team = neutral;
  - active = success; invited = info; deactivated = neutral muted;
  - sent = info; email_failed = warning; accepted = success; expired = neutral; revoked = danger.

**Behaviour:**
- Tabs and filters live in the URL: `?tab=members|invitations|history&q=&role=&status=&page=`.
- The `InvitationPanel` opens for `?invite=<memberId>`.
- Copy for the "Sent" status: "Accepted by the email provider. This doesn't mean it was read."
- Invitations are listed per member from the members with `status === 'invited'`.

- [ ] **Step 1: Write the failing tests:**
  - it renders 4 stat counts from the demo data (Active 3 including the Owner, Pending 1, Admins 2, Team 2);
  - searching "marta" leaves 1 row; the role filter `team` leaves 2;
  - the Owner row has no actions menu;
  - the menu for Marta shows Resend and Revoke and no Deactivate; the menu for Ana shows Deactivate;
  - Revoke asks for confirmation, then the status becomes revoked;
  - the history tab lists events with the outcome; filtering by outcome `denied` leaves only denied rows;
  - a service error shows the retry state.
- [ ] **Step 2: Run** `npx vitest run src/features/team/TeamPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Mobile: tables use the existing `DataTable` card layout, and the panel is full screen below `sm`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "Team & Access page: members, invitations, access history".

### Task 13: Invite member dialog

**Files:**
- Create: `src/features/team/InviteMemberDialog.tsx`, `InviteMemberDialog.test.tsx`
- Modify: `TeamPage.tsx` (the "Invite member" primary action opens it)

- [ ] **Step 1: Write the failing tests:**
  - submitting an empty or invalid email shows "Enter a valid email address" and doesn't advance;
  - choosing Team lists exactly the 5 Team permission labels;
  - Continue shows the review with the email, role and permissions; Send calls `inviteMember`;
  - the outcome `sent` shows "Invitation sent to …" and the expiry date;
  - the outcome `email_failed` shows the warning "Invitation saved but the email wasn't delivered" with Retry, and **never** the success text;
  - the error `already_member` returns to step 1 with the message under the email field;
  - the Send button is disabled and shows the loading state while the request is pending.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** with the existing `Modal` and `Form` components. The note is limited to 500 characters with a counter.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "Invite member dialog: form, review, honest result".

### Task 14: Role permissions page

**Files:**
- Create: `src/features/team/RolePermissionsPage.tsx`, `RolePermissionsPage.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - the page shows 3 groups and 15 rows, with checkbox columns Admin and Team and an Owner column showing "All";
  - toggling one box shows "1 unsaved change" with Save, Cancel and Reset to defaults;
  - saving with a removal opens a confirmation listing the removed permission labels and the number of affected active members of that role; confirming calls `setRolePermissions` for each changed role;
  - Cancel restores the saved state;
  - Reset to defaults sets `DEFAULT_ROLE_PERMISSIONS` (still unsaved until Save);
  - navigating away with unsaved changes asks for confirmation (the product editor's existing `useBlocker` pattern);
  - the warning text shows on `businesses.delete` and `products.delete`;
  - mobile (a `matchMedia` mock below `sm`) shows the role switch and a single checklist.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "Role permissions editor with unsaved-changes guard and removal confirmation".

### Task 15: Member detail page

**Files:**
- Create: `src/features/team/MemberDetailPage.tsx`, `MemberDetailPage.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - the page shows the email, role, status, joined date, "Last sign-in: Never" when it's null, and the permissions grouped from the role;
  - Change role (Admin → Team) opens a confirmation listing the permissions lost; confirming calls `setMemberRole`;
  - Deactivate shows "loses access immediately and is signed out on every device";
  - the invitation history lists `listMemberInvites`;
  - access events are filtered to this member;
  - the Owner's page shows no actions;
  - an unknown id shows the not-found state.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "Member detail page with consequence confirmations".

### Task 16: Join page

**Files:**
- Create: `src/features/join/JoinPage.tsx`, `JoinPage.test.tsx`
- Modify: `src/app/router.tsx` (public `/join`, standalone, using `AuthLayout` from `src/features/auth/AuthLayout.tsx`), `src/lib/urls.ts` (add `JOIN_PATH = '/join'`)

**Behaviour:**
1. Read `location.hash` (`#t=`), then call `history.replaceState` to drop the hash, then `inspectInvite`.
2. Valid state: a read-only email field, the role and the inviter, plus fields for full name, password and confirm password, and a **Create account** button.
3. On success: `auth.signInWithPassword(email, password)`, then navigate to `/admin`.
4. When `accountExists` is true: "You already have an account. Sign in to accept." The sign-in form posts `acceptInviteExisting` after signing in.
5. In demo mode (`auth` is null): `acceptInviteCreate` from the mock, then `signInAs({role:'super_admin', platformRole:<role>})`.

- [ ] **Step 1: Write the failing tests:**
  - with no hash → the "This link isn't valid" state;
  - `#t=demo-invite-token` → shows `marta@…` read-only; the hash is removed from the URL;
  - passwords that don't match → "Passwords don't match";
  - submitting calls `acceptInviteCreate` once, then goes to `/admin`;
  - the expired, revoked and used states each show their spec message;
  - `accountExists` shows the sign-in-to-accept form;
  - the Create button shows a loading state.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "Join page: inspect, create account, accept invitation".

### Task 17: Browser tests, full checks, Preview

**Files:**
- Create: `tests/e2e/team.spec.ts`
- Modify: `tests/e2e/helpers.ts` (add `signInAsPlatform(page, 'admin'|'team')`)

- [ ] **Step 1: Write the browser tests (demo mode):**
  - Owner → Team & Access → Invite `new@studio.test` as Team → review → "Invitation sent" → the Invitations tab lists it;
  - Admin login → the nav lacks Team & Access and Settings → `/admin/team` shows the no-access state;
  - Team login → All Products shows no Publish or Delete → `/admin/settings` shows the no-access state;
  - Owner deactivates João → status Deactivated → reactivates;
  - Owner removes `products.edit` from Team → the confirmation → saved;
  - `/join#t=demo-invite-token` → create account → lands on `/admin` with a Team nav.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/team.spec.ts`. Expected: PASS.
- [ ] **Step 3: Run the full checks** with the logs written to the scratchpad: `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test`. Expected: all PASS.
- [ ] **Step 4: Update** `docs/PROJECT_COMPLETION_STATUS.md` (team roles row: built, demo-verified, not yet applied to Supabase) and `System_arch/HANDOFF.md` (the team roles summary and deploy steps).
- [ ] **Step 5: Commit and push** the feature branch: `git push origin feature/sanctus-brand-design-system`. Wait for the Preview deploy (asset hash change), then smoke-test `/join` and `/admin` there.

### Task 18: ⚑ Apply to the client Supabase project (only after the owner says yes)

**Files:**
- Modify: `src/services/supabase/database.types.ts` (regenerated)

- [ ] **Step 1: Ask the owner for an explicit go-ahead,** naming project `zggylkbgajamhriebdrg`, the migration file and the 3 functions. Stop if the answer is not yes.
- [ ] **Step 2: Run the read-only preflight** `supabase/checks/preflight_readonly.sql` against the project (as before), and confirm that `platform_admins` holds the expected Owner accounts.
- [ ] **Step 3: Apply the migration** with `npx supabase db push --linked` (it applies migrations only; never `config push`), then deploy: `npx supabase functions deploy invite-member manage-member accept-member-invite --project-ref zggylkbgajamhriebdrg`. Expected: success output for each.
- [ ] **Step 4: Regenerate the types:** `SUPABASE_PROJECT_REF=zggylkbgajamhriebdrg npm run db:types`, then `npm run typecheck`. Commit.
- [ ] **Step 5: Live check on the Preview:**
  1. Invite an address that is reachable (until the sending domain is verified, only the Resend account's own address receives mail; report that limit).
  2. Read the link from Resend (`get-email`), open `/join`, and create the account.
  3. Sign in as that Team member: confirm the permitted pages and the blocked ones.
  4. Deactivate from the Owner account: the Team member's next request returns nothing or is refused, and the session ends.
  5. Check that the access history shows each step.

  Report each result honestly, with what passed and what couldn't be checked.
- [ ] **Step 6: Commit** the types and the status doc, and push. A merge to `main` needs a separate explicit go-ahead.

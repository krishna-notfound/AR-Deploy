# 19 · Supabase backend (foundation)
Decisions: ADR-0015 (dual mode), ADR-0016 (routes). This file is the setup guide.

## Status (2026-10-27): the live project is the client's `zggylkbgajamhriebdrg` (18 migrations applied, 13 Edge Functions active; see `System_arch/HANDOFF.md` Live state). `pmnjchhrgvajtjpadpqo` is the old dev project and is not used. The sections below are dated records of the old project (2026-10-13/20) and of the first 7 migrations.
- **Migrations:** `20261012192143_init_schema`, `20261012192159_storage`, `20261012192454_save_product`, `20261012200810_analytics_rate_limit`, `20261012200813_business_member_admin`.
- **Edge Function:** `track-event` (version 1, ACTIVE).
- **Live suite:** 13/13.
- **UI journey in Supabase mode:** 9/9 (reset-password page, admin creates a business, Owners tab add/unknown email, real path-mode catalog URL, owner dashboard, owner refused `/admin`, session survives reload, logout).
- **Advisor WARNs, by design:**
  - `admin_list_business_members` and `admin_add_business_member` are SECURITY DEFINER functions callable by signed-in users; each checks `is_platform_admin()` first, and the tests confirm 42501 for everyone else
  - `rls_auto_enable` is platform-provided
- **Advisor INFO:** `private.analytics_hits` has RLS on with no policies (intentional).

## Status (2026-10-13): applied to `pmnjchhrgvajtjpadpqo`
Applied with owner approval through the Supabase MCP. Recorded versions: `20261012192143_init_schema`, `20261012192159_storage`, `20261012192454_save_product`. The local files were renamed to match, so `supabase db push` sees them as already applied.

**Live checks:**
- **Schema:** RLS on all 8 tables, 23 table policies and 9 storage policies.
- **Buckets:** `product-media` is private and `business-logos` public, with the size and type limits.
- **Grants:** anon gets SELECT on the 5 catalog tables plus a column-level INSERT on analytics. Function execute is as designed.
- **Advisors:**
  - security: nothing from these migrations; only the pre-existing, platform-provided `rls_auto_enable` event-trigger function is flagged
  - performance: INFO for an unindexed composite FK on `product_analytics` and unused indexes on an empty DB; WARN for multiple permissive SELECT policies (by design)
- **Real-API suite:** `src/services/supabase/live.integration.test.ts` passed **10/10**. It covered roles, image/GLB/USDZ upload, isolation, the cross-business file reference, draft privacy, the owner slug/status guard, publish with signed-URL fetch, anon analytics plus forged-column rejection, unpublish, and the logo bucket rejecting SVG.
- **UI smoke in Supabase mode:** 8/8 (real `/login`, redirects, admin pages, Settings mode, logout).
- **Cleanup:** all QA users, data and files were deleted afterwards. The project is schema-only again.

**Bug found by the live run, fixed:** uploads sent `.glb` and `.usdz` as `application/octet-stream` (supabase-js uses the File's own type), so the bucket rejected them. `uploadAsset` now re-wraps the file with the correct MIME type.

## Status (2026-10-12)
**Written and tested locally:**
- client, service, auth, migrations, RLS and storage policies
- unit tests with a fake client
- 80 RLS and storage checks against PGlite, with stub `auth` and `storage` schemas (see "How the SQL was verified")
- a pre-deployment security review, with its fixes applied to the unapplied migration files (see "Pre-deployment review")

**Not done:**
- The migrations are **not applied** to any Supabase project. Deployment waits for the owner's explicit approval of the target project and plan.
- No real sign-in, upload or signed-URL flow has been run end to end.
- The only configured target is `pmnjchhrgvajtjpadpqo` (from `.mcp.json`; not CLI-linked). It was empty when last inspected read-only (2026-10-12, before the review). Don't assume it is still empty: run the pre-flight first.

## Modes
| `VITE_DATA_MODE` | URL + key | Result |
|---|---|---|
| unset / `demo` | ignored | Demo mode: mock service, localStorage, demo account picker. No Supabase client is created. |
| `supabase` | both valid | Supabase mode: real data, `/login`, Storage. |
| `supabase` | missing / invalid / secret key | **Misconfigured:** full-page setup error; every service call returns `CONFIG`. Never falls back to demo data. |
| anything else | – | Misconfigured. |

The mode is read once at build/dev-server start (`src/services/backend.ts`). Restart `npm run dev` after editing env files.

## 1. Create or select a project
1. Create a project at supabase.com, or reuse the linked one.
2. Copy the **Project URL** and the **publishable key** (`sb_publishable_…`) from **Connect** or **Settings → API Keys**.
3. **Never** put the secret / `service_role` key in any `VITE_*` variable; the app refuses to start with one.

## 2. Environment
Create `.env.local` (git-ignored):
```
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```
A legacy `anon` JWT key also works, but publishable keys are preferred.

## 3. Apply the migrations
The files are in `supabase/migrations/` (created with `supabase migration new`):

| File | What it does |
|---|---|
| `…_init_schema.sql` | Creates the tables, indexes, `product_analytics_daily` view (security_invoker), helper functions, triggers, RLS and explicit grants (new tables are not exposed automatically since 2026). |
| `…_storage.sql` | Creates the `business-logos` (public) and `product-media` (private) buckets and their `storage.objects` policies. |
| `…_save_product.sql` | Creates the `save_product()` RPC, which saves a product and its children in one transaction. |

The files contain no drops and no data changes. Each one fails as a whole (it runs in a transaction) if an object with the same name already exists. Deployment steps:
1. **Approve the target project and this plan.** No step below runs without that approval.
2. **Back up** if the project holds any data: `npx supabase db dump --linked -f backup.sql` (and `--data-only`), or use Dashboard backups.
3. **Run the read-only pre-flight** `supabase/checks/preflight_readonly.sql` (SQL editor). Stop if it returns any collision, an existing **public** `product-media` bucket, recorded migration versions you don't expect, or broad `storage.objects` policies. Policies are OR-ed, so a permissive existing policy would bypass ours.
4. Run:
   ```
   npx supabase login            # prefer a scoped access token
   npx supabase link --project-ref <ref>
   npx supabase db push --dry-run
   npx supabase db push
   ```
   Use the CLI rather than pasting into the SQL editor or the MCP `apply_migration` tool, so the recorded versions match these filenames.
5. **Check:** run the advisors (security and performance), then confirm RLS is on for all 8 tables and the 9 storage policies exist.
6. **Auth:**
   - Set the Site URL and Redirect URLs (§5).
   - Turn off public sign-ups (accounts are admin-created).
   - Turn on leaked-password protection.
7. **Accounts:** create the first users, then add platform admins and memberships with SQL (§4).
8. **App:** set `.env.local` (§2), then run `npm run db:types` with `SUPABASE_PROJECT_REF=<ref>`.

**Required permissions:** a Supabase access token (or the DB password) with database-write access on the target project. The migrations run as `postgres`, which can create policies on `storage.objects`.

**Rollback:** run `supabase/rollback/20261012_p8_rollback.sql`. It is **destructive** (drops the tables and all their rows). Buckets are dropped only when empty; stored files must be deleted through the Storage API first. Afterwards, mark the versions reverted with `supabase migration repair --status reverted <version>`. There are no down-migrations, and Auth users are untouched.

## 4. First accounts
1. Create users in **Authentication → Users** (email + password).
2. Make someone a platform admin (only possible with SQL; there is no client write path):
   ```sql
   insert into public.platform_admins (user_id) select id from auth.users where email = 'you@example.com';
   ```
3. Business owners are added by a platform admin. There is no UI for this yet; use SQL:
   ```sql
   insert into public.business_members (business_id, user_id)
   select b.id, u.id from public.businesses b, auth.users u where b.slug = 'casa-lisboa' and u.email = 'owner@example.com';
   ```
4. A signed-in user without either row sees "not linked yet" on `/login`.

## 5. Auth redirects
- In **Authentication → URL Configuration**:
  - Set **Site URL** to the deployed origin.
  - Add `https://<your-domain>/login` (and `http://localhost:5173/login` for development) to **Redirect URLs**.
- Local CLI settings are already in `supabase/config.toml`.
- Only email + password sign-in is implemented. Magic links, OAuth, password reset and email confirmation templates are not built.

## 6. Storage
| Bucket | Public | Limit | Types | Path |
|---|---|---|---|---|
| `business-logos` | yes | 2 MB | png, jpeg, webp (no SVG: XSS risk on a public bucket) | `{business_id}/{uuid}.{ext}`; `new/{uuid}.{ext}` while an admin creates a business |
| `product-media` | **no** | 50 MB | png, jpeg, webp, `model/gltf-binary`, `model/vnd.usdz+zip` | `{business_id}/{uuid}.{ext}` |

Who can do what:
- **Reading `product-media`:** anyone may read an object only if it is referenced by a product they can see (published product of an active business for the public; their own drafts for members). The app serves these files through 1-hour signed URLs (`createSignedUrls`).
- **Writing:** members write only inside their business folder. Platform admins write anywhere.
- **Client-side checks** (type, size, header bytes in `lib/files.ts`) are for UX only; the bucket limits and policies are the enforcement.
- **Known gaps:**
  - Deleting a product does not delete its files (orphans). A scheduled cleanup or Edge Function would handle this.
  - Duplicated products share files.

## Real-API test suite
`npx vitest run src/services/supabase/live.integration.test.ts`, with `SUPABASE_IT_URL`, `SUPABASE_IT_KEY` (publishable) and `SUPABASE_IT_PASSWORD` set. It needs the users `qa-admin@`, `qa-owner-a@` and `qa-owner-b@furnish.example`, with that password, and qa-admin in `platform_admins`. It creates and deletes its own businesses, products and files. The suite is skipped when the variables are unset. Delete the QA users afterwards; never run it against a project with real customer data you can't afford to have touched.

## Sample data (loaded 2026-10-13)
The old dev project `pmnjchhrgvajtjpadpqo` (not used by the live site; as of 2026-10-13) holds the demo catalog as sample data: 4 businesses (Oak & Ember is inactive), 21 products (18 published, 3 drafts), 7 real 3D models, variants, and about 16.8k analytics events for the last 30 days.
- **Intentional test cases:**
  - Tejo Side Table has a missing GLB (viewer error state)
  - Damask Accent Chair has a scale mismatch (AR scale unverified)
  - Rio Sideboard has no Portuguese (fallback)
- **Accounts:**
  - `admin@furnish.example`: platform admin (login email changed 2026-10-14)
  - `owner.casa@furnish.example` → Casa Lisboa
  - `owner.nordhaus@furnish.example` → Nordhaus
  - Passwords were given to the owner in chat and are never stored in the repo. Change them via `/reset-password` while signed in.
- **Re-seed (resets only the sample businesses):**
  1. Run `npm run db:sample-sql`.
  2. Run `supabase/seed/sample_data.sql` in the SQL editor.
  3. Run `SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… npm run db:sample-logos`.
- **Remove the sample data:** run the `delete from public.businesses where id in (…)` line at the top of the SQL file. It cascades to products, events and memberships; logos stay until deleted from the bucket.

## 7. Generated types
After the schema is applied:
```
npm run db:types   # npx supabase gen types typescript --project-id <ref> > src/services/supabase/database.types.ts
```
`src/services/supabase/database.types.ts` was generated from the live schema on 2026-10-13. `schemaDrift.check.ts` fails the typecheck if a hand-written `*Row` type reads a column that no longer exists. Regenerate after every migration.

## Data access map
| Service method | Supabase call | Protected by |
|---|---|---|
| businesses CRUD | `businesses` table | RLS. Only admins insert or delete. Owners update their own business, but a trigger blocks them from changing slug or status. |
| products read | `products` + embedded `product_images`, `product_models`, `product_variants` | RLS: public sees published products of active businesses; members see their own business; admins see everything. |
| create / update / duplicate product | `rpc('save_product')` | Caller's RLS, inside one transaction. |
| publish / unpublish / delete | `products` update or delete | RLS, plus a DB check that published products have a price, dimensions and a name. |
| analytics | `product_analytics_daily` view + `summarize()` | View is security_invoker; RLS lets only members and admins read events. |
| `recordEvent` | `functions.invoke('track-event')` → `record_event_limited()` (after migration 20261012200810; before it, a direct insert) | Rate limit 30/min per hashed visitor; published products of active businesses only; direct inserts closed; no personal data stored. |
| `uploadAsset` | Storage upload + public URL or signed URL | Bucket policies (above). |
| sign-in / role | `auth.signInWithPassword`, `auth.getUser`, `platform_admins`, `business_members` | Rows that users cannot write. |

## How the access helpers enforce 2FA (S1, migrations 20261025163627 and 20261025180600)
`is_platform_admin()`, `is_platform_member()` and `platform_can()` (staff) and `is_business_member()` (business owners) are true only when the 2FA rule holds: **`aal2 OR (policy off AND no verified factor)`**. The policy is `platform_settings.require_2fa_staff` / `require_2fa_business`. The factor check is `public.caller_has_verified_factor()` (security definer: it reads `auth.mfa_factors` for `auth.uid()` only). The definer helpers call `private.mfa_satisfied(scope)`. The two invoker helpers carry the same rule inline, because the API roles have no usage on schema `private`. Every RLS policy and admin function that uses the helpers, including the `business-logos` and `product-media` storage policies, therefore refuses an aal1 session when the policy is on or the user has a verified factor. Not gated: the own `profiles` row, `platform_settings`, `my_security_state()`, `record_sign_in()`, the Auth MFA APIs, public catalog reads and `service_*` functions.

## S1.5 additions (ADR-0033, migration `20261026041731_business_logic_fixes.sql`)
Rollback: `supabase/rollback/20261026_business_logic_fixes_rollback.sql`. Release: `docs/OPERATIONS_RUNBOOK.md` ("Business-logic fixes (S1.5)"). Needs Postgres 15 or later.

**Tables (RLS on, nothing for anon or authenticated, `service_role` only)**
| Table | Purpose |
|---|---|
| `private.owner_invite_attempts` | Reservations for owner invitations: `business_id`, lower-case `recipient`, `attempt`, `actor`, `outcome` (`accepted`, `sent`, `failed`, `blocked`), `created_at`. Select, insert and update for `service_role`. |
| `private.application_attempts` | Attempts to submit an application: `submitter_hash` (daily), `created_at`. Select, insert and delete for `service_role`. Rows older than 2 hours are removed on each call. |

**Columns and constraints**
- `business_applications.business_deleted_at` (set by a trigger when the linked business is deleted).
- `private.platform_invites.note` (up to 500 characters).
- `private.email_provider_events.applied` and `error`.
- `email_log.attempt` between 1 and 100000; `email_log_kind_check` adds `application_decision`, `business_notice`, `team_notice`.
- `product_analytics.product_id` is nullable with `on delete set null (product_id)` (Postgres 15); a new foreign key on `business_id` cascades; the event check adds `embed_view`.
- `audit_events.business_id` is no longer a foreign key.

**Views and functions**
- `product_analytics_daily` appends `embed_views`. `public.business_product_counts` (security invoker) gives exact product counts per business.
- `analytics_daily(p_tz, p_days, p_business)` (security invoker) buckets days in the viewer's time zone; an unknown zone raises `invalid_timezone`.
- `admin_remove_member`, `service_create_member_invite`, `service_latest_invite_note`, `private.has_2fa`, `admin_list_owner_states`, `admin_application_duplicates`, `service_reserve_owner_invite`, `service_finish_owner_invite`, `service_application_attempt`, `service_apply_provider_status`, `private.permission_prerequisites`, `private.with_prerequisites`, `private.normalize_business_name`, and `public.platform_can_read_profile(uuid)` (the last is not in the spec; it lets the profiles policy decide per row with the gated `platform_can`).
- Redefined: `record_sign_in` (accepts a pending owner), `my_platform_access` (Owner always has all 15 permissions; a deactivated member gets `status: 'deactivated'`), `admin_set_role_permissions` (stores prerequisites, answers `{ok, added}`), `admin_list_members` and `admin_get_member` (`has2fa`), `service_link_owner`, `service_closure_target`, `private.undo_closure`, `service_record_email_event`, `record_event_limited` and `private.audit_business_change` (sets `business_id` on `business_deleted`). Task 13 also redefines `service_request_closure` and recreates `service_log_account_event` with `p_business_id`.
- Triggers (execute revoked from public, anon, authenticated): `void_closure_on_owner_removed`, `guard_activate_during_closure` (`closure_pending`), `mark_application_business_deleted`, `audit_product_change`, `snapshot_audit_event`, `apply_pending_email_events`, `sync_member_email` (on `auth.users`, never raises).

**Policies**
- `audit_events`: "Platform members read audit events" excludes `account_%` for everyone but the Owner. New: "Platform members read catalogue activity" (product events) and "Business owners read platform changes to their business" (a fixed list of event types for their own business).
- `profiles`: "Platform members read profiles" is replaced (own row, the Owner, staff profiles for `access.view` or `records.view`, owner profiles for `businesses.view`).
- `storage.objects`: "Platform members delete media" needs `products.edit`, `products.delete` or `businesses.delete`; "Platform members delete logos" needs `businesses.edit` or `businesses.delete`.

**Permission prerequisites** (`private.permission_prerequisites()`, mirrored by `PERMISSION_PREREQUISITES` in `src/domain/permissions.ts`): `businesses.edit` ← `businesses.view`; `businesses.status` ← `businesses.edit`; `businesses.delete` ← `businesses.edit` and `products.delete`; `owners.manage` ← `businesses.view`; `applications.approve` and `applications.reject` ← `applications.view`; `products.edit` ← `products.view`; `products.publish` and `products.delete` ← `products.edit`. The closure is transitive and stored.

**Access map additions**
| Service method | Supabase call | Protected by |
|---|---|---|
| review an application | `functions.invoke('review-application')` → `admin_review_application` | 2FA gate, then the permission for the action; sends the rejection email. |
| possible duplicates | `rpc('admin_application_duplicates')` | `applications.view` or the Owner. |
| owner state per business | `rpc('admin_list_owner_states')` | `businesses.view`. |
| remove a team member | `functions.invoke('manage-member', {action:'remove'})` → `admin_remove_member` | Owner (SQL `owner_or_deny`). |
| analytics by day | `rpc('analytics_daily')` and `business_product_counts` | security invoker: RLS decides what is counted. |
| owner notices | `functions.invoke('notify-business-owner')` | 2FA gate, staff only; deduped by `email_log.workflow`. |

## Pre-deployment review (2026-10-12)
Fixed in the migration files (none had been applied anywhere):

| # | Issue | Severity | Fix |
|---|---|---|---|
| 1 | A product could reference another business's private file by its `storage_path`. The "media of visible products" read policy would then expose it, and publish it. | **High** | Write policies on `product_images` and `product_models` now require `storage_path` to sit in the product's own business folder (applies to admins too). |
| 2 | The public analytics insert accepted `created_at` and `id`, allowing back-dated or future events. | Medium | Column-level `insert (business_id, product_id, event_type)` for anon and authenticated. |
| 3 | `cta_url`, `contact_website`, `logo_url` and image/model URLs accepted `javascript:` and `data:` values, which are rendered as `href`/`src`. | Medium | `^https?://` checks (image and model URLs may also be same-origin `/path`). |
| 4 | Text fields had no size limits through the public API. | Low | Length and JSON size caps. |
| 5 | The slug/status guard trigger also blocked `postgres` and `service_role` (no `auth.uid()`), so admins couldn't fix a slug in the SQL editor. | Low (ops) | The guard now applies to `anon` and `authenticated` only. |
| 6 | An existing **public** `product-media` bucket would have been kept as-is (`on conflict do nothing`), leaving it exposed. | Medium | The storage migration aborts if `product-media` exists and is public. |
| 7 | Trigger functions were executable by `PUBLIC`. | Low | Execute revoked. |

**Open, not fixable in SQL alone:**
- **Public analytics flooding.** Anyone can insert unlimited valid `view` / `ar_activation` rows for published products. There is no per-client identity in Postgres to rate-limit on. Options:
  - (a) accept for a pilot and monitor table growth, or
  - (b) before public launch, revoke the anon insert and record events through an Edge Function with rate limiting or bot filtering.
- **Publishing without images.** The "has at least one image" publish rule is enforced in the app only; the DB enforces price, dimensions and name.
- **Storage cleanup and cost.** There is no orphaned-file cleanup, and owners can upload up to 50 MB per file to their own folder.

**Verified as safe:**
- **No self-elevation:**
  - `platform_admins` has no insert/update/delete grant or policy for API roles.
  - `business_members` writes are admin-only.
  - `user_metadata` is never read.
  - `save_product` is SECURITY INVOKER, forces new products to `draft`, can't change `business_id`, `status` or `published_at`, and raises 42501 on foreign products.
- **Transaction safety:** each RPC call is one transaction, so a failing child insert rolls back the product too.

## How the SQL was verified
- **Tool:** PGlite (Postgres compiled to WASM), with stub `auth.uid()` / `auth.users`, a stub `storage` schema and the anon/authenticated/service_role roles.
- **Method:** each case ran under `set local role` with a fake JWT `sub`.
- **Result:** 80/80 passed: the original 55, plus 25 added in the review. The new cases cover forged analytics columns, cross-business file references, `javascript:` URLs, size caps, membership tampering, moving storage objects across folders, the trusted-role trigger exemption, the public-bucket abort, and re-applying on an existing schema.
- **Rollback:** applying, rolling back (0 tables, functions, storage policies or buckets left) and re-applying all succeed.
- **Not covered:** PostgREST, the real Storage API and the Supabase linter. Re-check these on a real project; ideally port the cases to pgTAP (`supabase test db`).

## Still mock-only or missing
- **No admin UI for:** inviting users, managing memberships, or adding platform admins.
- **Activity feed:** derived from timestamps; deletions aren't listed.
- **Search:** name search is filtered in the browser (marked with a `ponytail:` comment in the code).
- **Demo-only features:** demo reset and simulated errors.
- **Business switcher:** a user who belongs to several businesses gets the first one.

## Content Editor additions (ADR-0043, migration `20261029074648_site_content.sql`; written, NOT applied as of 2026-10-29)
- Tables (RLS on, no grants to `anon` or `authenticated`): `site_content` (exactly one row: `draft`, `published`, `published_version`, `draft_updated_at`, who and when) and `site_content_versions` (every published document). Only security-definer functions touch them.
- Functions: `get_published_site_content(p_part, p_slug)` (public, reads only `published`), `admin_get_site_content`, `admin_save_site_content_draft(p_content, p_base)`, `admin_publish_site_content(p_base)`, `admin_list_site_content_versions`, `admin_restore_site_content_version(p_version, p_base)`. The admin ones require the 2FA step (`aal2_required`) then `content.manage` (`forbidden`, both 42501); a stale `p_base` gives `draft_conflict`; bad content gives `invalid_content` with the document path. Private helpers: `require_content_manage`, `validate_site_content`, `validate_apply_form`, `check_site_content_shape`, `content_actor_name`.
- `content.manage` is the 17th permission: the check constraint, `my_platform_access()` (Owner list) and the stored Admin set (backfilled with one `access_permissions_changed` row) are updated. `private.permission_prerequisites()` has no row for it.
- `business_applications`: `country`, `city`, `category` nullable; answers limit 65,536 bytes.
- Audit events: `site_content_published`, `site_content_draft_restored`.
- Rollback: `supabase/rollback/20261029_site_content_rollback.sql`. Tests: `supabase/tests/siteContent.test.ts` (PGlite).

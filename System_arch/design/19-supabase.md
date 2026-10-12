# 19 · Supabase backend (foundation)
Decisions: ADR-0015 (dual mode), ADR-0016 (routes). This file is the setup guide.

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

## 7. Generated types
After the schema is applied:
```
npm run db:types   # npx supabase gen types typescript --project-id <ref> > src/services/supabase/database.types.ts
```
Then replace the hand-written `*Row` interfaces in `supabaseCatalogService.ts` with the generated ones. Until then those interfaces are the only schema contract on the TS side. Don't commit generated types that weren't produced from a real schema.

## Data access map
| Service method | Supabase call | Protected by |
|---|---|---|
| businesses CRUD | `businesses` table | RLS. Only admins insert or delete. Owners update their own business, but a trigger blocks them from changing slug or status. |
| products read | `products` + embedded `product_images`, `product_models`, `product_variants` | RLS: public sees published products of active businesses; members see their own business; admins see everything. |
| create / update / duplicate product | `rpc('save_product')` | Caller's RLS, inside one transaction. |
| publish / unpublish / delete | `products` update or delete | RLS, plus a DB check that published products have a price, dimensions and a name. |
| analytics | `product_analytics_daily` view + `summarize()` | View is security_invoker; RLS lets only members and admins read events. |
| `recordEvent` | insert into `product_analytics` | Public may insert only for published products, with a matching business; no read-back; no personal data stored. |
| `uploadAsset` | Storage upload + public URL or signed URL | Bucket policies (above). |
| sign-in / role | `auth.signInWithPassword`, `auth.getUser`, `platform_admins`, `business_members` | Rows that users cannot write. |

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

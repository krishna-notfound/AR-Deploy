# S4: 3D model requests

**Status:** Built on `s4/integration` (2026-10-26), decisions in ADR-0034; not yet applied to the client project (runbook: "S4 3D model requests"). Owner decisions at the end of this file override the defaults above them.
**Source:** the owner's re-plan of 2026-10-26 (`docs/superpowers/plans/2026-10-26-next-scope.md`, §S4: "Request a 3D model, Admin uploads + notify, Allow own upload switch"). The owner's earlier words are in `System_arch/tasks/P12-team-roles-and-addons.md` (A3, and P13 "3D models (this is A3)"):
> "allow client to upload there own 3d model if this allow it will for for per business default business can request 3d model and cn only wait for 3dmodel should be made vide admin side when 3dmodel down and upload from admin side client get notification that 3dmodel is done can it can be show on catelog side left 3d model part will be hidden only business see upload multiple photo there are should be 2 section first which is show to use in without 3d mode second section will be apply for 3model with upload aleast 2-3page can and can so up as my client can do last 10 this should be a different section business side so admin have full control over 3d models"

**What the words settle (no further question needed):**
- The switch is **per business**. By **default** a business **requests** models and waits; uploading its own files is something the platform allows.
- The platform team makes the model and uploads it in the admin dashboard. The business is **notified** when it is done, and only then does the 3D part show in the catalog.
- Until then the product's 3D part is **hidden**; the product itself still shows with its photos.
- There are **two photo sections**: the catalog photos customers see, and a separate **request** section with **at least 2 and at most 10** photos.
- The platform has **full control over 3D models**.
- From A3: requesting is the **preferred** option; there is **no Meshy or AI-3D integration** (hard rule).

**Working rules:**
- Build on a branch cut from `feature/sanctus-brand-design-system` after S1.5 is merged there. Spec-driven and test-first.
- Build for real Supabase (client dev project `zggylkbgajamhriebdrg`). Demo mode is the test harness: it works with no env vars and follows every new rule in the same requirement (mock services).
- Hard rules that shape every design below:
  - one new migration (`npx supabase migration new model_requests`), with RLS and explicit grants;
  - Supabase only: SQL functions plus one new Edge Function, `verify_jwt` on; no custom server;
  - no new dependency, no `VITE_*` secrets;
  - URLs only in `src/lib/urls.ts`; dashboards English only; customer and owner emails EN/PT;
  - the S1 2FA-gated helpers (`platform_can`, `is_platform_admin`, `is_business_member`, `caller_mfa_satisfied`) are the only access checks, and Edge Functions use `_shared/gate.ts`;
  - AR stays native only (ADR-0021): GLB for the 3D view and Android Scene Viewer, USDZ for iPhone Quick Look. No AR-mode change.
  - shared features are never duplicated: the staff upload reuses `ModelSection` and `validateModelFile`; the request panel is one component used in the shared `ProductEditor`.

## 1. Goal, scope and non-goals

### 1.1 Goal
A business gets 3D models for its products by asking for them, the platform team delivers them, and the platform decides per business whether the business may upload its own files. The database enforces every rule; the UI says what is true at each step.

### 1.2 Scope
19 requirements in 5 workstreams:
- **W1** permission and the allow-own-upload switch (R-S4-1 to R-S4-4);
- **W2** the business request (R-S4-5 to R-S4-9);
- **W3** platform handling and the email (R-S4-10 to R-S4-15);
- **W4** visibility and file integrity (R-S4-16 to R-S4-18);
- **W5** demo parity (R-S4-19).

### 1.3 Non-goals
- **No other S4 ideas** (owner, 2026-10-26: "none of the other S4 ideas"). The audit findings once folded into S4 (PROD-03 unsaved uploads, ANA-03 readiness over finishes, PROD-12 demo upload rules) and the product-editor fixes moved from S1.5 (R-W4-2 to R-W4-7, R-W4-14) are **not** specified here. They stay on S2's "to confirm" list. R-S4-17 builds only the narrow model guard that this feature needs.
- No AI or automatic 3D generation, no GLB→USDZ conversion (hard rules). Staff make the files elsewhere and upload them.
- No cost, credits or billing per request (hard rule). Abuse is limited by the open-request cap (R-S4-6).
- No email to the platform team about new requests (the platform inbox is still a test address; S2 "to confirm"). The admin nav count is the signal (R-S4-10).
- No chat or comments on a request. The business's note and the staff's decline reason are the only text.
- No business-side team roles (ADR-0029). "The business" means its owner.
- No background sweeps or schedulers. File clean-up happens in the browser after the action, as in S1.5.

## 2. Concepts

**Request target.** A request is for a product's own model or for one of its options (finishes), because a finish can have its own GLB/USDZ (`20261020143507_variant_media`). When the switch is off, a request is the only way a business gets a model for a finish too.

**Lifecycle.**

| From | To | Who | How |
|---|---|---|---|
| (none) | `requested` | business owner | `request_model` (R-S4-6) |
| `requested` | `cancelled` | business owner | `cancel_model_request` (R-S4-8) |
| `requested` | `in_progress` | staff with `models.manage` | "Start work", or the first staged file (R-S4-12) |
| `requested`, `in_progress` | `rejected` | staff with `models.manage` | "Decline" with a reason (R-S4-14) |
| `in_progress` | `delivered` | staff with `models.manage` | "Deliver model", needs a staged GLB (R-S4-13) |

`delivered`, `rejected` and `cancelled` are final. After a final state the business can send a new request for the same target. **At most one open request** (`requested` or `in_progress`) exists per target. The UI label for `rejected` is **"Declined"** (A3 wording); the stored value stays `rejected`.

**Hidden until ready.** The public pages show 3D and AR only when the product (or the selected option) has a usable GLB (`variantMedia`, `hasAny3d`), and a model file is publicly readable only when a `product_models` / `product_variant_models` row points at it. Staged files are not such rows. So nothing about a request is visible to customers until delivery writes those rows (R-S4-16).

## 3. W1 Permission and the allow-own-upload switch

**R-S4-1. A new platform permission, `models.manage` ("Handle 3D model requests").**
- **Layer:** migration (check constraint, prerequisites, `my_platform_access`, backfill), `src/domain/permissions.ts`, role editor labels, `invite-member` permission bullets.
- **Why a new key, not `products.edit`:** ADR-0029 says "a permission without a feature doesn't exist; new features add their key to the check constraint". This is a new feature with its own pages and its own data (private request photos). Reusing `products.edit` would give every default Team member the request photos and the deliver/decline emails, and would stop the Owner from giving a 3D artist only this job. ADR-0030 is unaffected: the invitation lists the role's permissions, so the new key just appears in the bullets.
- **Rule:**
  - `platform_role_permissions` check constraint and `ALL_PERMISSIONS` gain `models.manage` (16 keys).
  - Prerequisites (`private.permission_prerequisites()` and `PERMISSION_PREREQUISITES`, pinned to each other by the existing PGlite test): `models.manage` → `products.view`, `businesses.view` (the queue shows product and business names, and the detail links to both).
  - `my_platform_access()` returns the fixed list of **16** keys for an Owner (R-W1-6 updated).
  - Defaults: Admin has all 16; Team keeps its 5 (no `models.manage`).
  - Backfill: `models.manage` is added to the stored **Admin** set, with an `access_role_permissions_changed` audit row (`metadata.reason = 'model_requests_backfill'`). Team's set is not changed. The pre-flight shows both sets (§10.1).
- **Acceptance:**
  - PGlite: a Team member with only `models.manage` (plus its prerequisites, added on save) can call the staff functions in §8.1; a Team member without it gets `forbidden` (42501) from each; an Admin without a verified 2FA step, when 2FA applies, gets `aal2_required`.
  - The Owner's `permissions` length is 16 after Admin's and Team's sets are narrowed to `{}`.
  - The role editor shows "Handle 3D model requests" with "Includes: View businesses, View products".

**R-S4-2. Each business has an "allow own 3D upload" switch that only the platform sets.**
- **Layer:** migration (column, guard, function, audit), service, admin UI (business detail), business UI (read-only).
- **Rule:**
  - `businesses.allow_own_models boolean not null default false`. New businesses start with the switch **off** (the owner's "default business can request").
  - Backfill: `true` for every business that already has at least one `product_models` or `product_variant_models` row, so no business loses a capability it is using today; `false` for the rest. The pre-flight lists both groups (§10.1).
  - The column is changed only by `admin_set_own_models(p_business uuid, p_allow boolean)` (security definer, gated by `platform_can('models.manage')`). It sets `app.own_models = 'on'` for the update and writes `business_own_models_changed` with `{from, to}`.
  - A direct API update of the column is refused, for everyone: a `BEFORE UPDATE OF allow_own_models` trigger raises `own_models_admin_only` (42501) for `anon`/`authenticated` unless `app.own_models = 'on'`. Business owners were already refused by `guard_business_admin_fields` (the column is not in its owner list); the trigger also routes staff through the audited function.
  - Turning the switch off **keeps** the business's existing 3D files on its products and on its public pages. From then on only staff can add, replace or remove them (R-S4-3).
- **Admin UI:** the business detail page gets a "3D models" card, visible with `businesses.view`:
  - a switch "Can upload its own 3D files" with the hint for its state (§9.1), editable only with `models.manage` (read-only text otherwise, no dead control);
  - turning it off asks first (§9.1);
  - the card also shows the number of open requests for this business, linking to the queue filtered to it (`modelRequestsAdminPath({ businessId })`).
- **Business UI:** no switch. The product editor reflects the state (R-S4-4).
- **Acceptance:**
  - PGlite: an owner PATCHing `allow_own_models` → 42501; an Admin PATCHing it directly → `own_models_admin_only`; `admin_set_own_models` as Admin with `models.manage` → changed plus one audit row; as Team without the key → `forbidden`.
  - Backfill: a business with a variant GLB only gets `true`; a business with photos only gets `false`.
  - Component: the card shows the switch with `models.manage`, the read-only line without it, and loading, error and saved states.

**R-S4-3. When the switch is off, the database refuses 3D writes by the business.**
- **Layer:** migration (helper, triggers, `save_product`, storage policy), service.
- **Rule:**
  - `public.can_write_own_models(p_business uuid) → boolean` (security definer, `stable`, execute to `authenticated`): true when `is_platform_admin()`, or `platform_can('products.edit')`, or `platform_can('models.manage')`, or (`is_business_member(p_business)` and the business's `allow_own_models`), or `app.model_delivery = 'on'` (set only inside `admin_deliver_model_request`). It lives in `public` because policies run as the caller, who has no `USAGE` on `private` (ADR-0029).
  - `private.guard_own_models` (`BEFORE INSERT OR UPDATE OR DELETE` on `product_models` and `product_variant_models`), for `current_user in ('anon','authenticated')`: when `can_write_own_models(business of the row's product)` is false it raises `own_models_not_allowed` (42501). Exception: a `DELETE` with `pg_trigger_depth() > 1` passes. That is the foreign-key cascade when a product or an option is deleted, which stays allowed.
  - `save_product` (redefined, same signature, grants restated): it compares the payload's model sets with the stored ones, for the product and for each kept option. When they are equal, or when `p_product.keep_models = true`, it **does not touch** any model row. Otherwise it replaces them as today, and the trigger decides. A business with the switch off can still save photos, text, prices and options, and can delete options; it cannot add, replace or remove a GLB or USDZ (uploaded or by URL).
  - Storage: "Members and admins upload media" on `product-media` is recreated so that an object whose name ends in `.glb` or `.usdz` also needs `can_write_own_models(folder business)`. "Members and admins update media" gets the same term. Images are unchanged.
  - Staff keep full control: with `products.edit` they still upload 3D files directly in the shared product editor, whatever the switch says.
- **Acceptance (PGlite):**
  - Switch off, owner: `save_product` with an extra `glb` row → `own_models_not_allowed`, and nothing is written; with the stored models unchanged (or `keep_models`) and a new name → saved; deleting an option that has a delivered GLB → allowed (cascade).
  - Switch off, owner: a direct `insert into product_models` → 42501; a storage insert of `{business}/{uuid}.glb` → refused; of `{business}/{uuid}.png` → allowed.
  - Switch on, owner: all three allowed. Admin with `products.edit`, switch off: allowed.
  - Mixed versions: an old frontend that resends unchanged models saves fine.

**R-S4-4. The product editor shows the own-upload controls only when they are allowed.**
- **Layer:** UI (`ProductEditorForm`, `ModelSection`, `VariantsEditor`), service (`Business.allowOwnModels`).
- **Rule:**
  - Business owner, switch **on**: the 3D section has two choices, **"Request from Sanctus (recommended)"** first and **"Upload your own"** second (the existing `Segmented` control). The request choice shows the request panel (R-S4-7). The upload choice shows `ModelSection` as today.
  - Business owner, switch **off**: no upload, URL or remove controls on the product or on any option. Existing files are shown read-only ("Current 3D files, managed by the Sanctus team") with the readiness lines; the request panel follows. The service sends `keep_models: true`.
  - Staff (admin product editor): `ModelSection` as today, plus a read-only line with the target's open request and a link to it (with `models.manage`). Staff never see the business's request form.
- **Acceptance (component):** owner + off → no file input with `accept=".glb"` or `".usdz"` anywhere in the editor, and the "managed by the Sanctus team" line; owner + on → both choices, request first; Admin → upload controls whatever the switch says.

## 4. W2 The business request

**R-S4-5. Request photos are a separate, private set.**
- **Layer:** migration (bucket, policies), `src/lib/files.ts`, service.
- **Rule:**
  - New private bucket `model-request-photos`: `file_size_limit` 10 MB, `allowed_mime_types` `image/jpeg`, `image/png`, `image/webp`. The migration refuses to continue if the bucket exists and is public (same guard as `product-media`).
  - Path: `{business_id}/{request_id}/{uuid}.{jpg|jpeg|png|webp}`.
  - `REQUEST_PHOTO_RULES` in `files.ts`: those types, 10 MB each, checked by `validateImageFile` before upload. No downscaling: the modeller needs the originals. Photos under 1000 px on the long side get a warning, not a refusal. HEIC is not accepted; iPhone Safari converts to JPEG when the file input accepts `image/jpeg`.
  - Policies on `storage.objects` for this bucket:
    - **insert** (authenticated): `is_business_member(folder[1])`, `folder[2]` is a uuid, and no `model_requests` row has that id yet (photos can't be added to a sent request);
    - **select:** `is_business_member(folder[1])`, or `platform_can('models.manage')`;
    - **delete:** `is_business_member(folder[1])` when no request with id `folder[2]` exists or it is `cancelled`; or `platform_can('businesses.delete')` / `platform_can('products.delete')` (clean-up, R-S4-18);
    - no update policy.
  - Catalog photos are unchanged. Request photos are never shown on public pages, never copied into the gallery, and never readable by `anon`.
- **Acceptance (PGlite + storage policy tests):** anon can't read a request photo; a member of another business can't read or write one; a Team member with only `products.view` can't read it; `models.manage` can; a member can't add a photo under the id of a request already sent.

**R-S4-6. A request is sent in one call that checks every rule.**
- **Layer:** migration (tables, `request_model`), service.
- **Rule:** `request_model(p_request_id uuid, p_product uuid, p_variant uuid, p_note text, p_photos jsonb) → jsonb` (security definer, execute to `authenticated`). Checks, in order:
  1. the caller `is_business_member` of the product's business (else `forbidden`, 42501);
  2. the option, when given, belongs to the product (`model_request_target_invalid`, 22023);
  3. the product's width, height and depth are all > 0 (`model_request_needs_dimensions`, 22023): the model is made to that size, and the AR scale check needs it;
  4. no open request exists for the target (`model_request_open`, 23505, backed by a partial unique index);
  5. the business has fewer than 25 open requests (`model_request_limit`, P0001);
  6. `p_photos` has 2 to 10 entries (`model_request_photos_count`, 22023). Each has the path shape of R-S4-5 with this business and `p_request_id`, and the object exists in `storage.objects` (`model_request_photo_missing`, 22023);
  7. `p_note` is at most 1000 characters.
- It inserts the request (`requested`, `requested_by = auth.uid()`) and its photo rows, and writes `model_request_created`. It returns `{id, status}`.
- **Client flow (upload on send, so an abandoned form leaves no files):** photos are picked and previewed locally. On **Send request** the service makes `p_request_id`, uploads the photos (progress per photo), then calls `request_model`. If the call fails, it deletes the uploaded photos and shows the mapped error. A tab closed mid-send can leave files under an unused request id; that is documented (no sweeps, §1.3).
- **Acceptance (PGlite):** 1 photo → `model_request_photos_count`; 11 → same; a path in another business's folder → `model_request_photo_missing`; a second open request for the same target → `model_request_open`; the same product with a different option → allowed; the 26th open request → `model_request_limit`; a product with depth 0 → `model_request_needs_dimensions`; a staff caller → `forbidden`.

**R-S4-7. The product editor has a "Request a 3D model" panel with every state.**
- **Layer:** UI (`ModelRequestPanel`, one shared component in `src/features/products/editor`), service, hooks.
- **Rule:**
  - **New, unsaved product:** "Save this product first, then request its 3D model." with a working **Save draft** button.
  - **Dimensions missing:** the form is shown, and Send is replaced by the dimensions line linking to the fields (§9.1).
  - **No open request:** the form: "Model for" (the product, or one of its saved options; options shown only when the product has any), the photo picker (2 to 10, thumbnails, remove, count line, the tips), "Notes for the Sanctus team" (optional, 1000 characters), **Send request**. Send is enabled only with 2 to 10 valid photos; the reason is shown next to it otherwise.
  - **Sending:** per-photo progress, the button busy, the form locked.
  - **Open, final and history states** (per target): status badge, date, and the actions of §9.1. The latest request per target shows; older ones are under "Earlier requests (n)".
  - **Loading:** a skeleton. **Error:** "Couldn't load 3D model requests." with Retry. It never falls back to sample data.
  - Status refreshes on window focus (`useRefreshWhenStale`). A request that becomes `delivered` while the editor is open shows "Ready. Reload to see the 3D model in this editor." with a **Reload** button (R-S4-17).
- **Acceptance (component):** each state above renders; Send stays disabled with 1 photo and with an 11th rejected by the picker; a 12 MB photo shows the size message; a `.gif` shows the type message; a service error shows the mapped copy and keeps the picked photos.

**R-S4-8. The business can cancel a request until work starts.**
- **Layer:** migration (`cancel_model_request`), service, UI.
- **Rule:** `cancel_model_request(p_request uuid) → jsonb` (definer, members): only `requested` → `cancelled` (`closed_at`, audit `model_request_cancelled`). Otherwise `model_request_not_cancellable` (P0001). It returns the photo paths; the service then deletes them (the delete policy allows it once the request is `cancelled`).
- In progress, the panel shows "The Sanctus team has started on this model. To stop it, contact the Sanctus team." and no Cancel button.
- **Acceptance:** cancel when `requested` → `cancelled`, photos removed from storage; cancel when `in_progress` → `model_request_not_cancellable`, nothing changed; a member of another business → `forbidden`.

**R-S4-9. The business sees request status in its product list.**
- **Layer:** UI (`ProductTable`, `ProductFilters`), service, `urls.ts`.
- **Rule:**
  - Next to the AR readiness label, a product with an open request shows a badge "3D requested" or "3D in progress"; a product whose latest request was declined shows "3D declined" until a new request or a model exists.
  - A filter "3D requests: open" is added; `myProductsPath({ model: 'open' })` builds its URL.
  - The AR readiness labels themselves are unchanged ("Photos only" stays true until delivery).
- **Acceptance:** component tests for the three badges and the filter; the URL helper has a unit test.

## 5. W3 Platform handling and the email

**R-S4-10. Staff have a "3D requests" queue.**
- **Layer:** UI (`/admin/model-requests`, `ModelRequestsPage`), router, nav, `urls.ts` (`modelRequestsAdminPath({ status?, businessId? })`, `modelRequestAdminPath(id)`), service.
- **Rule:**
  - The nav item "3D requests" shows with `models.manage`, with a count of `requested` rows (the number waiting for someone to start). The route is guarded by the same permission, and the database is the real boundary.
  - Tabs: **Open** (default: `requested` and `in_progress`, oldest first), **Delivered**, **Declined**, **Cancelled**, **All** (newest first). An optional business filter comes from the business card (R-S4-2).
  - Columns: product (first catalog photo and name), business, target ("Product" or the option name), photos (count), requested (date and age), status. At 390 px the rows become cards with the same fields.
  - Loading skeleton, empty state per tab (§9.1), error with Retry. Paged by 50 like Applications.
  - Reads are plain selects under RLS (§8.2); the prerequisites of R-S4-1 make the product and business names readable.
- **Acceptance:** a Team member without `models.manage` sees no nav item and gets the no-access view on the URL; an Admin sees the seeded rows by tab; each state renders (component); e2e at 1440 and 390.

**R-S4-11. The request detail shows the photos and everything needed to make the model.**
- **Layer:** UI (`/admin/model-requests/:id`, `ModelRequestDetailPage`), service.
- **Rule:**
  - Header: product name (linking to the admin product editor), business (linking to the business detail), target, status badge, requested by and on.
  - **Photos (n):** a grid of thumbnails from signed URLs (1 hour). Selecting one opens a viewer with previous/next (arrow keys), Esc to close, focus returned to the thumbnail, the file name and size, and **Download original** (`src/lib/download.ts`). A photo that fails to load shows "This photo couldn't be loaded." with Retry, not a broken image.
  - **Product facts:** width, height and depth with the unit, material, category, the business's note, the product's current 3D files and their readiness.
  - **Model files:** R-S4-12. **History:** the request's audit events (created, started, files staged, delivered or declined, cancelled) with actor labels.
  - Loading, not-found ("This request doesn't exist or was removed with its product.") and error states.
- **Acceptance (component):** the viewer opens, moves with arrow keys, closes with Esc and returns focus; a failed photo shows the retry state; not-found renders for a deleted product's request.

**R-S4-12. Staff upload the GLB and the USDZ with the existing model checks.**
- **Layer:** migration (`model_request_files`, `admin_start_model_request`, `admin_stage_model_file`, `admin_unstage_model_file`, storage policies), UI (reuses `ModelSection`), service.
- **Rule:**
  - **Start work:** `admin_start_model_request(p_request)` → `in_progress` (`started_at`, `handled_by`, audit `model_request_started`). Only from `requested` (else `invalid_transition`, 22023).
  - **Upload:** the detail page renders the shared `ModelSection` with `context="request"`, the product's dimensions and first photo as poster. Every existing check applies unchanged: `validateModelFile` (extension, 50 MB, GLB header and chunks, USDZ zip layout), the Scene Viewer extension warning (`readRequiredExtensions`), the optional optimisation, the 3D preview and the scale check against the product's dimensions. Remote URLs are not offered in this context: delivered files are always stored uploads.
  - The file goes to `product-media` at `{business_id}/{uuid}.{glb|usdz}`, the shape the model tables already require. A new storage policy "Model staff upload models" allows insert there with `platform_can('models.manage')` for `.glb`/`.usdz` names only; "Platform members delete media" is recreated to also allow `models.manage` for `.glb`/`.usdz` names.
  - **Stage:** `admin_stage_model_file(p_request, p_format, p_storage_path, p_file_name, p_size_bytes, p_required_extensions)`: status `requested` or `in_progress` (a `requested` request moves to `in_progress`); the path matches `^{business_id}/{uuid}\.{format}$` and exists; upsert by `(request_id, format)`. It returns the replaced path, which the service deletes. **Unstage** (`admin_unstage_model_file`) removes the row and returns the path.
  - Staged files are not product files: they are not in `product_models`, so the public storage policies never serve them.
  - The scale check result is shown but not stored on the request. AR scale is marked verified only where the editor already does it (hard rule).
- **Acceptance:** PGlite for start, stage (wrong business folder, wrong extension, missing object, replace returns the old path), unstage and the transitions; component test that the request context hides the URL input and shows the scale check; storage policy test that `models.manage` can upload `.glb` but not `.png` through the new policy.

**R-S4-13. Delivering attaches the files to the product in one transaction.**
- **Layer:** migration (`admin_deliver_model_request`), Edge Function (R-S4-15), UI.
- **Rule:** `admin_deliver_model_request(p_request uuid) → jsonb` (definer, `platform_can('models.manage')`):
  - locks the request; status must be `in_progress` (`invalid_transition`); a staged `glb` must exist (`model_request_needs_glb`, 22023). A staged `usdz` is optional.
  - sets `app.model_delivery = 'on'` and **replaces the target's whole model set** with the staged files: the product's `product_models`, or the option's `product_variant_models`. The staged `required_extensions` are copied. A format that is not staged is removed from the target, so a GLB never pairs with an older USDZ of another model (the rule `variantMedia` already follows).
  - sets `products.models_changed_at = now()` (R-S4-17) and `updated_at`;
  - marks the request `delivered` (`delivered_at`, `handled_by`, `closed_at`), deletes its `model_request_files` rows, writes `model_request_delivered` with `{format list, target}`;
  - returns `{status:'delivered', replaced_paths:[…], product_status}`. The service deletes `replaced_paths` from `product-media` after success and reports a partial clean-up the S1.5 way.
- The deliver dialog (§9.1) says what is replaced, and warns when there is no USDZ.
- **Acceptance (PGlite):** deliver with GLB only → the target has a GLB, its old USDZ row is gone and its path is in `replaced_paths`; deliver with both → both rows; deliver from `requested` → `invalid_transition`; without a GLB → `model_request_needs_glb`; the trigger of R-S4-3 doesn't block delivery for a business whose switch is off; anon reads the GLB object after delivery for a published product of an active business, and not before.

**R-S4-14. Staff can decline a request with a reason.**
- **Layer:** migration (`admin_reject_model_request`), Edge Function, UI.
- **Rule:** `admin_reject_model_request(p_request uuid, p_reason text) → jsonb`: from `requested` or `in_progress`; reason trimmed 1 to 1000 characters (`reason_required`, 22023); sets `rejected`, `reason`, `closed_at`, `handled_by`; deletes the staged rows and returns their paths for clean-up; audit `model_request_rejected` (the reason is not copied into the audit metadata, only `has_reason: true`). The reason is always sent to the business: it tells them what to fix (for example darker photos), and the dialog says so.
- **Acceptance (PGlite):** empty reason → `reason_required`; from `delivered` → `invalid_transition`; staged paths are returned and the rows are gone.

**R-S4-15. Deliver and decline go through one Edge Function that emails the business.**
- **Layer:** new Edge Function `review-model-request` (`handler.ts` + `index.ts`), `_shared/email.ts` (kind), `_shared/email-templates.ts`, `supabase/config.toml`.
- **Rule:**
  - `POST {requestId, action:'start'|'deliver'|'reject', reason?}` → `{ok:true, status, replacedPaths?, email?:{status, error?}}`.
  - It builds the caller client from the anon key plus the caller's `Authorization` header and calls `gateCaller(rpc, { permission: 'models.manage' })`, so `aal2_required` and `forbidden` come first (R-W1-1 pattern). It then calls the SQL function **as the caller**, so the audit actor and the database checks are the caller's.
  - For `deliver` and `reject` it emails the business owner with `sendAndLog`: kind `model_request_update`, `businessId`, workflow `model_request:<id>:<delivered|rejected>`. A workflow that already has an `email_log` row is not sent again, so a retry sends one email. Language: the source application's language, else `en` (the `notify-business-owner` rule). No owner → `email:{status:'skipped'}`.
  - An email failure never rolls back the status change: the response carries `email.status = 'failed'` and the toast says so (§9.1). `start` sends nothing.
  - Errors: `aal2_required`/`forbidden` 403; `invalid_transition`, `reason_required`, `model_request_needs_glb` 422; `model_request_not_found` 404; anything else 500 `unknown` with no secrets in logs.
  - A direct call of the SQL function (bypassing the function) still works and sends no email. This matches `admin_review_application` in S1.5 and is documented.
- **Acceptance (handler tests, injected):** each action; `aal2_required` before `forbidden`; deliver for a published and for a draft product picks the right body; EN and PT; the dedupe skips a second send; email failure keeps the status; no owner → skipped.

## 6. W4 Visibility and file integrity

**R-S4-16. "3D hidden until ready": what customers, publishing and readiness see.**
- **Layer:** none new in SQL beyond R-S4-13; public pages unchanged in behaviour; tests.
- **Rule:**
  - **Publishing:** a product with an open request can be published. The rule stays "at least one gallery image; a model is optional" (`publish_rules`, LIVE L4). Customers then see it **photo-only**: no 3D viewer, no AR button, and no mention of a coming model.
  - **Public pages:** they read only product and option model rows. Request rows, request photos and staged files are not readable by `anon` (RLS and storage), so nothing leaks.
  - **On delivery:** a published product of an active business shows 3D at once. Its signed URLs come from the normal product read (12 h). A draft product shows 3D in preview.
  - **Readiness:** the editor's `arReadiness` and the list's `productArReadiness` read the product's files, so they change from "Photos only" to "AR ready" (GLB and USDZ) or "Android only" (GLB only) at delivery. ANA-03 is not changed here (§1.3).
- **Acceptance (e2e, demo):** a published product with an open request has no "View in 3D" / AR control on its public page; after delivery the same page shows them; the business Overview's "with 3D" count goes up by one.

**R-S4-17. A delivery is never undone by an editor that was open before it.**
- **Layer:** migration (`products.models_changed_at`, `save_product`), service, UI.
- **Rule:**
  - `products.models_changed_at timestamptz` is set by delivery and by any `save_product` that changes model rows.
  - The editor sends the `models_changed_at` it loaded as `p_product.expected_models_changed_at`. When `save_product` would change model rows and the stored value is newer, it raises `models_changed_elsewhere` (P0001) and writes nothing. With `keep_models` or unchanged models, the check is skipped, so a business with the switch off is never blocked by it.
  - This is the models-only part of the stale-save problem. The general R-W4-2 stays out of scope (§1.3); if it ships later, it supersedes this check.
- **Acceptance (PGlite + e2e with two contexts):** the owner (switch on) opens the editor, staff deliver, the owner saves with a changed model → `models_changed_elsewhere` and the delivered files are kept; the owner saves without touching the 3D section → saved, and the delivered files are kept.

**R-S4-18. Request files are cleaned up with their product, business and request.**
- **Layer:** migration (`model_request_storage_paths`), service (product delete, business delete), `account-security` (closure sweep).
- **Rule:**
  - `model_request_storage_paths(p_product uuid) → jsonb` (definer): the request photo paths and staged model paths of the product, for a caller who can delete it (`is_business_member` or `platform_can('products.delete')`). The product delete reads it before the row delete and removes the files after, reporting a partial clean-up like S1.5.
  - Deleting a business (staff) and the closure sweep in `account-security` also remove the business's folder in `model-request-photos`.
  - Request photos are otherwise **kept** after a request ends (delivered or declined), so the team can revise a model. Cancelling deletes them (R-S4-8).
  - Rows cascade: product delete → requests → photos and staged rows; option delete → that option's requests.
- **Acceptance:** PGlite for the path function's gate; service test that a product delete calls storage remove with the request paths; handler test that the closure sweep lists both buckets.

## 7. W5 Demo parity

**R-S4-19. Demo mode follows every rule, and says what it does not do.**
- **Layer:** `services/mock` (store, seed, `mockCatalogService`), UI labels.
- **Rule:**
  - The mock service implements every new method with the same checks and error keys: 2 to 10 photos, types and 10 MB, dimensions, one open request per target, the 25 cap, transitions, `models.manage`, the switch (refusing model changes on save and on `uploadAsset` for `glb`/`usdz` with `own_models_not_allowed`), the delivery replace rule and `models_changed_elsewhere`.
  - Request photos picked in demo are **session-only** object URLs (localStorage can't hold ten originals; ADR-0007). The panel and the detail page label them: "Demo: these photos are kept only until you reload." Seeded requests use the sample product photos, labelled "Sample photos".
  - Staged and delivered models in demo are session-only, as demo 3D uploads already are, and labelled the same way.
  - No email is sent in demo: the deliver and decline toasts say "Demo: no email was sent."
  - Seed: the demo business has one request in each of `requested`, `in_progress`, `delivered` and `rejected`; one demo business has the switch off and one has it on.
  - `resetDemoData` restores them.
- **Acceptance:** the mock service tests mirror the PGlite cases by key; the e2e journey of §11 runs in demo.

## 8. Data model

### 8.1 One migration
`supabase/migrations/<timestamp>_model_requests.sql`, created with `npx supabase migration new model_requests`. Rollback: `supabase/rollback/20261026_model_requests_rollback.sql` (§10.3).

**Tables**

| Table | Columns | RLS and grants |
|---|---|---|
| `public.model_requests` | `id uuid pk` (client-made, checked unused), `business_id uuid not null → businesses on delete cascade`, `product_id uuid not null`, `variant_id uuid null`, FK `(product_id, business_id) → products (id, business_id) on delete cascade`, FK `(variant_id, product_id) → product_variants (id, product_id) on delete cascade`, `status text not null default 'requested' check in ('requested','in_progress','delivered','rejected','cancelled')`, `note text check (char_length(note) <= 1000)`, `reason text check (char_length(reason) <= 1000)`, `requested_by uuid → auth.users on delete set null`, `handled_by uuid → auth.users on delete set null`, `created_at`, `updated_at`, `started_at`, `delivered_at`, `closed_at` (timestamptz). Checks: `status <> 'rejected' or char_length(btrim(reason)) > 0`; `(status in ('delivered','rejected','cancelled')) = (closed_at is not null)`. Indexes: partial unique `(product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'))` where `status in ('requested','in_progress')`; `(status, created_at)`; `(business_id, status)`. `set_updated_at` trigger. | RLS on. Revoke all from public, anon, authenticated; `grant select to authenticated`; all to service_role. Policy "Members and model staff read requests": `is_business_member(business_id) or platform_can('models.manage')`. No API writes: every change goes through the definer functions. |
| `public.model_request_photos` | `request_id → model_requests on delete cascade`, `storage_path text not null` (shape of R-S4-5, ≤ 512), `file_name text not null` (≤ 255), `size_bytes bigint check (between 1 and 10485760)`, `sort_order int check (between 0 and 9)`, `pk (request_id, storage_path)` | Same grants. Policy: the parent request is readable (subquery under RLS). |
| `public.model_request_files` | `request_id → model_requests on delete cascade`, `format text check in ('glb','usdz')`, `storage_path`, `file_name`, `size_bytes`, `required_extensions text[]` (same checks as `product_models`), `uploaded_by → auth.users on delete set null`, `created_at`, `pk (request_id, format)` | Same grants. Policy: `platform_can('models.manage')` only. The business never reads staged files. |

**Columns**
- `businesses.allow_own_models boolean not null default false` (backfill in R-S4-2).
- `products.models_changed_at timestamptz` (null until the first model change after the migration).

**Functions** (security definer unless noted, `set search_path = ''`, `revoke … from public, anon`, explicit grants)

| Function | Grant | Purpose |
|---|---|---|
| `can_write_own_models(uuid) → boolean` (`stable`) | authenticated | R-S4-3 |
| `admin_set_own_models(uuid, boolean) → jsonb` | authenticated | R-S4-2 |
| `request_model(uuid, uuid, uuid, text, jsonb) → jsonb` | authenticated | R-S4-6 |
| `cancel_model_request(uuid) → jsonb` | authenticated | R-S4-8 |
| `admin_start_model_request(uuid) → jsonb` | authenticated | R-S4-12 |
| `admin_stage_model_file(uuid, text, text, text, bigint, text[]) → jsonb` | authenticated | R-S4-12 |
| `admin_unstage_model_file(uuid, text) → jsonb` | authenticated | R-S4-12 |
| `admin_deliver_model_request(uuid) → jsonb` | authenticated | R-S4-13 |
| `admin_reject_model_request(uuid, text) → jsonb` | authenticated | R-S4-14 |
| `model_request_storage_paths(uuid) → jsonb` | authenticated | R-S4-18 |
| Private triggers: `guard_own_models` (on `product_models`, `product_variant_models`), `guard_own_models_flag` (on `businesses`) | none (execute revoked from public, anon, authenticated) | R-S4-2, R-S4-3 |

Every `admin_*` function checks `platform_can('models.manage')` (2FA-gated) first; `request_model` and `cancel_model_request` check `is_business_member` (2FA-gated). None re-implements a check.

**Redefined:** `save_product` (R-S4-3, R-S4-17; same signature, grants restated), `my_platform_access` (16 keys), `private.permission_prerequisites`, and the `platform_role_permissions` check constraint.

**Storage**
- New bucket `model-request-photos` and its policies (R-S4-5).
- Recreated: "Members and admins upload media" and "Members and admins update media" (R-S4-3), "Platform members delete media" (adds `models.manage` for `.glb`/`.usdz`).
- New: "Model staff upload models" (R-S4-12).

**Policies elsewhere:** "Business owners read platform changes to their business" (S1.5 R-W7-2) adds `model_request_delivered`, `model_request_rejected` and `business_own_models_changed` to its list, so the owner's "Changes by the platform team" card shows them.

### 8.2 Who reads what

| Data | Business owner | Staff with `models.manage` | Other staff | anon |
|---|---|---|---|---|
| `model_requests` of a business | own business | all | none | none |
| request photos (rows and objects) | own business | all | none | none |
| staged files (`model_request_files`) | none | all | none | none |
| staged objects in `product-media` | readable through the existing folder policy if listed (accepted, §10.4) | yes | with `products.view` | no |
| delivered files | as today | as today | as today | published product of an active business |
| `allow_own_models` | own business (read) | read, change via function | read with `businesses.view` | no |

### 8.3 Error keys (mapped in `DB_RULES`)

| Key | Code | Copy |
|---|---|---|
| `own_models_not_allowed` | 42501 | "3D files for this business are made by the Sanctus team. Request a 3D model instead." |
| `own_models_admin_only` | 42501 | "Only the Sanctus team can change this setting, from the business page." |
| `model_request_open` | 23505 | "This product already has an open 3D model request." (with an option: "This option already has…") |
| `model_request_limit` | P0001 | "Your business has 25 open 3D model requests. Wait for some to be finished, or cancel one." |
| `model_request_photos_count` | 22023 | "Add 2 to 10 photos." |
| `model_request_photo_missing` | 22023 | "A photo didn't finish uploading. Remove it and add it again." |
| `model_request_needs_dimensions` | 22023 | "Add the product's width, height and depth first. The 3D model is made to that size." |
| `model_request_target_invalid` | 22023 | "That option no longer exists. Reload and choose again." |
| `model_request_not_cancellable` | P0001 | "The Sanctus team has started on this model. To stop it, contact the Sanctus team." |
| `model_request_needs_glb` | 22023 | "Upload the GLB file before delivering. It is needed for the 3D view and Android AR." |
| `models_changed_elsewhere` | P0001 | "The Sanctus team delivered a 3D model while you were editing. Reload to see it." |
| `invalid_transition` | 22023 | "This request has changed. Reload to see its current status." |
| `reason_required` | 22023 | "Write a reason. It is sent to the business." |
| `model_request_not_found` | P0002 | "This request doesn't exist or was removed with its product." |

### 8.4 Edge Function
| Function | `verify_jwt` | Input → output |
|---|---|---|
| **`review-model-request`** (new) | true | R-S4-15. Secrets: the existing email set. No new secret. |
| `account-security` | true (unchanged) | the closure sweep also removes the `model-request-photos` folder (R-S4-18) |

`supabase/config.toml` gets `[functions.review-model-request]` with `verify_jwt = true`.

### 8.5 Email kind and audit types
- `email_log_kind_check` = the existing 12 + **`model_request_update`** (also added to `EmailKind`).
- `audit_events_event_type_check`: no change (regex). New types: `model_request_created`, `model_request_cancelled`, `model_request_started`, `model_request_delivered`, `model_request_rejected`, `business_own_models_changed`. Staging a file is not audited separately (it shows in the request's own rows); delivery lists the formats. Each new type gets a label in `labels.tsx`.

### 8.6 Service interface (both implementations)
- `getModelRequests(query: { productId?; businessId?; status?: ModelRequestStatus[]; page? }) → Page<ModelRequest>`
- `getModelRequest(id) → ModelRequestDetail` (with photo signed URLs, and staged files for staff)
- `requestModel(input: { productId; variantId?; note?; photos: File[] }, onProgress?) → ModelRequest`
- `cancelModelRequest(id)`, `startModelRequest(id)`, `stageModelFile(id, format, file)`, `unstageModelFile(id, format)`
- `deliverModelRequest(id) → { status; email; cleanup? }`, `rejectModelRequest(id, reason) → { status; email; cleanup? }`
- `setBusinessOwnModels(businessId, allow)`
- `Business.allowOwnModels`, `Product.modelsChangedAt`, and the open-request summary on product list rows.

Components use these only through `src/services` and hooks (hard rule).

## 9. Copy

### 9.1 Dashboards (English only)
**Product editor (business owner)**
- Choice (switch on): "Request from Sanctus (recommended)" / "Upload your own".
- Switch off, above existing files: "Current 3D files, managed by the Sanctus team". With none: "3D models for your products are made by the Sanctus team. Request one below."
- Panel title: "Request a 3D model". Intro: "Send us 2 to 10 photos of this product, and the Sanctus team makes its 3D model. Customers see the 3D view and AR once the model is ready. Until then the product shows its photos only."
- Tips: "Photograph the product from the front, the back, both sides and at an angle, plus close-ups of the material. Use even light and keep people out of the photos. JPG, PNG or WebP, up to 10 MB each. Only the Sanctus team sees these photos; they are not added to your catalog."
- "Model for": "The product" / {option name}. Notes: "Notes for the Sanctus team (optional)", placeholder "For example: the legs are oak and the cushion is removable."
- Count: "{n} of 10 photos · add at least 2". Low-resolution warning: "{file} is small ({w}×{h}). A larger photo gives a better model."
- Buttons: "Send request", "Cancel request", "Send a new request", "Save draft", "Reload".
- Unsaved: "Save this product first, then request its 3D model." Dimensions: "Add width, height and depth above first. The model is made to that size."
- Status lines:
  - Requested: "Requested on {date}. The Sanctus team will start on it soon."
  - In progress: "In progress since {date}. We'll email you when it's ready."
  - Ready: "Ready since {date}. The 3D model is attached to {the product | {option}}."
  - Declined: "Declined on {date}. Reason: {reason}"
  - Cancelled: "Cancelled on {date}."
- Toasts: "Request sent. We'll email you when the model is ready." / "Request cancelled."
- Badges in the list: "3D requested", "3D in progress", "3D declined". Filter: "3D requests: open".

**Admin**
- Nav: "3D requests". Page title: "3D model requests". Tabs: Open, Delivered, Declined, Cancelled, All.
- Empty: Open "No open requests. New requests from businesses appear here."; other tabs "No {tab} requests."; error "Couldn't load 3D model requests." + Retry.
- Detail sections: "Photos ({n})", "Product facts", "Model files", "History". Actions: "Start work", "Deliver model", "Decline".
- Deliver dialog: title "Deliver the 3D model for {productName}?"; body "These files replace the current 3D files of {the product | the option {option}}. If the product is published, customers see the 3D view and AR right away. The business owner is emailed." Without a USDZ, add: "There's no USDZ file. iPhone AR then depends on the phone converting the GLB, which isn't guaranteed." Buttons "Deliver model" / "Cancel".
- Decline dialog: title "Decline this request?"; field "Reason (sent to the business)"; hint "For example: the photos are too dark. Please send a new request with photos taken in daylight."; buttons "Decline request" / "Cancel".
- Toasts: "Model delivered. The business owner was emailed." / "Model delivered, but the email was not sent: {reason}." / "Request declined. The business owner was emailed." / "Request declined, but the email was not sent: {reason}." / "Work started." Demo suffix: "Demo: no email was sent."
- Business card "3D models": switch "Can upload its own 3D files". Hint on: "The business can upload its own GLB and USDZ files, and can still request models." Hint off: "The business requests 3D models from the Sanctus team and can't add, replace or remove 3D files itself." Read-only line without `models.manage`: "Own 3D uploads: {allowed | not allowed}. Changing this needs 'Handle 3D model requests'."
- Turn-off confirmation: title "Stop {businessName} uploading its own 3D files?"; body "Its current 3D files stay on its products and public pages. From now on only the Sanctus team can change them, and the business requests new models."; buttons "Turn off" / "Cancel".
- Role editor: "Handle 3D model requests"; hint "See request photos, upload models, and deliver or decline requests. Also changes whether a business may upload its own 3D files."
- Audit labels: "3D model requested", "3D model request cancelled", "3D model work started", "3D model delivered", "3D model request declined", "Own 3D uploads {allowed | turned off}".

### 9.2 Email to the business owner (`model_request_update`, EN / PT)
| Event | Subject EN / PT | Body EN / PT |
|---|---|---|
| delivered, published | The 3D model for {productName} is ready / O modelo 3D de {productName} está pronto | The Sanctus team finished the 3D model for {productName}{ ({optionName})}. It is now attached to the product, and customers can view it in 3D and in AR on the product page. / A equipa Sanctus terminou o modelo 3D de {productName}{ ({optionName})}. Já está associado ao produto, e os clientes podem vê-lo em 3D e em AR na página do produto. |
| delivered, draft | (same subject) | The Sanctus team finished the 3D model for {productName}{ ({optionName})}. It is attached to the product in your dashboard. Publish the product when you're ready, and customers can view it in 3D and in AR. / A equipa Sanctus terminou o modelo 3D de {productName}{ ({optionName})}. Já está associado ao produto no seu painel. Publique o produto quando quiser, e os clientes poderão vê-lo em 3D e em AR. |
| declined | Your 3D model request for {productName} / O seu pedido de modelo 3D para {productName} | The Sanctus team couldn't make the 3D model for {productName}{ ({optionName})} from this request. Reason: {reason}. You can send a new request from the product in your dashboard. / A equipa Sanctus não conseguiu criar o modelo 3D de {productName}{ ({optionName})} com este pedido. Motivo: {reason}. Pode enviar um novo pedido a partir do produto no seu painel. |

Every message ends with: "Contact the Sanctus team if you have questions." / "Contacte a equipa Sanctus se tiver dúvidas." The product and option names use the email's language (`localized`, falling back to EN). The reason is the staff's text as typed (escaped, ≤ 1000, `REASON_MAX_LENGTH`).

## 10. Release order, docs, risks and rollback

### 10.1 Release order
1. Get the owner's go-ahead for `zggylkbgajamhriebdrg`. Run the read-only pre-flight and show the results:
   - businesses that will get `allow_own_models = true` (they have model rows) and those that will get `false`;
   - the stored Admin and Team permission sets (Admin gains `models.manage`);
   - that no `model-request-photos` bucket exists yet.
2. Apply with `supabase db push`. Never `config push`.
3. `npm run db:types`.
4. Deploy `review-model-request`, then `account-security`. No new secrets.
5. Release the frontend to the Preview, then to `sanctus.warpkit.online`. Push to `main` only when the owner asks.

**Mixed versions:**
- An old frontend saving a product with unchanged models works (R-S4-3 compares sets). An old frontend adding a model for a business with the switch off gets the generic error; that is the intended rule.
- An old frontend never sends `expected_models_changed_at`, so R-S4-17's check is skipped for it.

### 10.2 Docs to update
- **New ADR:** `System_arch/decisions/ADR-0034-3d-model-requests.md` (the `models.manage` permission against ADR-0029; the switch and its database enforcement; the request lifecycle; the private photo bucket; delivery replaces the whole set). Row in `decisions/README.md`.
- **Design:** design/19 (tables, bucket, policies, access map, functions), design/23 (the new kind), the product editor design file, and the admin navigation.
- **docs:** SECURITY_REVIEW (staged files readable by the business through its folder, the direct-SQL path without email, request photo privacy); OPERATIONS_RUNBOOK ("3D model requests (S4)": release order, pre-flight, rollback); TEST_PLAN; PRD (A3 row, the client question on cost answered "none"); CLIENT_HANDOVER (how to request a model, how staff deliver, the switch); PRODUCTION_READINESS, `System_arch/Task.md`, the P12 task file (S4 status) and HANDOFF.

### 10.3 Rollback
`supabase/rollback/20261026_model_requests_rollback.sql`:
- restores the previous `save_product`, `my_platform_access`, `permission_prerequisites`, the check constraint (removing `models.manage` from role sets first, with an audit row) and the recreated storage policies;
- drops the three tables, the triggers, the functions, the two columns and the new storage policies;
- empties and deletes the `model-request-photos` bucket only after an explicit export step in the runbook (the photos are customer data);
- keeps `email_log` rows (the kind check is widened back to include the old values only after `model_request_update` rows are confirmed absent, or the check keeps the new value);
- delivered models stay: they are ordinary product model rows.
The runbook tests apply → rollback → re-apply on PGlite.

### 10.4 Risks
- **Staged files are readable by the business before delivery** if its owner lists its own `product-media` folder through the API. They are files of its own product, never public. Accepted and documented; staging in the private bucket would need a cross-bucket copy at delivery.
- **The switch backfill decides who keeps own uploads.** A business that uploaded once keeps the right. The pre-flight shows the list, and staff can turn any off afterwards.
- **Delivery replaces the whole set.** A business's own USDZ is removed when staff deliver only a GLB. The dialog says so.
- **Email is best-effort.** The status in the dashboard is the durable record, and the owner's "Changes by the platform team" card lists deliveries and declines.
- **Orphans:** a tab closed mid-send leaves photos under an unused id; a failed clean-up after delivery leaves replaced files. Both are reported or documented; no sweeper (§1.3).
- **The 25-request cap** is a guess. It is one constant in SQL and in the mock.

## 11. Testing (test-first)
- **PGlite** (new `supabase/tests/modelRequests.test.ts`, the `harness.ts` pattern):
  - **Permission:** the 16th key, the prerequisites pinned to `PERMISSION_PREREQUISITES`, Owner 16, the Admin backfill and its audit row, `forbidden` and `aal2_required` on each `admin_*` function.
  - **Switch:** the column guard (owner, Admin direct, the function), the backfill groups, the audit row.
  - **Own-model refusal:** `save_product` equal sets, `keep_models`, a changed set (off → refused, on → saved, staff → saved), direct inserts and deletes, the cascade exception for option and product deletes, `models_changed_elsewhere`.
  - **Requests:** every check in R-S4-6 in order, the partial unique index (including two parallel `request_model` calls on two connections), cancel rules, start, stage (folder, extension, missing object, replace), unstage, deliver (GLB only, both, the replaced paths, the `models_changed_at` bump, the switch-off business), decline (reason, staged paths), every invalid transition.
  - **RLS and storage:** owner vs other business vs Team without the key vs `models.manage` vs anon, on the three tables and both buckets; anon reads a delivered GLB only for a published product of an active business; `model_request_storage_paths` gate.
  - **Owner audit card:** the three event types are readable by the business's owner only.
  - **Grants:** anon can't execute any new function; no API writes on the three tables.
  - **Rollback:** apply, roll back, re-apply.
- **Function handlers (Vitest, injected):** `review-model-request` (§5 R-S4-15 acceptance); `email-templates` renders `model_request_update` for three events × EN/PT with and without an option; `account-security` sweep lists both buckets.
- **Service and component tests:**
  - **Services:** `mapDbError` for every key in §8.3; the mock mirrors the PGlite rule cases; `requestModel` deletes uploaded photos when the call fails; product delete removes request paths; `urls.ts` helpers.
  - **Business screens:** `ModelRequestPanel` in every state of R-S4-7; the editor with the switch off and on (R-S4-4); the list badges and filter.
  - **Admin screens:** the queue (tabs, empty, error, the nav count, no access); the detail (photo viewer keyboard and focus, failed photo, not found); `ModelSection` in request context (no URL input, scale check shown); the deliver and decline dialogs (no-USDZ warning, reason required, the email-failed toast); the business "3D models" card with and without the key.
  - Every data view covers loading, empty and error.
- **Playwright (demo, 1440 and 390)**, new `model-requests.spec.ts`:
  - The owner of the switch-off business opens a published product with no model: no GLB input; requests a model with 2 photos (an 11th is refused); sees "Requested"; the public product page has no 3D or AR control.
  - The admin opens "3D requests", starts work, uploads a fixture GLB and USDZ, delivers; the toast says "Demo: no email was sent."
  - The public product page now shows the 3D and AR controls; the owner's editor shows "Ready" and "AR ready".
  - Decline with a reason → the owner sees the reason and "Send a new request".
  - The admin turns the switch on for the business → the owner sees "Upload your own".
  - `a11y-dashboard.spec` adds the two admin routes and the editor with the panel; the pixel guard stays green.
- **Live checks after deploy** (dev project, QA accounts labelled "QA", the owner's OK):
  - a QA owner sends a request with real phone photos; a Team member without the key can't open it, and one with the key can;
  - staff deliver a real GLB + USDZ; the QA owner gets `model_request_update` (Resend test address) in the business's language; the public page shows 3D; Android Scene Viewer and iPhone Quick Look open on real devices (TEST_PLAN, ADR-0021);
  - with the switch off, a direct REST insert into `product_models` as the QA owner → 42501, and a storage upload of a `.glb` → refused;
  - decline a second request → the email carries the reason.

## 12. Requirement list
| ID | Requirement |
|---|---|
| R-S4-1 | New permission `models.manage`, prerequisites, Owner 16 keys, Admin backfill |
| R-S4-2 | Per-business `allow_own_models` switch, default off, changed only by an audited staff function |
| R-S4-3 | With the switch off, the database refuses business GLB/USDZ writes (rows, `save_product`, storage) |
| R-S4-4 | The editor shows own-upload controls only when allowed; request is the recommended choice |
| R-S4-5 | Request photos in a private bucket, 2–10, JPG/PNG/WebP, 10 MB, never public |
| R-S4-6 | `request_model` checks membership, target, dimensions, one open per target, 25 cap, photos |
| R-S4-7 | "Request a 3D model" panel with unsaved, form, sending, status, loading and error states |
| R-S4-8 | The business cancels only while `requested`; photos deleted |
| R-S4-9 | Request badges and an "open requests" filter in the business product list |
| R-S4-10 | Admin "3D requests" queue with tabs, nav count, permission-gated |
| R-S4-11 | Request detail with photo viewer, product facts and history |
| R-S4-12 | Start work; stage GLB/USDZ with the existing model checks through the shared `ModelSection` |
| R-S4-13 | Deliver replaces the target's model set in one transaction; GLB required |
| R-S4-14 | Decline with a required reason that is sent to the business |
| R-S4-15 | `review-model-request` Edge Function: 2FA gate, caller-run SQL, EN/PT email, dedupe |
| R-S4-16 | 3D hidden until delivered: photo-only publishing, no public leak, readiness follows the files |
| R-S4-17 | A delivery is never overwritten by an editor opened before it (`models_changed_elsewhere`) |
| R-S4-18 | Request photos and staged files are cleaned up with their product, business and request |
| R-S4-19 | Demo mode enforces the same rules, session-only photos and models, labelled, no email |

## 13. Owner decisions to confirm
1. **Switch default and backfill:** new businesses start with own upload **off**. Existing businesses that already have any 3D file start **on**; the rest start off.
2. **Who handles requests:** a new permission "Handle 3D model requests". Admin gets it; Team does not by default (the Owner can add it to Team).
3. **Publishing before the model arrives:** a product can be published photo-only while its request is open, and the public page says nothing about a coming model.
4. **Cancelling:** the business can cancel only until the team starts work. After that, it asks the team, who decline with a reason.
5. **Limits and keeping photos:** 25 open requests per business, 10 MB per photo, and request photos kept until the product is deleted (so the team can revise a model). Cancelled requests' photos are deleted.

## Owner decisions (2026-10-26)

These override the defaults above where they differ.

1. **Own upload default:** off for new businesses; on for existing businesses that already have any 3D file. Switchable per business.
2. **Who handles requests:** the new permission `models.manage` ("Handle 3D model requests"). Admin gets it in the backfill; Team does not by default.
3. **Publishing before the model:** a product may be published photo-only while its request is open; nothing about the request appears publicly.
4. **Cancelling and limits:** the business can cancel only while the request is still "Requested". **There is no limit on open requests per business** (the 25-open rule in R-S4-6 is removed). The 10 MB per photo, 2–10 photos and JPG/PNG/WebP rules stay. Request photos are kept until the product is deleted, and deleted when a request is cancelled.

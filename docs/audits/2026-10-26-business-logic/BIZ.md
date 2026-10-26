# BIZ audit (business lifecycle, statuses, business settings)
Scope read: `supabase/migrations/` (init_schema, storage, publish_rules, owner_registration_and_claims, applications_and_owner_access, security_hardening, platform_team_roles, account_settings), `supabase/functions/account-security/{handler,index}.ts`, `src/services/supabase/supabaseCatalogService.ts` (businesses, catalogs, delete, logo upload, members), `src/services/mock/{mockCatalogService,mockAccount}.ts`, `src/services/validation.ts`, `src/services/applicationRules.ts`, `src/lib/{urls,slug}.ts`, `src/tenant/resolveTenant.ts`, `src/features/businesses/*`, `src/features/catalogs/CatalogQrPanel.tsx`, `src/features/admin/{BusinessesListPage,BusinessDetailPage,BusinessCreatePage,AdminCatalogsPage,ApplicationDetailPage}.tsx`, `src/features/public/CatalogPage.tsx`, `src/components/layout/DashboardShell.tsx` (CatalogStatusNotice), `src/features/business/BusinessOverviewPage.tsx`, `src/features/settings/sections/{AccountSection,BusinessSection}.tsx`, `src/features/team/permissions.ts`, i18n `en.ts`, design/12, design/14, docs/CLIENT_HANDOVER.md, known-items lists.

Checked and consistent (no finding): the three reserved-slug lists (`init_schema.sql:28`, `unique_business_slug` `applications_and_owner_access.sql:133`, `RESERVED_SUBDOMAINS` `resolveTenant.ts:7`); slug format regex (SQL, `SLUG_PATTERN`); the owner's editable fields (`OWNER_FIELDS` `BusinessForm.tsx:29` against the allow-list in `security_hardening.sql:62-63`); owners can't change slug or status (trigger + UI); `businesses.status` is enforced on insert too (`platform_team_roles.sql:876-890`); status changes and slug changes are audited; the closure functions bypass the owner guard correctly (SECURITY DEFINER); `closure_follow_status` keeps a staff decision across cancel or restore.

## Findings

### BIZ-01 Closure request outlives owner removal: completing it deletes the new owner's business, and the ex-owner can still bring the catalog back — High — CONFIRMED
- Where: `supabase/migrations/20261025163627_account_settings.sql:877-880` (request stores `business_id` once), `:887-918` (`undo_closure`, no membership check), `:920-940` (`cancel_account_closure`: the 2FA gate applies only while the caller is still a member), `:981-993` (`service_closure_target` returns the stored business_id); `supabase/functions/account-security/handler.ts:257-276` (`complete_closure` deletes `t.business_id`, never checks that the target still owns it); `src/services/supabase/supabaseCatalogService.ts:881-886` (`removeBusinessMember` only deletes the membership row); `src/features/businesses/BusinessOwnersPanel.tsx:79-93` (removal dialog doesn't mention the closure).
- What happens: owner A requests closure, so the business goes inactive. Staff then remove A (an owner change) and invite owner B, who starts working. The closure banner on the business page still matches by `businessId` (`BusinessDetailPage.tsx:90`). When the Owner clicks "Complete closure", the business, B's products, media and B's membership are deleted, along with A's account. If instead A clicks "Cancel request" in their settings, or the Owner restores, `undo_closure` sets the business back to its pre-closure status (for example active), even though A no longer owns it.
- Expected rule: ADR-0024 says there is exactly one owner and an owner only acts on their own business. Closure is "close **your** account" (`AccountSection.tsx:300-306`), and deleting a business is a deliberate staff action with its own permission (`businesses.delete`).
- Fix sketch: SQL. Add an AFTER DELETE trigger on `business_members` that deletes that user's closure request for that business, or sets `business_id` to null and logs it. Make `service_closure_target`/`undo_closure` ignore `business_id` unless the user is still its member. UI: warn in the owner-removal dialog when a closure is pending.
- Live check: on a disposable project, request closure as an owner, remove them, invite another owner, then call `service_closure_target` for the first user: it still returns the business id.

### BIZ-02 Staff can reactivate a business under a pending closure without seeing it, and every banner still says "offline" — Medium — CONFIRMED
- Where: `src/features/admin/BusinessDetailPage.tsx:48-53` (closures loaded only for the Owner), `:77-79`/`:109-113` (the Activate toggle is shown to anyone with `businesses.status`); `BusinessesListPage.tsx:46-48`, `:95-101` (same in the list); `BusinessForm.tsx:210-218` (status select); `account_settings.sql:945-963` (`closure_follow_status` accepts the change and records `active` as the status to restore); RLS already lets these staff read closures: `account_settings.sql:830-831` (`businesses.view`). The copy that becomes false: `BusinessDetailPage.tsx:257` ("The catalog is offline until you complete the closure"), `BusinessOverviewPage.tsx:238` and `AccountSection.tsx:321` ("Your catalog is offline").
- What happens: an Admin sees an "Inactive" business with no closure badge and clicks Activate. The catalog goes public again while the owner's request to close their account is still pending. The owner's dashboard and the Owner's banner still say the catalog is offline.
- Expected rule: the closure promise is "Your catalog goes offline now" (`AccountSection.tsx:304`, ADR-0032/spec 8). The brief's honesty rule says the UI must never claim something is offline when it is live.
- Fix sketch: UI. Show "Closure requested" (read-only) to everyone with `businesses.view` and confirm before activating. Derive the "offline" wording from the real status. Optionally in SQL, refuse `status = 'active'` while a closure request exists, except for the closure functions.
- Live check: as an Admin account, activate a business with a pending closure and watch the owner's banner.

### BIZ-03 On the live site, a paused or draft catalog shows "Catalog not found", but every screen promises "catalog unavailable" — Medium — CONFIRMED
- Where: `supabase/migrations/20261012192143_init_schema.sql:261-263` (anon can read only `status = 'active'`); `src/services/supabase/supabaseCatalogService.ts:698-703` (no row → `NOT_FOUND`); `src/features/public/CatalogPage.tsx:79-101` (NOT_FOUND → `catalog.notFoundTitle` "Catalog not found / Check the address, or ask the store for their catalog link"), vs `:104-107` (the "currently unavailable" branch runs only when the row is readable). Promises: `useBusinessActions.ts:18`, `DashboardShell.tsx:153-154`, `CatalogQrPanel.tsx:86`, `docs/SANCTUS_BUSINESS_DASHBOARD_AUDIT.md:92`, `System_arch/design/14-features-public.md:13`. Demo differs: `mockCatalogService.ts:106-110` returns any business, so demo shows "unavailable".
- What happens: a customer scans the printed QR of a paused store and is told the address is wrong. The owner and admin were told customers would see "This catalog is currently unavailable … contact them directly".
- Expected rule: design/14: "Inactive business: 'This catalog is currently unavailable'". Unknown slug: not-found.
- Fix sketch: SQL plus service. Add a small SECURITY DEFINER `public_catalog_state(p_slug)` that returns only `{ exists, active, name }` for non-active businesses, and have `CatalogPage` use it on NOT_FOUND. Otherwise change all the copy to "not found".
- Live check: open `/catalog/<inactive sample slug>` (Oak & Ember) signed out.

### BIZ-04 A freed catalog address can be taken by another business right away, so old QR codes open the wrong store — Medium — CONFIRMED
- Where: `init_schema.sql:26-28` (uniqueness covers only the current slug), `security_hardening.sql:239-241` (a slug change is only audited), `applications_and_owner_access.sql:139` (`unique_business_slug` checks only current rows), `validation.ts:22`, `BusinessForm.tsx:80-96` (the dialog says old QR codes "will stop working"), `useBusinessActions.ts:33` ("Printed QR codes will stop working").
- What happens: store A changes its address from `casa` to `casa-lisboa`, or is deleted. Staff then create or approve "Casa" for store B, and B gets `casa`. Every flyer, packaging QR and website embed of store A now opens store B's catalog and products.
- Expected rule: catalog QR codes are permanent print artifacts (ADR-0005, "it stays valid"). The dialogs promise the old links stop working, not that they point at someone else.
- Fix sketch: SQL. Add a `retired_slugs(slug pk, business_id, retired_at)` table, filled by the audit trigger on change and delete. Refuse it in the CHECK/insert path and skip it in `unique_business_slug` (or allow reuse only by the same business). Optionally redirect old slug to new for the same business.
- Live check: not needed (schema reading).

### BIZ-05 View-only staff get an editable business form (and status/"Create business" controls) that the database refuses — Medium — CONFIRMED
- Where: `src/features/admin/BusinessDetailPage.tsx:155` (always `mode="edit"`), `src/features/businesses/BusinessForm.tsx` (no permission checks: slug, status select `:210-218`, accent, currency, logo upload `:146`); the default Team role has `businesses.view` and no `businesses.edit` (`platform_team_roles.sql:51`); the update policy needs `businesses.edit` (`:197-199`); the refusal comes back as "You don't have permission to do this." (`supabaseCatalogService.ts:720` → `catalogService.ts:214`); the logo upload shows raw Storage text (`supabaseCatalogService.ts:978`). The list says "View details" for these users (`BusinessesListPage.tsx:91`). Also, a member with `businesses.edit` but not `businesses.status` sees the status select and the "Create business" button, which creates the business as active (`BusinessForm.tsx:77,264`), and both are refused (`platform_team_roles.sql:180-181`, `:876-890`).
- What happens: a Team member edits fields, uploads a logo (refused with a raw RLS message), clicks Save and gets a permission error. Every change they typed is lost.
- Expected rule: CLAUDE.md "No dead buttons". Team permission labels (`features/team/permissions.ts:20-22`).
- Fix sketch: UI. Pass a `readOnly` form mode when `!can('businesses.edit')`. Hide the status select and the "Create business (active)" button unless `can('businesses.status')`. Map Storage RLS errors through `teamFail('forbidden')`.
- Live check: sign in as a default Team member, open a business, edit the name and save.

### BIZ-06 Deleting a business from the console leaves files behind without saying so (logos under `new/`, and media when the deleter lacks product rights) — Medium — CONFIRMED
- Where: `supabaseCatalogService.ts:972` (a logo uploaded while creating goes to `new/<uuid>`), `:359-361` (`ownedLogoPath` refuses anything outside `<id>/`), `:723-724` (replacing such a logo never deletes it), `:733-744` + `:607-612` (`removeFolder` ignores list and remove errors, so the delete always reports success); `supabase/functions/account-security/index.ts:71-74` (closure sweep: the same two folders, so `new/` logos survive there too); the storage delete policies need `products.edit` (media) and `businesses.edit` (logos), not `businesses.delete` (`platform_team_roles.sql:285-299`).
- What happens: (a) every business created in the console with a logo keeps that logo public in `business-logos/new/` after the business is deleted or closed. (b) A staff role with `businesses.delete` but not `products.edit` deletes the rows, while every product photo and 3D model stays in `product-media` with no warning. The edge-function path at least records `storage_sweep_incomplete`.
- Expected rule: the `businesses.delete` warning says "Deletes the business, its products and media" (`features/team/permissions.ts:26`). The ActionCodeDialog says "deletes the business with its products, photos and models" (`BusinessDetailPage.tsx:274`). The accepted risk in SECURITY_REVIEW covers only a crash between the delete and the sweep.
- Fix sketch: service/function. After `createBusiness`, move the `new/` logo into `<id>/` (or upload the logo only after the row exists). Do the console sweep server-side with the service role (reuse the account-security sweep), and surface a partial sweep in the toast.
- Live check: create a business with a logo, delete it, then list `business-logos/new/` in the dashboard.

### BIZ-07 Deleting a business strands its application (approved, no business, no actions) and its owner login, and the dialog mentions neither — Low — CONFIRMED
- Where: `applications_and_owner_access.sql:49` (`business_id … on delete set null`), `applicationRules.ts:11` (`approved: []`), `ApplicationDetailPage.tsx:209-244` (business card and owner panel hidden when `businessId` is empty); `useBusinessActions.ts:31-36` (the dialog names only the catalog and products); the owner's auth user stays with no membership and gets no notice (`supabaseCatalogService.ts:733-744`).
- What happens: after the delete, the application page shows "Approved" with nothing else: no business, no way to re-approve, no note that it was deleted. The owner can still sign in and lands on an account with no business.
- Expected rule: brief "Missing consequence" / "Dead end". ADR-0024 lifecycle.
- Fix sketch: UI. The delete dialog says "The owner's sign-in stays; they lose access". The application page shows the `business_deleted` audit event in place of the business card.
- Live check: not needed.

### BIZ-08 During a closure, the owner sees "paused, contact the platform team" next to "Closure requested · Cancel request" — Low — CONFIRMED
- Where: `src/components/layout/DashboardShell.tsx:136-158` (`CatalogStatusNotice` sees only `status = 'inactive'`), `src/features/business/BusinessOverviewPage.tsx:222-243`.
- What happens: an owner who asked to close sees two notices that contradict each other on every dashboard page. One tells them to ask the platform team to reactivate, though they can do it themselves by cancelling.
- Expected rule: consistency, and the owner notice design (design/13 line 23).
- Fix sketch: UI. `CatalogStatusNotice` reads `security.closure` and says "Offline because you asked to close your account. Cancel in My account."
- Live check: not needed.

### BIZ-09 Business field limits are not checked in the form: overlong values fail with a generic error and no field highlighted — Low — CONFIRMED
- Where: `validation.ts:14-27` (no slug ≤ 63, phone ≤ 50, address ≤ 500 or email ≤ 320 checks) vs `init_schema.sql:24-35`; `BusinessForm.tsx:158-168,200-205` (no `maxLength`); `slugInput` has no cap (`lib/slug.ts:15-17`); `mapDbError` 23514 → "Some values were rejected" (`supabaseCatalogService.ts:181-184`). The description limits differ: form 400 (`BusinessForm.tsx:149`), application 1000 (`_shared/application.ts:85`, copied in `applications_and_owner_access.sql:191`), DB 5000.
- What happens: an admin types a 70-character address, or an owner pastes a long street address, and saving fails with no field marked. An approved business's 1000-character description can't be extended in the 400-character box.
- Expected rule: consistency. validateBusiness is meant to mirror the CHECKs.
- Fix sketch: UI/service. Add the limits to `validateBusiness` and `maxLength`, and choose one description limit.
- Live check: not needed.

### BIZ-10 Demo mode doesn't follow the real business and closure rules — Low — CONFIRMED
- Where: `src/services/mock/mockAccount.ts:263-273` (closure doesn't take the business offline), `:305-322` (complete doesn't delete the business, restore doesn't restore status), `:57-58,270` (`businessId: 'demo-business'`, which doesn't exist in the seed `seed.ts:150-189`, so the seeded request always shows as an orphan); `mockCatalogService.ts:157-169` (delete keeps `owners[id]` and `application.businessId`, so the application page then shows a "Business not found" error with Retry); `:106-110` (anon can read non-active businesses).
- What happens: demo tests and walkthroughs can't show the offline/restore behaviour, and they show public pages that live hides.
- Expected rule: brief: "the demo must model the real rules".
- Fix sketch: mock. Set the status to inactive, remember the previous status and restore it. Delete owners and clear `businessId` on delete. Hide non-active businesses from signed-out visitors.
- Live check: not needed.

### BIZ-11 "Open catalog" from the admin list and detail page opens a non-active catalog without preview, so staff see the unavailable page — Low — CONFIRMED
- Where: `BusinessDetailPage.tsx:106`, `BusinessesListPage.tsx:92` (`catalogLocalPath(b)`) vs `CatalogQrPanel.tsx:65` (`{ preview: !isPublic }`) and the owner top bar (`DashboardShell.tsx:412`).
- What happens: the same button means "preview" in one panel and "public view" in another. For a draft business, admins get "currently unavailable" and think the catalog is broken.
- Expected rule: consistency (ADR-0025 owner/admin preview).
- Fix sketch: UI. Pass `{ preview: b.status !== 'active' }` and label the button "Preview catalog".
- Live check: not needed.

### BIZ-12 Product counts in the businesses list and the delete dialog come from an unpaged 1000-row read (known D18, still causes problems) — Low — CONFIRMED
- Where: `supabaseCatalogService.ts:571` (`products.select('business_id, status')` with no filter or paging, even for `getCatalog(slug)`), `BusinessesListPage.tsx:102,132` (the count goes into the delete dialog); `supabase/config.toml:22` `max_rows = 1000`. Already listed as D18 in `docs/PRODUCTION_AUDIT_AND_PLAN.md:136`.
- What happens: past 1000 products across the platform, a business can show "0 products" and the delete dialog says "deletes … 0 products".
- Fix sketch: service. Use a per-business `count: 'exact', head: true` query, or a grouped view.
- Live check: not needed.

## Ideas (optional, max 5 lines)
- A "Ready to go live" request from a draft owner, plus a "Drafts waiting for activation" list for staff. Today the owner is told only that "the platform team activates it", and staff get no signal.
- An owner-requested catalog address change with a 301 from the old slug, using BIZ-04's retired-slug table.
- An explicit owner transfer (an atomic remove plus invite) that also handles BIZ-01.

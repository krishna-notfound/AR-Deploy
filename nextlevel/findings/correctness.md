# Sanctus correctness audit — branch `feature/sanctus-brand-design-system` (2026-10-20)

Read-only static review. No repo files were edited, nothing was committed, and no live Supabase, Vercel or Resend call was made. Paths are relative to `<repo>`. Line numbers are for this branch.

Two things were checked by running code:
- PL/pgSQL multi-row `UPDATE … RETURNING INTO`, run in PGlite: `scratchpad/audit/returning-into.mjs`.
- The EN/PT dictionary comparison: `scratchpad/audit/i18n-keys.mjs`.

Everything else was read from code. Findings marked **PLAUSIBLE** depend on runtime behaviour (supabase-js, PostgREST, Resend or the Supabase edge) that was not exercised.

**Severity:**
- P0: data loss or security in production.
- P1: core journey broken for everyone.
- P2: a real user hits a wrong or blocked result in a normal flow.
- P3: edge case, honesty or parity gap, or a minor dead end.

**Result:** 0 P0, 0 P1, 17 P2, 38 P3.

---

## 1. Route inventory

| Route | Role | Data dependencies | Actions | Error / empty states | Tests |
|---|---|---|---|---|---|
| `/` (landing) | public | `getProducts({status:'published'})`, `getCatalogs()` | links to the first active catalogue and categories, "Apply" CTA | no error state (links are hidden instead) | `landing.spec.ts` ×4 |
| `/catalog/:businessSlug` | public | `getBusinessBySlug`, then `getProducts({businessId,status:'published'})` | search and category (URL params), product links, language switch | loading, not found, unavailable (demo only, COR-07), business and products retry, empty, no match. Defects: COR-07, COR-08, COR-37 | `public.spec.ts:4,119,132,141`; `components.test.tsx:64` |
| `/products/:businessSlug/:productSlug` | public (`?preview=1` for a signed-in admin or owner) | `getPublicProduct(…,{allowDraft})`, `useRefreshWhenStale`, `recordEvent` (view, model_interaction, ar_activation) | photos/3D toggle, AR (scene-viewer, quick-look), unit switch, variants (name and price only), CTA or contact, share, QR | loading, not found or owner mismatch, error with retry, model error and stall timeout, AR failed toast. Defects: COR-09, COR-10, COR-38, COR-39, COR-40 | `public.spec.ts:21,28,38,56,84,119,132`; `responsive.mobile.spec.ts:18`; `modelViewer.test.tsx` |
| Hostname `/`, `/products/:productSlug` | public | same, with `tenantSlug` | same | same | `lib.test.ts:78-89` (resolveTenant only). No router test |
| `/apply` | public | `submitApplication` (submit-application Edge Function / mock); draft in sessionStorage | 5-step wizard, honeypot, submit | step validation, server field errors, rate-limit, duplicate, failed. Defect: COR-48 | `applications.spec.ts:48,108`; `responsive.mobile.spec.ts:25`; `submit-application/handler.test.ts` |
| `/accept-invite` | public; signed in through the invite link | `useAccount`, `auth.updatePassword`, `updateDisplayName`, `completeOwnerOnboarding` RPC | set password and name, go to `/dashboard` | demo notice, expired/invalid link, error notice. Defects: COR-15, COR-46 | none (no e2e or component test) |
| `/login` | public (forwards to `/demo` in demo mode) | `useAccount`, `auth.signInWithPassword` | sign in, sign out (no-role account), reset and apply links; `?next` limited to `/admin` and `/dashboard` (no open redirect) | sign-in error, `accountError`. Defects: COR-01, COR-02, COR-03 | `landing.spec.ts:39` (demo forward); `auth.test.ts` |
| `/reset-password` | public | `getSession`, `onAuthStateChange`, `requestPasswordReset`, `updatePassword` | request link, set new password | validation and service errors; expired link not handled (COR-34) | none |
| `/demo` | public | `getCatalogs` | `signInAs` admin or owner | error state | `admin-nav.spec.ts:24`, `accounts-persistence.spec.ts` |
| `/admin` | super_admin | `getAnalytics`, `getProducts`, `getBusinesses`, `getRecentActivity` | links | analytics error handled; others show false empties (COR-27) | `admin-nav.spec.ts:5` |
| `/admin/applications` | super_admin | `getApplications` (search, status, date, page) | filter, open | loading, error, empty, filtered-empty. Defect: COR-49 | `applications.spec.ts:48` |
| `/admin/applications/:id` | super_admin | `getApplication`, `getBusinessById`, `getAuditEvents`, `getEmailAttempts`, `getBusinessMembers` | start review / reopen, approve (confirm), reject (reason), invite / resend / remove owner | not found, error, business error. Defects: COR-14, COR-16, COR-41 to COR-45 | `applications.spec.ts:48`; `supabase/tests/migrations.test.ts:295-360`; `provision-owner/handler.test.ts` |
| `/admin/businesses` | super_admin | `getCatalogs`, `getAnalytics` | search, filter, page, edit, open, QR, activate/deactivate, delete | error. Defect: COR-28 | `business-crud.spec.ts` |
| `/admin/businesses/new` | super_admin | `createBusiness`, `uploadAsset('logo')` | save draft, create | field errors and toast. Defect: COR-32 | `business-crud.spec.ts:5` |
| `/admin/businesses/:id` | super_admin | `getBusinessById`, `getCatalog`, `getProductsByBusiness`, `getBusinessAnalytics`, members, audit, emails | update, status, delete, owner panel | not found and error. Defects: COR-04, COR-05, COR-06, COR-26, COR-35 | `business-crud.spec.ts`; owners in `applications.spec.ts` |
| `/admin/products`, `/new`, `/:id/edit` | super_admin | `getProducts`, `getBusinesses`, `getAnalytics`; editor: `getProductById`, `uploadAsset`, create / update / publish / unpublish / delete | filters, row menu, editor | products error handled; business-list error not handled (COR-21); stats error shows zeros (COR-22) | `product-crud.spec.ts:5,77,86,96`; `model-optimize.spec.ts:38` |
| `/admin/analytics` | super_admin | `getBusinesses`, `getAnalytics` / `getBusinessAnalytics`, `getProducts` | business filter | error. Defect: COR-29 | `admin-nav.spec.ts`; `service.test.ts:141-176` |
| `/admin/catalogs` | super_admin | `getCatalogs`, `useQrCode` | copy URL, download QR (encodes the catalogue URL), local-URL switch | loading, error, empty | `qr-copy.spec.ts` |
| `/admin/activity` | super_admin | `getAuditEvents` (paged) | search, page | loading, error, empty. Defect: COR-31 | `applications.spec.ts:103`; `live.integration.test.ts:251` |
| `/admin/settings` | super_admin | `useAccount`, `resetDemoData` | reset demo, failure injection | toast | `accounts-persistence.spec.ts:53` |
| `/dashboard` | business_admin | `getBusinessAnalytics`, `getProductsByBusiness`, `getRecentActivity` | links | an analytics error replaces the whole page (COR-22) | heading only (`helpers.ts:19`) |
| `/dashboard/products` | business_admin | `getProductsByBusiness`, `getBusinessAnalytics` | add, filters, row menu | loading, error, empty, no-match; stats error silent | `accounts-persistence.spec.ts:5`; `components.test.tsx:120` |
| `/dashboard/products/new`, `/:id/edit` | business_admin | as for the admin editor (business pinned) | save draft, publish, preview, uploads, variants, delete | not found (including another business's product, which is correctly refused), error (COR-18), leave blocker. Defects: COR-11, COR-12, COR-13 | `accounts-persistence.spec.ts:13`; `live.integration.test.ts:93,120,132,214`. No owner-scope editor e2e |
| `/dashboard/analytics` | business_admin | `getBusinessAnalytics`, `getProducts` | product links | error and empty | none |
| `/dashboard/catalog` | business_admin | `getCatalog`, `useQrCode` | copy, open, download QR | spinner, error | via `/admin/catalogs` only |
| `/dashboard/settings` | business_admin | `updateBusiness` (name, logo, description, contact only), `uploadAsset` | save, logo | field errors, in-app blocker. Defect: COR-25 | `accounts-persistence.spec.ts:26`; `live:149,226` |
| `*` (404) | public or in-shell | none | home link | English only (COR-50) | none for unknown routes |

---

## 2. Findings

### P2

#### COR-01 · P2 · Auth (Supabase) · A brief network failure on any auth event signs the user out mid-session
- **Expected vs actual:** A failed `getUser()` should keep the session and show a retry notice. Instead the user becomes null, `RequireRole` sends them to `/login?next=…`, and unsaved editor or form work is lost.
- **Scenario:** `TOKEN_REFRESHED` fires about every hour and re-runs `load()`. The network fails. `auth.ts:64` correctly returns `fail('UNKNOWN')`, but the provider still treats it as signed out.
- **Where:** `src/auth/AccountProvider.tsx:61-65` (`setAccount(r.ok ? r.data : null)`); `src/auth/RequireRole.tsx:21`; `src/services/supabase/auth.ts:63-66`.
- **Root cause:** a service error is mapped to "signed out".
- **Fix:** on `!r.ok`, keep the previous account (`setAccount(prev => prev === undefined ? null : prev)`), set `accountError`, and show a retry banner in DashboardShell. Treat only a 401 / AuthSessionMissing error as signed out.
- **Regression test:** provider test with a fake auth that succeeds, then fails on the second listener call. Expect `user` to stay set and `accountError` to be non-empty.

#### COR-02 · P2 · Auth / owner · One failed business lookup leaves the owner on a blank sign-in form, and signing in again does nothing
- **Expected vs actual:** A failed business fetch should show an error with retry. Instead `user` becomes null (`AccountProvider.tsx:93`), and LoginPage shows an empty form with no message. Signing in again reloads the same `businessId`, so `useBusiness` deps don't change and nothing refetches. In demo mode with failure injection on, the user loops between `/demo` and `/dashboard`.
- **Where:** `src/auth/AccountProvider.tsx:56-57, 89-93`; demo provider around line 124.
- **Fix:** treat only `NOT_FOUND` as no business. For other errors keep `user` undefined, expose `accountError` and `biz.refetch`, and call `biz.refetch()` from `signInAs` and the auth listener.
- **Regression test:** `getBusinessById` fails once, then succeeds. Signing in with the same session should end with `user` set.

#### COR-03 · P2 · Auth (Supabase) · "Switch account" bounces straight back
- **Scenario:** An owner opens `/admin`, gets the wrong-role page and clicks "Switch account". It goes to `/login`, and `LoginPage.tsx:26-28` immediately redirects a signed-in user to their own home, so the sign-in form is never reachable.
- **Where:** `src/components/layout/DashboardShell.tsx:272-277`; `src/auth/RequireRole.tsx:33`; `src/features/auth/LoginPage.tsx:26-28`.
- **Fix:** in Supabase mode, `await auth.signOut()` and then navigate to `/login`. Or support `/login?switch=1` showing "Signed in as X — sign out to switch".
- **Regression test:** e2e with mocked Supabase auth. Click "Switch account" and expect the sign-in form.

#### COR-04 · P2 · Admin · Saving the business form silently re-activates a catalogue that was just deactivated
- **Expected vs actual:** Deactivating from the header and then saving other edits should keep the catalogue inactive. Instead the save sends the stale `status: 'active'`.
- **Scenario:** On `/admin/businesses/:id`, edit the description (form is dirty). Click Deactivate and confirm; the database is now inactive. The form does not resync while dirty (`BusinessForm.tsx:43-50`). Click Save: the payload carries `status: data.status`, which is still 'active' (line 61), and the full payload is sent (line 64). The catalogue is live again and the toast just says "Changes saved". Any field changed by someone else meanwhile is overwritten the same way.
- **Where:** `src/features/businesses/BusinessForm.tsx:41-50, 55-65`.
- **Fix:** in edit mode send only the fields that differ from the snapshot. Also resync `status` from props, or disable the header status toggle while the form is dirty.
- **Regression test:** component test. Dirty the form, call `setBusinessStatus('inactive')`, save, and assert the update payload has no `status` (or has 'inactive').

#### COR-05 · P2 · Admin · Changing a catalogue address has no confirmation and no audit row
- **Detail:** The slug can be saved in one click, with only a hint line, from `BusinessForm.tsx` (slug field, saved via line 64). This breaks every printed QR code and every `/products/:businessSlug/…` link. The audit trigger only records status changes and deletes, so the change leaves no trace.
- **Where:** `supabase/migrations/20261020091428_applications_and_owner_access.sql:349-368`.
- **Scenario:** An admin edits the slug. Customers scanning the printed QR now see "Catalog not found", and the activity log shows nothing.
- **Fix:** add a confirm dialog naming the old and new URL. Add a `business_slug_changed` audit event to `private.audit_business_change` in a new migration (needs owner approval).
- **Regression test:** e2e: change the slug and expect the confirm dialog. PGlite test: an update with a new slug inserts an audit row.

#### COR-06 · P2 · Admin · The business detail Products tab says "No products yet" when products failed to load
- **Detail:** `ProductTable` gets `products.data ?? []` and has no error branch, so a failed load renders the empty state. This is the same bug class that ff0820e fixed on the public catalogue. Also, `productCount` is 0 while loading or after an error, so the delete confirm says "…and 0 products".
- **Where:** `src/features/admin/BusinessDetailPage.tsx:115-133` (products tab); productCount around line 56 and the delete confirm in `useBusinessActions.ts:31`.
- **Fix:** render `ErrorState` (with retry) when `products.status === 'error' && !products.data`. Take the count from the catalogue's `productCount`, or block Delete until products have loaded.
- **Regression test:** inject a `getProductsByBusiness` failure and expect the error state, not "No products yet".

#### COR-07 · P2 · Public (Supabase) · An inactive or draft business shows "Catalog not found" instead of "currently unavailable"
- **Expected vs actual:** design/14 and `CatalogQrPanel.tsx:78-81` say customers see "This catalog is currently unavailable". In practice RLS `status = 'active'` hides the row from anonymous visitors, so `getBusinessBySlug` returns NOT_FOUND and the "unavailable" branch is unreachable. The product page behaves the same way.
- **Demo divergence:** the mock returns any business, so demo shows "unavailable", and even shows a draft business's name and logo publicly.
- **Scenario:** An admin pauses a catalogue and a customer scans the printed QR. They read "Check the address", which looks like a broken QR.
- **Where:** `supabase/migrations/20261012192143_init_schema.sql:261-263`; `src/services/supabase/supabaseCatalogService.ts:611-616, 688-689`; `src/features/public/CatalogPage.tsx:61-80`; `src/services/mock/mockCatalogService.ts:102-106`.
- **Fix:** add a SECURITY DEFINER RPC `public_business_state(slug)` returning only `status` and `name`, and call it when the select returns nothing (new migration, needs owner approval). Or align the admin copy with what visitors actually see. Make the mock hide draft businesses from anonymous visitors.
- **Regression test:** live integration test: as anon, an inactive slug resolves to "inactive". Add a mock test for draft visibility.

#### COR-08 · P2 · Public · The catalogue header says "0 products" while loading or after products failed
- **Detail:** The count is rendered from `all.length`, where `all` comes from `products.data ?? []`, regardless of status. A load failure shows "0 products" in the hero above the error state, which partly looks like "no products".
- **Where:** `src/features/public/CatalogPage.tsx:46, 90`.
- **Fix:** render the count only when `products.status === 'success'`.
- **Regression test:** component test with `getProducts` returning `fail('UNKNOWN')`. Assert there is no "0 products" text.

#### COR-09 · P2 · Public / preview · Draft preview first shows "Product not available", then switches to the preview
- **Detail:** `canPreview = wantsPreview && !!user`, and `user` is `undefined` while the account loads. The first query therefore runs with `allowDraft: false`, gets NOT_FOUND, and renders "not available". It re-queries once the account resolves.
- **Scenario:** This always happens in Supabase mode, because Preview opens a new tab and the app cold-starts. In demo it happens for owners.
- **Where:** `src/features/public/ProductPage.tsx:43-45`.
- **Fix:** when `wantsPreview && user === undefined`, show the spinner and skip the query.
- **Regression test:** e2e. Open a draft preview in a new page and assert "Product not available" never appears (use a MutationObserver).

#### COR-10 · P2 · PLAUSIBLE · Public AR honesty · "True-to-size model" is claimed for iPhone AR, but the uploaded USDZ is never measured
- **Detail:** `checkScale` measures the GLB only. Quick Look receives a separate `iosSrc` (the uploaded USDZ). The copy says "…appears at real size in your room".
- **Scenario:** The USDZ was authored in centimetres. iPhone users see "verified" while Quick Look shows the wrong size.
- **Rule broken:** "mark AR scale verified only when the measured size matches".
- **Where:** `src/features/public/ProductPage.tsx:123, 308`; `src/features/public/ProductMedia.tsx:100`; `src/i18n/dictionaries/en.ts:81-82`.
- **Fix:** when a USDZ is present, qualify the badge ("3D model checked; iPhone AR file not checked"). Without a USDZ, model-viewer generates one from the GLB, so the claim holds.
- **Regression test:** unit-test the badge logic with `usdz` present.

#### COR-11 · P2 · Owner / admin editor · After a slug change, "Product published", Preview and "Open product page" open a dead URL
- **Detail:** `initial` is memoized on the product id only, and `save()`'s result is never stored. The dialog and Preview build the URL from the slug the editor opened with.
- **Scenario:** Change slug `sofa` to `sofa-2` and click Publish. The dialog links `/products/<biz>/sofa`, which shows "not available". Save, then Preview, does the same.
- **Where:** `src/features/products/ProductEditorPage.tsx:31, 75`; `src/features/products/editor/ProductEditorForm.tsx:150, 161, 172, 181, 426, 438, 449-454`.
- **Fix:** keep `const [latest, setLatest] = useState(product)`, update it from every successful save/publish, and use it for the dialog, Preview and confirms.
- **Regression test:** e2e: edit the slug, publish, and assert the dialog URL has the new slug.

#### COR-12 · P2 · Owner / admin editor · Publishing a brand-new product loses the highlighted field errors
- **Scenario:** On `/…/products/new`, fill in only the name and click Publish.
  1. The draft is created and publish fails validation.
  2. `goToEdit(saved)` changes the URL, and the `key` remounts the form.
  3. `errors` resets to `{}`, so only the toast "Complete the highlighted fields first" remains and nothing is highlighted.
- **Where:** `src/features/products/editor/ProductEditorForm.tsx:134-137, 154-158`; `src/features/products/ProductEditorPage.tsx:73`.
- **Fix:** pass `publishErrors` in navigation state (like `justPublished`) and seed `errors` from it.
- **Regression test:** e2e from `/new` with the name only, then Publish. Expect "Add at least one product image before publishing." after the URL becomes `/edit`.

#### COR-13 · P2 · Owner / admin editor · Uploads running at the same time overwrite each other (stale closures)
- **Detail:** Each upload's completion writes back a list captured when it started (`onChange([...others, ...next])`).
- **Scenarios:**
  - A GLB (slow) and a USDZ (fast) upload in parallel: the USDZ is lost.
  - Removing an image during another upload: the removed image comes back.
  - Gallery and "Additional photos" in parallel: one batch is lost.
  - The file inputs are not disabled while busy.
  - In Supabase mode, each lost upload leaves an orphaned storage object.
- **Where:** `src/components/ui/ImageUpload.tsx:37-38, 40-69`; `src/features/products/editor/ModelSection.tsx:44, 74-104, 158-168`; `src/features/products/editor/ProductEditorForm.tsx:325, 329, 337`.
- **Fix:** use functional updates (`onChange(prev => next)` merged in `setForm(f => …)`), have ModelSection report `onChange(format, asset)` merged into the latest models, and disable the inputs while busy.
- **Regression test:** component test with a deferred `uploadAsset`. Start GLB, start USDZ, resolve USDZ then GLB, and assert both are present.

#### COR-14 · P2 · Admin → owner (B) · "Resend invitation" always sends English and lands the owner on an English page
- **Expected vs actual:** A PT applicant invited in Portuguese should get the resend in Portuguese. Instead `resendOwnerInvitation(businessId)` sends `{ action: 'resend', businessId }` with no `language`. The handler defaults to `'en'`, so the email is English and the link is `/accept-invite?lang=en`. `?lang=` overrides the stored and browser language (`LanguageProvider.tsx:9-10`), so the accept page is English too.
- **Scenario:** An application with `language: 'pt'` is approved, the owner is invited in PT, the link expires, and the admin clicks Resend. The owner gets an English email and an English page.
- **Where:** `src/services/supabase/supabaseCatalogService.ts:802-803`; `src/features/businesses/BusinessOwnersPanel.tsx:25`; `supabase/functions/provision-owner/handler.ts:56, 85-87, 104`; the mock has the same signature (`mockCatalogService.ts:407`).
- **Fix:**
  - Add `language` to `resendOwnerInvitation(businessId, language)`.
  - In the panel, show a language select next to Resend, defaulting to `defaultLanguage`.
  - Server side, fall back to the language of the last `owner_invitation` (store `language` in the audit metadata or a new `email_log.language` column).
- **Regression test:** handler test: resend with `language: 'pt'` renders the PT template and `?lang=pt`. Component test: the panel passes the selected language.

#### COR-15 · P2 · Owner onboarding (B) · `/accept-invite` forces a password change; reusing a password blocks onboarding for good
- **Detail:** `SetPassword` always calls `auth.updatePassword` before `completeOwnerOnboarding`. Supabase refuses an unchanged password (`same_password`), which isn't in `AUTH_MESSAGES`, so the raw English text is shown even on the PT page. The page returns before the RPC runs, `accepted_at` stays null, and the admin sees "Invitation pending" forever.
- **Scenarios:**
  - (a) The onboarding RPC fails once. The copy says "Reload the page to try again". After the reload the user types the same password and gets the `same_password` error.
  - (b) The admin invites an email that already has a password (for example a removed and re-invited owner). The magic-link path lands on the same form, and re-entering the existing password fails the same way.
- **Where:** `src/features/auth/AcceptInvitePage.tsx:65-81`; `src/services/supabase/auth.ts:20-31, 96-99`; `src/i18n/dictionaries/en.ts:261`.
- **Fix:**
  - Keep `passwordSaved` state (in sessionStorage, so it survives a reload) and skip `updatePassword` when it is set.
  - Treat `same_password` as success.
  - Offer "Continue without changing password" for confirmed accounts.
  - Translate auth errors through `t()`.
- **Regression test:** component test with a fake auth where `completeOwnerOnboarding` fails once. Resubmitting must not call `updatePassword` again and must navigate to `/dashboard`. Unit-test the `same_password` mapping.

#### COR-16 · P2 · Admin → owner (B) · One email can be made owner of two businesses: onboarding crashes and the first business becomes unreachable
- **Detail:** provision-owner refuses only admin emails. `service_link_owner` checks only that the business has no owner. Two consequences follow:
  - **Both invitations pending:** `complete_owner_onboarding()` runs `UPDATE … RETURNING business_id INTO v_business` across two rows. PL/pgSQL raises "query returned more than one row" (verified in PGlite: `scratchpad/audit/returning-into.mjs`). Onboarding always fails with "we could not finish the setup", and neither business is ever marked accepted.
  - **One accepted:** `getCurrentUser` picks the newest membership (`auth.ts:71, 80`). After the second invite the owner's dashboard silently switches to business B and business A becomes unreachable (there is no switcher).
- **Where:** `supabase/functions/provision-owner/handler.ts:68-77`; `supabase/migrations/20261020091428_applications_and_owner_access.sql:254-277, 332-335`; `src/services/supabase/auth.ts:71, 80`.
- **Fix:**
  - Until a business switcher exists, refuse in provision-owner when `userIdByEmail` already has a `business_members` row (409 `email_owns_business`, added to FUNCTION_ERRORS).
  - In a new migration, make `complete_owner_onboarding` safe for several rows (`with u as (update … returning business_id) select business_id from u limit 1`).
- **Regression test:** PGlite test with two pending memberships for one user: `complete_owner_onboarding()` succeeds. Handler test: provisioning an email with an existing membership returns 409.

#### COR-17 · P2 · PLAUSIBLE · Auth · Logout ignores sign-out errors and navigates before sign-out finishes
- **Detail:** `logout` is `void auth.signOut()` and the shell navigates right away. If `signOut()` fails on the network (supabase-js keeps the local session), the user is still signed in and LoginPage sends them back to `/admin` with no message, which is risky on a shared device. Even on success, the user flashes `/login` → `/admin` → `/login`.
- **Where:** `src/auth/AccountProvider.tsx:75`; `src/components/layout/DashboardShell.tsx:146-147, 286-287`.
- **Fix:** make logout async. On error, call `signOut({ scope: 'local' })` and show a toast. Navigate only after it resolves.
- **Regression test:** `signOut` rejects. Expect a toast and the local session cleared.

### P3

#### COR-18 · P3 · Editor · A failed background refresh replaces the editor with an error page
- **Detail:** `ProductEditorPage.tsx:34` shows `ErrorState` on `status === 'error'` even though the previous data is kept (`hooks.ts:33`). Every write triggers a background refetch, so a transient failure unmounts the form mid-edit.
- **Fix:** add `&& !product.data` (also at line 37).
- **Test:** the background refetch fails and the editor stays mounted.

#### COR-19 · P3 · Editor · "Product not found" flashes for one commit after the first save of a new product
- **Detail:** After `goToEdit`, the first render has the new id but the old `{success, data: null}`.
- **Where:** `ProductEditorPage.tsx:22, 36-37`; `hooks.ts:40-43`.
- **Fix:** treat `product.data?.id !== productId` as loading.
- **Test:** router test asserting the text never appears during new → edit.

#### COR-20 · P3 · Editor / storage · Orphaned storage objects
- **Detail:** Uploaded files are cleaned up only when they were referenced by the previously saved product (`supabaseCatalogService.ts:522-533, 700-712`). Files are orphaned when:
  - the editor is abandoned after uploading;
  - a save fails;
  - a file is replaced before saving;
  - an upload is lost to COR-13;
  - signing fails after the upload succeeded (`:888-892` returns a failure but keeps the object).
- **Docs:** this is known (`System_arch/design/19-supabase.md:190`). Line 130 of the same file is out of date: it says delete leaves files behind, but delete now cleans up.
- **Fix:** track the paths uploaded in this editor session. After a successful save, delete the ones not referenced. On blocker "Leave", delete them all. Remove the object when signing fails.

#### COR-21 · P3 · Admin editor · No error state when the business list fails
- **Where:** `ProductEditorPage.tsx:49, 69`.
- **Effect:** On `/new` the Business select is empty with no message. On edit, `business` is undefined, so Preview is disabled and the published dialog never appears. In `useProductActions.tsx:91, 97`, "Copy URL" and "Open product page" do nothing while businesses are loading or failed (dead buttons).
- **Fix:** show `ErrorState` with retry, and disable those menu items with a reason.

#### COR-22 · P3 · Dashboards · Analytics failures hide or zero out other data
- **Where:** `BusinessOverviewPage.tsx:45-49` replaces the whole page on an analytics error. `MyProductsPage.tsx:102` and `AdminProductsPage.tsx:20` ignore stats errors, so the table shows 0 views and 0 AR (`ProductTable.tsx:86-94`).
- **Fix:** scope the error to the stats area, and show "—" plus a notice instead of zeros.

#### COR-23 · P3 · Editor · Delete is not guarded while the request runs
- **Scenario:** A second click shows a second confirm, then a "not found" error toast after the first delete succeeded.
- **Where:** `ProductEditorForm.tsx:185-190, 209`.
- **Fix:** add `busy='delete'` and disable the button.

#### COR-24 · P3 · Editor · Database range limits are not checked in the browser
- **Detail:** Price ≥ 21,474,836.48, dimensions ≥ 1,000,000 (`numeric(8,2)`) and CTA URLs over 2048 characters save in demo. In Supabase they fail with 22003, which falls through to "Try again in a moment", with no field highlighted and every retry failing.
- **Where:** `src/services/validation.ts:246-253`; `supabaseCatalogService.ts:151-167`.
- **Fix:** add maximums to `validateProductDraft`, and map 22003 to VALIDATION.

#### COR-25 · P3 · Owner settings · No browser-close or reload guard for unsaved changes
- **Detail:** `BusinessForm.tsx:51` only blocks in-app navigation. The product editor has a `beforeunload` guard (`ProductEditorForm.tsx:93-98`).
- **Fix:** add the same `beforeunload` effect.

#### COR-26 · P3 · Admin · The QR tab spins forever if the catalogue fails to load
- **Detail:** The spinner shows whenever `catalog.data` is missing, with no error branch.
- **Where:** `BusinessDetailPage.tsx:145`.
- **Fix:** add an `ErrorState` branch.

#### COR-27 · P3 · Admin overview · False empty states on load errors
- **Detail:** "No product activity yet", "No products yet" and "No businesses yet" are shown when the queries failed.
- **Where:** `AdminOverviewPage.tsx:85-88, 124-127, 159-162`.

#### COR-28 · P3 · Businesses list · 0 views and 0 AR shown while analytics load or after they fail
- **Where:** `BusinessesListPage.tsx:45, 50`.
- **Fix:** show "—".

#### COR-29 · P3 · Admin analytics · No way back from a stale `?business=<deleted id>`
- **Detail:** The error state returns before the business filter renders (`AnalyticsView.tsx:44` vs `:78`), so the admin cannot pick "All businesses" again. Business-list errors are ignored and names show as "Unknown" (`AdminAnalyticsPage.tsx:9`).

#### COR-30 · P3 · Business delete / storage · Logos uploaded on create are never cleaned up
- **Detail:**
  - Logos uploaded while creating a business go to `new/<uuid>` (`supabaseCatalogService.ts:883`).
  - `ownedLogoPath` only matches `<id>/` (`:297-300`), so update and delete never remove those files, and they stay publicly reachable.
  - `removeFolder` (`:535-540`) ignores errors, stops at 1000 objects, and runs after the row is deleted, so a failure cannot be retried.
- **Fix:** move the logo to `<id>/` after create, report storage errors, and page through the folder listing.

#### COR-31 · P3 · Audit log · The search placeholder's own example ("approved") finds nothing
- **Detail:** Search matches only `event_type`, and approvals are `application_status_changed` with `to_status = 'approved'`.
- **Where:** `AuditLogPage.tsx:35`; `supabaseCatalogService.ts:853-854`; mock `:552-555`.
- **Fix:** also match `to_status` and `from_status`, or change the example.

#### COR-32 · P3 · Business form · Slug length is not checked in the browser
- **Detail:** The database caps slugs at 63 characters. A 70-character slug gets the generic "Some values were rejected" with no field highlighted in Supabase, and is accepted in demo.
- **Where:** `validation.ts:16-19`; `init_schema.sql:27`.

#### COR-33 · P3 · Demo analytics · Totals include days outside the 30-day window
- **Detail:** Per-product totals add every stored stat, while the chart only adds days in the window, so totals exceed the chart sum as demo data ages.
- **Where:** `src/services/analytics.ts:39-44, 52-56`.

#### COR-34 · P3 · Reset password · An expired or used reset link gives no explanation
- **Detail:** `#error_code=otp_expired` is ignored and the user just sees the request form.
- **Where:** `ResetPasswordPage.tsx:31-38`.
- **Fix:** read the error code from the fragment, as `AcceptInvitePage.tsx:25` does.

#### COR-35 · P3 · Admin · Leave-page prompt after deleting a business with unsaved edits
- **Detail:** "Stay on page" keeps the admin on a business that no longer exists.
- **Where:** `useBusinessActions.ts:42` vs the `BusinessForm.tsx:51` blocker.
- **Fix:** set the form's `skipBlock` before navigating.

#### COR-36 · P3 · Shell · Notification read-state and errors
- **Detail:** One "seen" timestamp in browser storage is shared by every account on the browser, and a failed notification query shows "No activity yet".
- **Where:** `DashboardShell.tsx:21, 203, 208`.

#### COR-37 · P3 · Public · "No products yet" can be painted for one frame after the business resolves
- **Detail:** The placeholder `{ok, []}` query is `success` when `b` arrives, and `execute('new')` only runs after the commit.
- **Where:** `CatalogPage.tsx:30-33, 125`; `hooks.ts:40-43`.
- **Fix:** treat products as pending while `!b` or status is loading, or compare a query key with `b.id`.
- **Test:** browser e2e with a delayed `getProducts` and a MutationObserver that fails if the empty text appears.

#### COR-38 · P3 · Public · Invalid or empty model URLs spin for 45 s and then blame the connection
- **Detail:** `usableModels` only filters stale `blob:` URLs, unlike `readiness.ts:70`. When signing fails, `toProduct` sets `url: ''` and `status: 'invalid'` (`supabaseCatalogService.ts:209-219, 476-477`). `<model-viewer src="">` never fires `load` or `error`, so the visitor sees "Loading 3D model…" until the stall timeout and then a connection message. The catalogue "3D" badge also uses the raw `p.models.glb`.
- **Where:** `ProductMedia.tsx:23-28`; `CatalogPage.tsx:141`.
- **Fix:** require a non-empty `url` and `status === 'valid'`, and use `usableModels` for the badge.

#### COR-39 · P3 · Public · After one failed signed-URL refresh, the next is deferred another 6 hours
- **Detail:** `loadedAt` is advanced before `refetch()`, and a failed refetch keeps the same `data`, so the effect never re-arms. AR can then be handed an expired URL (12-hour TTL).
- **Where:** `hooks.ts:72-82`.
- **Fix:** advance `loadedAt` only when new data arrives.

#### COR-40 · P3 · PLAUSIBLE · Public · AR state is not reset when a refreshed product loses its model
- **Detail:** `modelState` and `canAR` are initialised once per `product.id`. If the GLB was removed, "View in AR" stays visible, a tap does nothing, and an `ar_activation` event is still recorded.
- **Where:** `ProductPage.tsx:82, 91-92`; `ProductMedia.tsx:55`.
- **Fix:** key the state on `glb?.url`.

#### COR-41 · P3 · Applications (B) · An approved application whose business was deleted becomes a dead end
- **Supabase:** `business_id` is set to null on delete, the status stays `approved`, `availableActions('approved')` is empty, and the page shows neither the business card nor the owner panel, with no explanation. The admin cannot re-approve to recreate the business.
- **Demo:** `deleteBusiness` leaves `applications[].businessId`, `owners[id]` and emails stale and writes no audit row. The page shows "Business record" → "Business not found" with a Retry that cannot succeed.
- **Where:** `src/features/admin/ApplicationDetailPage.tsx:64, 169-196`; `src/services/applicationRules.ts:11`; `src/services/mock/mockCatalogService.ts:153-166`.
- **Fix:**
  - Show a notice: "The business created from this application was deleted". Read the `business_deleted` audit metadata, which keeps the business id, by `metadata->>business_id`.
  - Optionally allow `start_review` from `approved` when `business_id is null` (new migration).
  - In the mock, clear `businessId`, `owners` and emails, and add the `business_deleted`, status-change and owner-removed audit rows that the Supabase triggers write.
- **Regression test:** service test: delete the business of an approved application, then `getApplication` has no `businessId` and the audit has `business_deleted`.

#### COR-42 · P3 · Owner invitations (B) · The 10-invitation cap is per business, not per owner
- **Detail:** Attempts are counted from `email_log` by workflow `invite:<businessId>`. Attempts sent to a removed owner count against the next owner.
- **Scenario:** Invite wrong@x and resend 9 times; remove the owner; invite right@x (attempt 11, sent). The first Resend for right@x then fails with "Too many invitations… Contact the owner directly" for good.
- **Second effect:** `email_log.attempt` is checked `between 1 and 100`. After 100 rows, `log()` throws *after* the owner was linked and the email sent, and the function returns 500.
- **Where:** `supabase/functions/provision-owner/handler.ts:79-80, 100-101`; `provision-owner/index.ts:192-201`; `mockCatalogService.ts:414-415`; migration `:100`.
- **Fix:** scope the workflow per membership (`invite:<businessId>:<userId>`), or count only rows created after the current membership's `invited_at`.
- **Regression test:** handler test: remove, then provision a new email after 10 prior attempts; resend is allowed.

#### COR-43 · P3 · PLAUSIBLE · Owner invitations (B) · Concurrent invite or resend can deliver an already-invalidated link
- **Detail:** The cooldown and attempt checks are check-then-act. Two simultaneous requests (two admins, or two tabs) both pass, and both call `generateLink`; the second rotates the token. Both compute the same `attempt`, so both send with idempotency key `invite:<biz>:<n>` but different bodies. Resend rejects the second, so the delivered email can carry the first, now-invalid link, and the owner hits `otp_expired`.
- **Where:** `provision-owner/handler.ts:66, 77-80, 100-111, 137`.
- **Fix:** reserve the attempt first (insert a `pending` `email_log` row under a unique `(workflow, attempt)` constraint) before generating the link. The loser gets `cooldown`.

#### COR-44 · P3 · PLAUSIBLE · Email status (B) · A webhook event that arrives before its email_log row is lost for good
- **Detail:** `sendAndLog` inserts the log row only after Resend responds. `service_record_email_event` stores the svix id first and then updates by `provider_message_id`. If no row matched yet, the event is still marked processed, redeliveries are deduplicated, and the status stays "accepted" forever. This is honest but stale.
- **Where:** `supabase/functions/_shared/email.ts:145-171`; migration `:283-315`; `resend-webhook/handler.ts:63-64`.
- **Fix:** when the update matches 0 rows, delete the provider-event row and return a 5xx so Resend retries. Or insert the log row (`pending`) before sending.

#### COR-45 · P3 · Owner panel (B) · Remove owner has no pending guard
- **Detail:** A double click sends a second delete, which returns NOT_FOUND and shows "Could not remove owner" after the first succeeded.
- **Where:** `src/features/businesses/BusinessOwnersPanel.tsx:67-81, 112`.
- **Fix:** use a `useServiceMutation` with `pending` to disable the button.

#### COR-46 · P3 · Accept invite (B) · A signed-in user with no membership is told the link "has expired or was already used"
- **Detail:** A removed owner, or someone whose invitation was withdrawn, still holds a working link. They are signed in with `user: null` (`auth.ts:82`), and the page shows `Invalid expired`, which is the wrong reason.
- **Where:** `src/features/auth/AcceptInvitePage.tsx:31`.
- **Fix:** if `signedInEmail` is set (signed in, no role), show "This invitation was withdrawn. Ask the Sanctus team." and a sign-out button.

#### COR-47 · P3 · Function errors (B) · Gateway and unknown error bodies become a generic message
- **Detail:** With `verify_jwt` on, an expired admin JWT is refused by the Supabase gateway with its own body (`{code:401,message:'Invalid JWT'}`). `payload.error` is undefined, so the admin sees "The request could not be completed. Try again in a moment" instead of "Sign in again" (PLAUSIBLE). Similarly, provision-owner's `invalid_request` field message (`fields.email`) is dropped by `BusinessOwnersPanel.tsx:52`, which shows only `res.error.message`.
- **Where:** `src/services/supabase/supabaseCatalogService.ts:458-466`.
- **Fix:** map HTTP 401 from `error.context.status` to PERMISSION "Sign in again", and prefer `fieldErrors.email` in the panel.

#### COR-48 · P3 · PLAUSIBLE · Apply wizard (B) · Server field errors that belong to no step are swallowed silently
- **Detail:** In the VALIDATION branch, errors keyed `submissionKey` (or any field not listed in `APPLICATION_STEPS`) produce no `first` step and no `submitError`. The Send button just stops. `loadDraft` accepts any stored draft without checking `submissionKey`, so a draft saved by an older build (or edited storage) reaches this state. The client-side check filters out the same key, so it never warns either.
- **Where:** `src/features/apply/ApplyPage.tsx:45-54, 145-151`.
- **Fix:** if no step owns the errors, set `submitError(t('apply.failed'))`. Have `loadDraft` regenerate a missing or invalid `submissionKey`.
- **Regression test:** component test with a stored draft lacking `submissionKey`. Submit and expect a visible error (or success with a regenerated key).

#### COR-49 · P3 · Applications list (B) · Out-of-range page and timezone date filter
- **Out-of-range page:** `?page=3` with 25 applications renders "No applications yet", because `filtered` ignores `page` (`ApplicationsPage.tsx:26, 39, 78`). Pagination is not rendered, so there is no way back except clearing the URL. Fix: clamp the page to `ceil(total/size)`, or show "No applications on this page" with a link to page 1.
- **Timezone:** `from`/`to` are applied as UTC midnight (`supabaseCatalogService.ts:814-815`; the mock compares the UTC `createdAt.slice(0,10)`), while the table shows local times. A Lisbon admin (UTC+1 in summer) filtering 20 Oct misses an application shown as "20 Oct, 00:30". Fix: convert local day boundaries to ISO with an offset in the browser before querying.

#### COR-50 · P3 · i18n · Public 404 and auth errors are English-only
- **Detail:**
  - `NotFoundPage` (hard-coded "Page not found…") serves every unmatched public URL, including hostname-mode business subdomains, outside `LanguageProvider`.
  - `/accept-invite` shows Supabase auth messages from English-only `AUTH_MESSAGES` (and raw Supabase text), even with `?lang=pt`.
  - `ToastProvider`'s "Dismiss notification" aria-label shows on public toasts (AR failed, share).
- **Where:** `src/features/demo/NotFoundPage.tsx:6-17`; `src/app/router.tsx:126, 150`; `src/services/supabase/auth.ts:20-31`; `src/components/ui/ToastProvider.tsx:71`.
- **Fix:** wrap the public 404 in `LanguageProvider` and use `t()`. Return error codes from auth and translate them in the page.

#### COR-51 · P3 · PLAUSIBLE · Analytics · Visitor key taken from the first `X-Forwarded-For` hop
- **Detail:** If the edge keeps a client-supplied value, a script can rotate fake IPs past the 30/minute limit and inflate views or AR attempts. Conversely, shared store Wi-Fi shares one budget, and the client ignores 429s.
- **Where:** `supabase/functions/track-event/handler.ts:33-35, 62`. The same `clientIp` pattern is in `_shared/http.ts:15`, used for the application rate limit.
- **Fix:** use the platform's trusted client-IP header or the last trusted hop. Document that counts are approximate.

#### COR-52 · P3 · Public · The dimension diagram clips the depth side of deep pieces
- **Detail:** `ox = 40 + D*cos`, but the drawing spans `40 + (W+2D)*cos`. For the seed bed (170×95×210 cm), the "210 cm" label is clipped at the 320-wide viewBox.
- **Where:** `src/features/public/DimensionDiagram.tsx:21, 27, 31`.
- **Fix:** budget the scale for `(W+D)*cos` plus the label margins, and use a fixed `ox`.
- **Test:** unit test that all points fall inside the viewBox.

#### COR-53 · P3 · Demo parity · The mock records analytics for any product and business
- **Detail:** No published or active check and no business-id match, unlike Supabase (`analytics_rate_limit.sql`).
- **Where:** `mockCatalogService.ts:341-353`.

#### COR-54 · P3 · Editor · Changing a published product's slug breaks shared links without a warning
- **Detail:** The business slug has a warning hint; the product slug has none.
- **Where:** `ProductEditorForm.tsx:286-295`.
- **Fix:** warn and confirm when the product is published and the slug changed.

#### COR-55 · P3 · Uploads · Image contents are not verified, and the upload hint is wrong in Supabase mode
- **Detail:** `files.ts:176-182` checks MIME type or extension only, despite the header promising magic-byte checks. A renamed text file passes as `photo.jpg` and satisfies the publish rule. `ImageUpload.tsx:130` says "resized for this demo" in Supabase mode too. Raw Storage error text is shown (`supabaseCatalogService.ts:889`).
- **Fix:** check magic bytes or `createImageBitmap` before upload, make the hint depend on the mode, and map storage errors.

### Smaller notes (not counted)
- **CLAUDE.md rule breaks:**
  - The UI imports `services/mock/*` (`AdminSettingsPage.tsx:11-12`, `RootLayout.tsx:5`).
  - URLs are built outside `src/lib/urls.ts` (`CatalogPage.tsx:51-52`, `ProductPage.tsx:48`, `LandingPage.tsx:66`, `BusinessDetailPage.tsx:67,72`, `BusinessesListPage.tsx:55`).
  - Neither is a functional bug today.
- **Local-preview QR download:** with "Encode local preview URL" on, the downloaded file has the same name and toast as the print QR (`CatalogQrPanel.tsx:23, 29-30`).
- **PLAUSIBLE, low (counts):** `catalogs()` fetches all product rows unpaged (`supabaseCatalogService.ts:499`, also `:555`, `:669`). With `max_rows = 1000` (`supabase/config.toml:18`), counts and analytics are silently truncated past 1000 products.
- **PLAUSIBLE, low (account loads):** `SupabaseAccountProvider.load()` has no request-id guard against out-of-order responses.
- **Concurrent edits:** two editors on one product means the last save wins, and the cleanup can delete the other person's newly uploaded file (`save_product` replaces child rows; `supabaseCatalogService.ts:700-712`). The fix needs optimistic concurrency on `updated_at`, which means a migration and owner approval.
- **Preview on a published product:** Preview saves unsaved edits straight to the live page, and the `window.open` after an `await` may be popup-blocked on iOS Safari (`ProductEditorForm.tsx:171-181`). PLAUSIBLE.
- **Demo variance:** the duplicate-slug error code differs between update (VALIDATION) and create (CONFLICT); the UI shows the same thing.

---

## 3. i18n check (programmatic)

The script is `scratchpad/audit/i18n-keys.mjs`. Its output:
- `en.ts` has 253 keys and `pt.ts` has 253. None are missing in PT, none are extra, and no placeholder sets differ.
- Every literal `t('…')` key used under `src/` exists in `en`. Dynamic keys were checked by hand and all resolve: `apply.err.*` (7 codes), `apply.step.*`, `apply.cat.*`, `apply.count|photos|models.*`, `category.*` (DB-constrained to the 7 seeded categories), `landing.col.*`, `product.width|height|depth`.
- Nine PT values are identical to EN. They are cognates or the client's verbatim brand copy, not defects: `product.material`, `site.nav.home` ("Home", verbatim per ADR-0023), `landing.title`, `landing.hero.title1/2`, `landing.quoteBy`, `landing.feature.name`, `apply.f.website`, `apply.f.applicantEmail`.
- Grepping the public pages (`features/public`, `marketing`, `apply`, `AcceptInvitePage`, `three`) found no hard-coded English in their JSX, apart from the honeypot label (intentionally hidden), the `placeholder="www.example.com"`, and the items in COR-50.

## 4. Checked and found correct
- **Applications and owner access:**
  - The transition table matches between the DB, `applicationRules.ts` and the UI.
  - Repeated actions are no-ops (`for update` lock; a double approve creates one business).
  - Rejection requires a reason in all three places.
  - Approval creates a private **draft** business with no contact data.
  - `submissionKey` idempotency covers double click and lost responses (including the concurrent 23505 path).
  - FUNCTION_ERRORS covers every error code the browser-called functions return.
  - Email status is reported honestly (accepted ≠ delivered; blocked and failed shown as not sent).
  - Email failures never undo stored rows.
- **Auth:** no open redirect via `?next`, no premature redirect while the session loads, and the no-membership owner gets a clear notice.
- **Owner scope:** owners cannot open or edit another business's products (UI check plus RLS / `save_product` 42501, covered by `live.integration.test.ts`), nor change their slug or status (trigger).
- **Public product page:**
  - AR is native only: `ar-modes="scene-viewer quick-look"`, `ar-scale="fixed"`, `ios-src` only with a USDZ, no WebXR.
  - Photos come first; 3D and AR are separate actions.
  - There is no cart or checkout.
  - The catalogue QR encodes the catalogue URL.
  - Hostname-mode links match their routes.
  - Analytics keep views and AR launch attempts separate, one view per mount, with AR taps de-duplicated.
- **Variants:** they change only name and price, which is a documented open client question (PRD R-09), not a defect.

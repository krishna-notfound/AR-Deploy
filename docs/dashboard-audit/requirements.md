# Sanctus: requirements traceability, owner experience (Agent A)

- **Repo:** `<local>`
- **Branch and commit:** `feature/sanctus-brand-design-system` @ `e2c1e74`
- **Mode:** read-only. No repo files, live services or secrets were touched.
- **Date:** 2026-10-20

**Sources of truth used:**
- `docs/PRD.md`
- `docs/DECISIONS.md`
- `docs/PRODUCTION_AUDIT_AND_PLAN.md`. This is the owner's 2026-10-20 restatement of the client requirements: its matrix rows A–E and decisions C1–C19.
- ADR-0005, ADR-0021, ADR-0023 and ADR-0024
- `System_arch/Task.md` and `System_arch/tasks/P11-sanctus.md`
- `docs/CLIENT_HANDOVER.md` and `docs/PRODUCTION_READINESS.md`
- `nextlevel/ULTRAREVIEW_PRODUCTION_READINESS.md`
- `System_arch/design/13-features-business.md`
- The code in `src/` and `supabase/`

**Client reference material in `AR-attachment/`:** seven images and no text files. Described by filename only, as mapped in `System_arch/design/21-sanctus-reference-map.md:9-15`:
- `PHOTO-2026-10-12-18-35-54.jpg`: the brand board.
- `PHOTO-2026-10-16-23-05-50*.jpg`: a brand collage, the full homepage, and a low-resolution copy of the moodboard.
- `Sanctus Luxury Furniture Website Moodboard (2).png`: nine page mockups. These include a cart and a contact page, both deliberately out of scope.
- `Sanctus_ Beyond What Is Seen (1).png` and `(2).png`: product pages with the 3D/AR rail, and AR phone views.

**None of the references shows an owner or admin dashboard.** Every owner-dashboard requirement below comes from the docs, not from the images.

**Classification labels:**
- **CONFIRMED** means the client or owner approved it, or the client stated it as a requirement.
- **ASSUMPTION** means engineering inferred it.
- **RECOMMENDATION** means it was proposed and is not required.
- **OPEN DECISION** means it needs the client or owner.

**Priority scale:**
- **P0:** blocks owner use or release.
- **P1:** a confirmed requirement that is missing.
- **P2:** partial, or a correctness or UX gap.
- **P3:** polish.

---

## 1. Requirements traceability

### 1a. Owner dashboard capabilities

| # | Requirement | Class | Evidence / source | Current implementation | Gap | Pri | Verification |
|---|---|---|---|---|---|---|---|
| O-1 | The owner signs in to a dashboard scoped to their one business | CONFIRMED | ADR-0024 `:7,12`; DECISIONS `:18` | Routes `src/app/router.tsx:88-102`; scoped by `useCurrentBusiness()`; RLS `is_business_member` in `init_schema.sql:261-317` | None in code. Real sign-in is blocked by invitation-email configuration (B1–B8 in ULTRAREVIEW §11) | P0 (config) | Preview: apply, approve, invite, receive the email, set a password, sign in, land on `/dashboard` |
| O-2 | Overview: counts and headline metrics | CONFIRMED (design/13 spec; R-30) | `design/13-features-business.md:9` | `BusinessOverviewPage.tsx:51-59` shows 5 stats (products, published, drafts, views, AR launch attempts), the trend, recent products and activity | No notice for an **inactive** (paused) business. The draft notice exists (`DashboardShell.tsx:76-85`). "View my catalog" (`:36`) opens a page that shows "unavailable" while the business is draft | P2 | Unit test of the shell notice for `inactive`; e2e: a draft-business owner clicks "View my catalog" |
| O-3 | Products: list, search and filter | CONFIRMED (R-23; design/13 `:10`) | PRD `:56` | `MyProductsPage.tsx:18-60`; `ProductTable.tsx` | None | — | e2e `product-crud` (exists) |
| O-4 | Create and edit a product | CONFIRMED (R-23, R-24) | PRD `:56-57` | `ProductEditorPage scope="business"`; `ProductEditorForm.tsx` (basics, images, models, specs, variants, CTA) | No free-form specs (A-3 is closed for materials by C4). Categories are a fixed furniture list (`init_schema.sql:81`; `domain/types.ts:17`) | P2 (see O-20) | e2e `product-crud` |
| O-5 | Publish and unpublish | CONFIRMED (R-23) | PRD `:56` | `useProductActions.tsx:34-53`. Client rules are in `validation.ts:46-55`. In the DB: the products check `init_schema.sql:93-95` and the gallery-image trigger `20261013093006_publish_rules.sql:12-66` | Publish works while the business is draft, and the toast warns about it (`useProductActions.tsx:37-38`). PRD R-23 still says the trigger is "UI-only until applied", which is stale | — | PGlite `tests/migrations.test.ts`; e2e |
| O-6 | Duplicate a product | CONFIRMED (R-23) | PRD `:56` | `useProductActions.tsx:28-33` → `supabaseCatalogService.ts:719-729` creates a draft copy that **shares the stored files** | Shared files are safe today because `removeUnreferencedMedia` (`:528-539`) checks both images and models. Variant media will need the same check (see §4) | — | e2e: duplicate, delete the original, the copy's media still loads |
| O-7 | Delete a product | CONFIRMED (R-23) | PRD `:56` | `useProductActions.tsx:54-70` (with a confirm) → `supabaseCatalogService.ts:730-738` (row delete plus orphan file cleanup) | None | — | e2e; live API suite |
| O-8 | Media uploads: gallery and additional photos | CONFIRMED (R-07) | PRD `:30` | `ProductEditorForm.tsx:421-428`. Limits: images 5 MB, logos 2 MB (`lib/files.ts:10,19`) | Images have no magic-byte check, and the bucket allows 50 MB for any MIME type (SEC-11 / M11) | P3 | Unit test on `lib/files.ts` with a renamed non-image |
| O-9 | 3D models: GLB and USDZ upload, preview, readiness, scale check | CONFIRMED (R-25, R-26, R-06) | PRD `:29,58-59` | `ModelSection.tsx:19-49,218-345`; `features/ar/readiness.ts:18-68`; `lib/scale.ts:24-41`; GLB/USDZ magic bytes (`lib/files.ts:55-72`) | A missing USDZ is a **warning** only (`readiness.ts:43-51`). C19 recommends that USDZ be required for iOS AR (an open question). Any ZIP passes as USDZ. The USDZ is never measured | P2 | Unit tests on readiness; device test (R-35) |
| O-10 | Variants: colour swatch, name EN/PT, SKU, price difference | CONFIRMED (as built; DECISIONS `:13,17`) | PRD `:32,89-94` | `VariantsEditor.tsx:25-60`; `product_variants` `init_schema.sql:133-143` | See O-11 | — | e2e |
| O-11 | **Each variant has its own photos and 3D model (GLB and USDZ)** | CONFIRMED (audit B5 `PRODUCTION_AUDIT_AND_PLAN.md:86`; C3 `:163`; owner approved the additive migration today) | UX-11 (ULTRAREVIEW `:79,176`); P11 sub-project 3 (`P11-sanctus.md:23`) | **Not built.** Picking a variant changes only the price (`ProductPage.tsx:103,128-129`). `ProductMedia` reads only `product.images` and `product.models` (`ProductMedia.tsx:20-26,53`) | No tables, RPC fields, editor UI or public swap. See the design notes in §4 | **P1** | PGlite RLS on the new tables. e2e: switching a variant swaps the photo, the GLB `src` and the `ios-src`. Device: each variant opens its own model in Scene Viewer and Quick Look |
| O-12 | Catalogue preview (including before go-live) | CONFIRMED (R-26 for products; design/13 `:13`) | PRD `:59` | Product draft preview with `?preview=1` (`useProductActions.tsx:77-80`). Catalogue preview opens the public page (`CatalogQrPanel.tsx`, `BusinessOverviewPage.tsx:36`) | `CatalogPage.tsx:89-94` shows "inactive" for any non-active business, so an owner can't preview their **whole catalogue** before activation | P2 | e2e: a draft-business owner previews the catalogue and sees the published products with a "Preview, not public" banner |
| O-13 | Catalogue QR code: download and copy the link | CONFIRMED (R-17; ADR-0005) | PRD `:45`; ADR-0005 `:10` | `MyCatalogPage.tsx:17` → `CatalogQrPanel.tsx:20-60` (PNG at 1024 px, preview-origin warning) | Path mode encodes `window.location.origin` (SEC-07). It is only correct when downloaded from the production domain | P2 (domain C7) | e2e `qr-copy.spec.ts`; scan the QR from the production build |
| O-14 | **Product QR code** in the dashboard | CONFIRMED (audit B8 `PRODUCTION_AUDIT_AND_PLAN.md:88`; P11 sub-project 5 `P11-sanctus.md:29`) | Phase 3 plan `:303` | **Not built in the dashboard.** A product QR exists only in the public desktop hand-off (`ArSection.tsx:55-77`, `shareableCurrentUrl()`). The table has "Copy product URL" only (`ProductTable.tsx:43`) | Missing in the editor and the table. ADR-0005 says "never a product" (`:7`), which needs an amendment | **P1** | e2e: the decoded QR in the editor equals `productPublicUrl(business, product)` |
| O-15 | Analytics: product views vs **AR launch attempts**, per product and in total | CONFIRMED (R-28, R-29, R-30; DECISIONS `:11`) | PRD `:66-68` | `AnalyticsView.tsx:71-99` (views, "AR launch attempts", 3D interactions, rate); `ProductPage.tsx:140-149` (one event per tap, 2 s guard); `track-event/handler.ts:15` | Labels are inconsistent: the table column is "AR" (`ProductTable.tsx:88-89,129`), and the rate hint says "Activations per product view" (`AnalyticsView.tsx:99`). Fixed 30-day window (design/16 excludes a date picker). Live numbers not reconciled | P3 | Unit test on the labels; reconcile live counts against `product_analytics` |
| O-16 | Settings: the owner edits name, logo, description and contact; address and status are read-only | CONFIRMED (design/13 `:16-19`; HANDOVER `:65`) | `BusinessForm.tsx:29,43,185-189` | UI limits the fields to `OWNER_FIELDS`. The DB guard trigger blocks only `slug` and `status` (`init_schema.sql:224-241`) | An owner can change `accent_color`, `default_currency` and any `https` `logo_url` through the API (SEC-27, ULTRAREVIEW `:138`) | P2 | PGlite: an owner's PATCH of `accent_color` is refused once column grants are in place |
| O-17 | No dead buttons; loading, empty and error states | CONFIRMED (CLAUDE.md hard rule) | — | Present on all `/dashboard` pages read (`BusinessOverviewPage.tsx:45-106`, `MyProductsPage.tsx:30-58`, `MyCatalogPage.tsx:16-24`) | None found | — | Component tests |

### 1b. Public and product experience the owner configures

| # | Requirement | Class | Evidence / source | Current implementation | Gap | Pri | Verification |
|---|---|---|---|---|---|---|---|
| O-18 | Native AR only: Scene Viewer (Android) and Quick Look (iOS); 3D viewer elsewhere | CONFIRMED (ADR-0021; DECISIONS `:7`) | ADR-0021 `:10` | `ModelViewer.tsx:116,130-131` (`ar-modes="scene-viewer quick-look"`, `ar-scale="fixed"`) | **Never tested on a real device** (R-35, SEC-02). UX-10: three overlapping 3D/AR controls on phones. Changing them needs owner go-ahead and a device test | P1 (gate) | Device matrix: one ARCore phone and one iPhone |
| O-19 | True real-world scale | CONFIRMED (R-06; audit C3) | PRD `:29` | `lib/scale.ts:24-53`; editor `ModelSection.tsx:327-345`; public `ProductPage.tsx:130,319,415-435` (copy is qualified when a separate USDZ is unmeasured) | Not measured on a device. The USDZ is unmeasured. Variant models will need their own check | P1 (gate) | Tape-measure test on both platforms |
| O-20 | Multi-industry; categories not furniture-only | CONFIRMED (A2 `PRODUCTION_AUDIT_AND_PLAN.md:78`) / mechanism is OPEN DECISION (C10 `:170`) | `P11-sanctus.md:21` (D1) | Fixed DB check `sofa…decor` (`init_schema.sql:81`; `domain/types.ts:17`) | An owner can't sell non-furniture items | P2 | Create a non-furniture product |
| O-21 | EN/PT public pages; product text in both | CONFIRMED (R-11) | PRD `:35` | `t()` and `localized()`; `LocalizedField` in the editor | The dialect is mixed: `lang="pt-PT"` (`LanguageProvider.tsx:46`) while the landing copy is pt-BR (C6 open). PT product text is optional (only `name.en` is required to publish) | P2 (C6) | i18n completeness test; client review |
| O-22 | EN/PT for **dashboards** and auth | OPEN DECISION | Audit E1 `:106` and P11 sub-project 4 (`P11-sanctus.md:24`) say EN/PT everywhere. CLAUDE.md `:50`, HANDOVER `:22` and `readiness.ts:17` say the dashboards are English-only | English-only | The docs contradict each other (see §3) | P2 | Decision first, then a dictionary-coverage test |
| O-23 | No cart, checkout or payments | CONFIRMED (B9 `:89`; ADR-0023 `:16`) | — | None present | None | — | grep gate |
| O-24 | No direct store-contact feature, vs the existing per-product CTA and "Contact the store" modal | OPEN DECISION (C15/C16 `PRODUCTION_AUDIT_AND_PLAN.md:175-176`; ADR-0023 `:16` "restyled, not removed (decision for the client)") | ULTRAREVIEW `:179` | Editor CTA section `ProductEditorForm.tsx:504-511`; public CTA link and contact modal `ProductPage.tsx:167,274-280,372-401` | The phase 1 default in the audit plan (hide behind a flag) was **not** done. No CTA-click analytics (D14/M10) | P2 (decision) | After the decision: e2e that the modal is hidden or shown; the `cta_click` event is recorded if C16 = yes |
| O-25 | Shareable product and catalogue URLs | CONFIRMED (R-18) | PRD `:46` | `lib/urls.ts:26-60`; "Copy product URL" in the table | Path mode depends on the origin (SEC-07) | P3 | Unit test on `urls.ts` |

### 1c. Owners and admins

| # | Requirement | Class | Evidence / source | Current implementation | Gap | Pri | Verification |
|---|---|---|---|---|---|---|---|
| O-26 | Exactly **one owner per business**, created by an admin; no self-registration or self-claim | CONFIRMED (ADR-0024; DECISIONS `:18`) | ADR-0024 `:7,12` | Unique index `20261020091428_applications_and_owner_access.sql:19`; the `register_business`, claim and add-member RPCs were dropped (`:11-16`); `provision-owner/handler.ts:69-87` (409 on `business_has_owner`, `email_owns_business`, `account_not_invited`); `service_link_owner` is service-role only (`:254-280`) | `business_members.user_id` is not unique, so one user could own two businesses at DB level. The provisioning check covers it in code, but COR-16's DB hardening is pending | P3 | PGlite: a second owner insert fails; probe a second business for the same user |
| O-27 | Admin approval before a business is public; rejection with a reason | CONFIRMED (ADR-0024 `:11`; DECISIONS `:13,18`) | Audit D1/D7 `:98,104` | `admin_review_application` (`:150-214`) creates a **draft** business (`:188-192`). Only an admin can activate it (guard trigger). Anonymous RLS requires `status='active'` (`init_schema.sql:261-263,299-303`) | No signal from the owner when the catalogue is ready for review (RECOMMENDATION) | P3 | Anonymous REST probe of a draft business returns nothing (live suite) |
| O-28 | Owner isolation (cross-tenant) | CONFIRMED (R-20; D5) | ULTRAREVIEW `:17` (44 probes) | RLS on products, children and storage (`20261012192159_storage.sql:98-140`) | SEC-05 is latent: the anonymous storage read is not tied to the business | P3 | PGlite and live probes |

---

## 2. Owner vs admin permission model (code and RLS)

| Capability | Owner (`business_members` row) | Platform admin (`platform_admins`) | Enforced by |
|---|---|---|---|
| Read own business, including draft and inactive | Yes | All businesses | RLS `init_schema.sql:264-266` |
| Edit name, description, contact and logo | Yes | Yes | RLS `:270-273`; UI `OWNER_FIELDS` `BusinessForm.tsx:29` |
| Edit `accent_color`, `default_currency` | **API: yes; UI: no** (SEC-27) | Yes | Not blocked by the trigger, so a gap |
| Change slug or status (activate or pause) | No | Yes | Trigger `guard_business_admin_fields` `:224-241` |
| Create or delete a business | No | Yes | RLS `:267-276` |
| Add, change or remove owners; invite | No | Yes, through `provision-owner` (Edge Function, server-side admin check) | RLS `:287-297`; service-role RPCs |
| Products: create, read, update, delete, duplicate, publish and unpublish | Own business only | Any | RLS `:305-317`; `save_product` is SECURITY INVOKER (`save_product.sql:10-20`) and never sets `status` or `business_id` |
| Publish while the business is draft | Allowed, but the product isn't public until the business is active | Same | Anonymous RLS `:299-303` |
| Images, models and variants | Own products; stored path must be in the own business folder | Any | RLS `:321-354` |
| Storage upload, read and delete | `{own business_id}/…` | Any | `20261012192159_storage.sql:98-140` |
| Analytics read | Own business | All | RLS `:365`; view `security_invoker` |
| Applications, audit events, email log | No | Read only; writes go through RPCs and functions | `20261020091428…sql:62-95`; `email_log.sql:35-40` |
| Become admin, or read another tenant | No (44 probes) | — | `platform_admins` has no browser writes |

The role guard in the UI is not a security boundary. Every row above is backed by RLS, a trigger or a service-role function, except the SEC-27 columns.

---

## 3. Contradictions: docs vs code, and docs vs docs

1. **Per-variant media:**
   - Open in the docs: PRD R-09 (`docs/PRD.md:32,98`) says "needs client decision", and the handover limitation (`CLIENT_HANDOVER.md:180`) says the same.
   - Confirmed elsewhere: the audit plan treats it as a client requirement (B5/C3, `PRODUCTION_AUDIT_AND_PLAN.md:86,163`), and the owner approved the migration today.
   - The PRD and the handover need updating.
2. **Materials:** PRD R-08 (`:31,99`) says "needs client decision", while the audit plan C4 (`:164`) says "decided: one line per language".
3. **Product QR:** ADR-0005 (`:7`) and the handover (`:131`) say the QR is "never a single product". The confirmed requirement B8 and sub-project 5 ask for a product QR. The catalogue QR rule can stay; ADR-0005 needs an amendment, not a reversal.
4. **Dashboard language:** CLAUDE.md `:50`, HANDOVER `:22` and the `readiness.ts:17` comment say English-only. Audit E1 and P11 sub-project 4 say EN/PT for dashboards.
5. **Contact CTA:**
   - ADR-0023 `:16` keeps the CTA and the contact modal as "decision for the client".
   - The audit plan phase 1 default (`:175`) was to hide them behind a flag.
   - The code still shows both. The client excluded "direct store-contact functionality".
6. **Owner editable fields:** HANDOVER `:65` says "only a platform admin can change … accent colour". The DB lets owners change it (SEC-27).
7. **AR label:**
   - HANDOVER `:155` says the summary card reads "AR button activations", and PRD R-29 (`:67`) says the label is still "AR activations".
   - The code says "AR launch attempts" (`AnalyticsView.tsx:72,97`). The table column says only "AR" (`ProductTable.tsx:88-89`).
8. **Live AR mode:**
   - PRD header `:3` says native-only AR has been live on `main` since 2026-10-14.
   - PRD R-04 `:27` says "`main` (live) still WebXR-first".
   - ADR-0021 status `:2` says "not deployed".
   - The HANDOVER banner (`:6`) says the live site "tries an in-browser AR mode first".
   - These need reconciling.
9. **Owner scope:** CLAUDE.md `:5` and design/13 `:1` say "Business Admin (scope pending)", but ADR-0024 confirms owner accounts. PRD X-01 (`:84`) still describes ADR-0022 sign-up and claim links, which were dropped by migration `20261020091428…:11-16`.
10. **Stale PRD notes:**
    - PRD R-23 says the publish trigger is "UI-only until migration applied", but it is applied.
    - R-33 says "6 migrations"; there are 9 in `supabase/migrations/`.
    - P11 calls variant media "migration 9", which would actually be the 10th file.
11. **Handover branding:** the title and copy say "AR Furniture Platform" and "furniture business owner" (`CLIENT_HANDOVER.md:1,17`). ADR-0023 says Sanctus and multi-industry.
12. **Handover sign-up:** HANDOVER `:196` says "before owners can sign up", but sign-up was removed (ADR-0024).
13. **Audit plan M8 design vs what shipped:**
    - The audit plan proposed `approval_status` and `catalog_visible` columns on `businesses`, plus a `categories` table (`:358-378`).
    - What shipped is a separate `business_applications` lifecycle with business `status` unchanged (draft, active, inactive), and no categories table.
    - The approval-vs-visibility goal (D7) is met differently. Categories (A2/C10) are still open.

---

## 4. Prioritized owner-dashboard checklist

### (a) Confirmed requirement gaps

1. **P0 (config, not code): owner invitations deliverable.**
   - Client-side Admin: Resend secrets, the `/accept-invite` redirect allow-list and Auth settings (B1–B8; D2 in P11). Rotate the exposed Resend key.
   - Smallest step: the client Admin applies the checklist, then one real round trip on the Preview.
2. **P1: per-variant photos and 3D models (O-11; the migration is approved).**
   - **Migration** (new file with `npx supabase migration new`, additive):
     - `variant_images` (variant_id FK on delete cascade, url | storage_path, alt, is_primary, sort_order).
     - `variant_models` (variant_id, format glb/usdz, url | storage_path, file_name, size_bytes, PK (variant_id, format)).
     - Same checks as `product_images` and `product_models`.
     - RLS that mirrors `init_schema.sql:321-345` through `product_variants → products`, including the own-business folder check on `storage_path`.
     - Explicit `grant select` to anon and authenticated, plus writes to authenticated.
   - **Required, easy to miss:**
     - **`save_product` deletes and reinserts every variant on each save** (`save_product.sql:77-94`), and the client does not send variant ids (`supabaseCatalogService.ts:281`). Variant ids therefore change on every save, and cascading media rows would be wiped. Have `save_product` accept the variant `id`, insert with the given id (`coalesce((r.id)::uuid, gen_random_uuid())`), and write the variant media in the same transaction. Use `create or replace`, keeping the signature compatible by adding the media inside each variant's JSON.
     - **Storage read policy** "Media of visible products is readable" (`20261012192159_storage.sql:90-96`) only checks `product_images` and `product_models`. Add `or exists` on `variant_images` and `variant_models`, or the signed URLs for visitors fail.
     - **Orphan cleanup** `removeUnreferencedMedia` (`supabaseCatalogService.ts:528-539`) must also query the variant tables. Otherwise deleting a product can remove files that a duplicate's variants still use.
     - `hydrate()` signs URLs for the new paths.
     - The `mock` service and the `ProductVariant` type (`domain/types.ts:82-89`) gain optional `images` and `models`.
     - Regenerate `database.types.ts` (`npm run db:types`).
   - **Editor:** per-variant photo and model uploads that reuse `ImageUpload` and `ModelSection`/`ModelPreview`. The shared-features rule means no duplicates. Show a per-variant scale check and iOS readiness. The fallback is product media when a variant has none (ASSUMPTION in M9 `PRODUCTION_AUDIT_AND_PLAN.md:385`).
   - **Public page:** a pure helper (for example in `lib/product.ts`) returns the product with the selected variant's media over the product's. Pass it to `ProductMedia` (`ProductPage.tsx:192`). The `ModelViewer` remount on `src` change is already fixed (SEC-04).
   - **Tests:** PGlite RLS (anon sees only published and active; owner B denied), the save round trip keeps variant ids, and e2e variant swap. Device check per variant.
3. **P1: product QR in the editor and table (O-14).**
   - A small `ProductQr` built on `useQrCode` plus `downloadDataUrl`. It encodes `productPublicUrl()` from `lib/urls.ts`.
   - Add it to the "Product published" dialog and the editor header or sidebar, and add a "Product QR code" menu item in `ProductTable.tsx`.
   - Reuse the preview-origin warning from `CatalogQrPanel`. Amend ADR-0005 (the catalogue QR stays catalogue-only).
4. **P1 (gate): real-device AR and true-scale check (O-18, O-19).** No code change. Fill the device matrix, including one variant model once item 2 ships.
5. **P2: categories not furniture-only (O-20).** Smallest safe change once C10 is answered: a migration that replaces the check with an admin-managed `categories` table (EN/PT labels), or with free text.

### (b) Recommended improvements (not client-confirmed)

1. **P2: catalogue preview for owners of draft or inactive businesses (O-12).**
   - Add `allowDraft` handling to `CatalogPage` for signed-in members, like the product `?preview=1`, with a visible "Preview, not public" banner.
   - Relabel "View my catalog" when the business isn't active.
2. **P2: SEC-27 column-level UPDATE grants** on `businesses` for owners (name, description, contact fields, `logo_url`), or extend the guard trigger to `accent_color` and `default_currency`. This needs owner approval for the migration.
3. **P2: an inactive-business notice** in `DashboardShell.tsx:76-85`, alongside the draft one.
4. **P2: USDZ readiness wording (C19).**
   - Keep it a warning until the client confirms.
   - If confirmed, block AR claims (not publishing) without a USDZ.
5. **P3: one label for AR launch attempts.** Rename the table column "AR" to "AR attempts" (`ProductTable.tsx:89,129`), and the hint to "Launch attempts per product view" (`AnalyticsView.tsx:99`).
6. **P3: image magic-byte check** in `lib/files.ts`, plus per-bucket MIME and size limits (M11).
7. **P3: COR-16 DB hardening** (one membership per user, or a safe `complete_owner_onboarding`), and the COR-05 slug-change audit event.
8. **P3: an owner "ready for review" signal** to the admin (for example an audit event or a dashboard checklist).
9. **P3: an optional `?variant=` deep link and a variant id on analytics events.** Not required; only useful after item 2.

### (c) Needs a client or owner decision

1. **C15/C16:** keep, hide or remove the per-product CTA link and the "Contact the store" modal (`ProductPage.tsx:274-280,372-401`), and whether to track CTA clicks (M10).
2. **Dashboard and auth language (O-22):** English-only (CLAUDE.md) or EN/PT (E1, sub-project 4). Also the Portuguese dialect, pt-BR or pt-PT (C6).
3. **Variant scope details:** may a variant also carry its own dimensions, SKU-level stock or material? (PRD A-3 asks this; dimensions currently stay per product, and the scale check uses them.) Must every variant have a model, or is fallback to the product model acceptable?
4. **C19:** is a USDZ mandatory for every product, or every variant, with a model?
5. **UX-10:** consolidate the phone 3D/AR controls. This needs owner go-ahead and a device test (ADR-0021).
6. **C10:** a fixed admin-managed category list or free text, and the default currency (EUR or BRL).
7. **C7:** the production domain. Printed QR codes, both catalogue and product, must be generated from it.

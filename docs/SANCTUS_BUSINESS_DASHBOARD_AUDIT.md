# Sanctus business dashboard: audit and implementation

| | |
|---|---|
| **Date** | 2026-10-20 |
| **Branch** | `feature/sanctus-brand-design-system` |
| **Commits** | `a1e8392` (variant media, dashboard, 3D/AR), `422481b` (fixes from the QA journeys) |
| **Preview** | https://ar-deploy-i328t0wiz-track0.vercel.app (Supabase mode, client dev project `zggylkbgajamhriebdrg`) |
| **Appendices** | [`dashboard-audit/requirements.md`](dashboard-audit/requirements.md) (full traceability, 28 rows), [`dashboard-audit/dashboard-ux.md`](dashboard-audit/dashboard-ux.md), [`dashboard-audit/security-owner.md`](dashboard-audit/security-owner.md), [`dashboard-audit/ar.md`](dashboard-audit/ar.md), [`dashboard-audit/qa-journeys.md`](dashboard-audit/qa-journeys.md) |
| **Related** | [`SANCTUS_3D_AR_QA_REPORT.md`](SANCTUS_3D_AR_QA_REPORT.md), [`SANCTUS_DASHBOARD_TEST_RESULTS.md`](SANCTUS_DASHBOARD_TEST_RESULTS.md), [`QA_BUSINESS_MANUAL_CLEANUP.md`](QA_BUSINESS_MANUAL_CLEANUP.md) |

## How the work was done

Five workstreams ran as separate agents, each owning its own files. The orchestrator then integrated the code, ran every gate, applied the migration and ran the QA journeys on the deployed Preview.

| Workstream | Output |
|---|---|
| A. Requirements and architecture | Traceability table, permission model, contradictions between docs and code, checklist |
| B. Dashboard UX | 12 findings (DUX-01 to DUX-12) and a prioritised implementation list |
| C. Dashboard functionality | Implementation of the DUX list and ADR-0025. The agent was stopped part-way at the owner's request, and the orchestrator finished its work. |
| D. 3D/AR | Model checks, a compatibility matrix, AR-01 to AR-14, and the per-variant design |
| E. Security | Owner isolation probes (about 60, PGlite), OWN-01 to OWN-06, and the variant-media security spec (23 probes) |
| V. Variant media and AR fixes | The migration, services, editor and public product page |
| QA executor | Created the QA products and ran Journeys A to G against the Preview |

## 1. Requirement traceability (summary)

The full table, with file and line evidence, is in [`dashboard-audit/requirements.md`](dashboard-audit/requirements.md). **CONFIRMED** means a client or owner requirement or decision; **OPEN DECISION** means the client still has to decide.

| Requirement | Class | Status after this work | Verification |
|---|---|---|---|
| The owner signs in to a dashboard scoped to one business | CONFIRMED | **PASS** in code and on the Preview. Real email invitations are **BLOCKED** by configuration. | Journey A (QA run), `ownerDashboard.test.tsx` |
| Overview: counts, metrics, next steps | CONFIRMED | **PASS.** Adds next steps, draft and paused notices, and a status badge. | Journey G, tests DUX-01 and DUX-04 |
| Products: list, search, filter | CONFIRMED | **PASS.** Adds the AR readiness label and a 3D/AR filter. | e2e `product-crud`, Journey B |
| Create, edit, publish, unpublish, duplicate, delete | CONFIRMED | **PASS** | Journey B (create, reload, preview, publish, unpublish, re-publish), e2e |
| Media uploads: photos and GLB/USDZ | CONFIRMED | **PASS.** GLB and USDZ validation is stronger (header, version, length, zip entry). | Journey B; the invalid GLB was rejected (P6) |
| **Variant-specific photos and 3D models** | CONFIRMED (migration approved 2026-10-20) | **PASS: built and applied** (migration `20261020143507_variant_media.sql`) | Journey C (P3), 8 PGlite tests, `productVariants.test.tsx` |
| Catalogue preview before go-live | CONFIRMED | **PASS.** The owner preview is bannered; anonymous visitors still see "unavailable". | DUX-02 test, Journey G |
| Catalogue QR (catalogue URL) | CONFIRMED (ADR-0005) | **PASS.** Decoded and opened. | Journey D, test |
| Product QR | CONFIRMED (audit B8) | **PASS.** New, under ADR-0025, and offered only for published products of an active business. | Journey D (decoded), test |
| Analytics: views vs AR launch attempts | CONFIRMED | **PASS.** Counts match the controlled traffic exactly, labelled "AR launch attempts". | Journey F |
| Native AR: Scene Viewer and Quick Look | CONFIRMED (ADR-0021) | **Partial.** The handoff passed in emulation. Physical AR is **BLOCKED** (no device). | 3D/AR report |
| True scale | CONFIRMED | **Partial.** Bounding boxes match the dimensions within 1 cm. Physical scale is **BLOCKED** (no device). | 3D/AR report |
| EN/PT on public pages | CONFIRMED | **PASS** (the dashboards stay English-only, per CLAUDE.md) | Journey G |
| No cart, checkout or store-contact | CONFIRMED | **PASS** for cart and checkout. The existing per-product "Contact the store" link is kept under ADR-0023 (**OPEN DECISION**). | Code review |
| One owner per business, admin-invited | CONFIRMED (ADR-0024) | **PASS.** The QA owner went through apply, approve, invite and accept. | QA setup |
| Configurable categories (multi-industry) | OPEN DECISION (C10) | **Not built.** The fixed furniture list remains. | — |
| Dashboard language, PT dialect, whether USDZ is mandatory | OPEN DECISION | Unchanged | — |

## 2. Existing functionality and gaps

**Kept as it was** (workstream B found these sound):
- the editor's section navigation, error summary and unsaved-changes guard;
- the AR readiness checklist and true-size check;
- "AR launch attempts" wording;
- keyboard-operable row menus;
- the catalogue QR.

**Gaps closed in this work:**
- variant media;
- the product QR;
- the owner catalogue preview;
- the paused-catalogue notice;
- AR readiness in the product list, including an "Android AR blocked" state;
- next steps on the overview;
- mobile overflow on the QR panel and the overview;
- analytics wording;
- a warning when copying a draft's link;
- touch targets;
- the sidebar highlight.

**Gaps still open:**
- **DUX-06:** the editor shows the publish checklist only after a failed attempt. All publish problems now appear together in one pass, but not before the first attempt.
- **Categories:** still a fixed list (C10).
- **The client's open decisions:** listed in section 6.

## 3. Dashboard architecture and implementation summary

**Routes:**

| Route | Page |
|---|---|
| `/dashboard` | Overview |
| `/dashboard/products` | My Products. "Add product" is now an action button rather than a nav item. |
| `/dashboard/products/new` and `/:id/edit` | Shared `ProductEditor` |
| `/dashboard/analytics` | Shared `AnalyticsView` |
| `/dashboard/catalog` | Shared `CatalogQrPanel` |
| `/dashboard/settings` | Shared `BusinessForm` |

The shared features are not duplicated per dashboard (CLAUDE.md).

**Owner preview:** `/catalog/<slug>?preview=1` for a signed-in member. It relies on RLS: members can read their own non-active business and its draft products. Anonymous visitors still get "This catalog is currently unavailable".

**Variant media (data):**
- `product_variant_images` and `product_variant_models` hold storage paths only.
- Each row must reference a variant of the same product, and paths must be `<business_id>/<uuid>.<ext>`.
- Visitors can read; owners can read, insert and delete; only the service role can update.
- `save_product` keeps variant ids stable and writes variant media in the same transaction.
- A trigger stops a product moving to another business (OWN-01).
- A nullable `required_extensions` column on the model tables keeps the Scene Viewer warning.

**Variant media (page):** the product page uses `variantMedia()`:
- the variant's own photos, GLB and USDZ, always as a pair from the same source;
- otherwise, the product's media with an honest note saying which finish the 3D and AR show;
- `?variant=<id>` deep links.

**New decision:** ADR-0025, "Product QR and owner catalogue preview". The catalogue QR still encodes the catalogue URL only.

## 4. UX and friction findings

The full list, with acceptance criteria, is in [`dashboard-audit/dashboard-ux.md`](dashboard-audit/dashboard-ux.md).

| ID | Finding | Status |
|---|---|---|
| DUX-01 (P1) | A paused catalogue showed "Published 2" with no warning | **Fixed.** Notice on every dashboard page, plus a status badge. |
| DUX-02 (P1) | The owner couldn't preview the catalogue before it was active | **Fixed.** Owner preview with a banner. |
| DUX-03 (P1) | The QR panel was cut off on phones | **Fixed** |
| DUX-04 | No next steps on the overview | **Fixed** |
| DUX-05 | AR readiness not visible in the list | **Fixed.** Label and filter. QA follow-up: models that exist only on variants are now counted. |
| DUX-06 | Publish rules shown only after a failed attempt | **Open** (all problems now appear in one pass) |
| DUX-07 | Analytics wording; "0.0%" for products without a model | **Fixed.** Shows "—" and states the period. |
| DUX-08 | Technical labels shown to owners | **Fixed** |
| DUX-09 | "Copy product URL" on a draft copied a link customers can't open | **Fixed.** The toast now warns. |
| DUX-10 | Phone touch targets of 28 to 32 px | **Fixed** (44 px) |
| DUX-11 | No sidebar highlight while editing | **Fixed** |
| QA-1 | A variant-only 3D product shown as "photos only" | **Fixed and re-verified on the Preview** |
| QA-2 | Overview 404 px wide on a 390 px phone | **Fixed and re-verified** |
| QA-3 | The 3D viewer had no keyboard focus ring | **Fixed** (keyboard only; checked in a browser) |
| QA-4 | The QR toast claimed exactly 1024 px | **Fixed** (wording) |

## 5. Security and permissions

Full details are in [`dashboard-audit/security-owner.md`](dashboard-audit/security-owner.md).

**What held:** an owner of one business cannot do any of the following to another business:
- write its rows, or attach its storage paths;
- publish past the publish rules;
- read its drafts;
- read, replace or delete its storage;
- move one of its products.

This was proven with about 60 PGlite probes under Supabase-style default privileges, and confirmed on the Preview with the QA owner's own session (Journey A): 0 rows for other businesses' drafts, applications, audit, email log, analytics and storage, and an UPDATE on another business's row affected 0 rows. No owner screen relies on hidden UI for authorisation.

| ID | Sev. | Finding | Status |
|---|---|---|---|
| OWN-01 | P3 | A product could change `business_id` with a direct API call | **Fixed** (trigger, in the applied migration) |
| OWN-02 | P3 | Only the first folder of `storage_path` was checked | **Fixed for variant media** (exact path shape). Product media: open, needs a migration. |
| OWN-03 | P3 | Some rules were enforced only in the UI (whitespace names, negative price differences, many primary images) | Partly: caps added in `save_product`. The rest is open. |
| OWN-04 | P3 | Analytics can be inflated | **Partly fixed.** IPv6 visitors are now keyed by their /64 network (deployed). De-duplication changes the metric's meaning and needs a decision. The AR-needs-a-model check needs a migration. |
| OWN-05 | P3 | "AR" labels | **Fixed** ("AR launch attempts") |
| OWN-06 | P3 | Media URL fields accept any host, including `http://` | Open (with SEC-27, needs a migration) |

Earlier findings that still matter: SEC-22 (`X-Forwarded-For` keying) and SEC-27 (owner column grants), both in `nextlevel/`.

## 6. Prioritised remaining work

1. **Client access (BLOCKED).** Set the Auth Site URL and redirect URLs. The QA run showed invitation links currently redirect to `http://localhost:3000/`, so a real emailed invitation would land on a dead page. Also set the email secrets, the verified domain and the webhook (B1 to B8 in `nextlevel/`).
2. **Real-device AR check:** Android Scene Viewer and iOS Quick Look, with tape-measure checks (3D/AR report, section 7).
3. **Migrations needing approval:**
   - SEC-27 and OWN-06: owner column grants and https-only media URLs.
   - OWN-02: exact path shape for product media.
   - OWN-04: an AR event requires a model.
   - The COR-05, COR-07 and COR-16 items from `nextlevel/`.
4. **DUX-06:** a publish-readiness checklist in the editor.
5. **Client decisions:**
   - categories (C10);
   - the "Contact the store" link;
   - the PT dialect;
   - dashboard language;
   - whether USDZ is mandatory for iPhone;
   - a USDZ per variant from the 3D artist;
   - analytics de-duplication (unique daily visitors vs page views).

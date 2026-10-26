# Sanctus: production audit and phased plan

**Audit date:** 2026-10-20.
**Scope:** read-only. No code, data, migrations, Supabase settings, Vercel settings or DNS were changed while producing this file.
**Status:** awaiting owner review. No phase has started.

**Evidence sources:**
- the repository on branch `feature/sanctus-brand-design-system`
- the project docs and ADRs
- a code re-verification run in demo mode
- read-only Supabase CLI queries on the client project
- read-only Vercel MCP queries on `ar-deploy`
- the 18 QA items as summarised by the owner

The original QA file (`Pasted markdown(2).md`) was not found in the repository, in Downloads or on disk. **No record of a 14 October QA evaluation exists in the docs.** Every QA item below was re-checked against the current code rather than taken on trust.

Status words used below: **PASS**, **FAIL**, **PARTIAL**, **UNVERIFIED**, **CLIENT DECISION REQUIRED**.

---

## 1. Current state

### Git
- **Branch:** `feature/sanctus-brand-design-system`, local only and not pushed, based on `main` at `3ada1b9`.
- **Uncommitted:** sub-project 1 (Sanctus brand), the owner's earlier doc edits, a `.mcp.json` change, and deleted local skill files under `.claude/skills/`.
- **Untracked:** `AR-attachment/`, ADR-0023, design/21–22, `tasks/P11-sanctus.md`, `public/images/sanctus/`.
- **Remote:** `krishna-notfound/AR-Deploy` is **public**. `main` has **no branch protection** and **no CI**, and pushing to `main` deploys production.

### Features as built
- Multi-tenant catalogues with product pages, opening on the photo, with separate 3D and native AR actions (Scene Viewer / Quick Look, ADR-0021).
- A scale check that compares the model with the stated dimensions.
- A desktop-to-phone hand-off (copy link + QR).
- A catalogue QR code.
- Analytics: views, 3D interactions and AR launch *attempts*.
- Admin and owner dashboards with a shared product editor.
- Owner self-registration as drafts and admin-issued claim links (ADR-0022).
- Sanctus branding (ADR-0023) and an EN/PT public site.

### Tests
All run on 2026-10-20 against the current working tree:
- typecheck: pass
- lint: 0 errors, 22 warnings, the same as `main`
- unit tests: 128 passed, 15 skipped (the live Supabase integration suite skips without credentials)
- E2E: 28/28 in demo mode, desktop and mobile
- production build: pass

The live integration suite has **not** been run against any project in this audit.

### Supabase
- **(2026-10-20; superseded: see `System_arch/HANDOFF.md` Live state, the live site now uses `zggylkbgajamhriebdrg`) Live production backend: `pmnjchhrgvajtjpadpqo`.** It sits in a non-client organisation, and the live bundle on the custom domain references it. It holds 7 migrations, `track-event`, sample data and demo accounts according to the docs. **It is not reachable from the current CLI login**, so its schema, auth settings, backups and secrets are UNVERIFIED in this audit.
- **Client project: `zggylkbgajamhriebdrg` ("Sanctus AR", org `vxoqgtqqvgqlmfggxhdu`, eu-west-1, Pro).** It is empty:
  - 0 migrations, 0 tables, 0 buckets, 0 functions, 0 secrets, 0 users
  - 5 daily backups exist (of the empty database); PITR is off
  - SSL is not enforced, and network access is open to all IPs (the defaults)
  - the current login is a **member, not an administrator**
- **Hosted Auth settings are UNVERIFIED on both projects:** site URL, redirect allow-list, sign-up, confirmations, password policy, SMTP. The CLI cannot read them.
- **Local `supabase/config.toml` is not production configuration.** It has sign-up on, confirmations off, minimum password 6, and only `/login` in the redirect allow-list.
- **`.env.local` points at the old production project in Supabase mode**, so a plain `npm run dev` talks to production.

### Vercel
- **Project:** `ar-deploy`, team `track0`, not owned by the client. Production is `main` at `3ada1b9`, deployed 2026-10-14.
- **Env vars:** `VITE_DATA_MODE`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are each **one entry shared by Production and Preview**, so **every Preview build reads and writes production data**. There is no `VITE_ROOT_DOMAIN`, so the site runs in path mode.
- **Protection:** preview URLs are behind Vercel SSO; the production alias and the custom domain are public.
- **Domains:**
  - The current custom domain is verified and serves production. **It is a personal domain, not a client domain.**
  - `www.` and `*.` are unverified (TXT pending), and Vercel recommends changing the apex A record.

### Email
No custom SMTP on either project. Resend is suggested but not configured. Invites, verification and password reset therefore rely on Supabase's built-in sender, which is rate-limited and not meant for production.

---

## 2. Requirements traceability matrix

| # | Requirement | Evidence | Status | Sev | Proposed fix | Acceptance test | Depends on |
|---|---|---|---|---|---|---|---|
| A1 | Product name Sanctus | ADR-0023, UI | PASS (branch only, not deployed) | — | Merge after review | Visual check | Phase 0 |
| A2 | Multi-industry, not furniture-only | Copy neutralised; categories fixed by DB check (`init_schema.sql:81`) | PARTIAL | P1 | Categories table or free-text category (M8) | Create a non-furniture product | C10 |
| A3 | Brand palette and typography | `index.css`, design/11 | PASS | — | — | Screenshots | — |
| A4 | Approved high-quality images | 11 of 13 landing images are AI-generated moodboard crops; logo traced | FAIL (temporary) | P1 | design/22 briefs; client supplies or approves assets | Visual review | C13 |
| A5 | No unapproved logo or imagery presented as official | Labelled in design/21–22 | PARTIAL | P2 | Keep labelled until approval | — | C13 |
| B1 | Catalogues reliably show published products | **Load failure shows "No products yet"** (`CatalogPage.tsx:30-33,121-125`, `hooks.ts:26,31`); reproduced | FAIL | **P0** | Fix loading/error state (D1) | E2E with injected failures | — |
| B2 | Drafts, unpublished, inactive and pending content never public | RLS anon policies (`init_schema.sql:261-348`), storage policy | PASS (code + PGlite tests); hosted UNVERIFIED | P0 | Re-run RLS suite on staging | Anon REST probes | Phase 0 staging |
| B3 | Photo first, separate 3D and AR | `ProductMedia.tsx`, `ProductPage.tsx` (branch) | PASS (branch) | — | — | E2E | — |
| B4 | Descriptions, dimensions, materials, price, photos | Product schema and editor | PASS | — | — | E2E | — |
| B5 | Each variant has its own photos and 3D model | Variants are colour + price only (`init_schema.sql:133-143`) | FAIL | P1 | Variant media (M9) | Switching variant swaps photos and model | C3 |
| B6 | No unrelated GLB/USDZ attached | Model per product; illustrative landing piece unlinked (branch) | PASS | — | — | — | — |
| B7 | Shareable product and catalogue URLs | `urls.ts` | PASS; 3 URLs built outside `urls.ts` (D19) | P3 | Move into `urls.ts` | Unit test | — |
| B8 | Catalogue QR and product QR | Catalogue QR in dashboards; product QR only on the public AR fallback | PARTIAL | P1 | Product QR in editor and product table | E2E | — |
| B9 | No cart, checkout or payments | None present | PASS | — | — | — | — |
| B10 | No dead `.example` links or invented contacts in production | Footer `contato@sanctus.example` (labelled) appears in production; seed `.example` CTAs and contacts are demo data | FAIL | P1 | Remove the placeholder; client supplies real details or the block is hidden | Grep gate in CI | C12 |
| C1 | Native AR only (Scene Viewer / Quick Look) | `ModelViewer.tsx` `ar-modes`; E2E WebXR guard | PASS | — | — | E2E | — |
| C2 | 3D viewer fallback | Present | PASS | — | — | E2E | — |
| C3 | True-scale validation | `lib/scale.ts`, editor check | PASS | — | — | Unit + E2E | — |
| C4 | Desktop to phone hand-off | Copy link + QR verified in demo | PASS | — | — | E2E | — |
| C5 | Verified on real devices | Never done (SEC-02) | UNVERIFIED | P1 (gate) | Device matrix in Phase 6 | Recorded device runs | Devices |
| C6 | AR analytics labelled as attempts | `AnalyticsView.tsx` | PASS | — | — | — | — |
| D1 | Manual approval before listing | `draft/active/inactive` only; no rejected state, reason or queue | PARTIAL | P0 | `approval_status` separate from visibility (M8) | Pending business never public | C1, C2 |
| D2 | Admins create owner accounts | Not possible in the app; done in the Supabase dashboard | FAIL | P0 | Admin provisioning Edge Function (invite) | Admin invites; owner sets password | C1, SMTP |
| D3 | No self-registration or self-claiming | `/signup`, `register_business`, claim links live (ADR-0022) | FAIL vs your stated requirement | P0 | Remove routes and RPCs (M8) | Anon / authenticated probes rejected | **C1** |
| D4 | One owner per business | No unique constraint; add-member RPCs allow more than one | FAIL | P0 | Unique index plus RPC guard (M8) | Second owner rejected | C1 |
| D5 | Owner isolation | RLS + trigger, PGlite tests | PASS (code); hosted UNVERIFIED | P0 | Re-run on staging | Cross-tenant write rejected | Phase 0 |
| D6 | Admin and owner roles distinct; owner cannot elevate | `platform_admins` table; trigger blocks status/slug edits | PASS (code) | — | Add approval fields to the trigger (M8) | PGlite test | — |
| D7 | Approval distinct from catalogue visibility | One `status` column mixes both | FAIL | P1 | M8 | Test | C2 |
| D8 | Traceability of admin actions | No audit table | FAIL | P1 | `audit_log` (M8) | Actions logged with actor and time | — |
| E1 | EN/PT across the whole app | Public pages and landing yes; auth (about 40 strings), dashboards and NotFound English-only | PARTIAL | P1 | Phase 4 | i18n completeness test | C6 |
| E2 | Language persistence | sessionStorage only | FAIL | P2 | localStorage + `?lang=` | E2E across tabs | — |
| E3 | One Portuguese dialect | pt-PT dictionary + pt-BR landing copy; `lang="pt-PT"` always | FAIL | P1 | Choose one; convert | Review | **C6** |
| E4 | Responsive desktop and mobile | E2E on both projects | PASS | — | — | — | — |

---

## 3. Defect register

**CONFIRMED** means it was reproduced or verified in the current code or infrastructure. **Historical #** refers to the owner's QA list.

| ID | Pri | Defect | Hist. # | Evidence | Fix |
|---|---|---|---|---|---|
| D1 | **P0** | A failed or slow product load shows "No products yet" (an empty catalogue) instead of loading or an error. Reproduced: 9 of 24 injected-failure loads, and a flash on every normal load. | 1 | `CatalogPage.tsx:30-33,121-125`, `services/hooks.ts:26,31` | Do not run the placeholder query; treat `!business` and `loading` as loading; error beats stale data; clear data on a dependency change |
| D2 | **P0** | Preview deployments use the production Supabase project (shared env entries). | new | Vercel env matrix | Split Production/Preview env; Preview → staging |
| D3 | **P0** | Access model differs from the stated client requirements: self-registration, claim links, more than one owner possible, no approve/reject. | 2 | migrations 1, 5, 7; `BusinessOwnersPanel` | M8 + provisioning function (Phase 2) |
| D4 | **P0** | Production runs on a non-client project, Vercel team and personal domain. The client project is empty. | new | infra audit | Phase 0/5 cut-over to client-owned infrastructure |
| D5 | P1 | No branch protection or CI; `main` deploys production directly; the repo is public. | new | GitHub API | Protect `main`, add a CI workflow, consider a private repo |
| D6 | P1 | No audit trail for approve, deactivate, delete or owner changes. | 7 | no table | `audit_log` (M8) |
| D7 | P1 | Auth pages, dashboards and NotFound are English-only; dialect mix; sessionStorage persistence. | 10 | i18n audit | Phase 4 |
| D8 | P1 | Variants carry no photos or models. | — | schema | M9 |
| D9 | P1 | No product QR in the dashboards. | — | editor | Phase 3 |
| D10 | P1 | Placeholder contact in the production footer; demo `.example` CTAs and contacts with no "sample" label in the contact modal. | 8 | `SiteChrome.tsx:131`, `seed.ts` | Phase 1 |
| D11 | P1 | Hosted Auth unverified; the local redirect list lacks `/reset-password`; docs disagree on sign-up and password length; no expired-link handling. | 16 | config, docs | Phase 2/5 settings checklist + UI handling |
| D12 | P1 | `BusinessOverviewPage` shows "Add your first product" when the query fails. | new (N1) | `BusinessOverviewPage.tsx:76-78` | Same pattern as D1 |
| D13 | P1 | Real-device AR never verified. | 4 | SEC-02 | Phase 6 device matrix |
| D14 | P2 | No CTA-click analytics event. | 15 | `handler.ts:15` | M10 (if C17 = yes) |
| D15 | P2 | Raw Supabase/Storage text in dashboards (`Upload failed: …`, `Could not reach Supabase: …`, unmapped auth codes). No SQL shown. | 17 | `supabaseCatalogService.ts:314,667,670`, `auth.ts:33,65,134` | Map to friendly messages; log details |
| D16 | P2 | Image uploads: no magic-byte check; bucket allows 50 MB against a 5 MB UI limit; orphaned uploads. | 12 | `files.ts:35`, `storage.sql` | Header sniffing; per-bucket limits; cleanup job or on-save upload |
| D17 | P2 | Business status `Select` changes status without confirmation. | 7 | `BusinessForm.tsx:184` | Confirm, or remove the select in favour of actions |
| D18 | P2 | Counts and lists cap at 1000 rows (no paging). | new (N2) | `analytics()`, `catalogs()`, `getProducts` | Count queries / pagination |
| D19 | P3 | URLs built outside `urls.ts`. | new (N3) | `LandingPage.tsx:66`, `ProductPage.tsx:48`, `CatalogPage.tsx:51` | Move into `urls.ts` |
| D20 | P3 | Invalid product id in the editor shows a validation error instead of "not found". | new (N4) | `mapDbError` 22P02 | Map to NOT_FOUND |
| D21 | P3 | Public `business-logos` bucket exposes draft-business logos by URL (unguessable UUID paths). | new | `storage.sql` | Accept (document), or private bucket + signed URLs |
| D22 | P3 | Signed media URLs stay valid up to 12 h after unpublish. | new | `catalogService.ts:40` | Accept (document) or shorter TTL |
| D23 | P2 | Sample-data inconsistencies (slug/name, velvet/woven, meta text in a description, missing PT, mixed dialect). | 11 | `seed.ts` | Fix the seed; remove sample data at launch |
| D24 | P2 | `.env.local` targets the old production project; scripts using it can write production data. | new | `.env.local` | Point dev at staging or demo |
| D25 | P2 | Client database: SSL not enforced, network open, PITR off. | new | CLI | Enforce SSL; restrict networks only if needed; decide PITR |
| D26 | P2 | Documentation contradictions: sign-up state, ADR statuses (0016, 0021, 0022), old brand names, outdated design/20, CLIENT_HANDOVER and PRD lines. | new | docs audit | Phase 5 doc pass |

**Not reproduced or not a defect now:**
- **#3 desktop AR hand-off:** works.
- **#5 blank KPIs:** correct in demo. Supabase mode only shows a skeleton while loading. Re-test on staging.
- **#6 malformed URLs:** friendly not-found message; no DB text.
- **#9 inactive businesses:** demo-only directory with an "Inactive" badge. Anon RLS hides inactive businesses in Supabase mode.
- **#13 Storage:** product media private and RLS-gated; sound.
- **#18 public states:** correct, except D1.
- **#14 isolation:** passes in PGlite tests; hosted re-run pending.

---

## 4. Client decision register

| ID | Decision | Why it matters | Recommended default | Can work continue without it? |
|---|---|---|---|---|
| C1 | **Access model:** admins create owners, no self-registration or claim links, one owner per business. This supersedes ADR-0022 (owner decision 2026-10-13). | ADR-0022 is live in production; reversing it removes routes and RPCs | Confirm the 2026-10-20 instruction supersedes ADR-0022; record ADR-0024 | No for M8 (Phase 2). Phase 1 can proceed. |
| C2 | Rejection: a distinct `rejected` state with a reason shown to the owner, separate from catalogue on/off | Defines M8's columns | `approval_status` = pending / approved / rejected, plus reason, reviewer and time; `catalog_visible` separate | Default can be built; confirm before applying |
| C3 | Variants carry their own photos and model (A-3). Stated in your requirements; the docs still say "open". | M9 scope | Treat as decided; per-variant gallery + GLB + USDZ; product-level media as fallback | Yes, confirm in passing |
| C4 | Materials: one line per language | Already stated by you | Keep as built | Yes (decided) |
| C5 | GLB compression (A-2) | Upload pipeline | Keep off until the client approves | Yes |
| C6 | **Portuguese dialect: pt-BR or pt-PT** | Phase 4 translations, the `lang` attribute, the landing copy | **pt-BR**: the client copy, R$ prices and São Paulo references are Brazilian | Phases 1–3 yes; Phase 4 no |
| C7 | **Production domain** and who controls DNS. Production currently serves from a personal, non-client domain. | Cut-over, auth redirects, email sender, QR URLs (printed QR codes must use the final domain) | Client-owned domain; Vercel on the apex; subdomain catalogues optional | Phase 5 no |
| C8 | Email: Resend account and sending domain, owned by the client | Invites and password reset in production | Resend + Supabase custom SMTP on a `mail.` subdomain | Phase 2 can be built and tested in staging with Resend's test sender; production no |
| C9 | Sample data at launch; is `digital-heroes-buisness` real? | Data cut-over | Launch the client project clean; no sample data in production | Yes |
| C10 | Categories: a fixed list per platform, or free text per business; default currency (EUR or BRL) | M8 category change; formatting | Admin-managed `categories` table (EN/PT labels); default currency BRL if the client is Brazilian | Yes, default can be built |
| C11 | **Data cut-over:** start clean on the client project, or migrate users and businesses from the old project | The old project is not client-owned and not reachable from this login | Clean start, assuming only sample data exists. Confirm no real client data lives in the old project. | Phase 0 no |
| C12 | Real contact details, social links, legal pages (privacy and terms text from the client or legal counsel) | D10, compliance | Hide contact and social blocks until supplied; no invented text | Yes |
| C13 | Official logo files and approved photography (or approval of the AI-generated references and briefs) | A4/A5 | design/22 briefs; keep the temporary assets labelled | Yes |
| C14 | **Staging environment:** a second Supabase project in the client org (Pro: billed per project) or Supabase branching. Docker is not available locally. | All write tests (Phase 0 rule) | A separate small staging project in the client org | **No: blocks write testing** |
| C15 | Keep the existing product CTA link and "Contact the store" modal? The client excluded "direct store-contact functionality". | Product page scope | Remove the store-contact modal; keep the per-product CTA link only if the client confirms | Phase 1 default: hide behind a flag until confirmed |
| C16 | CTA-click analytics wanted? | M10 | Yes, if the CTA stays (C15) | Yes |
| C17 | Compliance inputs (§5.4) | Launch readiness | Checklist below | Phase 5 no |
| C18 | Administrator access for our account in the client Supabase org; Vercel and GitHub ownership (transfer the project to the client team, or the client creates it) | Auth settings, SMTP and env changes need an Admin/Owner; this login is a member | Client grants Administrator, or performs settings changes from a checklist | Phase 0 partially no |
| C19 | USDZ required for every product (Q6) | Quick Look on iOS | Required for iOS AR; the editor warns when it is missing | Yes |

**Already decided; not asked again:** native AR only (ADR-0021); no cart, checkout or payments; no cross-business directory; photo-first product page; the Sanctus brand (ADR-0023); AR analytics = launch attempts; owner dashboard is in scope.

---

## 5. Infrastructure and integration plan

### 5.1 Available
- Client Supabase Pro project `zggylkbgajamhriebdrg`: empty, daily backups.
- Supabase CLI: logged in as a member, linked to the client project.
- Vercel MCP: read-only use works.
- GitHub CLI: admin access to the repo.
- PGlite migration/RLS tests: 23 tests, run offline.

### 5.2 Missing
- A staging project (C14).
- Custom SMTP / Resend (C8).
- A client domain (C7).
- CI.
- Branch protection.
- A Preview/Production env split.
- Admin role in the client org (C18).

### 5.3 Client actions
1. Grant our account Administrator in org `vxoqgtqqvgqlmfggxhdu`, or perform the dashboard settings from a checklist.
2. Approve a staging project (cost).
3. Create a Resend account and verify the sending domain. DNS records are provided at that time: SPF/DKIM TXT, MX/return-path, a DMARC recommendation.
4. Choose the domain and either add Vercel's DNS records or delegate them.
5. Decide Vercel ownership: transfer `ar-deploy` to the client team, or create a project in the client team. Changes to the current team stay with the current owner.
6. Supply legal pages and contact details.

### 5.4 Compliance-readiness checklist
This is not a legal opinion; each item needs client or qualified legal input.
- Launch countries: Brazil (LGPD)? EU / Portugal (GDPR)? Others?
- Approved Privacy Policy and Terms of Service text, and where they are linked (footer, sign-in).
- **Personal data held:**
  - Owner accounts: email, display name, sign-in metadata.
  - Visitors: salted SHA-256 hash of IP + date for rate limiting and unique counts; no cookies; language preference in browser storage.
  - Confirm no other tracking.
- **Subprocessors:** Supabase (eu-west-1), Vercel, Resend (if approved), Google Fonts (font requests from visitors' browsers; consider self-hosting the fonts to avoid it), raw.githubusercontent / Unsplash only in demo data.
- **Retention:** analytics events (proposal: 13 months), deleted businesses and products (hard delete today), auth logs (Supabase defaults).
- **Data-subject requests:** access, correction, deletion and export for owners. Procedure: admin-run SQL/RPC, documented.
- Cookie / consent banner: likely not required while there are no cookies or third-party trackers. Confirm with counsel.
- Incident response contact and account recovery (password reset by email; admin re-invite).

---

## 6. Phased roadmap

Each phase uses its own branch from `main` after the current branch is merged, ends with checks + diff review + doc/ADR updates + a report, and stops for review.

### Phase 0: Audit, environment isolation, release safeguards
- **Scope:**
  - Commit and merge sub-project 1 (on approval).
  - Protect `main`.
  - Add CI: typecheck, lint, unit, PGlite, build, E2E on pull requests.
  - Split Vercel env so Preview never points at production.
  - Point `.env.local` at staging or demo.
  - Provision staging (C14) and apply the 7 existing migrations + `track-event` there.
  - Run the RLS / live integration suite on staging.
  - Write the hosted-auth settings checklist.
  - Record the client project ref in the docs.
- **Excludes:** any production change; the cut-over.
- **Files:** `.github/workflows/ci.yml` (new), docs (RUNBOOK, HANDOFF, design/20), no app code.
- **Infrastructure impact:** staging project; Vercel env split (current team); GitHub settings.
- **Risks:** the env change can break Preview. Previews remain SSO-protected.
- **Done when:**
  - CI is green and required on `main`.
  - Preview builds point at staging, verified from the built bundle.
  - Staging has the 7 migrations, and the live suite passes there.
- **Rollback:** revert the env entries; protection can be relaxed.

### Phase 1: Public catalogue reliability and customer journey
- **Scope:**
  - D1 and D12 (loading and error vs empty).
  - `useServiceQuery` semantics.
  - D10 placeholder and demo labels.
  - D15 friendly messages.
  - D19, D20.
  - C15 (hide the store-contact modal by default).
  - Seed fixes D23.
- **Files:** `services/hooks.ts`, `features/public/CatalogPage.tsx`, `features/business/BusinessOverviewPage.tsx`, `features/marketing/SiteChrome.tsx`, `features/public/ProductPage.tsx`, `services/supabase/supabaseCatalogService.ts` (error mapping), `lib/urls.ts`, `services/mock/seed.ts`.
- **Migrations:** none.
- **Tests:**
  - E2E with `arfurn:debug:failRate` asserting error-not-empty.
  - Unit tests for the hook.
  - A grep test: no `.example` outside demo-labelled code.
- **Acceptance:** 50 reloads of a catalogue never show "No products yet" while products exist; a failure shows a retry.
- **Done when:** gates green; staging check on a real Supabase backend.

### Phase 2: Business approval, owner provisioning, access control
Depends on C1, C2, C8 (test sender), C14.
- **Scope:**
  - M8 (below).
  - Edge Function `admin-invite-owner`:
    - verifies the caller is in `platform_admins`
    - calls `auth.admin.inviteUserByEmail` with the service role server-side only
    - creates the single owner membership
    - writes `audit_log`
  - Admin approval queue: approve / reject with reason.
  - Owner "pending / rejected" notices.
  - Remove `/signup`, `/claim`, `RegisterBusinessForm` and the claim UI.
  - D17.
  - Expired / invalid recovery-link handling (D11).
  - Hosted auth settings checklist applied on staging: sign-up off, confirmations on, minimum password 12, leaked-password protection, redirect allow-list.
- **Files:** `supabase/migrations/<new>`, `supabase/functions/admin-invite-owner/`, `services/catalogService.ts` (+ mock + supabase), `features/admin/*`, `features/auth/*`, `app/router.tsx`, `components/layout/DashboardShell.tsx`.
- **Security risks:**
  - service-role misuse: kept only in the function
  - privilege escalation through metadata: `platform_admins` only
  - the RPC allowlist
- **Tests:**
  - PGlite: one-owner constraint; anon/owner cannot call admin RPCs; owner cannot change `approval_status`; pending/rejected never visible to anon.
  - Function unit tests.
  - Staging live suite.
  - E2E: admin invites → owner sets password → owner edits own business only.
- **Done when:** gates green on staging; ADR-0024 written; CLIENT_HANDOVER updated.
- **Rollback:** forward fix preferred; down-migration script prepared and tested on staging (§7).

### Phase 3: Variants, asset validation, AR, QR
Depends on C3, C19.
- **Scope:**
  - M9 variant media.
  - Editor per-variant photos and models; the product page swaps photos and model on variant change.
  - Variant scale check.
  - Product QR in the editor and table.
  - D16 image header sniffing and bucket limits (M11).
  - D14 / M10 CTA event (if C16).
  - USDZ warnings.
- **Files:** migrations, `domain/types.ts`, `features/products/editor/*`, `features/public/ProductPage.tsx` / `ProductMedia.tsx`, `lib/files.ts`, `services/*`, `track-event/handler.ts`.
- **Tests:**
  - PGlite RLS on the new tables.
  - E2E: variant switch changes media; the QR encodes the canonical product URL.
  - Unit: file sniffing.
- **Acceptance:** each variant opens its own model in Scene Viewer / Quick Look. Device confirmation happens in Phase 6.

### Phase 4: Complete EN/PT, dashboards, admin UX, errors
Depends on C6.
- **Scope:**
  - `t()` across auth, dashboards and NotFound.
  - One dialect.
  - localStorage + `?lang=` persistence.
  - Correct `lang` attribute.
  - Accessible labels and alt text in both languages.
  - D18 counts / pagination.
  - Remaining raw messages.
- **Tests:** a dictionary-completeness test (every key in both languages); an E2E PT pass over every route; axe accessibility checks on key pages.

### Phase 5: Email, operations, compliance readiness, documentation
Depends on C7, C8, C12, C17, C18.
- **Scope:**
  - Resend SMTP on staging, then production (separate approval).
  - Branded invite, verification and reset templates in EN/PT.
  - Domain and DNS instructions.
  - Production env values on the client Vercel project.
  - D25 hardening.
  - Backups and PITR decision.
  - Doc pass D26.
  - Client handover guide.
  - Compliance checklist completed with client inputs.
- **Done when:**
  - Test emails are delivered from the verified domain on staging.
  - Every doc names Sanctus, the client project and the client domain.

### Phase 6: Security regression, device acceptance, sign-off, controlled release
- **Scope:**
  - The full live integration suite and RLS probes on staging.
  - The release-gate run (§8).
  - Real-device AR matrix: iPhone (Safari), iPad, two Android phones (Chrome), recording device / OS / browser / asset / result.
  - Client acceptance session.
  - Production cut-over runbook: apply migrations to `zggylkbgajamhriebdrg`, deploy functions and secrets, set auth / SMTP, switch Vercel Production env, smoke test, rollback plan.
  - Each step requires separate explicit approval.

---

## 7. Migration review
Nothing has been applied anywhere.

**M0, baseline (existing).** Apply the 7 existing files, unchanged, to staging, then to the client production project. No data to backfill (both empty). Validate with the PGlite suite + live suite on staging. **Approval:** staging target and production target separately.

**M8, `YYYYMMDDHHMMSS_access_model.sql`** (Phase 2)
- **Adds to `businesses`:**
  - `approval_status` (pending / approved / rejected, default pending), `approval_reason`, `reviewed_by`, `reviewed_at`
  - `catalog_visible boolean` (replaces the `active`/`inactive` meaning), or `status` kept for visibility with a mapping
  - Backfill: `active` → approved + visible; `inactive` → approved + hidden; `draft` → pending.
- **One owner:** unique index on `business_members(business_id)`. Pre-check for duplicates; abort if any are found.
- **New `audit_log`:** id, at, actor, action, entity, entity_id, details jsonb. Insert only through security-definer RPCs and the function. Select for admins only; no update or delete grants.
- **Remove:**
  - `register_business`, `redeem_business_claim`, `admin_create_business_claim` (revoke execute, then drop)
  - the `private.business_claims` table
  - ADR-0022 superseded
- **Policy and trigger changes:**
  - Anon RLS: visible only when `approval_status='approved' and catalog_visible`.
  - The guard trigger extended to the approval fields.
- **Categories (C10):**
  - drop the category check
  - add a `categories` table (slug, label_en, label_pt, sort)
  - FK from `products.category` (backfill existing slugs)
- **Validation:** PGlite tests first, then staging with the live suite and anon/owner probes.
- **Rollback:** a forward-fix migration is the primary plan. A tested down script re-creates the dropped functions and table from migration 7 and drops the new columns. Data in `audit_log` is lost on rollback.
- **Production approval needed for:** the exact file hash, the target ref, and a backup taken immediately before.

**M9, `…_variant_media.sql`** (Phase 3)
- Adds `variant_images` (variant_id, url, alt EN/PT, sort, is_primary) and `variant_models` (variant_id, format glb/usdz, url, size).
- RLS mirrors the product child tables (owner by business, anon by published product).
- `save_product` RPC updated to write variant media atomically.
- No backfill: variants without media fall back to product media.
- **Rollback:** drop the new tables after export.

**M10, `…_analytics_cta.sql`** (Phase 3, if C16)
- Extends the event type check, the `record_event_limited` allowlist and the daily view with a `cta_click` column.
- **Rollback:** restore the previous check and view (no data loss except the new events).

**M11, `…_storage_limits.sql`** (Phase 3)
- Per-bucket MIME and size alignment: images 5 MB, models 50 MB, logos 2 MB.
- Optionally a private logos bucket (D21, if chosen).
- **Rollback:** restore the previous bucket limits.

---

## 8. Release gate
Every item must be green and recorded with evidence before production approval.

1. **Catalogue reliability:** 0 false-empty states in 50 reloads with injected failures on staging; the D1 regression test is in CI.
2. **Role isolation:** the live suite on staging is all green. It covers:
   - anon cannot read pending, rejected, hidden or draft content
   - an owner cannot read or write another business, or change approval or slug
   - non-admins cannot call admin RPCs or the function
3. **Approval workflow:** pending → approved / rejected works with reason and audit entries; rejected and pending never appear publicly.
4. **Owner provisioning:** an admin invite produces a working owner login through email on staging; a second owner is rejected.
5. **Uploads:** wrong type, renamed file, oversize and corrupt GLB are all rejected with friendly messages; valid GLB/USDZ/images pass.
6. **Email:** invite, verification and reset are delivered from the verified client domain; links land on the production domain.
7. **EN/PT:** the dictionary completeness test passes; manual PT walkthrough of every route; one dialect.
8. **Native AR:** device matrix recorded on at least one iPhone, one iPad and two Android ARCore devices; scale within 5 %; fallbacks correct on non-AR devices.
9. **Responsive:** 390 and 1440 px screenshots reviewed for every route; no horizontal scroll.
10. **Production configuration:**
    - client Supabase with auth settings per the checklist and SSL enforced
    - Vercel Production → client project, Preview → staging
    - no secrets in the bundle (build guard + grep)
    - `main` protected with CI
11. **Backups and recovery:** a backup is taken and a restore is rehearsed on staging; PITR decision recorded; Vercel rollback target identified.
12. **Content:** no `.example` or placeholder contacts; approved logo and photography (or explicit client acceptance of the temporary assets); legal pages linked.
13. **Client decisions:** C1–C19 resolved or explicitly deferred in writing.
14. **No open P0/P1 defects** in §3.

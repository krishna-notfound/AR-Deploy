# Decisions (ADRs)
One decision per file. Read only the ADR that a task links to. Scan this index otherwise.

## How to add a decision
1. Copy [_template.md](_template.md) to `ADR-NNNN-short-slug.md`, using the next number.
2. Fill it in, keeping it under about 30 lines.
3. Add a row below.
4. Update the affected `design/*.md` file to match.

If a decision is replaced, set the old ADR's status to `Superseded by ADR-NNNN`. Never delete an ADR.

## Index
| ADR | Title | Status | Affects |
|---|---|---|---|
| [0001](ADR-0001-greenfield-stack.md) | Greenfield stack: Vite + React 19 + TS + Tailwind v4 + Router v7 | Accepted | design/02 |
| [0002](ADR-0002-minimal-dependencies.md) | Minimal dependencies, custom hooks instead of query/state/i18n libs | Accepted | design/02, 05, 10 |
| [0003](ADR-0003-money-minor-units.md) | Store money in minor units | Accepted | design/04 |
| [0004](ADR-0004-localized-content.md) | `LocalizedText` for product content; admin English-only | Accepted | design/04, 10 |
| [0005](ADR-0005-qr-encodes-catalog-url.md) | QR encodes the catalog URL, never a product URL | Accepted | design/08 |
| [0006](ADR-0006-ar-fixed-scale-check.md) | Fixed AR scale + measured-vs-entered scale check | Accepted | design/09 |
| [0007](ADR-0007-session-only-3d-uploads.md) | 3D uploads are session-only blob URLs | Accepted | design/06 |
| [0008](ADR-0008-business-admin-shared-scoped.md) | Business Admin reuses shared features, scoped and marked pending | Accepted | design/07, 13 |
| [0009](ADR-0009-split-docs-for-context.md) | Split docs into small files to save context tokens | Accepted | System_arch/ |
| [0010](ADR-0010-tooling-versions-oxlint.md) | Follow current Vite template: TS 6, oxlint, React Router 8 | Accepted (refines 0001) | design/02 |
| [0011](ADR-0011-visual-identity.md) | Visual identity: eucalyptus + plaster, Hanken Grotesk, dimension drawing | Accepted | design/11 |
| [0012](ADR-0012-sample-analytics-daily-aggregates.md) | Seeded analytics stored as daily aggregates | Accepted | design/06, 16 |
| [0013](ADR-0013-sample-assets-measured.md) | Sample 3D assets, rendered posters, measured dimensions | Accepted | design/09 |
| [0014](ADR-0014-editorial-design-refresh.md) | Editorial refresh: orange accent split by contrast job, charcoal actions, hairlines | Accepted (supersedes 0011 palette) | design/11 |
| [0015](ADR-0015-supabase-dual-mode.md) | Supabase behind the service layer; demo stays the default | Accepted (refines 0002) | design/05, 07, 18, 19 |
| [0016](ADR-0016-landing-page-and-demo-route.md) | Landing page at `/`, demo picker at `/demo`, `/login` for Supabase | Accepted | design/07, 14 |
| [0017](ADR-0017-sample-data-from-demo-seed.md) | Supabase sample data generated from the demo seed (jiti, dev-only) | Accepted | design/19 |
| [0018](ADR-0018-custom-webxr-placement.md) | Own WebXR placement session (reticle, Place, Rotate, Move, Start over); native viewers otherwise | **Withdrawn** 2026-10-13: original model-viewer AR restored | design/09, 15 |
| [0019](ADR-0019-model-optimization.md) | Safe in-browser GLB optimization (glTF-Transform, no new glTF extensions), off until client sign-off | Accepted (flagged) | design/15 |
| [0020](ADR-0020-pglite-migration-tests.md) | SQL migrations and RLS tested in PGlite (dev-only) | Accepted | design/17, 19 |
| [0021](ADR-0021-native-ar-viewers-only.md) | Native AR viewers only: Scene Viewer (Android), Quick Look (iOS); no WebXR | Accepted 2026-10-13, needs device check before `main` | design/09 |
| [0022](ADR-0022-owner-registration-and-claim-links.md) | Owner self-registration as drafts, single-use claim links, no ownership by email match | **Superseded** by 0024 (2026-10-20) | design/19 |
| [0024](ADR-0024-applications-and-admin-provisioned-owners.md) | Public applications, admin review, one admin-provisioned owner per business, append-only audit, evidence-only email status | Accepted 2026-10-20 (supersedes 0022) | design/23, 24 |
| [0023](ADR-0023-sanctus-brand-from-client-references.md) | Sanctus brand and UI recreated from the client references (palette, Cormorant Garamond + Jost, traced logo, photo-first product page) | Accepted 2026-10-20 | design/11, 21 |
| [0025](ADR-0025-product-qr-and-owner-catalog-preview.md) | Separate per-product QR (published products only; catalogue QR unchanged) and owner preview of a non-active catalogue (`?preview=1`) | Accepted 2026-10-20 (amends 0005) | design/08, 13 |
| [0026](ADR-0026-product-embed-for-external-websites.md) | Product embed for external websites (`/embed/products/...`, `frame-ancestors *` on embed routes only); AR opens the full product page in a new tab | Accepted 2026-10-24 | design/08, 13, 14, 20 |
| [0027](ADR-0027-email-codes-instead-of-links.md) | Email codes instead of links: invitations and password reset send an 8-digit one-time code (1 h), typed on `/accept-invite` or `/reset-password` | Accepted 2026-10-24 | design/19, 23, ADR-0024 |
| [0028](ADR-0028-stitch-redesign.md) | Redesign from the owner's Stitch screens: split-card hero, dark 3D/AR section, split sign-in layout, dark dashboard sidebar; same tokens and fonts; no invented features or claims | Accepted 2026-10-25 (amends 0023) | design/11, 21 |
| [0029](ADR-0029-platform-team-roles.md) | Platform team roles: Owner (`platform_admins`), Admin and Team (`platform_members`); 15 role permissions enforced by `platform_can()` in additive policies | Accepted 2026-10-25 (lifts X-03 for platform roles) | design/19 |
| [0030](ADR-0030-link-team-invitations.md) | Link invitations for team members: hashed one-time secret in the URL fragment, consumed only on Create account, 7-day expiry | Accepted 2026-10-25 | design/23, ADR-0027 |
| [0031](ADR-0031-dashboard-type-and-density.md) | Dashboard type and density: Inter for dashboard UI text, Cormorant 500 for h1 only, no small uppercase labels, one `data-surface="dashboard"` scope; amends ADR-0023 and ADR-0028 for the dashboards; pixel guard for untouched pages | Accepted 2026-10-25 | design/11, BRIEF |
| [0032](ADR-0032-account-settings-and-2fa.md) | Account settings hub and authenticator-app 2FA: `profiles` as the single source for name and photo, emailed action codes for risky actions, hashed recovery codes, 2FA enforced in the database access helpers (policy switches plus opt-in), closure request flow; SMS and email second factors rejected | Accepted 2026-10-26 | design/19, 23 |
| [0033](ADR-0033-business-logic-fixes.md) | Business-logic fixes (S1.5): permission prerequisites with a backfill, 2FA before permission on every function a person calls, audit snapshots and a dropped business foreign key, embed views, deleted-product analytics, owner-invitation reservations, attempt-based submission limit with a daily hash | Accepted 2026-10-26 | design/19, 23, 24 |
| [0034](ADR-0034-3d-model-requests.md) | 3D model requests (S4): the `models.manage` permission (16th key) against ADR-0029, a per-business own-upload switch enforced by the database, the request lifecycle (no limit on open requests), a private request-photo bucket, staged files delivered as a whole-set replace, a `models_changed_at` stale-save guard, the `review-model-request` function and email | Accepted 2026-10-26 | design/19, 23, 15, 12 |
| [0035](ADR-0035-android-ar-webxr-first.md) | Android AR opens inside Chrome first (model-viewer WebXR, `ar-modes="webxr scene-viewer quick-look"`), Scene Viewer only as fallback; amends ADR-0021 for Android after Scene Viewer showed a black screen on the owner's phones even for Google's own sample; iPhone keeps Quick Look | Accepted 2026-10-26 | design/09 |
| [0036](ADR-0036-soft-public-pages.md) | Soft, editorial catalog and product pages: 24px rounded photos, stage and panels, pill buttons/chips/fields, the business name as a monument, large serif product names, 17px full-ink body, no hairlines, eyebrows or tiny caps; sticky "View in my home" bar on phones; from the approved Stitch designs (design/stitch/public); public pages only, amends ADR-0023 | Superseded by 0037 | design/11, 14 |
| [0037](ADR-0037-public-pages-original-soft-corners.md) | Public catalog and product pages back to the original look (pre-0036), with slightly soft corners (6px controls, 10px cards, photos and panels) and the product link as a real button; dashboards keep 2px | Accepted 2026-10-26 | design/14 |
| [0038](ADR-0038-automatic-model-lightening.md) | Automatic model lightening is on by default (`VITE_MODEL_OPTIMIZATION=off` opts out): GLBs above 100,000 triangles are welded and simplified with meshoptimizer (error 0.001) in the browser worker, textures above 2048 px downscaled, no compression extensions, result checked (bounding box within 0.5%) or the original is kept; USDZ untouched; extends ADR-0019 after the owner's yes on A-2 | Accepted 2026-10-26 | design/15, 17 |
| [0039](ADR-0039-usdz-built-from-glb.md) | The product editor's "Build from GLB" button makes the iPhone USDZ in the uploader's browser (three.js 0.183.2 `GLTFLoader` + `USDZExporter`, Quick Look compatible, at most 50,000 triangles and 1024 px textures, metres kept) and sends it through the normal USDZ upload; supersedes the "never build GLB→USDZ conversion" rule; amends ADR-0038 | Accepted 2026-10-27 | design/15 |
| [0040](ADR-0040-main-is-the-live-branch.md) | `main` is the live branch: Vercel Production builds it and serves `sanctus.warpkit.online` (moved from the feature branch), `builtbykrishna.dev` and `ar-deploy-sage.vercel.app`, on the client database `zggylkbgajamhriebdrg`, which holds real client data (read-only by default; every write needs the owner's OK); push `main` only when asked; hosting moves to the client's Vercel later | Accepted 2026-10-27 | design/20 |
| [0041](ADR-0041-ar-audit-fixes.md) | AR audit fixes: model files load straight from storage (not the `/ar/` proxy, which froze progress), the viewer download can be retried, AR is re-checked after load, model-viewer's Scene Viewer failure marker is handled, the iPhone-built file is capped and built once per tap, honest editor preview errors with fresh links; amends ADR-0035 | Accepted 2026-10-26 | design/09, 14 |

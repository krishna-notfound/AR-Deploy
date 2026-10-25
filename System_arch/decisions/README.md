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

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

# ADR-0017: Supabase sample data is generated from the demo seed
- **Status:** Accepted
- **Date:** 2026-10-13
- **Affects:** design/19-supabase.md, scripts/sample-data/, supabase/seed/, package.json (dev dependency `jiti` 2.7.0, exact)

## Context
Testing and future development need realistic data in the Supabase project (businesses, products, 3D models, analytics, owner logins). Hand-written SQL would drift from the demo seed in `src/services/mock/seed.ts`.

## Decision
- **Generator:** `npm run db:sample-sql` loads the TypeScript demo seed with `jiti` (dev-only, pinned to an exact version) and writes `supabase/seed/sample_data.sql`.
  - **Repeatable:** fixed UUIDs, and only the four sample businesses are deleted and re-created.
  - **Dates relative to `now()`**, so the last 30 days always have analytics.
  - **Analytics** are generated in SQL deterministically from each product id.
- **Logos:** `npm run db:sample-logos` renders the SVG logos to PNG (Playwright) and uploads them to `business-logos` as a platform admin. Credentials come from environment variables, never files.
- **Sample owner accounts** are linked by the SQL only if they exist. Passwords are never stored in the repo.
- **Labelling:** sample businesses are marked "(Sample business for testing.)" in their description.

## Consequences
- Good: demo mode and Supabase mode show the same catalog; re-seeding is one command plus one SQL run.
- Trade-off: one more dev dependency, which was already present transitively.

## Alternatives rejected
- Hand-maintained SQL: drifts from the demo seed.
- Inserting through the API: analytics inserts are closed to clients by design (rate-limited Edge Function only).

# ADR-0015: Supabase foundation behind the existing service layer (demo stays the default)
- **Status:** Accepted (refines ADR-0002: adds `@supabase/supabase-js` 2.117.3, pinned to an exact version)
- **Date:** 2026-10-12
- **Affects:** design/05-services.md, design/07-auth-routing.md, design/18-mock-vs-backend.md, design/19-supabase.md

## Context
Phase 2 adds Supabase as the future backend. The current frontend and its no-setup demo must keep working, and a half-configured environment must never show fake data as if it were real.

## Decision
- **Mode switch:** `VITE_DATA_MODE` selects the backend. It is `demo` by default. Supabase is used only when the mode is `supabase` **and** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are valid. Any other combination is `misconfigured`: the app shows a setup screen and every service call returns `CONFIG`. Secret and service_role keys are rejected.
- **One interface, two implementations:**
  - `services/index.ts` picks either the mock or `supabase/supabaseCatalogService.ts`.
  - The interface gains `uploadAsset` and `subscribe`.
  - Validation and analytics helpers are shared (`services/validation.ts`, `services/analytics.ts`).
- **Auth:** `services/supabase/auth.ts` is used only in Supabase mode, through `/login`. The demo account picker moves to `/demo` and is unchanged in demo mode.
- **Authorization lives in the database:**
  - RLS on every table.
  - Super Admin = a row in `platform_admins`, which has no client write policies. Business access = a row in `business_members`.
  - `user_metadata` is never used.
- **Product writes** go through the `save_product` RPC, a single SECURITY INVOKER transaction, so a product and its images, models and variants never half-save.
- **Storage:**
  - `business-logos` is public (logos are public branding; SVG is not allowed).
  - `product-media` is private and served by 1-hour signed URLs. The read policy follows product visibility, so draft files are never public.
- **No activity log table.** In Supabase mode, recent activity is derived from timestamps, so deletions don't appear.

## Consequences
- Good: components didn't change. Demo mode cannot reach Supabase: no client is created.
- Good: real errors are shown verbatim (verified against the live project before the schema was applied).
- Trade-off: hand-written row types until the schema is applied and types are generated.
- Trade-off: signed URLs expire after 1 hour, so very long-open pages need a reload.

## Alternatives rejected
- Auto-switching to Supabase when the env vars exist: a partial setup would silently change behaviour.
- A public product-media bucket: draft files would be readable by anyone with the URL.
- Separate per-table inserts for products: a failed child insert would leave a half-saved product.

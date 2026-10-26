# Architecture (summary)

Short technical map. Depth lives in `System_arch/` (start with `System_arch/HANDOFF.md`, index in `System_arch/README.md`, decisions in `System_arch/decisions/`).

## Stack
Vite 8, React 19, TypeScript 6 (strict), Tailwind 4 (tokens in `src/index.css`, ADR-0014), React Router 8, `@google/model-viewer` (3D + AR), `@supabase/supabase-js`. Also `qrcode`, `recharts`, `lucide-react`, `@gltf-transform/*` (model optimization, off by default). Lint: oxlint. SPA hosted on Vercel (`vercel.json` rewrites everything except `/assets/` to `index.html`).

## Data modes
- `VITE_DATA_MODE=demo` (default, no env vars): mock service with sample data, mock account picker at `/demo`.
- `VITE_DATA_MODE=supabase` + `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`: real backend.
- `src/services/backendConfig.ts`: `readBackendConfig` returns `demo | supabase | misconfigured`. It rejects secret/service_role keys and never falls back to demo silently. `productionBuildProblem` fails a build with `VERCEL_ENV=production` unless it is in Supabase mode over https.

## Service layer rule
Components read and write data only through `src/services` (`service`, `auth`, hooks in `hooks.ts`). They never import `services/mock/*` or `services/supabase/*`. The UI's role guard (`src/auth/RequireRole.tsx`) is for convenience; RLS is the security boundary.

## URL rules
All URLs are built in `src/lib/urls.ts`, which has three modes (`PUBLIC_URL_MODE`):
- `subdomain`: `VITE_ROOT_DOMAIN` is set. The catalog is at `https://<slug>.<root>`, products at `/products/<product>`. Reserved subdomains are listed in `src/tenant/resolveTenant.ts`.
- `path`: Supabase mode without a domain (today). `/catalog/<slug>` and `/products/<slug>/<product>` on the current origin. `PUBLIC_URLS_ARE_TEMPORARY` flags non-production origins, and the QR panel warns there.
- `demo`: placeholder `https://<slug>.example.com`, labelled in the UI.

The catalog QR always encodes `catalogPublicUrl`. Claim links are `/claim#<token>`: the token sits in the URL fragment, so it never reaches server logs.

## Supabase (client project `zggylkbgajamhriebdrg`; the old dev project `pmnjchhrgvajtjpadpqo` is not used. The lists below describe the first 7 migrations; 18 are applied, see `supabase/migrations/`)
- **Public tables (8, all with RLS):** `businesses`, `platform_admins`, `business_members`, `products`, `product_images`, `product_models`, `product_variants`, `product_analytics`. Anonymous users read only active businesses and their published products (and the child rows of those products).
- **`private` schema:** `analytics_hits` (rate-limit counters) and `business_claims` (only the SHA-256 hash of each claim token is stored). Neither is exposed through the Data API.
- **Storage:**
  - `business-logos`: public, 2 MB, png/jpeg/webp.
  - `product-media`: private, 50 MB, images plus GLB/USDZ. Served through signed URLs with a 12 h TTL (`MEDIA_URL_TTL_SECONDS`).
  - Path convention for both buckets: `{business_id}/{uuid}.{ext}`.
- **Edge Function `track-event`** (`verify_jwt=false`, public by design): validates the event, hashes the visitor as SHA-256(ip | UTC date | salt), and calls `record_event_limited`. The limit is 30 events per visitor key per minute, and that function is executable by `service_role` only. Browsers cannot insert analytics rows directly.
- **Migrations** (`supabase/migrations/`, all 7 applied to the live project as of 2026-10-13):
  1. `20261012192143_init_schema.sql`: tables, RLS, grants
  2. `20261012192159_storage.sql`: buckets and storage policies
  3. `20261012192454_save_product.sql`: transactional `save_product` (SECURITY INVOKER; inserts are always `draft`)
  4. `20261012200810_analytics_rate_limit.sql`: private schema, rate limiter, `model_interaction` event
  5. `20261012200813_business_member_admin.sql`: `admin_list_business_members`, `admin_add_business_member`
  6. `20261013093006_publish_rules.sql`: server-side publish rules; owner add requires a confirmed email
  7. `20261013144121_owner_registration_and_claims.sql`: claim links, `register_business`

  Rollback for 6 and 7: `supabase/rollback/20261013_publish_rules_and_claims_rollback.sql`.

## Auth and ownership (ADR-0022)
- Supabase Auth with email and password. Production sign-ups are off. The app requires passwords of at least 12 characters; the matching Auth setting is still pending as release checklist item 7.
- `platform_admins` rows are added manually by SQL (there are no write policies). `business_members` links users to businesses. Owners cannot change a business's slug or status (enforced by a trigger).
- An owner link is created in only three ways:
  - `admin_add_business_member`: by a platform admin, for a confirmed account;
  - `admin_create_business_claim` → `redeem_business_claim`: single use, 7 days;
  - `register_business`: a new business, always `draft` until an admin activates it.
- All of these are SECURITY DEFINER functions that check the caller first. Matching a business's name or email grants nothing.

## AR flow (ADR-0021)
- `src/components/three/ModelViewer.tsx` wraps model-viewer with `ar-modes="scene-viewer quick-look"` and `ar-scale="fixed"`. The USDZ is passed as `ios-src`.
- The "View in my home" button appears only when a GLB is loaded and `canActivateAR` is true.
- `src/lib/scale.ts` compares the GLB's measured size with the entered dimensions (5% or 1 cm tolerance).
- Analytics events, sent from `ProductPage.tsx` and never on `?preview=1`:
  - `view`: one per page load;
  - `ar_activation`: one launch attempt per tap, with a 2 s re-tap guard; not proof of placement;
  - `model_interaction`: the first rotate or zoom per page view.
- Live since 2026-10-14 (`main` `3ada1b9`): native only, `scene-viewer quick-look` (ADR-0021). Before that, production ran `webxr scene-viewer quick-look`.

## Deployment
- Vercel project `ar-deploy` (team `track0`), auto-deployed from `main` of `krishna-notfound/AR-Deploy`.
- Preview deployments currently share the production env values (Supabase mode, live database). A Preview build therefore reads and writes live data, including analytics. See `docs/PRODUCTION_READINESS.md` §8.
- Never run `npm run dev` in Supabase mode against the live project.

## Tests
- `npm test` (vitest): unit and component tests across `src/`.
- `supabase/tests/migrations.test.ts`: applies all migrations to PGlite and checks RLS, publish rules and claims.
- `src/services/supabase/live.integration.test.ts`: tests against the live API. Skipped unless `SUPABASE_IT_URL`, `SUPABASE_IT_KEY` and `SUPABASE_IT_PASSWORD` are set.
- `supabase/functions/track-event/handler.test.ts`: Edge Function handler.
- `npm run test:e2e` (Playwright, `tests/e2e`): desktop and mobile projects on a dev server at :5199, in demo mode.

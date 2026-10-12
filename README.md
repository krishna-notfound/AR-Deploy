# Furnish AR: 3D furniture catalog & AR platform (frontend)

This is a multi-tenant frontend where furniture businesses publish catalogs. Customers can rotate 3D models and tap **“View in my home”** to place furniture in their room with native AR.

The app has three surfaces:

| Surface | Route | Notes |
|---|---|---|
| Super Admin | `/admin` | Manages every business, product, catalog, QR code and analytics. |
| Business Admin | `/dashboard` | One business at a time. **Scope pending client confirmation.** |
| Public catalog / product | `/catalog/:businessSlug`, `/products/:businessSlug/:productSlug` | English and Portuguese, 3D viewer, AR. |

The landing page is at `/`. The demo account picker is at `/demo`.

> **Two modes.** By default the app runs in **demo mode**: sample data stored in this browser's `localStorage`, no setup, no real authentication. Roles there are for navigation only and are **not a security boundary**.
> **Supabase mode** (`VITE_DATA_MODE=supabase` plus URL and publishable key) uses Supabase Auth, Postgres with RLS, and Storage. The migrations are in `supabase/migrations/`; they are tested locally but have not been applied to a live project. Setup: [`System_arch/design/19-supabase.md`](System_arch/design/19-supabase.md).

## Run it

```bash
npm install
npm run dev            # http://localhost:5173 → choose a demo account
```

| Command | What it does |
|---|---|
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript (strict) |
| `npm run lint` | oxlint |
| `npm test` | Unit and component tests (Vitest) |
| `npm run test:e2e` | Playwright end-to-end tests. Run `npx playwright install chromium` once first. |

Optional: copy `.env.example` to `.env.local`.
- Set `VITE_ROOT_DOMAIN` to switch on subdomain (hostname) routing.
- Set the `VITE_SUPABASE_*` variables plus `VITE_DATA_MODE=supabase` to use Supabase.
- A partial Supabase setup shows a configuration error; it never falls back to demo data.

## Where things are

- `src/services/`: the `CatalogService` interface. The backend swap point is `services/index.ts`, configured by `services/backend.ts`. The mock implementation is in `services/mock/`, the Supabase implementation and auth in `services/supabase/`.
- `supabase/`: CLI config and SQL migrations (schema, RLS, storage policies, `save_product` RPC).
- `src/domain/types.ts`: all entity types.
- `src/features/`: pages and shared features. These include:
  - `products/ProductEditor*`
  - `catalogs/CatalogQrPanel`
  - `analytics/AnalyticsView`
  - `businesses/BusinessForm`
- `src/components/`: the design system (`ui/`), the app shell (`layout/`), charts, and the `<model-viewer>` wrapper (`three/`).
- `System_arch/`: architecture docs, ADRs and the task tracker. Start at `System_arch/README.md`.

## Sample assets and credits

- 3D models come from the Khronos glTF Sample Assets, licensed **CC BY 4.0**:
  - Glam Velvet Sofa
  - Sheen Wood Leather Sofa
  - Sheen Chair
  - Chair Damask Purplegold
  - Anisotropy Barn Lamp
  - Lights Punctual Lamp

  The source and licence of each model are at <https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models>. The posters in `public/images/models/` were rendered from these models.
- Product photos come from Unsplash, under the [Unsplash License](https://unsplash.com/license).
- All businesses, prices and analytics are **sample data**.

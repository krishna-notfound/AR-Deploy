# 07 · Mock accounts, guards & route table
Read when: adding routes, guards, navigation, or account switching.
Decision: [ADR-0008](../decisions/ADR-0008-business-admin-shared-scoped.md)

## Accounts (`src/auth/accounts.ts`)
- One `super_admin` account ("Platform Admin").
- One `business_admin` account per seeded business, linked by `businessId`.
- `AccountProvider` exposes `{ user, switchAccount(id), logout() }`. `logout` clears `arfurn:account` and goes to `/`.

## Guards
`<RequireRole allow="super_admin" | "business_admin">`. The prop is named `allow` to avoid clashing with ARIA `role`.

The session `{ role, businessId? }` is stored in `localStorage['arfurn:account']`. `useCurrentBusiness()` returns the signed-in business for `/dashboard` pages.

`RequireRole` behaviour:
- No user: redirect to `/?next=`.
- Wrong role: show a page saying which account type the area needs, with a "Switch account" button.

```ts
// UX-only routing guard for the demo. NOT a security boundary.
// Production access control must be enforced by the backend.
```

Business Admin pages always use `user.businessId` and never take a businessId from the URL. An `/dashboard/products/:id/edit` URL for a product owned by another business shows the not-found page.

## Routes
| Path | Page | Guard |
|---|---|---|
| `/` | DemoEntryPage | – |
| `/admin` | AdminOverviewPage | super_admin |
| `/admin/businesses` | BusinessesListPage | super_admin |
| `/admin/businesses/new` | BusinessCreatePage | super_admin |
| `/admin/businesses/:businessId` | BusinessDetailPage (edit + products + QR) | super_admin |
| `/admin/products` | AdminProductsPage (`?business ?status ?q`) | super_admin |
| `/admin/products/new` | ProductEditorPage (`?business` preselect) | super_admin |
| `/admin/products/:productId/edit` | ProductEditorPage | super_admin |
| `/admin/analytics` | AnalyticsPage | super_admin |
| `/admin/catalogs` | CatalogsQrPage (`?business`) | super_admin |
| `/admin/settings` | AdminSettingsPage | super_admin |
| `/dashboard` | BusinessOverviewPage | business_admin |
| `/dashboard/products` | MyProductsPage | business_admin |
| `/dashboard/products/new` | ProductEditorPage | business_admin |
| `/dashboard/products/:productId/edit` | ProductEditorPage | business_admin |
| `/dashboard/analytics` | AnalyticsPage (scoped) | business_admin |
| `/dashboard/catalog` | CatalogsQrPage (scoped) | business_admin |
| `/dashboard/settings` | BusinessSettingsPage | business_admin |
| `/catalog/:businessSlug` | CatalogPage | public |
| `/products/:businessSlug/:productSlug` | ProductPage | public |
| `*` | NotFoundPage | – |

- Lazy-load each surface (admin, dashboard, public) so public pages never ship admin code.
- model-viewer is imported only by ProductPage and ModelPreview.
- **Hostname mode** (later): when `resolveTenant()` returns a slug, `/` renders CatalogPage and `/products/:productSlug` renders ProductPage. The app picks this router branch at boot ([08-tenancy-urls.md](08-tenancy-urls.md)).

## Phase 2 routes (ADR-0016)
- `/`: landing page.
- `/demo`: account picker. `/?next=` redirects to `/demo?next=`.
- `/login`: Supabase sign-in. In demo mode it redirects to `/demo`.
- `RequireRole` sends signed-out users to `SIGN_IN_PATH` (`/demo` or `/login`).
- In Supabase mode, `AccountProvider` derives the user from `auth.getUser()` plus `platform_admins` / `business_members`. A signed-in user without a role gets a "not linked yet" message. Logout calls `auth.signOut()`.

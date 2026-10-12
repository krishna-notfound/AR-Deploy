# 05 · Service layer
Read when: adding or changing data access, mutations, or hooks. Persistence details are in [06-persistence.md](06-persistence.md).

## Contract (`src/services/catalogService.ts`)
```ts
export type ServiceErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'STORAGE' | 'UNKNOWN';
export interface ServiceError { code: ServiceErrorCode; message: string; fieldErrors?: Record<string, string> }
export type Result<T> = { ok: true; data: T } | { ok: false; error: ServiceError };

export type BusinessInput = Omit<Business, 'id' | 'createdAt' | 'updatedAt'>;
export type ProductInput  = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'status'> & { status?: ProductStatus };
export interface ProductQuery { businessId?: ID; status?: ProductStatus; search?: string; category?: string }

export interface CatalogService {
  getBusinesses(): Promise<Result<Business[]>>;
  getBusinessById(id: ID): Promise<Result<Business>>;
  getBusinessBySlug(slug: string): Promise<Result<Business>>;
  createBusiness(d: BusinessInput): Promise<Result<Business>>;
  updateBusiness(id: ID, d: Partial<BusinessInput>): Promise<Result<Business>>;
  setBusinessStatus(id: ID, s: BusinessStatus): Promise<Result<Business>>;
  deleteBusiness(id: ID): Promise<Result<void>>;                 // cascades products
  getCatalog(slug: string): Promise<Result<BusinessCatalog>>;
  getCatalogs(): Promise<Result<BusinessCatalog[]>>;            // all businesses, by name

  getProducts(q?: ProductQuery): Promise<Result<Product[]>>;
  getProductsByBusiness(businessId: ID): Promise<Result<Product[]>>;
  getProductById(id: ID): Promise<Result<Product>>;
  getPublicProduct(bSlug: string, pSlug: string, opts?: { allowDraft?: boolean }): Promise<Result<{ business: Business; product: Product }>>;
  // NOT_FOUND unless the business is active and the product is published (or allowDraft is true)
  createProduct(d: ProductInput): Promise<Result<Product>>;
  updateProduct(id: ID, d: Partial<ProductInput>): Promise<Result<Product>>;
  duplicateProduct(id: ID): Promise<Result<Product>>;            // "(copy)", slug -copy, -copy-2…, draft
  deleteProduct(id: ID): Promise<Result<void>>;
  publishProduct(id: ID): Promise<Result<Product>>;              // checks publish invariants
  unpublishProduct(id: ID): Promise<Result<Product>>;

  getAnalytics(): Promise<Result<AnalyticsSummary>>;
  getBusinessAnalytics(businessId: ID): Promise<Result<AnalyticsSummary>>;
  recordEvent(e: { productId: ID; type: AnalyticsEventType }): Promise<Result<void>>;
  getRecentActivity(o?: { businessId?: ID; limit?: number }): Promise<Result<ActivityItem[]>>;

  resetDemoData(): Promise<Result<void>>;
}
```

## Mock implementation rules (`services/mock/mockCatalogService.ts`)
1. `await simulateLatency()` adds 150–450 ms of delay (0 ms when `MODE === 'test'`).
2. Methods never throw. They catch errors and return `{ ok:false }`.
3. They return `structuredClone` copies of stored data.
4. Writes append an `ActivityItem` and call `store.notify()`.
5. Failure injection: `localStorage['arfurn:debug:failRate'] = '0.2'` (toggle in Settings → Developer).

## Hooks (`services/hooks.ts`)
```ts
useServiceQuery<T>(fn: () => Promise<Result<T>>, deps: unknown[])
  → { status: 'loading'|'success'|'error'; data?: T; error?: ServiceError; refetch(): void }
useServiceMutation<A extends unknown[], T>(fn: (...a: A) => Promise<Result<T>>)
  → { mutate(...a: A): Promise<Result<T>>; pending: boolean }
```
`useServiceQuery` subscribes to `store.subscribe()` and refetches whenever the store changes. No manual cache invalidation is needed.

## Backend swap point
`services/index.ts` → `export const service: CatalogService = mockCatalogService;`
A future `httpCatalogService` implements the same interface, so the UI doesn't change.

## Phase 2 additions (ADR-0015)
- **Backend selection:** `services/backend.ts` reads `VITE_DATA_MODE`, the URL and the key. `services/index.ts` exports `service` (mock, Supabase, or an always-`CONFIG`-error proxy when misconfigured) and `auth` (`null` in demo mode).
- **New interface methods:**
  - `uploadAsset({ kind, file, businessId })`: demo mode returns data URLs or session blobs; Supabase mode uploads to Storage.
  - `subscribe(listener)`: replaces the hooks' direct dependency on the mock store.
- **Changed method:** `recordEvent` now takes `businessId`.
- **New error codes:** `PERMISSION` (RLS denial / 42501), `CONFIG`, `UNSUPPORTED` (demo-only operations).
- **Shared modules:** `services/validation.ts` and `services/analytics.ts` (`summarize`, `deriveActivity`, `isoDay`) are used by both implementations.
- **`AnalyticsSummary.isSample`** is now `boolean`. The UI shows "Sample data" only when it is true.
- **Domain:** `ProductImage.storagePath` and `ModelAsset.storagePath` hold the Storage object path; `url` is then a signed URL.

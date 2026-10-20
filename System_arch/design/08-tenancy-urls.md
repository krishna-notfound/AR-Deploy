# 08 · Multi-tenant resolution, URLs & QR rule
Read when: building URLs, QR codes, copy/share links, or the subdomain logic.
Decision: [ADR-0005](../decisions/ADR-0005-qr-encodes-catalog-url.md), amended by [ADR-0025](../decisions/ADR-0025-product-qr-and-owner-catalog-preview.md)

## resolveTenant (`src/tenant/resolveTenant.ts`)
```ts
type Tenant = { mode: 'hostname'; slug: string } | { mode: 'path' };
export function resolveTenant(hostname = window.location.hostname): Tenant
```
Returns hostname mode when `VITE_ROOT_DOMAIN` is set, the hostname is `{slug}.{root}`, and the slug is not in `['www','admin','app','api']`. Otherwise it returns path mode, which is the local default. Cover it with unit tests.

## URL builders (`src/lib/urls.ts`): the only place URLs are composed
| Function | Result | Used by |
|---|---|---|
| `catalogPublicUrl(b)` | `https://{b.slug}.{ROOT}` | QR code, "Copy catalog URL" (labelled Demo URL) |
| `productPublicUrl(b, p)` | `https://{b.slug}.{ROOT}/products/{p.slug}` | Publish dialog, "Copy product URL" in admin |
| `catalogLocalPath(b, { preview? })` | `/catalog/{slug}` (`?preview=1` for the owner preview of a non-active catalogue, ADR-0025) | "Open catalog" / "Preview catalog (not public yet)" |
| `productLocalPath(b, p, { preview? })` | `/products/{bSlug}/{pSlug}` | "Open preview" |
| `tenantCatalogPath()` / `tenantProductPath(p)` | `/`, `/products/{pSlug}` on a business subdomain | Public catalogue links |
| `myProductsPath({ status?, ar? })` | `/dashboard/products?…` | Overview "Next steps" links |

`ROOT = import.meta.env.VITE_ROOT_DOMAIN ?? 'example.com'`.
Share and copy actions on **public** pages use `window.location.href`.

## QR rule
- The catalog QR code **always** encodes `catalogPublicUrl(business)`, never a product URL, so it stays valid as products change.
- An optional toggle, "Encode local preview URL (for testing on this network)", switches it to `origin + catalogLocalPath`. The toggle is off by default.
- Download as PNG at 1024 px, named `{slug}-catalog-qr.png`.
- The "Encode local preview URL" toggle is shown only on demo or temporary (preview/local) hosts, never in production.

## Product QR (ADR-0025)
- A separate "Product QR code" dialog (product row menu, shared `ProductTable`) encodes `productPublicUrl(b, p)`. It never replaces the catalogue QR.
- Published products only; a draft shows "Not public yet" and no code. A published product of a non-active business gets the code with a "Not public yet" warning.
- PNG at 1024 px, named `{business}-{product}-qr.png`.

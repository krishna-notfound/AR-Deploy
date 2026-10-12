# 08 · Multi-tenant resolution, URLs & QR rule
Read when: building URLs, QR codes, copy/share links, or the subdomain logic.
Decision: [ADR-0005](../decisions/ADR-0005-qr-encodes-catalog-url.md)

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
| `catalogLocalPath(b)` | `/catalog/{slug}` | "Open catalog preview" |
| `productLocalPath(b, p)` | `/products/{bSlug}/{pSlug}` | "Open preview" |

`ROOT = import.meta.env.VITE_ROOT_DOMAIN ?? 'example.com'`.
Share and copy actions on **public** pages use `window.location.href`.

## QR rule
- The catalog QR code **always** encodes `catalogPublicUrl(business)`, never a product URL, so it stays valid as products change.
- An optional toggle, "Encode local preview URL (for testing on this network)", switches it to `origin + catalogLocalPath`. The toggle is off by default.
- Download as PNG at 1024 px, named `{slug}-catalog-qr.png`.

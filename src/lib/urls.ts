// The only place URLs are composed. See System_arch/design/08-tenancy-urls.md.
import type { Business, Lang, Product } from '@/domain/types'

type Sluggable = Pick<Business, 'slug'>
type ProductSluggable = Pick<Product, 'slug'>

const ROOT = (import.meta.env.VITE_ROOT_DOMAIN as string | undefined) || undefined

/**
 * subdomain: real business subdomains on VITE_ROOT_DOMAIN.
 * path:      Supabase mode without a domain yet; real /catalog/... URLs on this deployment.
 * demo:      placeholder https://{slug}.example.com URLs, always labelled as demo URLs.
 */
export const PUBLIC_URL_MODE: 'subdomain' | 'path' | 'demo' = ROOT ? 'subdomain' : import.meta.env.VITE_DATA_MODE === 'supabase' ? 'path' : 'demo'
/** False only for demo placeholder URLs, which the UI must label as such. */
export const PUBLIC_URLS_ARE_LIVE = PUBLIC_URL_MODE !== 'demo'

/**
 * Path-mode URLs embed this deployment's own address. On a preview deployment or a laptop that address is
 * temporary, so QR codes and links copied there would point to the wrong site once printed or shared.
 */
export const PUBLIC_URLS_ARE_TEMPORARY = PUBLIC_URL_MODE === 'path' && __DEPLOY_ENV__ !== 'production'

export const ROOT_DOMAIN: string = ROOT || 'example.com'

/** Public catalog URL. Used by QR codes and "Copy catalog URL". */
export function catalogPublicUrl(b: Sluggable): string {
  return PUBLIC_URL_MODE === 'path' ? absoluteLocalUrl(catalogLocalPath(b)) : `https://${b.slug}.${ROOT_DOMAIN}`
}

/** Public product URL, e.g. https://business.example.com/products/modern-sofa */
export function productPublicUrl(b: Sluggable, p: ProductSluggable): string {
  return PUBLIC_URL_MODE === 'path' ? absoluteLocalUrl(productLocalPath(b, p)) : `${catalogPublicUrl(b)}/products/${p.slug}`
}

/** Query parameter that opens a product page on one colour or option (`?variant=<id>`; ids stay stable across saves). */
export const VARIANT_PARAM = 'variant'

/** The product page's query with the chosen variant set (or removed), every other parameter kept (preview, ...). */
export function withVariantParam(search: URLSearchParams, variantId: string | undefined): URLSearchParams {
  const next = new URLSearchParams(search)
  if (variantId) next.set(VARIANT_PARAM, variantId)
  else next.delete(VARIANT_PARAM)
  return next
}

/**
 * Local route that works in this running app. `preview` asks for the owner preview of a catalogue that is not
 * active yet: only a signed-in owner of that business (or a platform admin) gets it; everyone else still sees
 * "catalog unavailable", and in Supabase mode RLS is the real gate.
 */
export function catalogLocalPath(b: Sluggable, opts?: { preview?: boolean }): string {
  return `/catalog/${b.slug}${opts?.preview ? '?preview=1' : ''}`
}

/** Catalogue route on a business's own subdomain. */
export function tenantCatalogPath(opts?: { preview?: boolean }): string {
  return opts?.preview ? '/?preview=1' : '/'
}

/** Product route on a business's own subdomain (the catalogue there is "/"). */
export function tenantProductPath(p: ProductSluggable, opts?: { preview?: boolean }): string {
  return `/products/${p.slug}${opts?.preview ? '?preview=1' : ''}`
}

export function productLocalPath(b: Sluggable, p: ProductSluggable, opts?: { preview?: boolean }): string {
  return `/products/${b.slug}/${p.slug}${opts?.preview ? '?preview=1' : ''}`
}

/** Embed route (ADR-0026): the chrome-less product view other websites show in an iframe. */
export function productEmbedLocalPath(b: Sluggable, p: ProductSluggable): string {
  return `/embed/products/${b.slug}/${p.slug}`
}

/** Embed route on a business's own subdomain. */
export function tenantProductEmbedPath(p: ProductSluggable): string {
  return `/embed/products/${p.slug}`
}

/** Public embed URL for the owner's iframe snippet. `lang` fixes the language; without it the visitor's browser decides. */
export function productEmbedUrl(b: Sluggable, p: ProductSluggable, opts?: { lang?: Lang }): string {
  const base = PUBLIC_URL_MODE === 'path' ? absoluteLocalUrl(productEmbedLocalPath(b, p)) : `${catalogPublicUrl(b)}${tenantProductEmbedPath(p)}`
  return opts?.lang ? `${base}?lang=${opts.lang}` : base
}

/**
 * The full product page an embed hands off to (opened in a new tab, where native AR works), on this deployment,
 * on the same finish and language as the embed.
 */
export function embedProductPageUrl(b: Sluggable, p: ProductSluggable, opts: { tenant: boolean; variantId?: string; lang?: Lang }): string {
  const q = new URLSearchParams()
  if (opts.variantId) q.set(VARIANT_PARAM, opts.variantId)
  if (opts.lang) q.set('lang', opts.lang)
  const path = opts.tenant ? tenantProductPath(p) : productLocalPath(b, p)
  return absoluteLocalUrl(`${path}${q.size ? `?${q.toString()}` : ''}`)
}

export function absoluteLocalUrl(path: string): string {
  return `${typeof window !== 'undefined' ? window.location.origin : ''}${path}`
}

/** Public "Apply as a business" wizard. */
export const APPLY_PATH = '/apply'
/** Where owner invitation links land (the provision-owner Edge Function builds the absolute URL from APP_BASE_URL). */
export const ACCEPT_INVITE_PATH = '/accept-invite'

export const applicationAdminPath = (id: string) => `/admin/applications/${id}`
/** The applications list, optionally filtered by status (e.g. the overview's "awaiting review" link). */
export const applicationsAdminPath = (status?: string) => `/admin/applications${status ? `?status=${encodeURIComponent(status)}` : ''}`
export const businessAdminPath = (id: string) => `/admin/businesses/${id}`
/** The owner's product list, optionally filtered (the filters are the list's own URL parameters). */
export function myProductsPath(filter?: { status?: 'draft' | 'published'; ar?: 'ready' | 'android-only' | 'android-blocked' | 'photos-only' }): string {
  const q = new URLSearchParams()
  if (filter?.status) q.set('status', filter.status)
  if (filter?.ar) q.set('ar', filter.ar)
  return `/dashboard/products${q.toString() ? `?${q.toString()}` : ''}`
}

/** The current page's URL for sharing: the draft-preview flag is dropped, every other query parameter kept. */
export function shareableCurrentUrl(): string {
  const u = new URL(window.location.href)
  u.searchParams.delete('preview')
  return u.toString()
}

// The only place URLs are composed. See System_arch/design/08-tenancy-urls.md.
import type { Business, Product } from '@/domain/types'

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

export const ROOT_DOMAIN: string = ROOT || 'example.com'

/** Public catalog URL. Used by QR codes and "Copy catalog URL". */
export function catalogPublicUrl(b: Sluggable): string {
  return PUBLIC_URL_MODE === 'path' ? absoluteLocalUrl(catalogLocalPath(b)) : `https://${b.slug}.${ROOT_DOMAIN}`
}

/** Public product URL, e.g. https://business.example.com/products/modern-sofa */
export function productPublicUrl(b: Sluggable, p: ProductSluggable): string {
  return PUBLIC_URL_MODE === 'path' ? absoluteLocalUrl(productLocalPath(b, p)) : `${catalogPublicUrl(b)}/products/${p.slug}`
}

/** Local route that works in this running app. */
export function catalogLocalPath(b: Sluggable): string {
  return `/catalog/${b.slug}`
}

export function productLocalPath(b: Sluggable, p: ProductSluggable, opts?: { preview?: boolean }): string {
  return `/products/${b.slug}/${p.slug}${opts?.preview ? '?preview=1' : ''}`
}

export function absoluteLocalUrl(path: string): string {
  return `${typeof window !== 'undefined' ? window.location.origin : ''}${path}`
}

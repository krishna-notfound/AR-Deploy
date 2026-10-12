// The only place URLs are composed. See System_arch/design/08-tenancy-urls.md.
import type { Business, Product } from '@/domain/types'

type Sluggable = Pick<Business, 'slug'>
type ProductSluggable = Pick<Product, 'slug'>

export const ROOT_DOMAIN: string = import.meta.env.VITE_ROOT_DOMAIN || 'example.com'

/** Demo public catalog URL (subdomain). Used by QR codes and "Copy catalog URL". */
export function catalogPublicUrl(b: Sluggable): string {
  return `https://${b.slug}.${ROOT_DOMAIN}`
}

/** Demo public product URL, e.g. https://business.example.com/products/modern-sofa */
export function productPublicUrl(b: Sluggable, p: ProductSluggable): string {
  return `${catalogPublicUrl(b)}/products/${p.slug}`
}

/** Local route that works in this running demo. */
export function catalogLocalPath(b: Sluggable): string {
  return `/catalog/${b.slug}`
}

export function productLocalPath(b: Sluggable, p: ProductSluggable, opts?: { preview?: boolean }): string {
  return `/products/${b.slug}/${p.slug}${opts?.preview ? '?preview=1' : ''}`
}

export function absoluteLocalUrl(path: string): string {
  return `${window.location.origin}${path}`
}

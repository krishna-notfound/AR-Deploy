// The picture at the top of a public catalogue (ADR-0065, amends ADR-0062). Pure choice of the picture, so the page and its tests
// agree on the order: the company's own banner, else the platform's default banner, else the built-in Sanctus photograph.
import type { SiteAsset } from '@/domain/siteContent'
import type { Business } from '@/domain/types'
import { siteAssetUrl } from '@/services'

/** The built-in catalogue photograph: a Sanctus brand photo, dark enough for white text (ADR-0062). */
export const CATALOG_PHOTO = '/images/sanctus/v2/lamp-vase.webp'
/** Where the built-in photograph is anchored in the band. Any other picture is centred. */
export const CATALOG_PHOTO_POSITION = 'object-[50%_44%]'

export type CatalogBannerSource = 'own' | 'default' | 'builtin'

export interface CatalogBannerChoice {
  source: CatalogBannerSource
  src: string
}

/**
 * Which picture the catalogue top shows.
 * - `own`: the company's banner (an address).
 * - `default`: the platform's default banner, once it can be shown (a Website Editor picture that exists only in this demo session
 *   resolves to no address after a reload, and then the built-in photograph shows instead).
 * - `builtin`: the Sanctus photograph.
 * Returns null while the published site content is still loading and the company has no banner of its own, so the band stays plain
 * dark for a moment instead of flashing the built-in photograph before the default one arrives.
 */
export function chooseCatalogBanner(
  business: Pick<Business, 'banner'>,
  site: { loading: boolean; defaultBanner: SiteAsset | undefined },
): CatalogBannerChoice | null {
  if (business.banner?.url) return { source: 'own', src: business.banner.url }
  if (site.loading) return null
  const fallback = site.defaultBanner ? siteAssetUrl(site.defaultBanner) : ''
  return fallback ? { source: 'default', src: fallback } : { source: 'builtin', src: CATALOG_PHOTO }
}

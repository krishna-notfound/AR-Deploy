// The only place URLs are composed. See System_arch/design/08-tenancy-urls.md.
import type { Business, BusinessStatus, Lang, Product, ProductStatus, SettingsSection } from '@/domain/types'

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
export function catalogLocalPath(b: Sluggable, opts?: { preview?: boolean; category?: string }): string {
  const q = new URLSearchParams()
  if (opts?.category) q.set('category', opts.category)
  if (opts?.preview) q.set('preview', '1')
  const qs = q.toString()
  return `/catalog/${b.slug}${qs ? `?${qs}` : ''}`
}

/**
 * True when this product's public page is not live for customers yet: the product is not published, or its
 * business is not active. Owner and admin links to such a page carry `?preview=1` (R-W4-1); all of them use this helper.
 */
export function needsPreview(product: { status: ProductStatus }, business: { status: BusinessStatus }): boolean {
  return product.status !== 'published' || business.status !== 'active'
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
/** Where platform team invitation links land (ADR-0030); the secret travels in the URL fragment. */
export const JOIN_PATH = '/join'
/** Where owner invitation links land (the provision-owner Edge Function builds the absolute URL from APP_BASE_URL). */
export const ACCEPT_INVITE_PATH = '/accept-invite'
/** Public legal pages (EN/PT, text from docs/legal/drafts). Served on the platform domain and on business subdomains. */
export const PRIVACY_PATH = '/privacy'
export const TERMS_PATH = '/terms'

export const applicationAdminPath = (id: string) => `/admin/applications/${id}`
/** The applications list, optionally filtered by status (e.g. the overview's "awaiting review" link). */
export const applicationsAdminPath = (status?: string) => `/admin/applications${status ? `?status=${encodeURIComponent(status)}` : ''}`
export const businessAdminPath = (id: string) => `/admin/businesses/${id}`
/** The staff 3D model request queue (S4 R-S4-10), optionally on a tab and for one business. */
export function modelRequestsAdminPath(filter?: { status?: 'open' | 'delivered' | 'rejected' | 'cancelled' | 'all'; businessId?: string }): string {
  const q = new URLSearchParams()
  if (filter?.status) q.set('status', filter.status)
  if (filter?.businessId) q.set('business', filter.businessId)
  return `/admin/model-requests${q.toString() ? `?${q.toString()}` : ''}`
}
export const modelRequestAdminPath = (id: string) => `/admin/model-requests/${encodeURIComponent(id)}`
/** The owner's product list, optionally filtered (the filters are the list's own URL parameters). */
export function myProductsPath(filter?: { status?: 'draft' | 'published'; ar?: 'ready' | 'android-only' | 'android-blocked' | 'photos-only'; model?: 'open' }): string {
  const q = new URLSearchParams()
  if (filter?.status) q.set('status', filter.status)
  if (filter?.ar) q.set('ar', filter.ar)
  if (filter?.model) q.set('model', filter.model)
  return `/dashboard/products${q.toString() ? `?${q.toString()}` : ''}`
}

/** The current page's URL for sharing: the draft-preview flag is dropped, every other query parameter kept. */
export function shareableCurrentUrl(): string {
  const u = new URL(window.location.href)
  u.searchParams.delete('preview')
  return u.toString()
}

/** The settings hub (S1): /dashboard/settings/<section> for business owners, /admin/settings/<section> for staff. */
export function settingsPath(scope: 'admin' | 'business', section: SettingsSection = 'account'): string {
  return `${scope === 'admin' ? '/admin' : '/dashboard'}/settings/${section}`
}

/** Hash on the Scene Viewer fallback URL: Chrome opens it when the native viewer could not start (ADR-0021). */
export const AR_FALLBACK_HASH = '#ar-unavailable'
/** The marker model-viewer puts on the page URL as its own Scene Viewer fallback (`features/ar.js`, noArViewerSigil). */
export const MODEL_VIEWER_FALLBACK_HASH = '#model-viewer-no-ar-fallback'

/**
 * Phone AR files are served from the site's own domain: vercel.json rewrites `/ar/*` to this public folder. Some
 * networks (several Indian ISPs, 2026) block supabase.co for apps such as Scene Viewer while the browser still gets
 * through, so the phone's viewer never has to reach Supabase. Keep in step with the `/ar/:path*` rewrite.
 * Not used by the product page since the AR audit (2026-10-26): through the rewrite Vercel compresses the file and drops
 * Content-Length, so the 3D view's progress froze and slow downloads timed out. `arLaunchUrl` uses the direct URL.
 */
export const AR_PROXY_SOURCE = 'https://zggylkbgajamhriebdrg.supabase.co/storage/v1/object/public/ar-models/'
export const AR_PROXY_PATH = '/ar/'

/** The same-domain address of a public AR copy; any other URL (or a build without the rewrite) is returned as is. */
export function arProxyUrl(url: string, enabled: boolean = import.meta.env.PROD): string {
  return enabled && url.startsWith(AR_PROXY_SOURCE) ? `${AR_PROXY_PATH}${url.slice(AR_PROXY_SOURCE.length)}` : url
}
/** Android app that hosts Scene Viewer: the Google app, as model-viewer used on main (proven on the owner's phone). */
export const SCENE_VIEWER_PACKAGE = 'com.google.android.googlequicksearchbox'

/**
 * Android's native AR: the Google Scene Viewer intent (ADR-0021). The model URL goes in once, whole and encoded, so a
 * signed URL keeps its single token (model-viewer's own intent also copied the token out as a parameter: AR-12).
 * `trueToSize` (scale verified) locks the size; otherwise the visitor may resize the piece.
 */
export function sceneViewerIntentUrl({ file, title, pageUrl, trueToSize }: { file: string; title: string; pageUrl: string; trueToSize: boolean }): string {
  const model = new URL(file, pageUrl).toString()
  const fallback = new URL(pageUrl)
  fallback.hash = AR_FALLBACK_HASH
  const query = `file=${encodeURIComponent(model)}&mode=ar_preferred&title=${encodeURIComponent(title)}${trueToSize ? '&resizable=false' : ''}`
  return `intent://arvr.google.com/scene-viewer/1.2?${query}#Intent;scheme=https;package=${SCENE_VIEWER_PACKAGE};action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(fallback.toString())};end;`
}

/** iPhone/iPad native AR: the AR Quick Look link for an uploaded USDZ. `trueToSize` turns off pinch scaling. */
export function quickLookHref(usdz: string, { trueToSize, pageUrl }: { trueToSize: boolean; pageUrl: string }): string {
  const url = new URL(usdz, pageUrl)
  if (trueToSize) url.hash = url.hash ? `${url.hash.slice(1)}&allowsContentScaling=0` : 'allowsContentScaling=0'
  return url.toString()
}

import { Box, Eye, PauseCircle, SearchX, Store } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { SearchInput } from '@/components/ui/SearchInput'
import { SmartImage } from '@/components/ui/SmartImage'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { CATEGORIES, type Category, type Product } from '@/domain/types'
import { LocalizedSpan, useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { service } from '@/services'
import { MEDIA_URL_TTL_SECONDS } from '@/services/catalogService'
import { useRefreshWhenStale, useServiceQuery } from '@/services/hooks'
import { initialPrice, primaryImage } from '@/lib/product'
import { catalogLocalPath, productLocalPath, tenantCatalogPath, tenantProductPath } from '@/lib/urls'
import { hasAny3d } from '@/features/ar/variantMedia'
import { BusinessContactPanel } from './BusinessContactPanel'
import { CatalogArBand } from './CatalogArBand'
import { CatalogHero } from './CatalogHero'
import { PublicMessage } from './PublicMessage'
import { PublicShell } from './PublicShell'
import { TAP_TARGET } from './tapTarget'

/** Signed media URLs last MEDIA_URL_TTL_SECONDS; refetch on return to the tab once half of that has passed. */
const MEDIA_REFRESH_MS = (MEDIA_URL_TTL_SECONDS * 1000) / 2

/** The obsidian pill of the public pages (primary action of the empty and no-results states). */
const PILL_PRIMARY =
  'inline-flex h-11 items-center justify-center rounded-full bg-ink px-6 text-[15px] font-medium text-canvas motion-safe:transition-transform motion-safe:duration-200 hover:opacity-90 active:scale-[0.97]'

/** Grid of the catalogue: 2 columns on phones and tablets, 3 on desktop; cards keep their own height (the tall one). */
const GRID = 'grid grid-cols-2 items-start gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-14 lg:grid-cols-3 lg:gap-y-16'

/** The AR band sits after this many cards (or after all of them when there are fewer). */
const CARDS_BEFORE_BAND = 6
/** On desktop the middle card of the second row is tall (v2 rhythm). */
const TALL_INDEX = 4

export default function CatalogPage({ tenantSlug }: { tenantSlug?: string }) {
  const params = useParams()
  const slug = tenantSlug ?? params.businessSlug ?? ''
  const { t, lang, localized } = useI18n()
  const [search, setSearch] = useSearchParams()
  const q = search.get('q') ?? ''
  const cat = (CATEGORIES as readonly string[]).includes(search.get('category') ?? '') ? (search.get('category') as Category) : ''
  const only3d = search.get('3d') === '1'
  const gridRef = useRef<HTMLElement>(null)

  const { user } = useAccount()

  const business = useServiceQuery(() => service.getBusinessBySlug(slug), [slug])
  const b = business.data
  // Owner preview of a catalogue that is not active yet (DUX-02): only with ?preview=1 AND a signed-in owner of
  // this business or a platform admin. A UX rule, not security: in Supabase mode RLS only returns a non-active
  // business and its products to its members and platform admins; anonymous visitors get "not found".
  const wantsPreview = search.get('preview') === '1'
  // While the account loads, a preview request waits instead of flashing "catalog unavailable" (as COR-09).
  const accountPending = wantsPreview && user === undefined
  const isPreview = !!b && b.status !== 'active' && wantsPreview && !!user && (user.role === 'super_admin' || user.businessId === b.id)
  const showCatalog = !!b && (b.status === 'active' || isPreview)
  // Until there is a business to show the query stays pending: a placeholder [] would read as "No products yet"
  // (and "0 products") for the first frame after the business arrives (COR-37).
  const products = useServiceQuery(
    () => (b && showCatalog ? service.getProducts({ businessId: b.id, status: 'published' }) : new Promise<never>(() => {})),
    [b?.id, showCatalog],
  )
  // Pages left open must not show product photos whose signed URLs have expired.
  useRefreshWhenStale(products.refetch, MEDIA_REFRESH_MS, products.data)

  useEffect(() => {
    if (b) document.title = b.name
  }, [b])

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(search)
    if (v) next.set(k, v)
    else next.delete(k)
    setSearch(next, { replace: true })
  }

  const all = useMemo(() => [...(products.data ?? [])].sort((a, b2) => localized(a.name).localeCompare(localized(b2.name), lang)), [products.data, lang, localized])
  const categories = useMemo(() => CATEGORIES.filter((c) => all.some((p) => p.category === c)), [all])
  const with3d = useMemo(() => all.filter((p) => hasAny3d(p)), [all])
  // The piece the hero and the AR band show: the first with 3D, else the first.
  const featured = with3d[0] ?? all[0]
  // A "3D & AR" chip only helps when it narrows the list.
  const show3dChip = with3d.length > 0 && with3d.length < all.length
  const term = q.trim().toLowerCase()
  const visible = all.filter(
    (p) => (!cat || p.category === cat) && (!only3d || hasAny3d(p)) && (!term || localized(p.name).toLowerCase().includes(term) || p.name.en.toLowerCase().includes(term)),
  )

  const productHref = (p: Product) => (tenantSlug ? tenantProductPath(p, { preview: isPreview }) : productLocalPath({ slug }, p, { preview: isPreview }))
  const catalogHref = tenantSlug ? tenantCatalogPath({ preview: isPreview }) : catalogLocalPath({ slug }, { preview: isPreview })
  // Clearing the search and category keeps the preview flag.
  const clearFilters = () => setSearch(isPreview ? { preview: '1' } : {}, { replace: true })
  // "Browse pieces in 3D": narrow the grid to the pieces with 3D (when that narrows it) and bring the grid into view.
  const browse3d = () => {
    if (show3dChip && !only3d) {
      const next = new URLSearchParams(search)
      next.set('3d', '1')
      next.delete('category')
      next.delete('q')
      setSearch(next, { replace: true })
    }
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    gridRef.current?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  if ((business.status === 'loading' && !b) || (b && b.status !== 'active' && accountPending))
    return (
      <PublicShell>
        <FullPageSpinner label={t('common.loading')} />
      </PublicShell>
    )

  if (!b) {
    const notFound = business.status === 'error' && business.error.code === 'NOT_FOUND'
    return (
      <PublicShell>
        {notFound ? (
          <PublicMessage
            icon={Store}
            title={t('catalog.notFoundTitle')}
            body={t('catalog.notFoundBody')}
            action={
              // On a business subdomain "/" is this missing catalogue, so the way out is only offered on the platform domain.
              tenantSlug ? undefined : (
                <Link to="/" className={PILL_PRIMARY}>
                  {t('catalog.goHome')}
                </Link>
              )
            }
          />
        ) : (
          <ErrorState message={t('common.errorTitle')} onRetry={business.refetch} retryLabel={t('common.retry')} className="py-24" />
        )}
      </PublicShell>
    )
  }

  if (!showCatalog) {
    return (
      <PublicShell business={b} catalogHref={catalogHref}>
        <PublicMessage icon={PauseCircle} title={t('catalog.inactiveTitle')} body={t('catalog.inactiveBody')} />
      </PublicShell>
    )
  }

  const loaded = products.status === 'success'
  const chip = (active: boolean) =>
    cn(
      TAP_TARGET,
      'inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-[15px] leading-none font-medium motion-safe:transition-transform motion-safe:duration-150 active:scale-[0.96] sm:h-10',
      active ? 'bg-ink text-canvas' : 'bg-subtle text-ink-body hover:text-ink',
    )
  const chipCount = (n: number, active: boolean) => (
    // The count repeats what the grid shows; the button's name stays the category (e2e and screen readers).
    <span aria-hidden className={cn('tabular-nums', active ? 'text-canvas/70' : 'text-ink-muted')}>
      {n}
    </span>
  )
  const firstCards = visible.slice(0, CARDS_BEFORE_BAND)
  const restCards = visible.slice(CARDS_BEFORE_BAND)
  // The tall card only in a full row rhythm: at least two rows on desktop.
  const tall = firstCards.length >= CARDS_BEFORE_BAND

  return (
    <PublicShell business={b} catalogHref={catalogHref} nameInHero>
      {isPreview && (
        <div className="bg-warning-soft" role="status">
          <p className="mx-auto flex max-w-[1320px] items-center gap-2 px-5 py-2.5 text-[14px] font-medium text-warning sm:px-10">
            <Eye className="size-4 shrink-0" aria-hidden />
            {t('catalog.previewBanner')}
          </p>
        </div>
      )}
      <CatalogHero
        business={b}
        loading={products.status === 'loading' && !products.data}
        counts={loaded ? { pieces: all.length, with3d: with3d.length } : undefined}
        featured={loaded ? featured : undefined}
        featuredHref={featured ? productHref(featured) : undefined}
      />

      {/* Filters: category pills with real counts and a pill search. Phones: search first, chips scroll sideways. */}
      <div className="bg-canvas lg:sticky lg:top-16 lg:z-20">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-4 px-5 py-3 sm:flex-row sm:items-center sm:gap-8 sm:px-10">
          <SearchInput
            value={q}
            onChange={(v) => setParam('q', v)}
            label={t('catalog.searchLabel')}
            placeholder={t('catalog.searchPlaceholder')}
            className="sm:order-last sm:ml-auto sm:w-80 sm:shrink-0 [&_input]:h-12 [&_input]:rounded-full [&_input]:border-0 [&_input]:bg-subtle [&_input]:pl-11 [&_input]:text-[15px] [&_input]:text-ink sm:[&_input]:h-11 [&>svg]:left-4"
          />
          {(categories.length > 1 || show3dChip) && (
            <div
              role="group"
              aria-label={t('catalog.categories')}
              className="-mx-5 -my-1 flex min-w-0 gap-2.5 overflow-x-auto px-5 py-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {(['', ...(categories.length > 1 ? categories : [])] as const).map((c) => {
                // "All" clears the category and the 3D filter; a category combines with the 3D filter.
                const active = c ? cat === c : !cat && !only3d
                const pick = () => {
                  const next = new URLSearchParams(search)
                  if (c) next.set('category', c)
                  else {
                    next.delete('category')
                    next.delete('3d')
                  }
                  setSearch(next, { replace: true })
                }
                return (
                  <button key={c || 'all'} type="button" aria-pressed={active} onClick={pick} className={chip(active)}>
                    {c ? t(`category.${c}`) : t('catalog.allCategories')}
                    {chipCount(c ? all.filter((p) => p.category === c).length : all.length, active)}
                  </button>
                )
              })}
              {show3dChip && (
                <button type="button" aria-pressed={only3d} onClick={() => setParam('3d', only3d ? '' : '1')} className={chip(only3d)}>
                  <Box className="size-4" strokeWidth={1.5} aria-hidden />
                  {t('catalog.only3d')}
                  {chipCount(with3d.length, only3d)}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <section ref={gridRef} className="mx-auto max-w-[1320px] scroll-mt-20 px-5 pt-6 pb-10 sm:px-10 sm:pt-10 sm:pb-16 lg:scroll-mt-36" aria-live="polite">
        {products.status === 'loading' && !products.data ? (
          <CardSkeletons label={t('common.loading')} />
        ) : products.status === 'error' && !products.data ? (
          <ErrorState message={t('common.errorTitle')} onRetry={products.refetch} retryLabel={t('common.retry')} className="py-24" />
        ) : all.length === 0 ? (
          <PublicMessage icon={Box} title={t('catalog.emptyTitle')} body={t('catalog.emptyBody')} />
        ) : visible.length === 0 ? (
          <PublicMessage
            icon={SearchX}
            title={t('catalog.noResultsTitle')}
            body={t('catalog.noResultsBody')}
            action={
              <button type="button" onClick={clearFilters} className={PILL_PRIMARY}>
                {t('catalog.clearFilters')}
              </button>
            }
          />
        ) : (
          <>
            <ul className={GRID}>
              {firstCards.map((p, i) => (
                <li key={p.id} className="min-w-0">
                  <ProductCard product={p} href={productHref(p)} tall={tall && i === TALL_INDEX} />
                </li>
              ))}
            </ul>
            {with3d[0] && <CatalogArBand featured={with3d[0]} onBrowse3d={browse3d} />}
            {restCards.length > 0 && (
              <ul className={GRID}>
                {restCards.map((p) => (
                  <li key={p.id} className="min-w-0">
                    <ProductCard product={p} href={productHref(p)} tall={false} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <BusinessContactPanel business={b} />
    </PublicShell>
  )
}

/** "W 80 × D 85 × H 75 cm" in the product's own unit, or '' when a measure is missing. */
function useSizeLine(p: Product) {
  const { t } = useI18n()
  const { width: w, height: h, depth: d, unit } = p.dimensions
  if (!(w > 0 && h > 0 && d > 0)) return ''
  const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
  return t('product.dimsLine', { w: n(w), d: n(d), h: n(h), unit })
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** Up to three finish swatches from the variants: their colour, else their first photo as a tiny round thumbnail. */
type Swatch = { id: string; color?: string; image?: string }
function finishSwatches(p: Product): Swatch[] {
  const out: Swatch[] = []
  for (const v of p.variants) {
    const image = v.images?.find((i) => i.url)?.url
    if (v.colorHex && HEX.test(v.colorHex)) out.push({ id: v.id, color: v.colorHex })
    else if (image) out.push({ id: v.id, image })
  }
  return out
}

/**
 * A catalogue card (Stitch v1 style, v2 extras): a soft-cornered photo on a tone step with a "3D & AR" pill, then the
 * serif name, a price · size line and the finish dots. `tall` makes the photo taller on desktop (grid rhythm).
 */
function ProductCard({ product: p, href, tall }: { product: Product; href: string; tall: boolean }) {
  const { t, lang, localized } = useI18n()
  const size = useSizeLine(p)
  const swatches = finishSwatches(p)
  return (
    <Link to={href} className="group block rounded-soft-sm focus-visible:outline-offset-4 sm:rounded-soft">
      <div className="relative overflow-hidden rounded-soft-sm bg-subtle sm:rounded-soft">
        <SmartImage
          src={primaryImage(p)?.url}
          alt={localized(p.name)}
          className={cn(
            'aspect-[4/5] w-full motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-[1.03]',
            tall && 'lg:aspect-[2/3]',
          )}
        />
        {hasAny3d(p) && (
          <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-[12px] leading-4 font-medium text-ink sm:top-4 sm:right-4 sm:px-3 sm:text-[13px]">
            <Box className="size-3.5" strokeWidth={1.5} aria-hidden />
            {t('catalog.has3d')}
          </span>
        )}
      </div>
      <div className="mt-3 sm:mt-4">
        <LocalizedSpan as="h2" text={p.name} className="font-display text-piece-card font-normal break-words text-ink" />
        <p className="mt-1 text-[14px] leading-5 text-ink-body tabular-nums sm:text-[15px]">
          <span className="font-medium text-ink">{formatMoney(initialPrice(p), p.currency, lang)}</span>
          {size && (
            <>
              <span className="px-2 text-ink-faint max-sm:hidden" aria-hidden>
                ·
              </span>
              <span className="max-sm:mt-0.5 max-sm:block">{size}</span>
            </>
          )}
        </p>
        {swatches.length > 0 && (
          <p className="mt-2.5 flex items-center gap-2 text-[13px] leading-4 text-ink-body">
            <span aria-hidden className="flex gap-1">
              {swatches.slice(0, 3).map((s) =>
                s.color ? (
                  <span key={s.id} className="size-3 rounded-full" style={{ backgroundColor: s.color }} />
                ) : (
                  <img key={s.id} src={s.image} alt="" loading="lazy" className="size-3 rounded-full object-cover" />
                ),
              )}
            </span>
            {p.variants.length === 1 ? t('catalog.finishesOne') : t('catalog.finishes', { count: p.variants.length })}
          </p>
        )}
      </div>
    </Link>
  )
}

/** Loading placeholders shaped like the cards. */
function CardSkeletons({ label }: { label: string }) {
  return (
    <div className={GRID} role="status" aria-label={label}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[4/5] w-full rounded-soft-sm sm:rounded-soft" />
          <Skeleton className="mt-4 h-6 w-2/3" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}

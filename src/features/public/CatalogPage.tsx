import { Box, Eye, PauseCircle, SearchX, Store } from 'lucide-react'
import { useEffect, useMemo } from 'react'
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
import { PublicMessage } from './PublicMessage'
import { PublicShell } from './PublicShell'
import { TAP_TARGET } from './tapTarget'

/** Signed media URLs last MEDIA_URL_TTL_SECONDS; refetch on return to the tab once half of that has passed. */
const MEDIA_REFRESH_MS = (MEDIA_URL_TTL_SECONDS * 1000) / 2

/** The obsidian pill of the public pages (primary action of the empty and no-results states). */
const PILL_PRIMARY =
  'inline-flex h-11 items-center justify-center rounded-full bg-ink px-6 text-[15px] font-medium text-canvas motion-safe:transition-transform motion-safe:duration-200 hover:opacity-90 active:scale-[0.97]'

/** Grid of the catalogue: 2 columns on phones and tablets, 3 on desktop. A container, so the featured card can size its photo to the row. */
const GRID = '@container grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-14 lg:grid-cols-3 lg:gap-y-16'

export default function CatalogPage({ tenantSlug }: { tenantSlug?: string }) {
  const params = useParams()
  const slug = tenantSlug ?? params.businessSlug ?? ''
  const { t, lang, localized } = useI18n()
  const [search, setSearch] = useSearchParams()
  const q = search.get('q') ?? ''
  const cat = (CATEGORIES as readonly string[]).includes(search.get('category') ?? '') ? (search.get('category') as Category) : ''

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
  const term = q.trim().toLowerCase()
  const visible = all.filter((p) => (!cat || p.category === cat) && (!term || localized(p.name).toLowerCase().includes(term) || p.name.en.toLowerCase().includes(term)))
  // The first piece leads the grid (Stitch): only on the full, unfiltered list of at least 3.
  const featureFirst = visible.length >= 3 && !term && !cat

  const productHref = (p: Product) => (tenantSlug ? tenantProductPath(p, { preview: isPreview }) : productLocalPath({ slug }, p, { preview: isPreview }))
  const catalogHref = tenantSlug ? tenantCatalogPath({ preview: isPreview }) : catalogLocalPath({ slug }, { preview: isPreview })
  // Clearing the search and category keeps the preview flag.
  const clearFilters = () => setSearch(isPreview ? { preview: '1' } : {}, { replace: true })

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
      {/* Hero (Stitch): the business name as a monument, its description in full ink, the count at the far right. */}
      <section className="mx-auto max-w-[1320px] px-5 pt-6 pb-8 sm:px-10 sm:pt-14 sm:pb-12">
        <h1 className="font-display text-monument font-normal break-words text-ink">{b.name}</h1>
        <div className="mt-5 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-end sm:justify-between sm:gap-12">
          {b.description && <p className="max-w-2xl text-body-public text-ink sm:text-[19px] sm:leading-[1.6]">{b.description}</p>}
          {/* Only a loaded list has a count: "0 products" while loading or after a failure reads as an empty catalogue. */}
          {products.status === 'success' && (
            <p className="shrink-0 text-[16px] leading-6 text-accent-ink tabular-nums sm:ml-auto sm:text-[17px]">{all.length === 1 ? t('catalog.countOne') : t('catalog.count', { count: all.length })}</p>
          )}
        </div>
      </section>

      {/* Filters: category pills and a pill search. Phones: search first, chips scroll sideways. */}
      <div className="bg-canvas lg:sticky lg:top-16 lg:z-20">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-4 px-5 py-3 sm:flex-row sm:items-center sm:gap-8 sm:px-10">
          <SearchInput
            value={q}
            onChange={(v) => setParam('q', v)}
            label={t('catalog.searchLabel')}
            placeholder={t('catalog.searchPlaceholder')}
            className="sm:order-last sm:ml-auto sm:w-80 sm:shrink-0 [&_input]:h-12 [&_input]:rounded-full [&_input]:border-0 [&_input]:bg-subtle [&_input]:pl-11 [&_input]:text-[15px] [&_input]:text-ink sm:[&_input]:h-11 [&>svg]:left-4"
          />
          {categories.length > 1 && (
            <div
              role="group"
              aria-label={t('catalog.categories')}
              className="-mx-5 -my-1 flex min-w-0 gap-2.5 overflow-x-auto px-5 py-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {(['', ...categories] as const).map((c) => (
                <button
                  key={c || 'all'}
                  type="button"
                  aria-pressed={cat === c}
                  onClick={() => setParam('category', c)}
                  className={cn(
                    TAP_TARGET,
                    'h-11 shrink-0 rounded-full px-5 text-[15px] leading-none font-medium motion-safe:transition-transform motion-safe:duration-150 active:scale-[0.96] sm:h-10',
                    cat === c ? 'bg-ink text-canvas' : 'bg-subtle text-ink-body hover:text-ink',
                  )}
                >
                  {c ? t(`category.${c}`) : t('catalog.allCategories')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="mx-auto max-w-[1320px] px-5 pt-6 pb-10 sm:px-10 sm:pt-10 sm:pb-16" aria-live="polite">
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
          <ul className={GRID}>
            {visible.map((p, i) => {
              const featured = featureFirst && i === 0
              return (
                <li key={p.id} className={cn('min-w-0', featured && 'col-span-2')}>
                  <ProductCard product={p} href={productHref(p)} featured={featured} />
                </li>
              )
            })}
          </ul>
        )}
      </section>
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

/**
 * A catalogue card (Stitch): a soft-cornered photo on a tone step with a "3D" pill, then the serif name and a
 * price · size line, no box. The featured card spans two columns and matches its row's photo height on desktop.
 */
function ProductCard({ product: p, href, featured }: { product: Product; href: string; featured: boolean }) {
  const { t, lang, localized } = useI18n()
  const size = useSizeLine(p)
  return (
    <Link to={href} className="group block rounded-soft-sm focus-visible:outline-offset-4 sm:rounded-soft">
      <div className="relative overflow-hidden rounded-soft-sm bg-subtle sm:rounded-soft">
        <SmartImage
          src={primaryImage(p)?.url}
          alt={localized(p.name)}
          className={cn(
            'w-full motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-[1.03]',
            // Featured: landscape on its own row; beside two columns on desktop it takes their 4:5 photo height.
            featured ? 'aspect-[4/3] lg:aspect-auto lg:h-[calc((100cqw-3rem)/3*1.25)]' : 'aspect-[4/5]',
          )}
        />
        {hasAny3d(p) && (
          <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-[12px] leading-4 font-medium text-ink sm:top-4 sm:right-4 sm:px-3 sm:text-[13px]">
            <Box className="size-3.5" strokeWidth={1.5} aria-hidden />
            {t('catalog.has3d')}
          </span>
        )}
      </div>
      <div className={cn('mt-3 sm:mt-4', featured && 'sm:flex sm:items-baseline sm:justify-between sm:gap-6')}>
        <LocalizedSpan as="h2" text={p.name} className="font-display text-piece-card font-normal break-words text-ink" />
        <p className={cn('mt-1 text-[14px] leading-5 text-ink-body tabular-nums sm:text-[15px]', featured && 'sm:mt-0 sm:shrink-0')}>
          <span className="font-medium text-ink">{formatMoney(initialPrice(p), p.currency, lang)}</span>
          {size && (
            <>
              <span className={cn('px-2 text-ink-faint', !featured && 'max-sm:hidden')} aria-hidden>
                ·
              </span>
              <span className={cn(!featured && 'max-sm:mt-0.5 max-sm:block')}>{size}</span>
            </>
          )}
        </p>
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

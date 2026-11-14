import { Box, Eye, PauseCircle, SearchX, Store } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { Button, ButtonLink } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { SmartImage } from '@/components/ui/SmartImage'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState, InlineNotice } from '@/components/ui/States'
import type { Product } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { service } from '@/services'
import { MEDIA_URL_TTL_SECONDS } from '@/services/catalogService'
import { useRefreshWhenStale, useServiceQuery } from '@/services/hooks'
import { useCategories, useCategoryLabel } from '@/services/listsHooks'
import { productLocalPath, tenantProductPath } from '@/lib/urls'
import { useSiteContent } from '../marketing/SiteContentProvider'
import { CATALOG_PHOTO_POSITION, chooseCatalogBanner } from './catalogBanner'
import { PublicMessage } from './PublicMessage'
import { ProductCard } from './ProductCard'
import { PublicShell } from './PublicShell'
import { TAP_TARGET } from './tapTarget'

/** Signed media URLs last MEDIA_URL_TTL_SECONDS; refetch on return to the tab once half of that has passed. */
const MEDIA_REFRESH_MS = (MEDIA_URL_TTL_SECONDS * 1000) / 2

export default function CatalogPage({ tenantSlug }: { tenantSlug?: string }) {
  const params = useParams()
  const slug = tenantSlug ?? params.businessSlug ?? ''
  const { t, lang, localized } = useI18n()
  const [search, setSearch] = useSearchParams()
  const q = search.get('q') ?? ''
  const catParam = search.get('category') ?? ''
  const categoryList = useCategories()
  const categoryLabel = useCategoryLabel()

  const { user } = useAccount()
  const site = useSiteContent()

  const business = useServiceQuery(() => service.getBusinessBySlug(slug), [slug])
  // The platform's own showcase (ADR-0047) is never a catalogue: its pieces open under /showcase/.
  const isHouse = !!business.data?.house
  const b = isHouse ? undefined : business.data
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
  // The filter chips are the visible categories (managed in the admin console, ADR-0055) that this catalogue has products in.
  const categories = useMemo(() => categoryList.active.map((c) => c.slug).filter((c) => all.some((p) => p.category === c)), [all, categoryList.active])
  // A category in the address that no chip offers (removed, hidden, mistyped) is ignored, as before.
  const cat = categories.includes(catParam) ? catParam : ''
  const term = q.trim().toLowerCase()
  const visible = all.filter((p) => (!cat || p.category === cat) && (!term || localized(p.name).toLowerCase().includes(term) || p.name.en.toLowerCase().includes(term)))

  const productHref = (p: Product) => (tenantSlug ? tenantProductPath(p, { preview: isPreview }) : productLocalPath({ slug }, p, { preview: isPreview }))
  // Clearing the search and category keeps the preview flag.
  const clearFilters = () => setSearch(isPreview ? { preview: '1' } : {}, { replace: true })

  if ((business.status === 'loading' && !b) || (b && b.status !== 'active' && accountPending))
    return (
      <PublicShell>
        <FullPageSpinner label={t('common.loading')} />
      </PublicShell>
    )

  if (!b) {
    const notFound = isHouse || (business.status === 'error' && business.error.code === 'NOT_FOUND')
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
                <ButtonLink to="/" variant="primary">
                  {t('catalog.goHome')}
                </ButtonLink>
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
      <PublicShell business={b}>
        <PublicMessage icon={PauseCircle} title={t('catalog.inactiveTitle')} body={t('catalog.inactiveBody')} />
      </PublicShell>
    )
  }

  // The picture: the company's own banner, else the platform's default banner, else the built-in photograph (ADR-0065).
  const banner = chooseCatalogBanner(b, { loading: site.loading, defaultBanner: site.chrome?.catalogBanner })

  return (
    <PublicShell business={b}>
      {isPreview && (
        <div className="border-b border-warning/30 bg-warning-soft" role="status">
          <p className="mx-auto flex max-w-[1320px] items-center gap-2 px-5 py-2.5 text-[13px] font-medium text-warning sm:px-10">
            <Eye className="size-4 shrink-0" aria-hidden />
            {t('catalog.previewBanner')}
          </p>
        </div>
      )}
      {/* Catalogue top (ADR-0062), in the landing hero's and sign-in panel's style: a picture under a dark veil with the company's
          logo, the eyebrow, its name (the only place the name is written on this page) and the piece count in white. The picture is the
          company's own banner, else the platform's default, else a Sanctus photograph (ADR-0065); the veil keeps the text readable on
          any of them. The company description is internal (ADR-0054) and not shown. */}
      <section aria-labelledby="catalog-title" className="relative isolate flex min-h-[19rem] flex-col justify-end overflow-hidden bg-obsidian text-chalk sm:min-h-[24rem] lg:min-h-[30rem]">
        {banner && <img src={banner.src} alt="" width={1200} height={896} fetchPriority="high" data-banner={banner.source} className={cn('absolute inset-0 -z-10 size-full object-cover', banner.source === 'builtin' ? CATALOG_PHOTO_POSITION : 'object-center')} />}
        <div className="absolute inset-0 -z-10 bg-obsidian/45" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-[80%] bg-linear-to-t from-obsidian/85 via-obsidian/40 to-transparent" aria-hidden />
        <div className="mx-auto w-full max-w-[1320px] px-5 pt-16 pb-9 sm:px-10 sm:pb-12 lg:pb-16">
          {b.logoUrl && (
            <span className="mb-6 inline-flex size-14 items-center justify-center rounded-[var(--radius-control)] bg-chalk p-2 sm:size-16">
              <SmartImage src={b.logoUrl} alt="" className="size-full object-contain" />
            </span>
          )}
          <p className="flex items-center gap-4 text-[12px] leading-[1.4] font-medium tracking-[0.08em] text-chalk/85 uppercase">
            <span className="h-px w-8 bg-chalk/50" aria-hidden />
            {t('catalog.eyebrow')}
          </p>
          <h1 id="catalog-title" className="mt-4 max-w-3xl font-display text-[clamp(2.25rem,1.6rem+2.8vw,4rem)] leading-[1.06] font-light break-words text-chalk">
            {b.name}
          </h1>
          {/* Only a loaded list has a count: "0 products" while loading or after a failure reads as an empty catalogue. */}
          {products.status === 'success' && <p className="mt-5 text-[12px] leading-[1.2] font-medium tracking-[0.08em] text-chalk/85 uppercase tabular-nums">{all.length === 1 ? t('catalog.countOne') : t('catalog.count', { count: all.length })}</p>}
        </div>
      </section>

      <div className="mx-auto max-w-[1320px] px-5 pt-12 pb-6 sm:px-10 sm:pt-16 sm:pb-8">
        {/* The Website Editor's heading in this language, else the built-in one (ADR-0067); kept invisible while the site content
            loads so the built-in wording does not flash. */}
        <h2 className={cn('text-headline [overflow-wrap:anywhere]', site.loading && 'invisible')}>{site.chrome?.catalogHeading?.[lang]?.trim() || t('catalog.heading')}</h2>
      </div>

      {/* Solid filter bar (no blur), hairline top and bottom. */}
      {/* Pinned under the header from tablet width up; on a phone the two stacked rows would cover a third of the screen. */}
      <div className="z-20 border-y border-line bg-canvas sm:sticky sm:top-20">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-3 px-5 py-3 sm:px-10 lg:flex-row lg:items-center lg:gap-8">
          {categories.length > 1 && (
            <div role="group" aria-label={t('catalog.categories')} className="-mx-5 -my-1 flex min-w-0 gap-2 overflow-x-auto px-5 py-1 sm:-mx-10 sm:px-10 lg:mx-0 lg:px-0">
              {(['', ...categories] as const).map((c) => (
                <button
                  key={c || 'all'}
                  type="button"
                  aria-pressed={cat === c}
                  onClick={() => setParam('category', c)}
                  className={cn(
                    TAP_TARGET,
                    'h-11 shrink-0 rounded-[var(--radius-control)] border px-4 text-[12px] sm:h-9 leading-[1.2] font-medium tracking-[0.08em] uppercase transition-colors',
                    cat === c ? 'border-obsidian bg-obsidian text-chalk' : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
                  )}
                >
                  {c ? categoryLabel(c) : t('catalog.allCategories')}
                </button>
              ))}
            </div>
          )}
          <SearchInput value={q} onChange={(v) => setParam('q', v)} label={t('catalog.searchLabel')} placeholder={t('catalog.searchPlaceholder')} className="sm:w-72 lg:ml-auto lg:shrink-0" />
        </div>
      </div>

      <section className="mx-auto max-w-[1320px] px-5 pt-8 pb-16 sm:px-10 sm:pt-10 sm:pb-24" aria-live="polite">
        {/* A refresh that failed while products are on screen keeps them, and says so without blocking (QA EF-13). */}
        {products.status === 'error' && products.data && (
          <InlineNotice tone="neutral" className="mb-6 items-center">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{t('catalog.refreshFailed')}</span>
              <Button size="sm" variant="ghost" className="underline underline-offset-2" onClick={products.refetch}>
                {t('common.retry')}
              </Button>
            </span>
          </InlineNotice>
        )}
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
            action={<Button onClick={clearFilters}>{t('catalog.clearFilters')}</Button>}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => (
              <li key={p.id} className="min-w-0">
                <ProductCard product={p} href={productHref(p)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PublicShell>
  )
}

/** Loading placeholders shaped like the cards. */
function CardSkeletons({ label }: { label: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4" role="status" aria-label={label}>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="rounded-[var(--radius-card)] border border-line bg-surface p-2.5 sm:p-4">
          <Skeleton className="aspect-[4/5] w-full" />
          <Skeleton className="mt-4 h-3 w-1/3" />
          <Skeleton className="mt-2 h-5 w-2/3" />
          <Skeleton className="mt-5 h-3.5 w-1/4" />
        </div>
      ))}
    </div>
  )
}

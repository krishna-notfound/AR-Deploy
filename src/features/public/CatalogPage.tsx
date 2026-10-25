import { ArrowRight, Box, Eye, PauseCircle, SearchX, Store } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { Button, ButtonLink } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { SmartImage } from '@/components/ui/SmartImage'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { CATEGORIES, type Category, type Product } from '@/domain/types'
import { LocalizedSpan, useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { initialPrice, primaryImage } from '@/lib/product'
import { catalogLocalPath, productLocalPath, tenantCatalogPath, tenantProductPath } from '@/lib/urls'
import { hasAny3d } from '@/features/ar/variantMedia'
import { PublicMessage } from './PublicMessage'
import { PublicShell } from './PublicShell'
import { TAP_TARGET } from './tapTarget'

export default function CatalogPage({ tenantSlug }: { tenantSlug?: string }) {
  const params = useParams()
  const slug = tenantSlug ?? params.businessSlug ?? ''
  const { t, localized } = useI18n()
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

  useEffect(() => {
    if (b) document.title = b.name
  }, [b])

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(search)
    if (v) next.set(k, v)
    else next.delete(k)
    setSearch(next, { replace: true })
  }

  const all = useMemo(() => [...(products.data ?? [])].sort((a, b2) => a.name.en.localeCompare(b2.name.en)), [products.data])
  const categories = useMemo(() => CATEGORIES.filter((c) => all.some((p) => p.category === c)), [all])
  const term = q.trim().toLowerCase()
  const visible = all.filter((p) => (!cat || p.category === cat) && (!term || localized(p.name).toLowerCase().includes(term) || p.name.en.toLowerCase().includes(term)))

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
      <PublicShell business={b} catalogHref={catalogHref}>
        <PublicMessage icon={PauseCircle} title={t('catalog.inactiveTitle')} body={t('catalog.inactiveBody')} />
      </PublicShell>
    )
  }

  return (
    <PublicShell business={b} catalogHref={catalogHref}>
      {isPreview && (
        <div className="border-b border-warning/30 bg-warning-soft" role="status">
          <p className="mx-auto flex max-w-[1320px] items-center gap-2 px-5 py-2.5 text-[13px] font-medium text-warning sm:px-10">
            <Eye className="size-4 shrink-0" aria-hidden />
            {t('catalog.previewBanner')}
          </p>
        </div>
      )}
      {/* Title block as the landing's section headers: eyebrow, serif name and count left, description right, hairline. */}
      <section className="mx-auto max-w-[1320px] px-5 pt-12 pb-10 sm:px-10 sm:pt-20 sm:pb-12">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-end lg:gap-16">
          <div className="flex min-w-0 items-start gap-5">
            {b.logoUrl && <SmartImage src={b.logoUrl} alt="" className="size-14 shrink-0 object-contain sm:size-16" />}
            <div className="min-w-0">
              <p className="text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-accent-ink">{t('catalog.eyebrow')}</p>
              <h1 className="mt-3 text-headline break-words">{b.name}</h1>
              {/* Only a loaded list has a count: "0 products" while loading or after a failure reads as an empty catalogue. */}
              {products.status === 'success' && (
                <p className="mt-4 text-[12px] leading-[1.2] font-medium tracking-[0.08em] uppercase text-ink-muted tabular-nums">{all.length === 1 ? t('catalog.countOne') : t('catalog.count', { count: all.length })}</p>
              )}
            </div>
          </div>
          {b.description && <p className="max-w-xl text-[15px] leading-7 text-ink-muted lg:justify-self-end">{b.description}</p>}
        </div>
      </section>

      {/* Solid filter bar (no blur), hairline top and bottom. */}
      <div className="sticky top-16 z-20 border-y border-line bg-canvas sm:top-20">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:gap-8 sm:px-10">
          {categories.length > 1 && (
            <div role="group" aria-label={t('catalog.categories')} className="-mx-5 -my-1 flex min-w-0 gap-2 overflow-x-auto px-5 py-1 sm:mx-0 sm:px-0">
              {(['', ...categories] as const).map((c) => (
                <button
                  key={c || 'all'}
                  type="button"
                  aria-pressed={cat === c}
                  onClick={() => setParam('category', c)}
                  className={cn(
                    TAP_TARGET,
                    'h-9 shrink-0 rounded-[2px] border px-4 text-[12px] leading-[1.2] font-medium tracking-[0.08em] uppercase transition-colors',
                    cat === c ? 'border-obsidian bg-obsidian text-chalk' : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
                  )}
                >
                  {c ? t(`category.${c}`) : t('catalog.allCategories')}
                </button>
              ))}
            </div>
          )}
          <SearchInput value={q} onChange={(v) => setParam('q', v)} label={t('catalog.searchLabel')} placeholder={t('catalog.searchPlaceholder')} className="sm:ml-auto sm:w-72 sm:shrink-0" />
        </div>
      </div>

      <section className="mx-auto max-w-[1320px] px-5 py-10 sm:px-10 sm:py-16" aria-live="polite">
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
          <ul className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
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

/** A catalogue card in the landing's collection-card style: hairline frame, photo with a category chip, serif name. */
function ProductCard({ product: p, href }: { product: Product; href: string }) {
  const { t, lang, localized } = useI18n()
  return (
    <Link to={href} className="group flex h-full flex-col border border-line bg-surface p-3 transition-colors hover:border-line-strong focus-visible:outline-offset-4 sm:p-4">
      <div className="relative overflow-hidden bg-subtle">
        <SmartImage src={primaryImage(p)?.url} alt={localized(p.name)} className="aspect-[4/5] w-full transition-transform duration-700 group-hover:scale-[1.02]" />
        <span className="absolute top-3 left-3 max-w-[calc(100%-1.5rem)] truncate bg-surface px-2 py-1 text-xs leading-4 font-medium tracking-[0.08em] text-ink uppercase">
          {t(`category.${p.category}`)}
        </span>
        {hasAny3d(p) && (
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 bg-surface px-2 py-1 text-xs leading-4 font-medium tracking-[0.08em] text-accent-ink uppercase">
            <Box className="size-3" strokeWidth={1.5} aria-hidden />
            {t('catalog.has3d')}
          </span>
        )}
      </div>
      <LocalizedSpan as="h2" text={p.name} className="mt-5 font-display text-[1.45rem] leading-snug font-normal text-ink" />
      <LocalizedSpan as="p" text={p.shortDescription} className="mt-1.5 mb-5 line-clamp-2 text-[13px] leading-5 text-ink-muted" />
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-[14px] tracking-[0.04em] text-ink tabular-nums">{formatMoney(initialPrice(p), p.currency, lang)}</span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[14px] leading-5 font-medium text-ink transition-colors group-hover:text-accent-ink">
          {t('catalog.viewPiece')}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} aria-hidden />
        </span>
      </div>
    </Link>
  )
}

/** Loading placeholders shaped like the cards. */
function CardSkeletons({ label }: { label: string }) {
  return (
    <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4" role="status" aria-label={label}>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="border border-line bg-surface p-3 sm:p-4">
          <Skeleton className="aspect-[4/5] w-full" />
          <Skeleton className="mt-5 h-5 w-2/3" />
          <Skeleton className="mt-2 h-3.5 w-1/2" />
          <Skeleton className="mt-6 h-3.5 w-1/4" />
        </div>
      ))}
    </div>
  )
}

import { Box, PauseCircle, SearchX, Store } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { SmartImage } from '@/components/ui/SmartImage'
import { SkeletonGrid } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { CATEGORIES, type Category, type Product } from '@/domain/types'
import { LocalizedSpan, useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { primaryImage } from '@/lib/product'
import { PublicMessage } from './PublicMessage'
import { PublicShell } from './PublicShell'

export default function CatalogPage({ tenantSlug }: { tenantSlug?: string }) {
  const params = useParams()
  const slug = tenantSlug ?? params.businessSlug ?? ''
  const { t, lang, localized } = useI18n()
  const [search, setSearch] = useSearchParams()
  const q = search.get('q') ?? ''
  const cat = (CATEGORIES as readonly string[]).includes(search.get('category') ?? '') ? (search.get('category') as Category) : ''

  const business = useServiceQuery(() => service.getBusinessBySlug(slug), [slug])
  const b = business.data
  const products = useServiceQuery(
    () => (b && b.status === 'active' ? service.getProducts({ businessId: b.id, status: 'published' }) : Promise.resolve({ ok: true as const, data: [] as Product[] })),
    [b?.id, b?.status],
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

  const productHref = (p: Product) => (tenantSlug ? `/products/${p.slug}` : `/products/${slug}/${p.slug}`)
  const catalogHref = tenantSlug ? '/' : `/catalog/${slug}`

  if (business.status === 'loading' && !b)
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
          <PublicMessage icon={Store} title={t('catalog.notFoundTitle')} body={t('catalog.notFoundBody')} />
        ) : (
          <ErrorState message={business.status === 'error' ? business.error.message : t('common.errorTitle')} onRetry={business.refetch} className="py-24" />
        )}
      </PublicShell>
    )
  }

  if (b.status !== 'active') {
    return (
      <PublicShell business={b} catalogHref={catalogHref}>
        <PublicMessage icon={PauseCircle} title={t('catalog.inactiveTitle')} body={t('catalog.inactiveBody')} />
      </PublicShell>
    )
  }

  return (
    <PublicShell business={b} catalogHref={catalogHref}>
      <section className="mx-auto max-w-[1240px] px-5 pt-12 pb-8 sm:px-8 sm:pt-16">
        <div className="flex items-center gap-4">
          <SmartImage src={b.logoUrl} alt="" className="size-14 shrink-0 rounded-[var(--radius-card)] object-contain sm:size-16" />
          <div className="min-w-0">
            <h1 className="text-headline font-light">{b.name}</h1>
            <p className="mt-1 text-sm text-ink-muted tabular-nums">{all.length === 1 ? t('catalog.countOne') : t('catalog.count', { count: all.length })}</p>
          </div>
        </div>
        {b.description && <p className="mt-6 max-w-2xl text-lead text-ink-muted">{b.description}</p>}
      </section>

      <div className="sticky top-16 z-20 border-y border-line bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:px-8">
          <SearchInput value={q} onChange={(v) => setParam('q', v)} label={t('catalog.searchLabel')} placeholder={t('catalog.searchPlaceholder')} className="sm:w-72" />
          {categories.length > 1 && (
            <div role="group" aria-label={t('catalog.categories')} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:px-0">
              {(['', ...categories] as const).map((c) => (
                <button
                  key={c || 'all'}
                  type="button"
                  aria-pressed={cat === c}
                  onClick={() => setParam('category', c)}
                  className={cn(
                    'h-8 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                    cat === c ? 'border-[var(--brand-accent)] bg-[var(--brand-accent)] text-white' : 'border-line-strong bg-surface text-ink-muted hover:text-ink',
                  )}
                >
                  {c ? t(`category.${c}`) : t('catalog.allCategories')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="mx-auto max-w-[1240px] px-5 py-10 sm:px-8 sm:py-14" aria-live="polite">
        {products.status === 'loading' && !products.data ? (
          <SkeletonGrid />
        ) : products.status === 'error' && !products.data ? (
          <ErrorState message={products.error.message} onRetry={products.refetch} />
        ) : all.length === 0 ? (
          <PublicMessage icon={Box} title={t('catalog.emptyTitle')} body={t('catalog.emptyBody')} />
        ) : visible.length === 0 ? (
          <PublicMessage
            icon={SearchX}
            title={t('catalog.noResultsTitle')}
            body={t('catalog.noResultsBody')}
            action={<Button onClick={() => setSearch({}, { replace: true })}>{t('catalog.clearFilters')}</Button>}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-12 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => (
              <li key={p.id}>
                <Link to={productHref(p)} className="group block rounded-[var(--radius-card)] focus-visible:outline-offset-4">
                  <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-subtle">
                    <SmartImage src={primaryImage(p)?.url} alt={localized(p.name)} className="aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-[1.02]" />
                    {p.models.glb && (
                      <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2.5 py-1 text-xs text-ink">
                        <Box className="size-3" aria-hidden />
                        {t('catalog.has3d')}
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-start justify-between gap-3">
                    <LocalizedSpan as="h2" text={p.name} className="text-[15px] leading-snug font-medium text-ink group-hover:underline group-hover:underline-offset-4" />
                    <span className="shrink-0 text-[15px] text-ink tabular-nums">{formatMoney(p.price, p.currency, lang)}</span>
                  </div>
                  <LocalizedSpan as="p" text={p.shortDescription} className="mt-1 line-clamp-2 text-[13px] leading-5 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PublicShell>
  )
}

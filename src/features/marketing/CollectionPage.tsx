import { ArrowLeft, Armchair } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { arrowLinkClasses, ButtonLink, Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import type { ProductRef } from '@/domain/siteContent'
import type { Business, Category, Product } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { errorText } from '@/i18n/errorText'
import { cn } from '@/lib/cn'
import { primaryImage } from '@/lib/product'
import { APPLY_PATH, productLocalPath } from '@/lib/urls'
import { service } from '@/services'
import { usePublishedCollection } from '@/services/contentHooks'
import { useServiceQuery } from '@/services/hooks'
import { PublicMessage } from '../public/PublicMessage'
import { TAP_TARGET } from '../public/tapTarget'
import { BUILTIN_COLLECTIONS } from './landingBuiltin'
import { landingImage } from './landingImages'
import PublicNotFoundPage from './PublicNotFoundPage'
import { useSiteContent } from './SiteContentProvider'
import { SiteFooter, SiteHeader } from './SiteChrome'

// A collection's own public page, /collections/:slug (owner decision 2026-11-03). The Owner/Admin curates which products it
// shows in the Website Editor; visitors never land in a business catalogue from here. Until the Editor has published any
// collection, the four built-in ones (sofas, tables, armchairs, decor) have a page too: the published pieces of that
// category, from every active business. A piece that is no longer published (or whose business is not active) is skipped.

const SECTION = 'mx-auto max-w-[1320px] px-5 sm:px-10'

interface View {
  title: string
  text?: string
  image: string
  focus?: string
  /** The curated pieces in order; undefined = every published piece of `category`. */
  refs?: ProductRef[]
  category?: Category
}

interface Piece {
  product: Product
  business: Business
}

export default function CollectionPage() {
  const { slug = '' } = useParams()
  const { t, localized } = useI18n()
  const { collection, loading, notFound } = usePublishedCollection(slug)
  const { chrome } = useSiteContent()
  const nothingPublished = !loading && (chrome?.landingCollections.length ?? 0) === 0

  const view: View | null = useMemo(() => {
    if (collection) {
      const img = landingImage(collection.image)
      return { title: localized(collection.title), text: collection.text ? localized(collection.text) || undefined : undefined, image: img?.src ?? '', focus: img?.focus, refs: collection.products }
    }
    const builtin = nothingPublished ? BUILTIN_COLLECTIONS.find((c) => c.key === slug) : undefined
    if (!builtin) return null
    const img = landingImage(builtin.image)
    return { title: t(`landing.col.${builtin.key}`), text: t(`landing.col.${builtin.key}Body`), image: img?.src ?? '', focus: img?.focus, category: builtin.category }
    // `localized` and `t` change with the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, nothingPublished, slug, t, localized])

  useDocumentTitle(view?.title)

  const products = useServiceQuery(() => service.getProducts({ status: 'published' }), [])
  const businesses = useServiceQuery(() => service.getBusinesses(), [])
  const pieces: Piece[] = useMemo(() => {
    if (!view) return []
    const active = new Map((businesses.data ?? []).filter((b) => b.status === 'active').map((b) => [b.id, b]))
    const live = (products.data ?? []).filter((p) => p.status === 'published' && active.has(p.businessId)).map((product) => ({ product, business: active.get(product.businessId)! }))
    if (view.refs) {
      const byKey = new Map(live.map((x) => [`${x.business.slug}/${x.product.slug}`, x]))
      return view.refs.flatMap((r) => byKey.get(`${r.businessSlug}/${r.productSlug}`) ?? [])
    }
    return live
      .filter((x) => x.product.category === view.category)
      .sort((a, b) => a.business.name.localeCompare(b.business.name) || a.product.name.en.localeCompare(b.product.name.en))
  }, [view, products.data, businesses.data])

  if (loading) return <Frame><Skeletons /></Frame>
  if (notFound && !view) return <PublicNotFoundPage />
  if (!view) return <PublicNotFoundPage />

  const dataLoading = products.status === 'loading' || businesses.status === 'loading'
  const failed = products.status === 'error' ? products : businesses.status === 'error' ? businesses : null

  return (
    <Frame>
      <main className="flex-1">
        <div className={cn(SECTION, 'pt-8 lg:pt-12')}>
          <Link to="/#colecoes" className={cn(arrowLinkClasses, TAP_TARGET, 'text-ink')}>
            <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
            {t('site.collection.all')}
          </Link>
          <header className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-end lg:gap-14">
            <div>
              <p className="text-eyebrow text-accent-ink">{t('site.collection.eyebrow')}</p>
              <h1 className="mt-4 text-display">{view.title}</h1>
              {view.text && <p className="mt-5 max-w-md text-[15px] leading-7 text-ink-muted">{view.text}</p>}
            </div>
            {view.image && <img src={view.image} alt="" width={1200} height={896} className={cn('aspect-[4/3] w-full bg-subtle object-cover', view.focus)} />}
          </header>
        </div>
        <div className={cn(SECTION, 'mt-10 lg:mt-14')}>
          <hr className="border-line" />
        </div>
        <div className={cn(SECTION, 'py-10 lg:py-14')}>
          {dataLoading ? (
            <Grid label={t('common.loading')} busy>
              {[0, 1, 2, 3].map((i) => (
                <li key={i}>
                  <Skeleton className="aspect-[4/5] w-full" />
                  <Skeleton className="mt-4 h-5 w-2/3" />
                  <Skeleton className="mt-2 h-4 w-1/3" />
                </li>
              ))}
            </Grid>
          ) : failed && failed.status === 'error' ? (
            <div role="alert" className="py-10 text-center">
              <p className="text-[15px] text-ink-muted">{t('site.collection.loadError')}</p>
              <p className="mt-1 text-[13px] text-ink-muted">{errorText(failed.error, t)}</p>
              <Button className="mt-4" onClick={() => { products.refetch(); businesses.refetch() }}>
                {t('common.retry')}
              </Button>
            </div>
          ) : pieces.length === 0 ? (
            <PublicMessage
              icon={Armchair}
              title={t('site.collection.emptyTitle')}
              body={t('site.collection.emptyBody')}
              action={
                <ButtonLink to={APPLY_PATH} variant="primary">
                  {t('site.apply')}
                </ButtonLink>
              }
            />
          ) : (
            <Grid label={t('site.collection.pieces', { name: view.title })}>
              {pieces.map(({ product, business }) => (
                <li key={product.id} className="flex">
                  <PieceCard product={product} business={business} />
                </li>
              ))}
            </Grid>
          )}
        </div>
      </main>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  )
}

function Skeletons() {
  const { t } = useI18n()
  return (
    <main className={cn(SECTION, 'flex-1 py-12')} aria-busy="true" aria-label={t('common.loading')}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-6 h-12 w-1/2" />
      <Skeleton className="mt-6 aspect-[4/3] w-full max-w-xl" />
    </main>
  )
}

function Grid({ label, busy, children }: { label: string; busy?: boolean; children: React.ReactNode }) {
  return (
    <ul aria-label={label} aria-busy={busy || undefined} className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
      {children}
    </ul>
  )
}

function PieceCard({ product, business }: Piece) {
  const { localized } = useI18n()
  const img = primaryImage(product)
  return (
    <Link
      to={productLocalPath(business, product)}
      className="group/card flex w-full flex-col border border-line bg-surface p-2.5 transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-line-strong hover:shadow-[var(--shadow-card)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-4"
    >
      {img ? (
        <img src={img.url} alt="" width={800} height={1000} loading="lazy" className="aspect-[4/5] w-full bg-subtle object-cover" />
      ) : (
        <div className="aspect-[4/5] w-full bg-subtle" aria-hidden />
      )}
      <h3 className="mt-4 font-display text-[1.25rem] leading-tight font-normal text-ink sm:text-[1.375rem]">{localized(product.name)}</h3>
      <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">{business.name}</p>
    </Link>
  )
}

import { ArrowLeft, Armchair } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { arrowLinkClasses, Button, ButtonLink } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import type { ProductRef } from '@/domain/siteContent'
import type { Category, Product } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { errorText } from '@/i18n/errorText'
import { cn } from '@/lib/cn'
import { initialPrice, primaryImage } from '@/lib/product'
import { useFormat } from '@/lib/useFormat'
import { APPLY_PATH, showcaseProductPath } from '@/lib/urls'
import { usePublishedCollection } from '@/services/contentHooks'
import { TAP_TARGET } from '../public/tapTarget'
import { BUILTIN_COLLECTIONS } from './landingBuiltin'
import { collectionImage, landingImage } from './landingImages'
import PublicNotFoundPage from './PublicNotFoundPage'
import { useSiteContent } from './SiteContentProvider'
import { SiteFooter, SiteHeader } from './SiteChrome'
import { hasGlb, useShowcasePieces } from './useShowcasePieces'

// A collection's own public page, /collections/:slug (owner decisions 2026-11-03, ADR-0047). It lists only the admin's own
// showcase pieces, each opening its showcase page; no business catalogue or product is ever reachable from here. The Owner/
// Admin curates the pieces in the Website Editor. Until the Editor has published any collection, the four built-in ones
// (sofas, tables, armchairs, decor) have a page too: the showcase pieces of that category.

const SECTION = 'mx-auto max-w-[1320px] px-5 sm:px-10'

interface View {
  title: string
  text?: string
  image: string
  focus?: string
  /** The curated pieces in order; undefined = every showcase piece of `category`. */
  refs?: ProductRef[]
  category?: Category
}

export default function CollectionPage() {
  const { slug = '' } = useParams()
  const { t, localized } = useI18n()
  const { collection, loading } = usePublishedCollection(slug)
  const { chrome } = useSiteContent()
  const nothingPublished = !loading && (chrome?.landingCollections.length ?? 0) === 0

  const view: View | null = useMemo(() => {
    if (collection) {
      const img = collectionImage(collection.image)
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

  const showcase = useShowcasePieces()
  const { ofRef, pieces: all } = showcase
  const pieces: Product[] = useMemo(() => {
    if (!view) return []
    // Refs to anything but the house business are skipped by `ofRef`; a piece that is gone or unpublished is skipped too.
    if (view.refs) return view.refs.flatMap((r) => ofRef(r) ?? [])
    return all.filter((p) => p.category === view.category)
  }, [view, ofRef, all])

  if (loading) return <Frame><Skeletons /></Frame>
  if (!view) return <PublicNotFoundPage />

  return (
    <Frame>
      <main className="flex-1">
        <div className={cn(SECTION, 'pt-8 lg:pt-12')}>
          <Link to="/#colecoes" className={cn(arrowLinkClasses, TAP_TARGET, 'text-ink')}>
            <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
            {t('site.collection.all')}
          </Link>
          <header className="mt-6 max-w-3xl lg:mt-10">
            <p className="text-eyebrow text-accent-ink">{t('site.collection.eyebrow')}</p>
            <h1 className="mt-4 text-display">{view.title}</h1>
            {view.text && <p className="mt-5 max-w-xl text-[15px] leading-7 text-ink-muted">{view.text}</p>}
          </header>
        </div>
        {view.image && (
          <div className={cn(SECTION, 'mt-10 lg:mt-14')}>
            <img src={view.image} alt="" width={1200} height={896} className={cn('aspect-[16/10] w-full bg-subtle object-cover sm:aspect-[21/9]', view.focus)} />
          </div>
        )}
        <div className={cn(SECTION, 'py-12 lg:py-16')}>
          {showcase.status === 'loading' ? (
            <Grid label={t('common.loading')} busy>
              {[0, 1, 2, 3].map((i) => (
                <li key={i}>
                  <Skeleton className="aspect-[4/5] w-full" />
                  <Skeleton className="mt-4 h-5 w-2/3" />
                  <Skeleton className="mt-2 h-4 w-1/3" />
                </li>
              ))}
            </Grid>
          ) : showcase.status === 'error' && showcase.error ? (
            <div role="alert" className="py-10 text-center">
              <p className="text-[15px] text-ink-muted">{t('site.collection.loadError')}</p>
              <p className="mt-1 text-[13px] text-ink-muted">{errorText(showcase.error, t)}</p>
              <Button className="mt-4" onClick={showcase.refetch}>
                {t('common.retry')}
              </Button>
            </div>
          ) : pieces.length === 0 ? (
            <div className="mx-auto flex max-w-md flex-col items-center py-12 text-center">
              <span className="grid size-12 place-items-center rounded-[var(--radius-control)] border border-line bg-surface">
                <Armchair className="size-5 text-ink-muted" strokeWidth={1.4} aria-hidden />
              </span>
              <h2 className="mt-6 text-title">{t('site.collection.emptyTitle')}</h2>
              <p className="mt-3 text-[14px] leading-6 text-ink-muted">{t('collection.emptyBody')}</p>
            </div>
          ) : (
            <Grid label={t('site.collection.pieces', { name: view.title })}>
              {pieces.map((product) => (
                <li key={product.id} className="flex">
                  <PieceCard product={product} />
                </li>
              ))}
            </Grid>
          )}
        </div>
        <Banner />
      </main>
    </Frame>
  )
}

function Frame({ children }: { children: ReactNode }) {
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
      <Skeleton className="mt-6 aspect-[21/9] w-full" />
    </main>
  )
}

/** Two columns on a phone, three on a laptop, four on a wide screen. */
function Grid({ label, busy, children }: { label: string; busy?: boolean; children: ReactNode }) {
  return (
    <ul aria-label={label} aria-busy={busy || undefined} className="grid grid-cols-2 gap-x-3 gap-y-9 sm:gap-x-6 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </ul>
  )
}

/** A photo (4:5), the name and the price; the whole card opens the piece's showcase page. */
function PieceCard({ product }: { product: Product }) {
  const { t, localized } = useI18n()
  const { money } = useFormat()
  const img = primaryImage(product)
  return (
    <Link
      to={showcaseProductPath(product.slug)}
      className="group/card flex w-full flex-col focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-ink"
    >
      <div className="relative overflow-hidden border border-line bg-subtle">
        {img ? (
          <img
            src={img.url}
            alt=""
            width={800}
            height={1000}
            loading="lazy"
            className="aspect-[4/5] w-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover/card:scale-100"
          />
        ) : (
          <div className="aspect-[4/5] w-full" aria-hidden />
        )}
        {hasGlb(product) && (
          <span className="absolute top-2 left-2 bg-obsidian px-2.5 py-1.5 text-[10px] leading-none tracking-[0.18em] text-chalk uppercase sm:top-3 sm:left-3">
            <span aria-hidden>{t('collection.chip')}</span>
            <span className="sr-only">{t('collection.chipLabel')}</span>
          </span>
        )}
      </div>
      <h2 className="mt-4 font-display text-[1.25rem] leading-tight font-normal text-ink sm:text-[1.375rem]">{localized(product.name)}</h2>
      <p className="mt-1.5 text-[14px] leading-5 text-ink-muted">{money(initialPrice(product), product.currency)}</p>
    </Link>
  )
}

/** The one closing call to action: the showcase is how a business's own catalogue would look. */
function Banner() {
  const { t } = useI18n()
  return (
    <section className={cn(SECTION, 'pb-20 lg:pb-28')} aria-label={t('collection.bannerLine')}>
      <div className="flex flex-col gap-6 border border-line bg-surface px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:gap-12 sm:px-12 sm:py-12">
        <p className="max-w-xl font-display text-[clamp(1.5rem,1.2rem+1.2vw,2.1rem)] leading-[1.15] text-ink">{t('collection.bannerLine')}</p>
        <ButtonLink to={APPLY_PATH} variant="primary" size="lg" className="shrink-0 self-start sm:self-center">
          {t('site.apply')}
        </ButtonLink>
      </div>
    </section>
  )
}

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
import { APPLY_PATH, showcaseProductPath } from '@/lib/urls'
import { usePublishedCollection } from '@/services/contentHooks'
import { ProductCard } from '../public/ProductCard'
import { TAP_TARGET } from '../public/tapTarget'
import { BUILTIN_COLLECTIONS } from './landingBuiltin'
import PublicNotFoundPage from './PublicNotFoundPage'
import { useSiteContent } from './SiteContentProvider'
import { SiteFooter, SiteHeader } from './SiteChrome'
import { useShowcasePieces } from './useShowcasePieces'

// A collection's own public page, /collections/:slug (owner decisions 2026-11-03, ADR-0047). It lists only the admin's own
// showcase pieces, each opening its showcase page; no business catalogue or product is ever reachable from here. The Owner/
// Admin curates the pieces in the Website Editor. Until the Editor has published any collection, the four built-in ones
// (sofas, tables, armchairs, decor) have a page too: the showcase pieces of that category.

const SECTION = 'mx-auto max-w-[1320px] px-5 sm:px-10'

interface View {
  title: string
  text?: string
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
      return { title: localized(collection.title), text: collection.text ? localized(collection.text) || undefined : undefined, refs: collection.products }
    }
    const builtin = nothingPublished ? BUILTIN_COLLECTIONS.find((c) => c.key === slug) : undefined
    if (!builtin) return null
    return { title: t(`landing.col.${builtin.key}`), text: t(`landing.col.${builtin.key}Body`), category: builtin.category }
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
                  <ProductCard product={product} href={showcaseProductPath(product.slug)} />
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
    </main>
  )
}

/** Two columns on a phone, three on a laptop, four on a wide screen (the shared ProductCard, ADR-0054). */
function Grid({ label, busy, children }: { label: string; busy?: boolean; children: ReactNode }) {
  return (
    <ul aria-label={label} aria-busy={busy || undefined} className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </ul>
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

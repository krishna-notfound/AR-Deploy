import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { ButtonLink } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { HOUSE_BUSINESS_SLUG } from '@/domain/siteContent'
import type { Business, Product } from '@/domain/types'
import { LocalizedSpan, useI18n } from '@/i18n/LanguageProvider'
import { useCategoryLabel } from '@/services/listsHooks'
import { cn } from '@/lib/cn'
import { APPLY_PATH, showcaseProductPath } from '@/lib/urls'
import { service } from '@/services'
import { useRefreshWhenStale, useServiceQuery } from '@/services/hooks'
import { ArSection } from '../public/ArSection'
import { ArTips } from '../public/ArTips'
import { InAppNotice } from '../public/InAppNotice'
import { ProductMedia } from '../public/ProductMedia'
import { ArPrimaryAction, ArScaleBadge, DimensionsSection, MorePhotos, ProductLinkButton, ProductSpecs } from '../public/ProductParts'
import { ProductCard } from '../public/ProductCard'
import { ShareButton } from '../public/ShareActions'
import { StickyActionBar } from '../public/StickyActionBar'
import { TAP_TARGET } from '../public/tapTarget'
import { MEDIA_REFRESH_MS, useProductStage } from '../public/useProductStage'
import { VariantPicker } from '../public/VariantPicker'
import PublicNotFoundPage from './PublicNotFoundPage'
import { SiteFooter, SiteHeader } from './SiteChrome'

// A piece of the platform's own showcase catalogue (ADR-0047), /showcase/:productSlug, in the site's style: the page a
// visiting business owner opens from the landing to see what their customers would see. Same stage, AR and dimensions as
// the business product page (useProductStage, ProductParts), a simpler layout, no business header, no analytics event
// (there is no business to report to), and one closing banner that leads to the application.

const SECTION = 'mx-auto max-w-[1320px] px-5 sm:px-10'
/** How many other showcase pieces the "More pieces" row shows. */
const MORE_PIECES = 4

export default function ShowcaseProductPage() {
  const { productSlug = '' } = useParams()
  const { t } = useI18n()
  const res = useServiceQuery(() => service.getPublicProduct(HOUSE_BUSINESS_SLUG, productSlug), [productSlug])
  // A page left open (mobile tab restore) must not hand an expired model URL to Scene Viewer / Quick Look.
  useRefreshWhenStale(res.refetch, MEDIA_REFRESH_MS, res.data)

  if (res.status === 'loading' && !res.data) return <Frame><PageSkeleton /></Frame>
  // A refetch that says NOT_FOUND (unpublished, renamed, deleted) outranks the kept-stale product.
  if (res.status === 'error' && res.error.code === 'NOT_FOUND') return <PublicNotFoundPage />
  if (!res.data)
    return (
      <Frame>
        <main className="flex-1">
          <ErrorState message={t('showcase.loadError')} onRetry={res.refetch} retryLabel={t('common.retry')} className="py-24" />
        </main>
      </Frame>
    )
  return <ShowcaseView key={res.data.product.id} business={res.data.business} product={res.data.product} />
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SiteHeader />
      <InAppNotice />
      {children}
      <SiteFooter />
    </div>
  )
}

function PageSkeleton() {
  const { t } = useI18n()
  return (
    <main className={cn(SECTION, 'flex-1 py-10')} aria-busy="true" aria-label={t('common.loading')}>
      <Skeleton className="h-4 w-32" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-14">
        <Skeleton className="aspect-square w-full sm:aspect-[5/4]" />
        <div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-12 w-3/4" />
          <Skeleton className="mt-4 h-5 w-24" />
          <Skeleton className="mt-6 h-16 w-full max-w-md" />
          <Skeleton className="mt-8 h-12 w-full max-w-xs" />
        </div>
      </div>
    </main>
  )
}

function ShowcaseView({ business, product }: { business: Business; product: Product }) {
  const { t, localized } = useI18n()
  const categoryLabel = useCategoryLabel()
  // No analytics: the showcase belongs to the platform, not to a business.
  const stage = useProductStage(product, { record: false })
  const { name, hasCta } = stage
  useDocumentTitle(name)
  // The row of actions, watched so the phone's sticky bar shows only while the row is still below the screen.
  const [actionRow, setActionRow] = useState<HTMLElement | null>(null)

  return (
    <Frame>
      <main className="flex-1">
        <div className={cn(SECTION, 'pt-6 pb-16 sm:pt-8 lg:pb-20')}>
          <Link to="/#colecoes" className={cn(TAP_TARGET, 'inline-flex items-center gap-2 py-1 text-[12px] leading-[1.2] font-medium tracking-[0.08em] uppercase text-ink-muted hover:text-ink')}>
            <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
            {t('site.collection.all')}
          </Link>

          {/* Phones: the stage, then the text and the actions. Desktop: a large stage on the left (about 60%), the text on the right. */}
          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start lg:gap-14">
            <div ref={stage.stageRef} className="min-w-0 scroll-mt-24 lg:sticky lg:top-28">
              <figure className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-2.5 sm:p-4">
                <ProductMedia {...stage.mediaProps} switcher />
                {stage.media.fallback && stage.has3d && stage.variant && (
                  <p className="mt-3 text-center text-xs text-ink-muted">{t('ar.variantFallback', { name: localized(stage.variant.name) })}</p>
                )}
              </figure>
            </div>

            <div className="min-w-0">
              <Eyebrow>{categoryLabel(product.category)}</Eyebrow>
              <LocalizedSpan as="h1" text={product.name} className="mt-3 font-display text-[2.4rem] leading-[1.05] font-light text-balance break-words text-ink sm:text-[2.9rem]" />
              <LocalizedSpan as="p" text={product.shortDescription} className="mt-4 max-w-md text-[15px] leading-7 text-ink-muted" />

              <VariantPicker product={product} selectedId={stage.variantId} onSelect={stage.selectVariant} className="mt-8 border-t border-line pt-6" />

              {/* One row: the main action (AR on a supported phone, else 3D), the piece's own link, Share. Stacked and full width on a phone. */}
              <div ref={setActionRow} data-ar-cta className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <ArPrimaryAction stage={stage} arLabel={t('showcase.arButton')} />
                <ProductLinkButton product={product} outlined={hasCta} />
                {business.shareEnabled && <ShareButton title={t('product.shareTitle', { name, business: business.name })} />}
              </div>
              {hasCta && (
                <div className="mt-5 flex flex-col gap-4">
                  <ArScaleBadge stage={stage} />
                  <ArSection availability={stage.availability} onShowTips={stage.showTips} />
                </div>
              )}

              <DimensionsSection product={product} stage={stage} />
              <ProductSpecs product={product} />
            </div>
          </div>

          <MorePhotos stage={stage} />
          <MorePieces currentSlug={product.slug} />
          <ClosingBanner />
        </div>
      </main>
      <StickyActionBar stage={stage} arLabel={t('showcase.arButton')} row={actionRow} />
      <ArTips {...stage.tips} />
    </Frame>
  )
}

/** Up to four other published showcase pieces. Nothing while loading or when the showcase has no other piece. */
function MorePieces({ currentSlug }: { currentSlug: string }) {
  const { t } = useI18n()
  const res = useServiceQuery(() => service.getShowcase(), [])
  const others = (res.data?.products ?? []).filter((p) => p.status === 'published' && p.slug !== currentSlug).slice(0, MORE_PIECES)
  if (others.length === 0) return null
  return (
    <section className="mt-16 border-t border-line pt-8 lg:mt-20" aria-labelledby="showcase-more-h">
      <h2 id="showcase-more-h" className="text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-ink">
        {t('showcase.moreTitle')}
      </h2>
      <ul aria-label={t('showcase.moreList')} className="mt-6 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
        {others.map((p) => (
          <li key={p.id} className="flex">
            <ProductCard product={p} href={showcaseProductPath(p.slug)} headingLevel="h3" />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The only Apply button of the page. */
function ClosingBanner() {
  const { t } = useI18n()
  return (
    <section className="mt-16 lg:mt-20" aria-labelledby="showcase-banner-h">
      <div className="flex flex-col gap-8 border border-line bg-surface px-6 py-10 sm:px-12 sm:py-14 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
        <div className="max-w-2xl">
          <h2 id="showcase-banner-h" className="font-display text-[clamp(1.75rem,1.3rem+1.6vw,2.6rem)] leading-[1.12] font-normal text-balance text-ink">
            {t('showcase.bannerTitle')}
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-ink-muted">{t('showcase.bannerBody')}</p>
        </div>
        <ButtonLink to={APPLY_PATH} variant="primary" size="lg" className="shrink-0 self-stretch sm:self-start lg:self-center">
          {t('site.apply')}
          <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />
        </ButtonLink>
      </div>
    </section>
  )
}

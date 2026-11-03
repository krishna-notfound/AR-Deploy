import { ArrowRight } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import type { Business, Category, Product } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { primaryImage } from '@/lib/product'
import { useFormat } from '@/lib/useFormat'
import { APPLY_PATH, catalogLocalPath, productLocalPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { LandingCollections } from './LandingCollections'
import { SiteFooter, SiteHeader, useSectionScroll } from './SiteChrome'

// Photography: the owner's Stitch set (AI-generated, design/stitch/BRIEF.md), 1200×896 unless noted.
const IMG = (name: string) => `/images/sanctus/v2/${name}.webp`

const FEATURES = [
  ['landing.xp.f1Title', 'landing.xp.f1Body'],
  ['landing.xp.f2Title', 'landing.xp.f2Body'],
  ['landing.xp.f3Title', 'landing.xp.f3Body'],
] as const

const SECTION = 'mx-auto max-w-[1320px] px-5 sm:px-10'

// The references' square call to action (Button lg), composed here because cn() does not merge conflicting colours.
const CTA = 'inline-flex h-12 items-center justify-center gap-3 whitespace-nowrap rounded-[var(--radius-control)] px-6 text-label uppercase transition-colors select-none'
const CTA_DARK = cn(CTA, 'bg-ink text-chalk hover:bg-umber')

type Showcase = { product: Product; business: Business }

export default function LandingPage() {
  const { t } = useI18n()
  useDocumentTitle(t('landing.title'))
  const [params] = useSearchParams()
  const links = useLandingLinks()
  useSectionScroll(links.settled)
  // Old links sent people to "/?next=…" for the account picker, which now lives at /demo.
  if (params.has('next')) return <Navigate to={`/demo?${params.toString()}`} replace />
  return (
    <div className="min-h-dvh bg-canvas">
      <SiteHeader />
      <main>
        <Hero exampleHref={links.piece3d ?? links.catalog} />
        <HowItWorks />
        <Experience pieceHref={links.piece3d} catalogHref={links.catalog} />
        <LandingCollections />
        <About />
        <Partners />
      </main>
      <SiteFooter />
    </div>
  )
}

/**
 * Where the reference's calls to action lead: real published catalogues and products from the service.
 * A link without a destination is not rendered (no dead buttons).
 */
function useLandingLinks() {
  const products = useServiceQuery(() => service.getProducts({ status: 'published' }), [])
  const catalogs = useServiceQuery(() => service.getCatalogs(), [])
  return useMemo(() => {
    const active = new Map((catalogs.data ?? []).filter((c) => c.business.status === 'active').map((c) => [c.business.id, c.business]))
    const items: Showcase[] = (products.data ?? [])
      .filter((p) => active.has(p.businessId) && primaryImage(p))
      .map((p) => ({ product: p, business: active.get(p.businessId)! }))
      .sort((a, b) => a.business.name.localeCompare(b.business.name) || a.product.name.en.localeCompare(b.product.name.en))
    const byCategory = (c: Category) => {
      const hit = items.find((i) => i.product.category === c)
      return hit ? `${catalogLocalPath(hit.business)}?category=${c}` : undefined
    }
    // The 3D section opens a real product that has a 3D model, an armchair when there is one.
    const withModel = items.filter((i) => i.product.models.glb)
    const piece = withModel.find((i) => i.product.category === 'chair') ?? withModel[0]
    return {
      catalog: items[0] ? catalogLocalPath(items[0].business) : undefined,
      piece3d: piece ? productLocalPath(piece.business, piece.product) : undefined,
      category: byCategory,
      settled: products.status !== 'loading' && catalogs.status !== 'loading',
    }
  }, [products.data, products.status, catalogs.data, catalogs.status])
}

/** A heading set on two lines as in the reference, read as one sentence by screen readers. */
function TwoLines({ a, b, italic }: { a: string; b: string; italic?: boolean }) {
  return (
    <>
      <span className="block">{a}</span> <span className={cn('block', italic && 'italic')}>{b}</span>
    </>
  )
}

const arrowIcon = <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-eyebrow text-accent-ink', className)}>{children}</p>
}

function Hero({ exampleHref }: { exampleHref?: string }) {
  const { t } = useI18n()
  return (
    <section aria-labelledby="hero-title">
      {/* Full-bleed: edge to edge, and on large screens fills the viewport below the 80px header. */}
      <div className="grid border-b border-line bg-surface lg:min-h-[calc(100dvh-5rem)] lg:grid-cols-2 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="order-2 flex flex-col justify-center px-5 py-10 sm:px-10 sm:py-14 lg:order-1 lg:px-14 lg:py-16 xl:px-16">
          <Eyebrow>{t('landing.hero.eyebrow')}</Eyebrow>
          <h1 id="hero-title" className="mt-5 font-display text-[clamp(2.25rem,1.4rem+1.6vw,3.25rem)] leading-[1.06] font-normal text-ink">
            <TwoLines a={t('landing.hero.title1')} b={t('landing.hero.title2')} italic />
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-7 text-ink-body">{t('landing.hero.body')}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:flex-col lg:items-start xl:flex-row">
            <Link to={APPLY_PATH} className={CTA_DARK}>
              {t('site.apply')}
              {arrowIcon}
            </Link>
            {exampleHref && (
              <Link to={exampleHref} className={cn(CTA, 'border border-ink text-ink hover:bg-subtle')}>
                {t('landing.hero.cta3d')}
              </Link>
            )}
          </div>
          <p className="mt-5 max-w-md text-[13px] leading-5 text-ink-muted">{t('landing.hero.note')}</p>
        </div>
        <figure className="relative order-1 lg:order-2">
          <img
            src={IMG('hero-living')}
            alt={t('landing.hero.imageAlt')}
            width={1376}
            height={768}
            fetchPriority="high"
            className="aspect-[4/3] size-full object-cover sm:aspect-[16/9] lg:absolute lg:inset-0 lg:aspect-auto"
          />
          <figcaption className="absolute right-3 bottom-3 bg-surface px-3 py-2 text-[10px] leading-none font-medium tracking-[0.18em] text-ink uppercase sm:right-5 sm:bottom-5">
            {t('landing.hero.caption')}
          </figcaption>
        </figure>
      </div>
    </section>
  )
}

const STEPS = [
  ['landing.how.s1Title', 'landing.how.s1Body'],
  ['landing.how.s2Title', 'landing.how.s2Body'],
  ['landing.how.s3Title', 'landing.how.s3Body'],
  ['landing.how.s4Title', 'landing.how.s4Body'],
] as const

/** What a furniture business does with Sanctus, in the order they do it. Every step exists in the product. */
function HowItWorks() {
  const { t } = useI18n()
  return (
    <section id="como-funciona" className="scroll-mt-24" aria-labelledby="how-title">
      <div className={cn(SECTION, 'py-20 lg:py-28')}>
        <Eyebrow>{t('landing.how.eyebrow')}</Eyebrow>
        <h2 id="how-title" className="mt-4 text-headline">
          <TwoLines a={t('landing.how.title1')} b={t('landing.how.title2')} />
        </h2>
        <ol className="mt-10 grid gap-x-8 border-t border-line sm:grid-cols-2 lg:mt-14 lg:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="border-b border-line py-6 lg:border-b-0">
              <span className="font-display text-[2rem] leading-none text-accent-ink italic" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-4 text-label text-ink">{t(title)}</h3>
              <p className="mt-3 text-[14px] leading-6 text-ink-muted">{t(body)}</p>
            </li>
          ))}
        </ol>
        <Link to={APPLY_PATH} className={cn(CTA_DARK, 'mt-10')}>
          {t('site.apply')}
          {arrowIcon}
        </Link>
      </div>
    </section>
  )
}

/**
 * 3D and AR, explained. The card on the right is the Linden armchair from the brand references: an illustration with
 * no product record or 3D model, so it is labelled as such and never links anywhere (ADR-0023). The call to action
 * opens a real published product that has a model.
 */
function Experience({ pieceHref, catalogHref }: { pieceHref?: string; catalogHref?: string }) {
  const { t } = useI18n()
  const { money } = useFormat()
  const href = pieceHref ?? catalogHref
  return (
    <section id="experiencia" className="scroll-mt-24 bg-obsidian text-chalk" aria-labelledby="xp-title">
      <div className={cn(SECTION, 'grid gap-14 py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-20 lg:py-28')}>
        <div>
          <p className="text-eyebrow text-chalk/70">{t('landing.xp.eyebrow')}</p>
          <h2 id="xp-title" className="mt-5 text-headline text-chalk">
            {t('landing.xp.title')}
          </h2>
          <p className="mt-6 max-w-md text-[15px] leading-7 font-light text-chalk/80">{t('landing.xp.body')}</p>
          <ol className="mt-10 divide-y divide-chalk/15 border-y border-chalk/15">
            {FEATURES.map(([title, body], i) => (
              <li key={title} className="grid grid-cols-[2.75rem_minmax(0,1fr)] py-5">
                <span className="font-display text-lg leading-none text-chalk/55 italic" aria-hidden>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="text-label text-chalk">{t(title)}</h3>
                  <p className="mt-2 text-[13px] leading-5 text-chalk/70">{t(body)}</p>
                </div>
              </li>
            ))}
          </ol>
          {href && (
            <Link to={href} className={cn(CTA, 'mt-10 bg-chalk text-ink hover:bg-limestone')}>
              {pieceHref ? t('landing.xp.cta') : t('landing.band.cta')}
              {arrowIcon}
            </Link>
          )}
        </div>

        <figure className="border border-chalk/15 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-chalk/15 pb-4">
            <div>
              <p className="text-label text-chalk/60">{t('landing.feature.eyebrow')}</p>
              <p className="mt-1.5 font-display text-[1.75rem] leading-none">{t('landing.feature.name')}</p>
            </div>
            {/* What a product page offers; not controls (this piece is an illustration). */}
            <div className="flex gap-2 text-[10px] leading-none tracking-[0.2em]" aria-hidden>
              <span className="border border-chalk/30 px-2.5 py-1.5">3D</span>
              <span className="border border-chalk/30 px-2.5 py-1.5">AR</span>
            </div>
          </div>
          <div className="relative mt-4 sm:mt-6">
            <img
              src={IMG('armchair-walnut')}
              alt={t('landing.feature.imageAlt')}
              width={1200}
              height={896}
              loading="lazy"
              className="aspect-[4/3] w-full bg-umber object-cover"
            />
            <span className="absolute top-3 left-3 bg-obsidian px-2.5 py-1.5 text-[10px] leading-none tracking-[0.18em] text-chalk uppercase">
              {t('landing.xp.illustration')}
            </span>
          </div>
          <figcaption className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <dl className="grid gap-4 text-[13px] sm:grid-cols-2">
              <div>
                <dt className="text-label text-chalk/60">{t('landing.feature.dimsLabel')}</dt>
                <dd className="mt-1.5 tracking-[0.04em] text-chalk/85">{t('landing.feature.dims')}</dd>
              </div>
              <div>
                <dt className="text-label text-chalk/60">{t('landing.feature.materialsLabel')}</dt>
                <dd className="mt-1.5 leading-5 text-chalk/85">{t('landing.feature.materials')}</dd>
              </div>
            </dl>
            <p className="font-display text-xl tracking-[0.04em] sm:text-right">{money(249000, 'EUR')}</p>
            <p className="text-xs leading-5 text-chalk/60 sm:col-span-2">{t('landing.feature.illustrative')}</p>
          </figcaption>
        </figure>
      </div>
    </section>
  )
}

function About() {
  const { t } = useI18n()
  return (
    <section id="sobre" className="scroll-mt-24" aria-labelledby="about-title">
      <div className={cn(SECTION, 'grid gap-12 py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-16 lg:py-28')}>
        <div>
          <Eyebrow>{t('landing.about.eyebrow')}</Eyebrow>
          <h2 id="about-title" className="mt-5 text-headline">
            <TwoLines a={t('landing.about.title1')} b={t('landing.about.title2')} />
          </h2>
          <p className="mt-6 max-w-md text-[15px] leading-7 text-ink-muted">{t('landing.about.body')}</p>
        </div>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-3 sm:gap-6">
          <img
            src={IMG('coffee-table')}
            alt={t('landing.about.imageAlt')}
            width={1200}
            height={896}
            loading="lazy"
            className="row-span-2 aspect-[4/5] size-full border border-line bg-subtle object-cover"
          />
          <img
            src={IMG('detail-joinery')}
            alt={t('landing.about.detailAlt')}
            width={1024}
            height={1024}
            loading="lazy"
            className="aspect-square w-full border border-line bg-subtle object-cover"
          />
          <div className="flex flex-col justify-end border border-line bg-subtle p-3 sm:p-5">
            <span className="block h-px w-8 bg-accent" aria-hidden />
            <p className="mt-3 font-display text-base leading-snug text-ink-body italic sm:text-xl">{t('landing.feature.textureCaption')}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Partners() {
  const { t } = useI18n()
  return (
    <section id="parcerias" className={cn(SECTION, 'scroll-mt-24 py-20 lg:py-28')} aria-labelledby="biz-title">
      <div className="flex flex-col gap-8 border border-line bg-surface px-6 py-10 sm:px-12 sm:py-14 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
        <div className="max-w-2xl">
          <Eyebrow>{t('landing.biz.eyebrow')}</Eyebrow>
          <h2 id="biz-title" className="mt-4 font-display text-[clamp(1.75rem,1.3rem+1.6vw,2.6rem)] leading-[1.12] font-normal text-ink">
            {t('landing.biz.title')}
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-ink-muted">{t('landing.biz.body')}</p>
        </div>
        <Link to={APPLY_PATH} className={cn(CTA_DARK, 'shrink-0 self-start lg:self-center')}>
          {t('site.apply')}
          {arrowIcon}
        </Link>
      </div>
    </section>
  )
}

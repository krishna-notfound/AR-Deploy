import { ArrowRight } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { arrowLinkClasses } from '@/components/ui/Button'
import type { Business, Category, Product } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { primaryImage } from '@/lib/product'
import { APPLY_PATH, catalogLocalPath, productLocalPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { TAP_TARGET } from '../public/tapTarget'
import { SectionLink, SiteFooter, SiteHeader, useSectionScroll } from './SiteChrome'

// Photography: the owner's Stitch set (AI-generated, design/stitch/BRIEF.md), 1200×896 unless noted.
const IMG = (name: string) => `/images/sanctus/v2/${name}.webp`

// The four collection cards of the reference, each tied to a platform category so "Ver coleção" opens real products.
const COLLECTIONS: { key: 'sofas' | 'tables' | 'armchairs' | 'decor'; category: Category; img: string; focus?: string }[] = [
  { key: 'sofas', category: 'sofa', img: 'sofa-travertine' },
  { key: 'tables', category: 'table', img: 'dining-table' },
  { key: 'armchairs', category: 'chair', img: 'lounge-chair', focus: 'object-[62%_80%]' },
  { key: 'decor', category: 'decor', img: 'lamp-vase' },
]

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
        <Hero />
        <Collections links={links} />
        <Experience pieceHref={links.piece3d} catalogHref={links.catalog} />
        <About />
        <Manifesto />
        <Projects catalogHref={links.catalog} />
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

/** `to`: another page; `href`: a section of this page ("/#colecoes"). */
function ArrowLink({ to, href, children, className }: { to?: string; href?: string; children: ReactNode; className?: string }) {
  const inner = (
    <>
      {children}
      <ArrowRight className="size-3.5 transition-transform group-hover/arrow:translate-x-0.5" strokeWidth={1.5} aria-hidden />
    </>
  )
  if (to)
    return (
      <Link to={to} className={cn(arrowLinkClasses, TAP_TARGET, className)}>
        {inner}
      </Link>
    )
  if (href)
    return (
      <SectionLink href={href} className={cn(arrowLinkClasses, TAP_TARGET, className)}>
        {inner}
      </SectionLink>
    )
  return null
}

const arrowIcon = <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-eyebrow text-accent-ink', className)}>{children}</p>
}

function Hero() {
  const { t } = useI18n()
  return (
    <section className={cn(SECTION, 'pt-5 sm:pt-10')} aria-labelledby="hero-title">
      <div className="grid border border-line bg-surface lg:min-h-[600px] lg:grid-cols-2 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="order-2 flex flex-col justify-center px-6 py-10 sm:px-12 sm:py-14 lg:order-1 lg:px-12 lg:py-16 xl:px-14">
          <Eyebrow>{t('landing.hero.eyebrow')}</Eyebrow>
          <h1 id="hero-title" className="mt-5 text-display text-ink">
            <TwoLines a={t('landing.hero.title1')} b={t('landing.hero.title2')} italic />
          </h1>
          <p className="mt-6 max-w-sm text-[15px] leading-7 font-light text-ink-body">{t('landing.hero.body')}</p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:flex-col lg:items-start xl:flex-row">
            <SectionLink href="/#colecoes" className={CTA_DARK}>
              {t('landing.hero.cta')}
              {arrowIcon}
            </SectionLink>
            <SectionLink href="/#experiencia" className={cn(CTA, 'border border-ink text-ink hover:bg-subtle')}>
              {t('landing.hero.cta3d')}
            </SectionLink>
          </div>
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

function Collections({ links }: { links: ReturnType<typeof useLandingLinks> }) {
  const { t } = useI18n()
  return (
    <section id="colecoes" className="scroll-mt-24" aria-labelledby="col-title">
      <div className={cn(SECTION, 'py-20 lg:py-28')}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] lg:items-end lg:gap-14">
          <div>
            <Eyebrow>{t('landing.col.eyebrow')}</Eyebrow>
            <h2 id="col-title" className="mt-4 text-headline">
              <TwoLines a={t('landing.col.title1')} b={t('landing.col.title2')} />
            </h2>
          </div>
          <p className="max-w-xl text-[15px] leading-7 text-ink-muted">{t('landing.col.body')}</p>
          {links.catalog && (
            <ArrowLink to={links.catalog} className="justify-self-start text-ink lg:justify-self-end">
              {t('landing.col.all')}
            </ArrowLink>
          )}
        </div>
        <hr className="mt-10 border-line lg:mt-14" />
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-6 lg:mt-14 lg:grid-cols-4">
          {COLLECTIONS.map((c, i) => {
            const href = links.category(c.category)
            const name = t(`landing.col.${c.key}` as TranslationKey)
            return (
              <li key={c.key} className="flex flex-col border border-line bg-surface p-2.5 sm:p-4">
                <div className="relative">
                  <img src={IMG(c.img)} alt="" width={1200} height={896} loading="lazy" className={cn('aspect-[4/5] w-full bg-subtle object-cover', c.focus)} />
                  <span className="absolute top-2 left-2 bg-surface px-2 py-1 text-[9px] leading-none tracking-[0.16em] text-ink-muted uppercase sm:top-3 sm:left-3 sm:text-[10px]">
                    {`${String(i + 1).padStart(2, '0')} // ${t('landing.col.chip')}`}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-[1.375rem] leading-tight font-normal text-ink sm:mt-5 sm:text-[1.625rem]">{name}</h3>
                <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">{t(`landing.col.${c.key}Body` as TranslationKey)}</p>
                {href && (
                  <div className="mt-auto pt-5">
                    <ArrowLink to={href} className="text-ink">
                      <span className="sr-only">{name}: </span>
                      {t('landing.col.view')}
                    </ArrowLink>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
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
            <p className="font-display text-xl tracking-[0.04em] sm:text-right">{t('landing.feature.price')}</p>
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
          <ArrowLink href="/#manifesto" className="mt-10 text-ink">
            {t('landing.about.cta')}
          </ArrowLink>
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

function Manifesto() {
  const { t } = useI18n()
  return (
    <section id="manifesto" className={cn(SECTION, 'scroll-mt-24')}>
      <figure className="border border-line bg-surface px-6 py-14 text-center sm:px-12 lg:py-20">
        <blockquote className="mx-auto max-w-3xl font-display text-[clamp(1.5rem,1.1rem+1.4vw,2.25rem)] leading-snug font-normal text-ink italic">
          {t('landing.quote')}
        </blockquote>
        <figcaption className="mt-5 text-label text-accent-ink">{t('landing.quoteBy')}</figcaption>
      </figure>
    </section>
  )
}

function Projects({ catalogHref }: { catalogHref?: string }) {
  const { t } = useI18n()
  return (
    <section id="projetos" className={cn(SECTION, 'scroll-mt-24 pt-20 lg:pt-28')} aria-labelledby="projects-title">
      <div className="relative isolate flex min-h-[440px] items-end overflow-hidden border border-line bg-obsidian lg:min-h-[540px]">
        <img
          src={IMG('interior-villa')}
          alt={t('landing.projects.imageAlt')}
          width={1376}
          height={768}
          loading="lazy"
          className="absolute inset-0 -z-10 size-full object-cover"
        />
        {/* Plain legibility scrim over the photograph. */}
        <div className="absolute inset-0 -z-10 bg-obsidian/55 sm:bg-obsidian/45" aria-hidden />
        <div className="max-w-xl px-6 py-10 text-chalk sm:px-12 sm:py-14">
          <p className="text-eyebrow text-chalk/85">{t('landing.projects.eyebrow')}</p>
          <h2 id="projects-title" className="mt-4 text-headline text-chalk">
            <TwoLines a={t('landing.projects.title1')} b={t('landing.projects.title2')} />
          </h2>
          <p className="mt-5 max-w-sm text-[15px] leading-7 text-chalk/90">{t('landing.projects.body')}</p>
          {catalogHref && (
            <ArrowLink to={catalogHref} className="mt-8 border-chalk/70 text-chalk hover:text-limestone">
              {t('landing.projects.cta')}
            </ArrowLink>
          )}
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

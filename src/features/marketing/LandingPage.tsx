import { ArrowRight, Plus } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Wordmark } from '@/components/ui/BrandMark'
import { arrowLinkClasses } from '@/components/ui/Button'
import type { Business, Category, Product } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { primaryImage } from '@/lib/product'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { TAP_TARGET } from '../public/tapTarget'
import { SectionLink, SiteFooter, SiteHeader, useSectionScroll } from './SiteChrome'

// Photography: crops of the client's reference boards (AI-generated, temporary) and licensed Pexels photos; provenance in design/21.
const IMG = (name: string) => `/images/sanctus/${name}.webp`

// The four collection cards of the reference, each tied to a platform category so "Ver coleção" opens real products.
const COLLECTIONS: { key: 'sofas' | 'tables' | 'armchairs' | 'decor'; category: Category; img: string; w: number; h: number }[] = [
  { key: 'sofas', category: 'sofa', img: 'col-sofas', w: 298, h: 422 },
  { key: 'tables', category: 'table', img: 'col-mesas', w: 329, h: 422 },
  { key: 'armchairs', category: 'chair', img: 'col-poltronas', w: 329, h: 422 },
  { key: 'decor', category: 'decor', img: 'col-decoracao', w: 333, h: 325 },
]

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
    <div className="relative min-h-dvh bg-canvas">
      {/* Outside the hero section so it keeps the page's banner landmark; absolutely placed over the photograph. */}
      <SiteHeader variant="overlay" />
      <Hero />
      <main>
        <Collections links={links} />
        <AboutAndProjects catalogHref={links.catalog} />
        <Manifesto />
        <Feature catalogHref={links.catalog} />
        <Band catalogHref={links.catalog} />
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
    const catalogOf = (b: Business) => `/catalog/${b.slug}`
    const byCategory = (c: Category) => {
      const hit = items.find((i) => i.product.category === c)
      return hit ? `${catalogOf(hit.business)}?category=${c}` : undefined
    }
    return {
      catalog: items[0] ? catalogOf(items[0].business) : undefined,
      category: byCategory,
      settled: products.status !== 'loading' && catalogs.status !== 'loading',
    }
  }, [products.data, products.status, catalogs.data, catalogs.status])
}

/** A heading set on two lines as in the reference, read as one sentence by screen readers. */
function TwoLines({ a, b }: { a: string; b: string }) {
  return (
    <>
      <span className="block">{a}</span> <span className="block">{b}</span>
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

function Hero() {
  const { t } = useI18n()
  return (
    <section className="relative isolate flex min-h-[560px] flex-col overflow-hidden bg-obsidian text-chalk sm:min-h-[600px] lg:h-[min(78dvh,700px)]">
      <img
        src={IMG('hero')}
        alt={t('landing.hero.imageAlt')}
        width={1560}
        height={712}
        fetchPriority="high"
        className="absolute inset-0 -z-10 size-full object-cover object-[40%_center] lg:object-left"
      />
      {/* Legibility scrim over the photograph's left wall, where the copy sits in the reference. */}
      <div className="absolute inset-0 -z-10 bg-linear-to-r from-obsidian/70 via-obsidian/25 to-transparent sm:from-obsidian/55" aria-hidden />
      <div className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col justify-center px-5 pt-24 pb-16 sm:px-10">
        <p className="text-eyebrow">{t('landing.hero.eyebrow')}</p>
        <h1 className="mt-5 text-display text-chalk">
          <TwoLines a={t('landing.hero.title1')} b={t('landing.hero.title2')} />
        </h1>
        <p className="mt-6 max-w-[19rem] text-[15px] leading-7 font-light text-chalk/90">{t('landing.hero.body')}</p>
        <span className="mt-10 block h-px w-12 bg-chalk/60" aria-hidden />
        <ArrowLink href="/#colecoes" className="mt-6 self-start border-chalk/70 text-chalk hover:text-limestone">
          {t('landing.hero.cta')}
        </ArrowLink>
      </div>
    </section>
  )
}

function Collections({ links }: { links: ReturnType<typeof useLandingLinks> }) {
  const { t } = useI18n()
  return (
    <section id="colecoes" className="scroll-mt-20" aria-labelledby="col-title">
      <div className="mx-auto grid max-w-[1320px] gap-x-10 gap-y-12 px-5 py-16 sm:px-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,3fr)] lg:py-20">
        <div className="lg:pt-2">
          <p className="text-eyebrow text-ink-muted">{t('landing.col.eyebrow')}</p>
          <h2 id="col-title" className="mt-5 text-headline">
            <TwoLines a={t('landing.col.title1')} b={t('landing.col.title2')} />
          </h2>
          <p className="mt-6 max-w-sm text-[15px] leading-7 text-ink-muted">{t('landing.col.body')}</p>
          {links.catalog && (
            <ArrowLink to={links.catalog} className="mt-10 text-ink">
              {t('landing.col.all')}
            </ArrowLink>
          )}
        </div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
          {COLLECTIONS.map((c) => {
            const href = links.category(c.category)
            return (
              <li key={c.key} className="flex flex-col">
                <img
                  src={IMG(c.img)}
                  alt=""
                  width={c.w}
                  height={c.h}
                  loading="lazy"
                  className="aspect-[4/5] w-full bg-subtle object-cover"
                />
                <h3 className="mt-5 text-eyebrow text-ink">{t(`landing.col.${c.key}` as TranslationKey)}</h3>
                <p className="mt-2 text-[13px] leading-5 text-ink-muted">{t(`landing.col.${c.key}Body` as TranslationKey)}</p>
                {href && (
                  <ArrowLink to={href} className="mt-6 self-start border-transparent text-ink-muted hover:border-current">
                    <span className="sr-only">{t(`landing.col.${c.key}` as TranslationKey)}: </span>
                    {t('landing.col.view')}
                  </ArrowLink>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

function AboutAndProjects({ catalogHref }: { catalogHref?: string }) {
  const { t } = useI18n()
  return (
    <section className="grid lg:min-h-[440px] lg:grid-cols-[1.45fr_1.5fr_1.05fr_1fr]">
      <img src={IMG('about-vase')} alt={t('landing.about.imageAlt')} width={1200} height={1248} loading="lazy" className="aspect-[4/3] size-full object-cover lg:aspect-auto" />
      <div id="sobre" className="flex scroll-mt-20 flex-col justify-center bg-subtle px-6 py-14 sm:px-10 lg:px-12" aria-labelledby="about-title">
        <p className="text-eyebrow text-ink-muted">{t('landing.about.eyebrow')}</p>
        <h2 id="about-title" className="mt-5 font-display text-[clamp(1.75rem,1.3rem+1.4vw,2.4rem)] leading-[1.12] font-normal">
          <TwoLines a={t('landing.about.title1')} b={t('landing.about.title2')} />
        </h2>
        <p className="mt-6 max-w-md text-[14px] leading-7 text-ink-muted">{t('landing.about.body')}</p>
        <ArrowLink href="/#manifesto" className="mt-8 self-start text-ink">
          {t('landing.about.cta')}
        </ArrowLink>
      </div>
      <img src={IMG('about-interior')} alt={t('landing.projects.imageAlt')} width={800} height={616} loading="lazy" className="aspect-[4/3] size-full object-cover lg:aspect-auto" />
      <div id="projetos" className="flex scroll-mt-20 flex-col justify-center bg-obsidian px-6 py-14 text-chalk sm:px-10 lg:px-10" aria-labelledby="projects-title">
        <p className="text-eyebrow text-chalk/80">{t('landing.projects.eyebrow')}</p>
        <h2 id="projects-title" className="mt-5 font-display text-[clamp(1.75rem,1.3rem+1.4vw,2.4rem)] leading-[1.12] font-normal text-chalk">
          <TwoLines a={t('landing.projects.title1')} b={t('landing.projects.title2')} />
        </h2>
        <p className="mt-6 max-w-xs text-[14px] leading-7 text-chalk/80">{t('landing.projects.body')}</p>
        {catalogHref && (
          <ArrowLink to={catalogHref} className="mt-8 self-start border-chalk/70 text-chalk hover:text-limestone">
            {t('landing.projects.cta')}
          </ArrowLink>
        )}
      </div>
    </section>
  )
}

function Manifesto() {
  const { t } = useI18n()
  return (
    <section id="manifesto" className="scroll-mt-20 border-y border-line bg-canvas">
      <div className="mx-auto flex max-w-[1320px] items-center gap-8 pl-5 sm:pl-10">
        <figure className="flex-1 py-12 text-center sm:py-14 lg:pl-[12%] lg:text-left">
          <blockquote className="font-display text-[clamp(1.35rem,1rem+1.2vw,1.9rem)] leading-snug font-normal tracking-[0.03em] text-ink italic">
            {t('landing.quote')}
          </blockquote>
          <figcaption className="mt-4 text-label text-ink-muted lg:pl-[18%]">{t('landing.quoteBy')}</figcaption>
        </figure>
        <img src={IMG('quote-stone')} alt="" width={286} height={151} loading="lazy" className="hidden h-40 w-56 self-stretch object-cover md:block" />
      </div>
    </section>
  )
}

/** Illustrative piece from the brand references. It has no product record or 3D model, so it never links to one (ADR-0023). */
function Feature({ catalogHref }: { catalogHref?: string }) {
  const { t } = useI18n()
  return (
    <section className="bg-canvas" aria-labelledby="feature-title">
      <div className="mx-auto grid max-w-[1320px] gap-x-12 gap-y-10 px-5 py-16 sm:px-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.62fr)] lg:py-16">
        <img
          src={IMG('feature-main')}
          alt={t('landing.feature.imageAlt')}
          width={746}
          height={576}
          loading="lazy"
          className="aspect-[4/3] w-full bg-subtle object-cover lg:aspect-auto lg:h-full"
        />
        <div className="flex flex-col justify-center">
          <p className="text-eyebrow text-ink-muted">{t('landing.feature.eyebrow')}</p>
          <h2 id="feature-title" className="mt-4 text-title">
            {t('landing.feature.name')}
          </h2>
          <p className="mt-4 text-[15px] tracking-[0.06em] text-ink">{t('landing.feature.price')}</p>
          <p className="mt-1 text-xs text-ink-faint">{t('landing.feature.illustrative')}</p>
          <p className="mt-5 max-w-md text-[14px] leading-7 text-ink-muted">{t('landing.feature.body')}</p>
          <dl className="mt-8 space-y-5">
            <div>
              <dt className="text-eyebrow text-ink">{t('landing.feature.dimsLabel')}</dt>
              <dd className="mt-1.5 text-[13px] tracking-[0.04em] text-ink-muted">{t('landing.feature.dims')}</dd>
            </div>
            <div>
              <dt className="text-eyebrow text-ink">{t('landing.feature.materialsLabel')}</dt>
              <dd className="mt-1.5 text-[13px] text-ink-muted">{t('landing.feature.materials')}</dd>
            </div>
          </dl>
          {catalogHref && (
            <Link to={catalogHref} className="mt-9 inline-flex h-12 items-center justify-center self-start bg-ink px-10 text-label text-chalk transition-colors hover:bg-umber">
              {t('landing.band.cta')}
            </Link>
          )}
        </div>
        <aside className="lg:border-l lg:border-line lg:pl-10" aria-labelledby="details-title">
          <h3 id="details-title" className="text-eyebrow text-ink">
            {t('landing.feature.details')}
          </h3>
          <div className="mt-4 divide-y divide-line border-y border-line">
            {(
              [
                ['landing.feature.materialsLabel', 'landing.feature.materials'],
                ['landing.feature.dimsLabel', 'landing.feature.dims'],
              ] as const
            ).map(([label, body]) => (
              <details key={label} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between py-3.5 text-[13px] text-ink [&::-webkit-details-marker]:hidden">
                  {t(label)}
                  <Plus className="size-3.5 transition-transform group-open:rotate-45" strokeWidth={1.5} aria-hidden />
                </summary>
                <p className="pb-4 text-[13px] leading-6 text-ink-muted">{t(body)}</p>
              </details>
            ))}
          </div>
          <figure className="mt-6">
            <img src={IMG('feature-texture')} alt={t('landing.feature.textureAlt')} width={372} height={182} loading="lazy" className="aspect-[2/1] w-full object-cover" />
            <figcaption className="mt-3 font-display text-[15px] text-ink-muted italic">{t('landing.feature.textureCaption')}</figcaption>
          </figure>
        </aside>
      </div>
    </section>
  )
}

function Band({ catalogHref }: { catalogHref?: string }) {
  const { t } = useI18n()
  return (
    <section className="grid grid-cols-2 gap-1.5 bg-canvas px-1.5 pb-1.5 lg:grid-cols-[1.5fr_1fr_0.95fr_1.1fr]">
      <div className="relative isolate col-span-2 flex min-h-[260px] flex-col justify-center overflow-hidden px-8 py-12 text-chalk sm:px-12 lg:col-span-1">
        <img src={IMG('band-lake')} alt="" width={1600} height={840} loading="lazy" className="absolute inset-0 -z-10 size-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-obsidian/30" aria-hidden />
        <Wordmark size={14} />
        <p className="mt-5 text-[17px] font-light">{t('landing.band.title')}</p>
        {catalogHref && (
          <ArrowLink to={catalogHref} className="mt-8 self-start border-chalk/70 text-chalk hover:text-limestone">
            {t('landing.band.cta')}
          </ArrowLink>
        )}
      </div>
      <img src={IMG('band-fabric')} alt={t('landing.band.fabricAlt')} width={471} height={354} loading="lazy" className="aspect-[4/3] size-full object-cover lg:aspect-auto" />
      <img src={IMG('band-bench')} alt={t('landing.band.benchAlt')} width={452} height={354} loading="lazy" className="aspect-[4/3] size-full object-cover lg:aspect-auto" />
      <img src={IMG('band-card')} alt={t('landing.band.cardAlt')} width={530} height={354} loading="lazy" className="col-span-2 aspect-[16/9] size-full object-cover lg:col-span-1 lg:aspect-auto" />
    </section>
  )
}

import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { APPLY_PATH, showcaseProductPath } from '@/lib/urls'
import { useLandingExample, useLandingFeatured } from '@/services/contentHooks'
import { LandingCollections } from './LandingCollections'
import { LandingShowcase, ShowcaseCta, useShowcaseCardView } from './LandingShowcase'
import { SiteFooter, SiteHeader, useSectionScroll } from './SiteChrome'
import { useShowcasePieces } from './useShowcasePieces'

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

export default function LandingPage() {
  const { t } = useI18n()
  useDocumentTitle(t('landing.title'))
  const [params] = useSearchParams()
  const example = useExampleHref()
  useSectionScroll(example.settled)
  // Old links sent people to "/?next=…" for the account picker, which now lives at /demo.
  if (params.has('next')) return <Navigate to={`/demo?${params.toString()}`} replace />
  return (
    <div className="min-h-dvh bg-canvas">
      <SiteHeader />
      <main>
        <Hero exampleHref={example.href} />
        <HowItWorks />
        <Experience />
        <LandingCollections />
        <About />
        <Partners />
      </main>
      <SiteFooter />
    </div>
  )
}

/**
 * Where "See a live example" leads (ADR-0047): the admin's chosen example piece, else the 3D card's piece, else the newest
 * showcase piece, as its showcase page. No piece at all: no button (no dead buttons).
 */
function useExampleHref() {
  const { example, loading: exampleLoading } = useLandingExample()
  const { featured, loading: featuredLoading } = useLandingFeatured()
  const { status, pieces, ofRef } = useShowcasePieces()
  // Not before the chosen pieces are known, so the button never points at the newest piece for a moment and then moves.
  const settled = status !== 'loading' && !exampleLoading && !featuredLoading
  const piece = settled ? (ofRef(example) ?? ofRef(featured) ?? pieces[0]) : undefined
  return { href: piece ? showcaseProductPath(piece.slug) : undefined, settled }
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
          {exampleHref && (
            <>
              <Link to={exampleHref} className={cn(CTA_DARK, 'mt-9 self-start')}>
                {t('landing.hero.cta3d')}
                {arrowIcon}
              </Link>
              <p className="mt-5 max-w-md text-[13px] leading-5 text-ink-muted">{t('landing.hero.note')}</p>
            </>
          )}
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
 * 3D and AR, explained. The card on the right is one of the admin's own showcase pieces (image or live 3D, ADR-0047); with
 * no piece it is the labelled Linden illustration (ADR-0023). The call to action opens that same piece, never a catalogue.
 */
function Experience() {
  const { t } = useI18n()
  // The featured 3D piece the admin picks in the Editor; without one, the newest showcase piece with a model.
  const { featured } = useLandingFeatured()
  const { view, loading } = useShowcaseCardView(featured)
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
          <ShowcaseCta view={view} className={cn(CTA, 'mt-10 bg-chalk text-ink hover:bg-limestone')}>
            {arrowIcon}
          </ShowcaseCta>
        </div>

        <LandingShowcase view={view} loading={loading} />
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

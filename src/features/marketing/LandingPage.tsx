import { ArrowRight } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { ButtonLink, buttonClasses } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { type BuiltinSectionId, type SiteImage, resolveLandingSections } from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { APPLY_PATH, showcaseProductPath } from '@/lib/urls'
import { siteAssetUrl } from '@/services'
import { useLandingExample, useLandingFeatured } from '@/services/contentHooks'
import { HeroMedia } from './HeroMedia'
import { LandingCollections } from './LandingCollections'
import { LandingQr } from './LandingQr'
import { LandingShowcase, ShowcaseCta, useShowcaseCardView } from './LandingShowcase'
import { OwnSectionView } from './LandingOwnSections'
import { SECTION, SECTION_Y } from './landingFrame'
import { SiteFooter, SiteHeader, useSectionScroll } from './SiteChrome'
import { useSiteContent } from './SiteContentProvider'
import { useShowcasePieces } from './useShowcasePieces'

// Photography: the owner's Stitch set (AI-generated, design/stitch/BRIEF.md), 1200×896 unless noted.
const IMG = (name: string) => `/images/sanctus/v2/${name}.webp`

const FEATURES = [
  ['landing.xp.f1Title', 'landing.xp.f1Body'],
  ['landing.xp.f2Title', 'landing.xp.f2Body'],
  ['landing.xp.f3Title', 'landing.xp.f3Body'],
] as const

export default function LandingPage() {
  const { t } = useI18n()
  useDocumentTitle(t('landing.title'))
  const [params] = useSearchParams()
  const example = useExampleHref()
  useSectionScroll(example.settled)
  const sections = resolveLandingSections({ sections: useSiteContent().chrome?.landingSections })
  // Old links sent people to "/?next=…" for the account picker, which now lives at /demo.
  if (params.has('next')) return <Navigate to={`/demo?${params.toString()}`} replace />
  return (
    <div className="min-h-dvh bg-canvas">
      <SiteHeader />
      <main>
        <Hero exampleHref={example.href} />
        {/* The Website Editor's list (ADR-0061): in its order, hidden ones skipped. The hero is always first. */}
        {sections.map((s) => (s.hidden ? null : s.kind === 'builtin' ? <Fragment key={s.id}>{BUILTIN_VIEWS[s.id]}</Fragment> : <OwnSectionView key={s.id} section={s} />))}
      </main>
      <SiteFooter />
    </div>
  )
}

const BUILTIN_VIEWS: Record<BuiltinSectionId, ReactNode> = {
  qr: <LandingQr />,
  how: <HowItWorks />,
  experience: <Experience />,
  collections: <LandingCollections />,
  about: <About />,
  partners: <Partners />,
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

/**
 * The sign-in page's photo panel as a hero (round 2): the editable picture full width under a dark veil, with the eyebrow, the
 * serif headline, the text and the one action in white at the foot. On a phone the picture is tall (about 76% of the screen)
 * and the text sits at the bottom. HeroMedia owns the picture, the veil and the 3D chip; the texts stay here.
 */
function Hero({ exampleHref }: { exampleHref?: string }) {
  const { t } = useI18n()
  return (
    <section aria-labelledby="hero-title" className="relative isolate flex min-h-[max(30rem,76svh)] flex-col overflow-hidden bg-obsidian text-chalk lg:min-h-[calc(100svh-5rem)]">
      <HeroMedia>
        <div className={cn(SECTION, 'pt-28 pb-10 sm:pb-14 lg:pb-20')}>
          <div className="max-w-2xl">
            <Eyebrow onDark>{t('landing.hero.eyebrow')}</Eyebrow>
            <h1 id="hero-title" className="mt-5 font-display text-[clamp(2.5rem,1.7rem+3.1vw,4.25rem)] leading-[1.04] font-light text-chalk">
              <TwoLines a={t('landing.hero.title1')} b={t('landing.hero.title2')} italic />
            </h1>
            {exampleHref && (
              <>
                <ButtonLink to={exampleHref} variant="inverse" size="lg" className="mt-8 w-full sm:w-auto">
                  {t('landing.hero.cta3d')}
                  {arrowIcon}
                </ButtonLink>
                <p className="mt-4 max-w-md text-sm leading-5 text-chalk/80">{t('landing.hero.note')}</p>
              </>
            )}
          </div>
        </div>
      </HeroMedia>
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
      <div className={cn(SECTION, SECTION_Y)}>
        <Eyebrow>{t('landing.how.eyebrow')}</Eyebrow>
        <h2 id="how-title" className="mt-4 text-headline">
          <TwoLines a={t('landing.how.title1')} b={t('landing.how.title2')} />
        </h2>
        <ol className="mt-8 grid gap-x-8 border-t border-line sm:grid-cols-2 lg:mt-14 lg:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="border-b border-line py-6 lg:border-b-0">
              <span className="font-display text-[2rem] leading-none text-accent-ink italic" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-4 text-label text-ink">{t(title)}</h3>
              <p className="mt-3 max-w-sm text-[15px] leading-6 text-ink-muted">{t(body)}</p>
            </li>
          ))}
        </ol>
        <ButtonLink to={APPLY_PATH} variant="primary" size="lg" className="mt-8 w-full sm:mt-10 sm:w-auto">
          {t('site.apply')}
          {arrowIcon}
        </ButtonLink>
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
      <div className={cn(SECTION, SECTION_Y, 'grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-20')}>
        <div>
          <Eyebrow onDark>{t('landing.xp.eyebrow')}</Eyebrow>
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
                  <p className="mt-2 text-sm leading-5 text-chalk/75">{t(body)}</p>
                </div>
              </li>
            ))}
          </ol>
          <ShowcaseCta view={view} className={buttonClasses('inverse', 'lg', 'mt-8 w-full sm:mt-10 sm:w-auto')}>
            {arrowIcon}
          </ShowcaseCta>
        </div>

        <LandingShowcase view={view} loading={loading} />
      </div>
    </section>
  )
}

/** An About photograph: the Owner/Admin's upload with its own description, else the built-in photo with its description. */
function aboutPicture(own: SiteImage | undefined, builtin: { src: string; alt: string }, localized: ReturnType<typeof useI18n>['localized']) {
  const url = own ? siteAssetUrl(own) : ''
  return url ? { src: url, alt: localized(own!.alt) } : builtin
}

function About() {
  const { t, localized } = useI18n()
  const about = useSiteContent().chrome?.landingAbout
  const main = aboutPicture(about?.image, { src: IMG('coffee-table'), alt: t('landing.about.imageAlt') }, localized)
  const detail = aboutPicture(about?.detail, { src: IMG('detail-joinery'), alt: t('landing.about.detailAlt') }, localized)
  return (
    <section id="sobre" className="scroll-mt-24" aria-labelledby="about-title">
      <div className={cn(SECTION, SECTION_Y, 'grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-16')}>
        <div>
          <Eyebrow>{t('landing.about.eyebrow')}</Eyebrow>
          <h2 id="about-title" className="mt-5 text-headline">
            <TwoLines a={t('landing.about.title1')} b={t('landing.about.title2')} />
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-ink-muted sm:mt-6">{t('landing.about.body')}</p>
        </div>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-3 sm:gap-6">
          <img
            src={main.src}
            alt={main.alt}
            width={1200}
            height={896}
            loading="lazy"
            className="row-span-2 aspect-[4/5] size-full border border-line bg-subtle object-cover"
          />
          <img
            src={detail.src}
            alt={detail.alt}
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
    <section id="parcerias" className={cn(SECTION, SECTION_Y, 'scroll-mt-24')} aria-labelledby="biz-title">
      <div className="flex flex-col gap-8 border border-line bg-surface px-6 py-10 sm:px-12 sm:py-14 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
        <div className="max-w-2xl">
          <Eyebrow>{t('landing.biz.eyebrow')}</Eyebrow>
          <h2 id="biz-title" className="mt-4 font-display text-[clamp(1.75rem,1.3rem+1.6vw,2.6rem)] leading-[1.12] font-normal text-ink">
            {t('landing.biz.title')}
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-ink-muted">{t('landing.biz.body')}</p>
        </div>
        <ButtonLink to={APPLY_PATH} variant="primary" size="lg" className="shrink-0 self-stretch sm:self-start lg:self-center">
          {t('site.apply')}
          {arrowIcon}
        </ButtonLink>
      </div>
    </section>
  )
}

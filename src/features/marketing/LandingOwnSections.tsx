// The sections the Owner/Admin adds in the Website Editor (ADR-0061), in three designs that follow the Sanctus rhythm of the rest
// of the landing page: serif headings, the shared eyebrow and Button, pictures contained (except in the banner, which is a
// photograph under a veil like the hero). Hidden sections are skipped by the page, not here.
import { ArrowRight } from 'lucide-react'
import { ButtonLink, buttonClasses } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import type { BannerSection, ImageTextSection, OwnSection, SectionButton, SiteImage, TextSection } from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { siteAssetUrl } from '@/services'
import { SECTION, SECTION_Y } from './landingFrame'

const arrow = <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />

/** The section's button: a site path goes through the router, an https address opens as a normal link. Nothing when the label or link is missing. */
function SectionAction({ button, variant, className }: { button?: SectionButton; variant: 'primary' | 'inverse'; className?: string }) {
  const { localized } = useI18n()
  const label = button ? localized(button.label).trim() : ''
  if (!button || !label || !button.href) return null
  if (button.href.startsWith('/')) {
    return (
      <ButtonLink to={button.href} variant={variant} size="lg" className={className}>
        {label}
        {arrow}
      </ButtonLink>
    )
  }
  return (
    <a href={button.href} rel="noopener noreferrer" className={buttonClasses(variant, 'lg', className)}>
      {label}
      {arrow}
    </a>
  )
}

/** An uploaded picture's address, or '' when it only exists in this browser session or has no path yet. */
const imageSrc = (image: SiteImage): string => (image.path ? siteAssetUrl(image) : '')

const headingId = (id: string) => `section-${id}-title`

function TextBlock({ section }: { section: TextSection }) {
  const { localized } = useI18n()
  const eyebrow = section.eyebrow ? localized(section.eyebrow) : ''
  const subtitle = section.subtitle ? localized(section.subtitle) : ''
  const body = section.body ? localized(section.body) : ''
  return (
    <section id={section.anchor} className="scroll-mt-24" aria-labelledby={headingId(section.id)}>
      <div className={cn(SECTION, SECTION_Y)}>
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          {eyebrow && <Eyebrow className="justify-center">{eyebrow}</Eyebrow>}
          <h2 id={headingId(section.id)} className={cn('text-headline [overflow-wrap:anywhere]', eyebrow && 'mt-4')}>
            {localized(section.title)}
          </h2>
          {subtitle && <p className="mt-4 max-w-2xl font-display text-xl leading-snug text-ink-body italic [overflow-wrap:anywhere] sm:text-2xl">{subtitle}</p>}
          {body && <p className="mt-6 max-w-xl text-base leading-7 whitespace-pre-line text-ink-muted [overflow-wrap:anywhere]">{body}</p>}
          <SectionAction button={section.button} variant="primary" className="mt-8 w-full sm:mt-10 sm:w-auto" />
        </div>
      </div>
    </section>
  )
}

function ImageTextBlock({ section }: { section: ImageTextSection }) {
  const { localized } = useI18n()
  const eyebrow = section.eyebrow ? localized(section.eyebrow) : ''
  const body = section.body ? localized(section.body) : ''
  const src = imageSrc(section.image)
  return (
    <section id={section.anchor} className="scroll-mt-24" aria-labelledby={headingId(section.id)}>
      <div className={cn(SECTION, SECTION_Y, 'grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16')}>
        {src && (
          <img
            src={src}
            alt={localized(section.image.alt)}
            loading="lazy"
            className={cn('aspect-[4/3] w-full border border-line bg-subtle object-contain', section.imageSide === 'right' && 'lg:order-last')}
          />
        )}
        <div className={cn('min-w-0', !src && 'lg:col-span-2 lg:mx-auto lg:max-w-2xl')}>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h2 id={headingId(section.id)} className={cn('text-headline [overflow-wrap:anywhere]', eyebrow && 'mt-4')}>
            {localized(section.title)}
          </h2>
          {body && <p className="mt-5 max-w-md text-base leading-7 whitespace-pre-line text-ink-muted [overflow-wrap:anywhere] sm:mt-6">{body}</p>}
          <SectionAction button={section.button} variant="primary" className="mt-8 w-full sm:mt-10 sm:w-auto" />
        </div>
      </div>
    </section>
  )
}

/** A full-width picture under the hero's soft dark veil with white text at the foot. */
function BannerBlock({ section }: { section: BannerSection }) {
  const { localized } = useI18n()
  const title = section.title ? localized(section.title) : ''
  const body = section.body ? localized(section.body) : ''
  const src = imageSrc(section.image)
  const hasText = !!(title || body || section.button)
  return (
    <section
      id={section.anchor}
      className="relative isolate flex min-h-[22rem] scroll-mt-24 flex-col justify-end overflow-hidden bg-obsidian text-chalk sm:min-h-[28rem] lg:min-h-[32rem]"
      aria-labelledby={title ? headingId(section.id) : undefined}
      aria-label={title ? undefined : localized(section.image.alt) || undefined}
    >
      {src && <img src={src} alt={title ? '' : localized(section.image.alt)} loading="lazy" className="absolute inset-0 -z-10 size-full object-cover" />}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute inset-0 bg-obsidian/35" />
        {hasText && <div className="absolute inset-x-0 bottom-0 h-[80%] bg-linear-to-t from-obsidian/85 via-obsidian/45 to-transparent" />}
      </div>
      {hasText && (
        <div className={cn(SECTION, 'w-full pt-28 pb-10 sm:pb-14 lg:pb-20')}>
          <div className="max-w-2xl">
            {title && (
              <h2 id={headingId(section.id)} className="font-display text-[clamp(2rem,1.4rem+2.4vw,3.5rem)] leading-[1.06] font-light text-chalk [overflow-wrap:anywhere]">
                {title}
              </h2>
            )}
            {body && <p className={cn('max-w-md text-base leading-7 whitespace-pre-line text-chalk/90 [overflow-wrap:anywhere]', title && 'mt-5 sm:mt-6')}>{body}</p>}
            <SectionAction button={section.button} variant="inverse" className="mt-8 w-full sm:w-auto" />
          </div>
        </div>
      )}
    </section>
  )
}

export function OwnSectionView({ section }: { section: OwnSection }) {
  switch (section.kind) {
    case 'text':
      return <TextBlock section={section} />
    case 'imageText':
      return <ImageTextBlock section={section} />
    case 'banner':
      return <BannerBlock section={section} />
  }
}

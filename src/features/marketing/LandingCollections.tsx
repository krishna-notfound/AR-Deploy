import { ArrowRight } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { Link } from 'react-router'
import { Eyebrow } from '@/components/ui/Eyebrow'
import type { LandingCollection, LandingCollectionLink } from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { imageFrame } from '@/lib/imageFrames'
import { collectionPath } from '@/lib/urls'
import { BUILTIN_COLLECTIONS } from './landingBuiltin'
import { collectionImage, landingImage } from './landingImages'
import { useSiteContent } from './SiteContentProvider'

// The landing page's Collections section (ADR-0046). The cards come from the Website Editor when it has published some;
// until then, and while the content loads, the built-in four show, so the page never jumps and looks the same as before the
// first publish. Each card is one link to its own collection page (photo and title together); a card with no link is plain.

const SECTION = 'mx-auto max-w-[1320px] px-5 sm:px-10'

/** A card ready to draw: texts in the page language, a photo, and where it leads (none: not a link). */
export interface CardView {
  id: string
  title: string
  text?: string
  image: string
  focus?: string
  /** An uploaded picture (cropped to the frame, shown whole in it); the built-in photos keep filling the frame. */
  uploaded?: boolean
  href?: string
}

const FRAME = imageFrame('collection')

/**
 * Where an Editor card leads (ADR-0047): always to its own collection page. The old link kinds (catalogue, product, apply)
 * are ignored; a card set to "none", or one without a slug, is plain.
 */
export function hrefOf(link: LandingCollectionLink, slug?: string): string | undefined {
  return link.kind === 'none' || !slug ? undefined : collectionPath(slug)
}

/** The built-in cards: each opens its own collection page (/collections/sofas, ...), never a business catalogue. */
function builtinCards(t: ReturnType<typeof useI18n>['t']): CardView[] {
  return BUILTIN_COLLECTIONS.map((c) => {
    const img = landingImage(c.image)
    return { id: c.key, title: t(`landing.col.${c.key}`), text: t(`landing.col.${c.key}Body`), image: img?.src ?? '', focus: img?.focus, href: collectionPath(c.key) }
  })
}

/** The Editor's cards that are shown: hidden ones are skipped, the language falls back to English. */
function editorCards(list: LandingCollection[], localized: ReturnType<typeof useI18n>['localized']): CardView[] {
  return list
    .filter((c) => !c.hidden)
    .flatMap((c) => {
      const img = collectionImage(c.image)
      if (!img) return [] // an unknown photo key is never published (the database refuses it); skip rather than show a broken card
      return [{ id: c.id, title: localized(c.title), text: c.text ? localized(c.text) || undefined : undefined, image: img.src, focus: img.focus, ...(img.uploaded ? { uploaded: true } : {}), href: hrefOf(c.link, c.slug) }]
    })
}

/** How many columns a row has on a wide screen, so a few cards fill the width and eight make two even rows. */
const COLUMNS: Record<number, string> = {
  1: 'lg:grid-cols-1 lg:max-w-sm',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-3',
  6: 'lg:grid-cols-3',
  7: 'lg:grid-cols-4',
  8: 'lg:grid-cols-4',
}

export function LandingCollections() {
  const { t, lang, localized } = useI18n()
  const { chrome } = useSiteContent()
  const published = chrome?.landingCollections ?? []
  const cards = useMemo(
    () => (published.length > 0 ? editorCards(published, localized) : builtinCards(t)),
    // `localized` and `t` change with the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [published, lang],
  )

  return (
    <section id="colecoes" className="scroll-mt-24" aria-labelledby="col-title">
      <div className={cn(SECTION, 'py-16 sm:py-20 lg:py-28')}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:items-end lg:gap-14">
          <div>
            <Eyebrow>{t('landing.col.eyebrow')}</Eyebrow>
            <h2 id="col-title" className="mt-4 text-headline">
              <span className="block">{t('landing.col.title1')}</span> <span className="block">{t('landing.col.title2')}</span>
            </h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-ink-muted">{t('landing.col.body')}</p>
        </div>
        <hr className="mt-8 border-line lg:mt-14" />
        {cards.length > 0 && (
          <ul className={cn('mt-8 grid gap-3 sm:gap-6 lg:mt-14', cards.length === 1 ? 'grid-cols-1' : 'grid-cols-2', COLUMNS[cards.length] ?? 'lg:grid-cols-4')}>
            {cards.map((c) => (
              <li key={c.id} className="flex">
                <Card card={c} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

const CARD = 'group/card flex w-full flex-col border border-line bg-surface p-2.5 sm:p-4'

/** The whole card is the link (photo, title and text), with a visible focus ring and a small lift on hover. */
function Card({ card }: { card: CardView }) {
  const { t } = useI18n()
  const body: ReactNode = (
    <>
      <img src={card.image} alt="" width={1200} height={896} loading="lazy" className={cn('w-full bg-subtle', FRAME.aspectClass, card.uploaded ? FRAME.fitClass : 'object-cover', card.focus)} />
      <h3 className="mt-4 font-display text-[1.375rem] leading-tight font-normal text-ink sm:mt-5 sm:text-[1.625rem]">{card.title}</h3>
      {card.text && <p className="mt-1.5 text-sm leading-5 text-ink-muted">{card.text}</p>}
      {card.href && (
        <span aria-hidden className="mt-auto flex items-center gap-2 pt-5 text-label uppercase text-ink">
          {t('landing.col.view')}
          <ArrowRight className="size-3.5 transition-transform group-hover/card:translate-x-0.5" strokeWidth={1.5} />
        </span>
      )}
    </>
  )
  if (!card.href) return <div className={CARD}>{body}</div>
  return (
    <Link
      to={card.href}
      className={cn(
        CARD,
        'transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-line-strong hover:shadow-[var(--shadow-card)] motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-ink',
      )}
    >
      {body}
    </Link>
  )
}

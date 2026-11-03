import { ArrowRight } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { Link } from 'react-router'
import { arrowLinkClasses } from '@/components/ui/Button'
import type { LandingCollection, LandingCollectionLink } from '@/domain/siteContent'
import type { Category } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { primaryImage } from '@/lib/product'
import { APPLY_PATH, catalogLocalPath, productLocalPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { TAP_TARGET } from '../public/tapTarget'
import { BUILTIN_COLLECTIONS } from './landingBuiltin'
import { landingImage } from './landingImages'
import { useSiteContent } from './SiteContentProvider'

// The landing page's Collections section (ADR-0046). The cards come from the Website Editor when it has published some;
// until then, and while the content loads, the built-in four show, so the page never jumps and looks the same as before the
// first publish. Each card is one link (photo and title together); a card with no link is plain.

const SECTION = 'mx-auto max-w-[1320px] px-5 sm:px-10'

/** A card ready to draw: texts in the page language, a photo, and where it leads (none: not a link). */
export interface CardView {
  id: string
  title: string
  text?: string
  image: string
  focus?: string
  href?: string
}

/** What the page knows about the live catalogues, to point the cards at pages that exist. */
export interface Targets {
  /** False until the catalogues and products have loaded: links are then trusted as they are. */
  settled: boolean
  /** Slugs of active businesses that have a catalogue. */
  businesses: ReadonlySet<string>
  /** `<business slug>/<product slug>` of published products of active businesses. */
  products: ReadonlySet<string>
  /** The first catalogue and, per category, the first catalogue that has a published product of it. */
  firstCatalog?: string
  byCategory: ReadonlyMap<Category, string>
}

/** Published products and active catalogues, loaded once for the section. */
function useTargets(): Targets {
  const products = useServiceQuery(() => service.getProducts({ status: 'published' }), [])
  // Businesses, not getCatalogs(): the catalogue counts view is staff-only, so visitors got a 401 and no links at all.
  const catalogs = useServiceQuery(() => service.getBusinesses(), [])
  return useMemo(() => {
    const active = new Map((catalogs.data ?? []).filter((b) => b.status === 'active').map((b) => [b.id, b]))
    const items = (products.data ?? [])
      .filter((p) => active.has(p.businessId) && primaryImage(p))
      .map((p) => ({ product: p, business: active.get(p.businessId)! }))
      .sort((a, b) => a.business.name.localeCompare(b.business.name) || a.product.name.en.localeCompare(b.product.name.en))
    const byCategory = new Map<Category, string>()
    for (const i of items) if (!byCategory.has(i.product.category)) byCategory.set(i.product.category, i.business.slug)
    const names = [...active.values()].sort((a, b) => a.name.localeCompare(b.name))
    return {
      settled: products.status !== 'loading' && catalogs.status !== 'loading',
      businesses: new Set(names.map((b) => b.slug)),
      products: new Set(items.map((i) => `${i.business.slug}/${i.product.slug}`)),
      firstCatalog: items[0]?.business.slug,
      byCategory,
    }
  }, [products.data, products.status, catalogs.data, catalogs.status])
}

/** The address of an Editor card's link. A link to a product or catalogue that is gone (once the lists have loaded) is dropped, so a card never leads to an error page. */
export function hrefOf(link: LandingCollectionLink, targets: Targets): string | undefined {
  switch (link.kind) {
    case 'apply':
      return APPLY_PATH
    case 'product':
      return !targets.settled || targets.products.has(`${link.businessSlug}/${link.productSlug}`) ? productLocalPath({ slug: link.businessSlug }, { slug: link.productSlug }) : undefined
    case 'catalog':
      return !targets.settled || targets.businesses.has(link.businessSlug) ? catalogLocalPath({ slug: link.businessSlug }, { category: link.category }) : undefined
    default:
      return undefined
  }
}

/** The built-in cards: the category's catalogue when one has it, else the first catalogue unfiltered, else no link. */
function builtinCards(t: ReturnType<typeof useI18n>['t'], targets: Targets): CardView[] {
  return BUILTIN_COLLECTIONS.map((c) => {
    const withCategory = targets.byCategory.get(c.category)
    const href = withCategory ? catalogLocalPath({ slug: withCategory }, { category: c.category }) : targets.firstCatalog ? catalogLocalPath({ slug: targets.firstCatalog }) : undefined
    const img = landingImage(c.image)
    return { id: c.key, title: t(`landing.col.${c.key}`), text: t(`landing.col.${c.key}Body`), image: img?.src ?? '', focus: img?.focus, href }
  })
}

/** The Editor's cards that are shown: hidden ones are skipped, the language falls back to English. */
function editorCards(list: LandingCollection[], localized: ReturnType<typeof useI18n>['localized'], targets: Targets): CardView[] {
  return list
    .filter((c) => !c.hidden)
    .flatMap((c) => {
      const img = landingImage(c.image)
      if (!img) return [] // an unknown photo key is never published (the database refuses it); skip rather than show a broken card
      return [{ id: c.id, title: localized(c.title), text: c.text ? localized(c.text) || undefined : undefined, image: img.src, focus: img.focus, href: hrefOf(c.link, targets) }]
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
  const targets = useTargets()
  const published = chrome?.landingCollections ?? []
  const cards = useMemo(
    () => (published.length > 0 ? editorCards(published, localized, targets) : builtinCards(t, targets)),
    // `localized` and `t` change with the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [published, targets, lang],
  )

  return (
    <section id="colecoes" className="scroll-mt-24" aria-labelledby="col-title">
      <div className={cn(SECTION, 'py-20 lg:py-28')}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] lg:items-end lg:gap-14">
          <div>
            <p className="text-eyebrow text-accent-ink">{t('landing.col.eyebrow')}</p>
            <h2 id="col-title" className="mt-4 text-headline">
              <span className="block">{t('landing.col.title1')}</span> <span className="block">{t('landing.col.title2')}</span>
            </h2>
          </div>
          <p className="max-w-xl text-[15px] leading-7 text-ink-muted">{t('landing.col.body')}</p>
          {targets.firstCatalog && (
            <Link to={catalogLocalPath({ slug: targets.firstCatalog })} className={cn(arrowLinkClasses, TAP_TARGET, 'justify-self-start text-ink lg:justify-self-end')}>
              {t('landing.col.all')}
              <ArrowRight className="size-3.5 transition-transform group-hover/arrow:translate-x-0.5" strokeWidth={1.5} aria-hidden />
            </Link>
          )}
        </div>
        <hr className="mt-10 border-line lg:mt-14" />
        {cards.length > 0 && (
          <ul className={cn('mt-10 grid gap-3 sm:gap-6 lg:mt-14', cards.length === 1 ? 'grid-cols-1' : 'grid-cols-2', COLUMNS[cards.length] ?? 'lg:grid-cols-4')}>
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
      <img src={card.image} alt="" width={1200} height={896} loading="lazy" className={cn('aspect-[4/5] w-full bg-subtle object-cover', card.focus)} />
      <h3 className="mt-4 font-display text-[1.375rem] leading-tight font-normal text-ink sm:mt-5 sm:text-[1.625rem]">{card.title}</h3>
      {card.text && <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">{card.text}</p>}
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

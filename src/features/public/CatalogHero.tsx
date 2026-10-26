import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { Skeleton } from '@/components/ui/Skeleton'
import { SmartImage } from '@/components/ui/SmartImage'
import type { Business, Product } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { initialPrice, primaryImage } from '@/lib/product'
import { Reveal } from './Reveal'

/**
 * Catalogue hero (ADR-0036 v2): the business name as a monument with its description and the real counts on the left,
 * the featured piece's photo on the right with a pill linking to it. Phones: name and text first, then the photo.
 * `counts` and `featured` exist only once the products have loaded; `loading` shows a photo placeholder meanwhile.
 */
export function CatalogHero({
  business: b,
  counts,
  featured,
  featuredHref,
  loading,
}: {
  business: Business
  counts?: { pieces: number; with3d: number }
  featured?: Product
  featuredHref?: string
  loading: boolean
}) {
  const { t, lang, localized } = useI18n()
  const hasPhoto = loading || !!featured
  return (
    <section className={cn('mx-auto grid max-w-[1320px] gap-8 px-5 pt-6 pb-8 sm:px-10 sm:pt-12 sm:pb-12 lg:gap-16', hasPhoto && 'lg:grid-cols-2')}>
      <div className="flex min-w-0 flex-col">
        <Reveal as="h1" className="font-display text-monument font-normal break-words text-ink">
          {b.name}
        </Reveal>
        {b.description && (
          <Reveal as="p" delay={1} className="mt-5 max-w-xl text-body-public text-ink sm:mt-8 sm:text-[19px] sm:leading-[1.6]">
            {b.description}
          </Reveal>
        )}
        {/* Only a loaded list has a count: "0 pieces" while loading or after a failure reads as an empty catalogue. */}
        {counts && (
          <Reveal delay={1} className="mt-6 lg:mt-auto lg:pt-10">
            <p className="inline-flex flex-wrap items-center gap-x-2 rounded-full bg-subtle px-4 py-2 text-[14px] leading-5 text-ink tabular-nums sm:text-[15px]">
              <span>{counts.pieces === 1 ? t('catalog.piecesOne') : t('catalog.pieces', { count: counts.pieces })}</span>
              {counts.with3d > 0 && (
                <>
                  <span aria-hidden className="text-ink-faint">
                    ·
                  </span>
                  <span>{t('catalog.in3d', { count: counts.with3d })}</span>
                </>
              )}
            </p>
          </Reveal>
        )}
      </div>
      {hasPhoto && (
        <Reveal delay={2} className="min-w-0">
          {featured && featuredHref ? (
            <Link to={featuredHref} className="group relative block overflow-hidden rounded-soft-sm focus-visible:outline-offset-4 sm:rounded-soft">
              <SmartImage
                src={primaryImage(featured)?.url}
                alt=""
                className="aspect-[4/3] w-full motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-[1.03] lg:aspect-[6/5]"
              />
              <span className="absolute bottom-4 left-4 inline-flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-canvas px-4 py-2 text-[14px] leading-5 text-ink sm:bottom-6 sm:left-6 sm:text-[15px]">
                <span className="truncate">{localized(featured.name)}</span>
                <span aria-hidden className="text-ink-faint">
                  ·
                </span>
                <span className="shrink-0 tabular-nums">{formatMoney(initialPrice(featured), featured.currency, lang)}</span>
                <ArrowRight className="size-4 shrink-0 motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5" strokeWidth={1.5} aria-hidden />
              </span>
            </Link>
          ) : (
            <Skeleton className="aspect-[4/3] w-full rounded-soft-sm sm:rounded-soft lg:aspect-[6/5]" />
          )}
        </Reveal>
      )}
    </section>
  )
}

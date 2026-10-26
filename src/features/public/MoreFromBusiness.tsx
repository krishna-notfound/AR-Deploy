import { ArrowRight, Box } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { SmartImage } from '@/components/ui/SmartImage'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Business, Product } from '@/domain/types'
import { hasAny3d } from '@/features/ar/variantMedia'
import { LocalizedSpan, useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { initialPrice, primaryImage } from '@/lib/product'
import { service } from '@/services'
import { MEDIA_URL_TTL_SECONDS } from '@/services/catalogService'
import { useRefreshWhenStale, useServiceQuery } from '@/services/hooks'
import { Reveal } from './Reveal'

const MAX = 4
/** Signed photo URLs last MEDIA_URL_TTL_SECONDS; refetch on return to the tab once half of that has passed. */
const MEDIA_REFRESH_MS = (MEDIA_URL_TTL_SECONDS * 1000) / 2
const GRID = 'grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-4'

/**
 * "More from <business>" (ADR-0036 v2): up to four other published pieces of the same business, from the same service
 * call as the catalogue, and a pill to the whole catalogue. Placeholders while loading; the section stays hidden when
 * there is nothing else to show or the list could not be loaded (the page itself is complete without it).
 */
export function MoreFromBusiness({
  business,
  currentId,
  catalogHref,
  productHref,
  className,
}: {
  business: Business
  currentId: string
  catalogHref: string
  productHref: (p: Product) => string
  className?: string
}) {
  const { t, lang, localized } = useI18n()
  const res = useServiceQuery(() => service.getProducts({ businessId: business.id, status: 'published' }), [business.id])
  useRefreshWhenStale(res.refetch, MEDIA_REFRESH_MS, res.data)
  const all = res.data
  const others = useMemo(
    () =>
      (all ?? [])
        .filter((p) => p.id !== currentId)
        .sort((a, b) => localized(a.name).localeCompare(localized(b.name), lang))
        .slice(0, MAX),
    [all, currentId, localized, lang],
  )

  if (res.status === 'error' && !all) return null
  const loading = !all
  if (!loading && !others.length) return null
  const count = all?.length ?? 0

  return (
    <section aria-labelledby="more-from-h" className={className}>
      <Reveal className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <h2 id="more-from-h" className="font-display text-[2rem] leading-tight font-normal break-words text-ink sm:text-[2.5rem]">
          {t('product.moreFrom', { business: business.name })}
        </h2>
        {!loading && (
          <Link
            to={catalogHref}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-subtle px-5 text-[15px] font-medium text-ink transition-[background-color,transform] hover:bg-line/70 motion-safe:duration-200 motion-safe:active:scale-[0.98]"
          >
            {count > 1 ? t('product.viewAllPieces', { n: count }) : t('product.viewCatalog')}
            <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />
          </Link>
        )}
      </Reveal>
      {loading ? (
        <div className={cn(GRID, 'mt-6 sm:mt-8')} role="status" aria-label={t('common.loading')}>
          {Array.from({ length: MAX }, (_, i) => (
            <div key={i}>
              <Skeleton className="aspect-[4/5] w-full rounded-soft-sm sm:rounded-soft" />
              <Skeleton className="mt-4 h-6 w-2/3" />
              <Skeleton className="mt-2 h-4 w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <ul className={cn(GRID, 'mt-6 sm:mt-8')}>
          {others.map((p, i) => (
            <Reveal as="li" key={p.id} delay={i === 0 ? 1 : 2}>
              <Link to={productHref(p)} className="group block rounded-soft-sm focus-visible:outline-offset-4 sm:rounded-soft">
                <div className="relative overflow-hidden rounded-soft-sm bg-subtle sm:rounded-soft">
                  <SmartImage
                    src={primaryImage(p)?.url}
                    alt={localized(p.name)}
                    className="aspect-[4/5] w-full motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-[1.03]"
                  />
                  {hasAny3d(p) && (
                    <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-[12px] leading-4 font-medium text-ink sm:top-3.5 sm:right-3.5 sm:text-[13px]">
                      <Box className="size-3.5" strokeWidth={1.5} aria-hidden />
                      {t('product.moreHas3d')}
                    </span>
                  )}
                </div>
                <LocalizedSpan as="h3" text={p.name} className="mt-3 block font-display text-piece-card font-normal break-words text-ink sm:mt-4" />
                <p className="mt-1 text-[15px] leading-5 font-medium text-ink tabular-nums">{formatMoney(initialPrice(p), p.currency, lang)}</p>
              </Link>
            </Reveal>
          ))}
        </ul>
      )}
    </section>
  )
}

import { Link } from 'react-router'
import { SmartImage } from '@/components/ui/SmartImage'
import type { Business, Product, ProductAnalytics } from '@/domain/types'
import { formatMoney, formatNumber } from '@/lib/format'
import { primaryImage } from '@/lib/product'
import { hasArModel } from '../products/productReadiness'

/** Stored AR launch attempts for a product, or null when it has no 3D model and none were recorded (shown as "No 3D"). */
export function arAttempts(p: Product | undefined, r: ProductAnalytics): number | null {
  return !r.arActivations && p && !hasArModel(p) ? null : r.arActivations
}

/** Product page and embed views together. */
export const allViews = (r: Pick<ProductAnalytics, 'views' | 'embedViews'>) => r.views + r.embedViews

/** The AR rate as dashboards show it (R-W5-3): "0.12 AR launches per view". Never a percentage. */
export function formatArRate(rate: number): string {
  return `${rate.toFixed(2)} AR launches per view`
}

/** The rows "Most viewed" shows: existing products with at least one page or embed view, most viewed first (R-W5-7). */
export function mostViewed(rows: ProductAnalytics[], products: Map<string, Product>, limit = 5): ProductAnalytics[] {
  return rows.filter((r) => products.has(r.productId) && allViews(r) > 0).slice(0, limit)
}

const NAME_CLASS = 'block truncate text-ui-body font-medium text-ink max-sm:whitespace-normal max-sm:[overflow-wrap:anywhere]'

/**
 * Ranked list of the most viewed products (index, thumbnail, name, views and AR launch attempts). Shared by both
 * overviews and the analytics page; rows must already be sorted by views and limited by the caller (`mostViewed`).
 * Products without a page or embed view are never listed.
 */
export function MostViewedList({
  rows,
  products,
  businesses,
  editBase,
}: {
  rows: ProductAnalytics[]
  products: Map<string, Product>
  /** Pass to show the business name under each product (platform-wide lists). */
  businesses?: Map<string, Business>
  /** Where the name links to edit the product; without it the name is plain text (no products.edit, R-W5-1). */
  editBase?: string
}) {
  return (
    <ol className="divide-y divide-line">
      {rows
        .filter((r) => allViews(r) > 0)
        .map((r, i) => {
          const p = products.get(r.productId)
          if (!p) return null
          const attempts = arAttempts(p, r)
          const businessName = businesses?.get(p.businessId)?.name
          const price = Number.isFinite(p.price) ? formatMoney(p.price, p.currency) : null
          return (
            <li key={r.productId} className="grid grid-cols-[1.25rem_auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
              <span className="text-ui-body text-ink-muted tabular-nums" aria-hidden>
                {i + 1}
              </span>
              <SmartImage src={primaryImage(p)?.url} alt="" className="size-11 shrink-0 border border-line" />
              <div className="min-w-0">
                {editBase ? (
                  <Link to={`${editBase}/${p.id}/edit`} className={`${NAME_CLASS} hover:underline`}>
                    {p.name.en}
                  </Link>
                ) : (
                  <p className={NAME_CLASS}>{p.name.en}</p>
                )}
                <p className="flex min-w-0 text-ui-small text-ink-muted" title={[businessName, price].filter(Boolean).join(' · ')}>
                  {businessName && <span className="truncate">{businessName}</span>}
                  {businessName && price && (
                    <span className="shrink-0 whitespace-pre" aria-hidden>
                      {' · '}
                    </span>
                  )}
                  {price && <span className="shrink-0 tabular-nums">{price}</span>}
                </p>
              </div>
              <p className="text-right text-ui-small text-ink-muted tabular-nums">
                <span className="block text-ui-body font-medium text-ink">{formatNumber(allViews(r))} views</span>
                {attempts === null ? 'No 3D model' : `${formatNumber(attempts)} AR attempts`}
              </p>
            </li>
          )
        })}
    </ol>
  )
}

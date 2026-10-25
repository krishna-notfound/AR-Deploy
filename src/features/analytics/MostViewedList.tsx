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

/**
 * Ranked list of the most viewed products (index, thumbnail, name, views and AR launch attempts). Shared by both
 * overviews and the analytics page; rows must already be sorted by views and limited by the caller.
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
  editBase: string
}) {
  return (
    <ol className="divide-y divide-line">
      {rows.map((r, i) => {
        const p = products.get(r.productId)
        if (!p) return null
        const attempts = arAttempts(p, r)
        const sub = [businesses?.get(p.businessId)?.name, formatMoney(p.price, p.currency)].filter(Boolean).join(' · ')
        return (
          <li key={r.productId} className="grid grid-cols-[1.25rem_auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
            <span className="text-ui-body text-ink-muted tabular-nums" aria-hidden>
              {i + 1}
            </span>
            <SmartImage src={primaryImage(p)?.url} alt="" className="size-11 shrink-0 border border-line" />
            <div className="min-w-0">
              <Link to={`${editBase}/${p.id}/edit`} className="block truncate text-ui-body font-medium text-ink hover:underline max-sm:whitespace-normal max-sm:[overflow-wrap:anywhere]">
                {p.name.en}
              </Link>
              <p className="truncate text-ui-small text-ink-muted">{sub}</p>
            </div>
            <p className="text-right text-ui-small text-ink-muted tabular-nums">
              <span className="block text-ui-body font-medium text-ink">{formatNumber(r.views)} views</span>
              {attempts === null ? 'No 3D model' : `${formatNumber(attempts)} AR attempts`}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

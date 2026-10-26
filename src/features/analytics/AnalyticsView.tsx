import { BarChart3 } from 'lucide-react'
import { useId, useMemo } from 'react'
import { Link } from 'react-router'
import { ActivityTrend } from '@/components/charts/ActivityTrend'
import { SERIES, dayLabel } from '@/components/charts/Charts'
import { PanelHeader } from '@/components/layout/PageHeader'
import { SampleDataTag } from '@/components/ui/Badge'
import { Card, CardBody } from '@/components/ui/Card'
import { type Column, DataTable } from '@/components/ui/DataTable'
import { Select } from '@/components/ui/Form'
import { Thumb } from '@/components/ui/SmartImage'
import { StatGroup } from '@/components/ui/StatGroup'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Business, Product, ProductAnalytics } from '@/domain/types'
import { formatNumber } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { service } from '@/services'
import { EMBED_VIEWS_SINCE } from '@/services/analytics'
import { useServiceQuery } from '@/services/hooks'
import { primaryImage } from '@/lib/product'
import { MostViewedList, allViews, arAttempts, formatArRate, mostViewed } from './MostViewedList'

/** A figure that does not exist (yet): a grey dash at hint size, not a word in the 28px value slot (BRIEF section 4). */
const MISSING = <span className="text-ui-small font-normal text-ink-muted">—</span>

/** Row key of the one "Deleted product" row: the history of products that were deleted (R-W5-4). */
const DELETED = 'deleted-products'

/**
 * Shared analytics: product views and AR launch attempts only (design/16).
 * With businessId it is scoped to one business; otherwise platform-wide with an optional filter.
 */
export function AnalyticsView({
  businessId,
  businesses,
  onBusinessChange,
  editBase,
}: {
  businessId?: string
  businesses?: Business[]
  onBusinessChange?: (id: string) => void
  editBase: string
}) {
  const selectId = useId()
  const prefs = usePreferences()
  // Days are the person's local days (R-W5-2); without preferences the service uses this device's zone.
  const timeZone = prefs?.timezone
  const summary = useServiceQuery(
    () => (businessId ? service.getBusinessAnalytics(businessId, { timeZone }) : service.getAnalytics({ timeZone })),
    [businessId, timeZone],
  )
  const products = useServiceQuery(() => service.getProducts(businessId ? { businessId } : {}), [businessId])
  const productMap = useMemo(() => new Map<string, Product>((products.data ?? []).map((p) => [p.id, p])), [products.data])
  const bizMap = useMemo(() => new Map<string, Business>((businesses ?? []).map((b) => [b.id, b])), [businesses])
  const s = summary.data
  const loading = summary.status === 'loading' && !s
  // Product rows need product names; without them every row would be filtered out as "no products".
  const productsLoading = products.status === 'loading' && !products.data

  if (summary.status === 'error' && !s) return <ErrorState message={summary.error.message} onRetry={summary.refetch} />
  if (products.status === 'error' && !products.data) return <ErrorState message={products.error.message} onRetry={products.refetch} />

  const gone = s?.deletedProducts
  const rows: ProductAnalytics[] = [
    ...(s?.byProduct ?? []).filter((r) => productMap.has(r.productId)),
    ...(gone ? [{ productId: DELETED, businessId: businessId ?? '', ...gone, arRate: allViews(gone) ? gone.arActivations / allViews(gone) : 0 }] : []),
  ]
  const top = mostViewed(s?.byProduct ?? [], productMap)
  const showBusinessCol = !!businesses && !businessId
  const totalViews = s ? s.totals.views + s.totals.embedViews : 0
  // Rows from before embed_view existed can't be split: say so while the window still reaches back before it.
  const embedNote = s && s.series.length > 0 && s.series[0]!.date < EMBED_VIEWS_SINCE ? `Embed loads before ${dayLabel(EMBED_VIEWS_SINCE, prefs)} are counted as page views.` : null

  const columns: Column<ProductAnalytics>[] = [
    {
      key: 'product',
      header: 'Product',
      sortValue: (r) => productMap.get(r.productId)?.name.en ?? '',
      cell: (r) => {
        if (r.productId === DELETED) return <span className="text-ink-muted">Deleted product</span>
        const p = productMap.get(r.productId)
        return (
          <div className="flex items-center gap-3">
            <Thumb src={p ? primaryImage(p)?.url : undefined} alt="" size="sm" />
            <Link to={`${editBase}/${r.productId}/edit`} className="font-medium hover:underline">
              {p?.name.en}
            </Link>
          </div>
        )
      },
    },
    ...(showBusinessCol
      ? [{ key: 'business', header: 'Business', sortValue: (r: ProductAnalytics) => bizMap.get(r.businessId)?.name ?? '', className: 'max-w-[240px]', cell: (r: ProductAnalytics) => <span className="block truncate text-ink-muted" title={bizMap.get(r.businessId)?.name}>{bizMap.get(r.businessId)?.name}</span> } satisfies Column<ProductAnalytics>]
      : []),
    { key: 'views', header: 'Product page views', align: 'right', sortValue: (r) => r.views, cell: (r) => formatNumber(r.views) },
    { key: 'embedViews', header: 'Embed views', align: 'right', sortValue: (r) => r.embedViews, cell: (r) => formatNumber(r.embedViews) },
    {
      key: 'ar',
      header: 'AR launch attempts',
      align: 'right',
      sortValue: (r) => arAttempts(productMap.get(r.productId), r) ?? -1,
      cell: (r) => {
        const n = arAttempts(productMap.get(r.productId), r)
        return n === null ? <span className="text-ink-faint">No 3D</span> : formatNumber(n)
      },
    },
    {
      key: 'rate',
      header: 'AR rate',
      align: 'right',
      className: 'whitespace-nowrap',
      sortValue: (r) => (arAttempts(productMap.get(r.productId), r) === null ? -1 : r.arRate),
      cell: (r) => (arAttempts(productMap.get(r.productId), r) === null ? <span className="text-ink-faint">No 3D</span> : allViews(r) ? formatArRate(r.arRate) : 'No views'),
    },
  ]

  return (
    <div className="space-y-6">
      {businesses && onBusinessChange && (
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <div className="w-full sm:w-64">
            <label htmlFor={selectId} className="mb-1.5 block text-ui-body font-medium text-ink">
              Business
            </label>
            <Select id={selectId} value={businessId ?? ''} onChange={(e) => onBusinessChange(e.target.value)} className="w-full">
              <option value="">All businesses</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex min-h-10 flex-wrap items-center gap-2">
            {s?.isSample && <SampleDataTag />}
            <span className="text-ui-small text-ink-muted">Last 30 days.{s?.isSample ? ' Includes visits and AR taps you make in this demo.' : ''}</span>
          </div>
        </div>
      )}

      <StatGroup
        loading={loading}
        stats={[
          { label: 'Product page views', value: formatNumber(s?.totals.views ?? 0), hint: 'Last 30 days' },
          { label: 'Embed views', value: formatNumber(s?.totals.embedViews ?? 0), hint: 'Product embeds on other websites' },
          { label: 'AR launch attempts', value: formatNumber(s?.totals.arActivations ?? 0), hint: 'Last 30 days' },
          // The seeded sample data has no 3D interactions: "0" next to thousands of views would read as broken tracking.
          s?.isSample && !s.totals.modelInteractions
            ? { label: '3D interactions', value: MISSING, hint: 'Not recorded in the sample data' }
            : { label: '3D interactions', value: formatNumber(s?.totals.modelInteractions ?? 0), hint: 'Times a visitor turned or zoomed a 3D model' },
          s && !totalViews
            ? { label: 'AR launch rate', value: MISSING, hint: 'No views yet' }
            : {
                label: 'AR launch rate',
                value: (
                  <>
                    {(s ? s.totals.arActivations / totalViews : 0).toFixed(2)}
                    <span className="mt-0.5 block text-ui-small font-normal tracking-normal text-ink-muted"> AR launches per view</span>
                  </>
                ),
                hint: 'Over page and embed views, last 30 days',
              },
          { label: 'Published products', value: formatNumber(s?.totals.published ?? 0), hint: 'Current' },
        ]}
        footer={
          (s?.isSample && !onBusinessChange) || embedNote ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {s?.isSample && !onBusinessChange && (
                <>
                  <SampleDataTag /> Includes seeded sample data. Not live production analytics.
                </>
              )}
              {embedNote && <span>{embedNote}</span>}
            </span>
          ) : undefined
        }
      />

      <Card>
        <PanelHeader title="Views and AR launch attempts" description="Daily totals of page and embed views, last 30 days" actions={!onBusinessChange && s?.isSample ? <SampleDataTag /> : undefined} />
        <CardBody className="sm:px-6 sm:pb-6">{loading || !s ? <Skeleton className="h-40 w-full" /> : <ActivityTrend data={s.series} prefs={prefs} {...(businessId ? {} : { emptyBody: 'Views and AR opens will appear here once people visit published catalogs.' })} />}</CardBody>
      </Card>

      <div className={showBusinessCol ? 'grid gap-6 lg:grid-cols-2 [&>*]:min-w-0' : ''}>
        {showBusinessCol && (
          <Card>
            <PanelHeader title="Views by business" description="Page and embed views, last 30 days" />
            <CardBody className="sm:px-6">
              {loading || !s ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <BusinessBars rows={s.byBusiness.map((b) => ({ label: bizMap.get(b.businessId)?.name ?? 'Unknown', value: b.views }))} />
              )}
            </CardBody>
          </Card>
        )}
        <Card>
          <PanelHeader title="Most viewed products" description="Page and embed views, last 30 days" />
          <CardBody className="sm:px-6">
            {loading || productsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : top.length === 0 ? (
              <EmptyState icon={BarChart3} title="No product activity yet" body="Views and AR launch attempts appear once products are published and visited." />
            ) : (
              <MostViewedList rows={top} products={productMap} businesses={showBusinessCol ? bizMap : undefined} editBase={editBase} />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <PanelHeader title="Product performance" description="Select a column header to sort" />
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.productId}
          loading={loading || productsLoading}
          caption="Product performance"
          noun="products"
          initialSort={{ key: 'views', dir: 'desc' }}
          empty={<EmptyState icon={BarChart3} title="No products to report on" body="Add and publish products to start collecting views." />}
          mobileRow={(r) => {
            if (r.productId === DELETED)
              return (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ui-body text-ink-muted">Deleted product</span>
                  <span className="shrink-0 text-ui-body font-medium tabular-nums">{formatNumber(allViews(r))} views</span>
                </div>
              )
            const p = productMap.get(r.productId)
            const attempts = arAttempts(p, r)
            return (
              <div className="flex items-center gap-3">
                <Thumb src={p ? primaryImage(p)?.url : undefined} alt="" size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link to={`${editBase}/${r.productId}/edit`} className="min-w-0 text-ui-body font-medium hover:underline">
                      {p?.name.en}
                    </Link>
                    <span className="shrink-0 text-ui-body font-medium tabular-nums">{formatNumber(allViews(r))} views</span>
                  </div>
                  <p className="text-ui-body text-ink-muted tabular-nums">
                    {attempts === null ? 'No 3D model' : `${formatNumber(attempts)} AR launch attempts · ${allViews(r) ? formatArRate(r.arRate) : 'No views'}`}
                  </p>
                </div>
              </div>
            )
          }}
        />
      </Card>
    </div>
  )
}

/** Views per business: one row each (name, bar track, value), most views first; businesses with none fold into one line. */
export function BusinessBars({ rows }: { rows: { label: string; value: number }[] }) {
  const withViews = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value)
  const quiet = rows.length - withViews.length
  const max = Math.max(1, ...withViews.map((r) => r.value))
  if (rows.length === 0) return <p className="text-ui-small text-ink-muted">No views yet</p>
  return (
    <div>
      {withViews.length > 0 && (
        <ul className="space-y-3" aria-label="Views by business">
          {withViews.map((r, i) => (
            <li key={`${r.label}-${i}`} className="flex items-center gap-3">
              <span className="w-[38%] min-w-0 shrink-0 truncate text-ui-body text-ink" title={r.label}>
                {r.label}
              </span>
              <div className="h-2 min-w-0 flex-1 rounded-full bg-subtle">
                <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: SERIES.views.color }} aria-hidden />
              </div>
              <span className="w-12 shrink-0 text-right text-ui-body text-ink tabular-nums">{formatNumber(r.value)}</span>
            </li>
          ))}
        </ul>
      )}
      {quiet > 0 && <p className={`text-ui-small text-ink-muted${withViews.length > 0 ? ' mt-4' : ''}`}>{quiet === 1 ? '1 business with no views' : `${quiet} businesses with no views`}</p>}
    </div>
  )
}

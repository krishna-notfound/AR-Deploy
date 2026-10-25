import { BarChart3 } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { ActivityTrend } from '@/components/charts/ActivityTrend'
import { HorizontalBars } from '@/components/charts/Charts'
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
import { formatNumber, formatPercent } from '@/lib/format'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { primaryImage } from '@/lib/product'
import { MostViewedList, arAttempts } from './MostViewedList'

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
  const summary = useServiceQuery(() => (businessId ? service.getBusinessAnalytics(businessId) : service.getAnalytics()), [businessId])
  const products = useServiceQuery(() => service.getProducts(businessId ? { businessId } : {}), [businessId])
  const productMap = useMemo(() => new Map<string, Product>((products.data ?? []).map((p) => [p.id, p])), [products.data])
  const bizMap = useMemo(() => new Map<string, Business>((businesses ?? []).map((b) => [b.id, b])), [businesses])
  const s = summary.data
  const loading = summary.status === 'loading' && !s
  // Product rows need product names; without them every row would be filtered out as "no products".
  const productsLoading = products.status === 'loading' && !products.data

  if (summary.status === 'error' && !s) return <ErrorState message={summary.error.message} onRetry={summary.refetch} />
  if (products.status === 'error' && !products.data) return <ErrorState message={products.error.message} onRetry={products.refetch} />

  const rows = (s?.byProduct ?? []).filter((r) => productMap.has(r.productId))
  const top = rows.slice(0, 5)
  const showBusinessCol = !!businesses && !businessId

  const columns: Column<ProductAnalytics>[] = [
    {
      key: 'product',
      header: 'Product',
      sortValue: (r) => productMap.get(r.productId)?.name.en ?? '',
      cell: (r) => {
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
      ? [{ key: 'business', header: 'Business', sortValue: (r: ProductAnalytics) => bizMap.get(r.businessId)?.name ?? '', cell: (r: ProductAnalytics) => <span className="text-ink-muted">{bizMap.get(r.businessId)?.name}</span> } satisfies Column<ProductAnalytics>]
      : []),
    { key: 'views', header: 'Views', align: 'right', sortValue: (r) => r.views, cell: (r) => formatNumber(r.views) },
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
      sortValue: (r) => (arAttempts(productMap.get(r.productId), r) === null ? -1 : r.arRate),
      cell: (r) => (arAttempts(productMap.get(r.productId), r) === null ? <span className="text-ink-faint">No 3D</span> : r.views ? formatPercent(r.arRate) : 'No views'),
    },
  ]

  return (
    <div className="space-y-6">
      {businesses && onBusinessChange && (
        <div className="flex flex-wrap items-center gap-3">
          <Select aria-label="Filter analytics by business" value={businessId ?? ''} onChange={(e) => onBusinessChange(e.target.value)} className="w-full sm:w-64">
            <option value="">All businesses</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          {s?.isSample && <SampleDataTag />}
          <span className="text-xs text-ink-muted">Last 30 days.{s?.isSample ? ' Includes visits and AR taps you make in this demo.' : ''}</span>
        </div>
      )}

      <StatGroup
        loading={loading}
        stats={[
          { label: 'Product page views', value: formatNumber(s?.totals.views ?? 0), hint: 'Last 30 days' },
          { label: 'AR launch attempts', value: formatNumber(s?.totals.arActivations ?? 0), hint: 'Last 30 days' },
          // The seeded sample data has no 3D interactions: "0" next to thousands of views would read as broken tracking.
          s?.isSample && !s.totals.modelInteractions
            ? { label: '3D interactions', value: 'Not recorded', hint: 'Not in the sample data' }
            : { label: '3D interactions', value: formatNumber(s?.totals.modelInteractions ?? 0), hint: 'Times a visitor turned or zoomed a 3D model' },
          { label: 'AR launch rate', value: s && s.totals.views ? formatPercent(s.totals.arActivations / s.totals.views) : 'No views yet', hint: 'AR launch attempts per product page view' },
          { label: 'Published products', value: formatNumber(s?.totals.published ?? 0), hint: 'Current' },
        ]}
        footer={
          s?.isSample && !onBusinessChange ? (
            <span className="flex flex-wrap items-center gap-2">
              <SampleDataTag /> Includes seeded sample data. Not live production analytics.
            </span>
          ) : undefined
        }
      />

      <Card>
        <PanelHeader title="Views and AR launch attempts" description="Daily totals, last 30 days" actions={!onBusinessChange && s?.isSample ? <SampleDataTag /> : undefined} />
        <CardBody className="sm:px-6 sm:pb-6">{loading || !s ? <Skeleton className="h-40 w-full" /> : <ActivityTrend data={s.series} />}</CardBody>
      </Card>

      <div className={showBusinessCol ? 'grid gap-6 lg:grid-cols-2 [&>*]:min-w-0' : ''}>
        {showBusinessCol && (
          <Card>
            <PanelHeader title="Views by business" description="Product page views, last 30 days" />
            <CardBody className="sm:px-6">
              {loading || !s ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <HorizontalBars series="views" valueLabel="Views" data={s.byBusiness.map((b) => ({ label: bizMap.get(b.businessId)?.name ?? 'Unknown', value: b.views }))} />
              )}
            </CardBody>
          </Card>
        )}
        <Card>
          <PanelHeader title="Most viewed products" description="Product page views, last 30 days" />
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
          mobileRow={(r) => (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{productMap.get(r.productId)?.name.en}</span>
              <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                {formatNumber(r.views)} views
                {arAttempts(productMap.get(r.productId), r) === null ? ' · no 3D model' : ` · ${formatNumber(r.arActivations)} AR attempts`}
              </span>
            </div>
          )}
        />
      </Card>
    </div>
  )
}

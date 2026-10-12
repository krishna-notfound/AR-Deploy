import { Building2, PackagePlus, Plus, QrCode } from 'lucide-react'
import { Link } from 'react-router'
import { ActivityTrend } from '@/components/charts/ActivityTrend'
import { PageHeader } from '@/components/layout/PageHeader'
import { BusinessStatusBadge, ProductStatusBadge, SampleDataTag } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { SmartImage, Thumb } from '@/components/ui/SmartImage'
import { StatGroup } from '@/components/ui/StatGroup'
import { SkeletonRows, Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { formatNumber, formatRelative } from '@/lib/format'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { ActivityList } from '../shared/ActivityList'
import { primaryImage } from '@/lib/product'
import { useBusinesses } from '../products/useCatalogData'

export default function AdminOverviewPage() {
  const summary = useServiceQuery(() => service.getAnalytics(), [])
  const products = useServiceQuery(() => service.getProducts(), [])
  const { list: businesses, map: bizMap, query: bizQuery } = useBusinesses()
  const activity = useServiceQuery(() => service.getRecentActivity({ limit: 8 }), [])
  const s = summary.data

  const recentProducts = [...(products.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
  const recentBusinesses = [...businesses].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4)
  const productMap = new Map((products.data ?? []).map((p) => [p.id, p]))
  const top = (s?.byProduct ?? []).filter((r) => productMap.has(r.productId)).slice(0, 5)

  return (
    <>
      <PageHeader
        title="Overview"
        description="Every business catalog on the platform at a glance."
        actions={
          <>
            <ButtonLink to="/admin/catalogs" icon={<QrCode className="size-4" aria-hidden />}>
              View catalogs
            </ButtonLink>
            <ButtonLink to="/admin/products/new" icon={<PackagePlus className="size-4" aria-hidden />}>
              Add product
            </ButtonLink>
            <ButtonLink to="/admin/businesses/new" variant="primary" icon={<Plus className="size-4" aria-hidden />}>
              Create business
            </ButtonLink>
          </>
        }
      />

      {summary.status === 'error' && !s ? (
        <Card>
          <ErrorState message={summary.error.message} onRetry={summary.refetch} />
        </Card>
      ) : (
        <div className="space-y-6">
          <StatGroup
            loading={!s}
            stats={[
              { label: 'Businesses', value: formatNumber(s?.totals.businesses ?? 0) },
              { label: 'Products', value: formatNumber(s?.totals.products ?? 0) },
              { label: 'Published', value: formatNumber(s?.totals.published ?? 0) },
              { label: 'Drafts', value: formatNumber(s?.totals.drafts ?? 0) },
              { label: 'Product page views', value: formatNumber(s?.totals.views ?? 0), hint: 'Last 30 days' },
              { label: 'AR activations', value: formatNumber(s?.totals.arActivations ?? 0), hint: 'Last 30 days' },
            ]}
            footer={
              s?.isSample ? (
                <span className="flex items-center gap-2">
                  <SampleDataTag /> Views and AR figures are seeded sample data plus visits made in this demo, not live production analytics.
                </span>
              ) : undefined
            }
          />

          <Card>
            <CardHeader title="Product views and AR activations" description="All businesses, last 30 days" actions={<Link to="/admin/analytics" className="text-[13px] font-medium text-accent-ink hover:underline">Open analytics</Link>} />
            <CardBody>{s ? <ActivityTrend data={s.series} compact /> : <Skeleton className="h-32 w-full" />}</CardBody>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Top-performing products" description="By views, last 30 days" />
              <CardBody>
                {!s || products.status === 'loading' ? (
                  <SkeletonRows rows={4} />
                ) : top.length === 0 ? (
                  <EmptyState title="No product activity yet" />
                ) : (
                  <ul className="divide-y divide-line">
                    {top.map((r) => {
                      const p = productMap.get(r.productId)!
                      return (
                        <li key={r.productId} className="flex items-center gap-3 py-2.5">
                          <Thumb src={primaryImage(p)?.url} alt="" />
                          <div className="min-w-0 flex-1">
                            <Link to={`/admin/products/${p.id}/edit`} className="block truncate text-sm font-medium hover:underline">
                              {p.name.en}
                            </Link>
                            <p className="truncate text-xs text-ink-muted">{bizMap.get(p.businessId)?.name}</p>
                          </div>
                          <span className="text-right text-xs text-ink-muted tabular-nums">
                            <span className="block font-medium text-ink">{formatNumber(r.views)} views</span>
                            {formatNumber(r.arActivations)} AR
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Recent activity" />
              <CardBody>
                <ActivityList query={activity} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Recently added products" actions={<Link to="/admin/products" className="text-[13px] font-medium text-accent-ink hover:underline">All products</Link>} />
              <CardBody>
                {products.status === 'loading' && !products.data ? (
                  <SkeletonRows rows={4} />
                ) : recentProducts.length === 0 ? (
                  <EmptyState
                    title="No products yet"
                    action={
                      <ButtonLink to="/admin/products/new" size="sm">
                        Add product
                      </ButtonLink>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {recentProducts.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 py-2.5">
                        <Thumb src={primaryImage(p)?.url} alt="" />
                        <div className="min-w-0 flex-1">
                          <Link to={`/admin/products/${p.id}/edit`} className="block truncate text-sm font-medium hover:underline">
                            {p.name.en}
                          </Link>
                          <p className="truncate text-xs text-ink-muted">
                            {bizMap.get(p.businessId)?.name} · added {formatRelative(p.createdAt)}
                          </p>
                        </div>
                        <ProductStatusBadge status={p.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Recently created businesses" actions={<Link to="/admin/businesses" className="text-[13px] font-medium text-accent-ink hover:underline">All businesses</Link>} />
              <CardBody>
                {bizQuery.status === 'loading' && !bizQuery.data ? (
                  <SkeletonRows rows={3} />
                ) : recentBusinesses.length === 0 ? (
                  <EmptyState icon={Building2} title="No businesses yet" />
                ) : (
                  <ul className="divide-y divide-line">
                    {recentBusinesses.map((b) => (
                      <li key={b.id} className="flex items-center gap-3 py-2.5">
                        <SmartImage src={b.logoUrl} alt="" className="size-10 rounded-lg object-contain" />
                        <div className="min-w-0 flex-1">
                          <Link to={`/admin/businesses/${b.id}`} className="block truncate text-sm font-medium hover:underline">
                            {b.name}
                          </Link>
                          <p className="text-xs text-ink-muted">Created {formatRelative(b.createdAt)}</p>
                        </div>
                        <BusinessStatusBadge status={b.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}

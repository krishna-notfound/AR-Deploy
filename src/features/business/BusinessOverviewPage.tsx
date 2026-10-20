import { ExternalLink, PackagePlus } from 'lucide-react'
import { Link } from 'react-router'
import { useCurrentBusiness } from '@/auth/AccountProvider'
import { ActivityTrend } from '@/components/charts/ActivityTrend'
import { PageHeader } from '@/components/layout/PageHeader'
import { ProductStatusBadge, SampleDataTag } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Thumb } from '@/components/ui/SmartImage'
import { StatGroup } from '@/components/ui/StatGroup'
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Package } from 'lucide-react'
import { formatNumber, formatRelative } from '@/lib/format'
import { catalogLocalPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { primaryImage } from '@/lib/product'
import { ActivityList } from '../shared/ActivityList'

export default function BusinessOverviewPage() {
  const business = useCurrentBusiness()
  const summary = useServiceQuery(() => service.getBusinessAnalytics(business.id), [business.id])
  const products = useServiceQuery(() => service.getProductsByBusiness(business.id), [business.id])
  const activity = useServiceQuery(() => service.getRecentActivity({ businessId: business.id, limit: 6 }), [business.id])
  const s = summary.data
  const recent = [...(products.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)

  return (
    <>
      <PageHeader
        title="Overview"
        description={`How ${business.name}’s catalog is doing.`}
        actions={
          <>
            <Button icon={<ExternalLink className="size-4" aria-hidden />} onClick={() => window.open(catalogLocalPath(business), '_blank', 'noopener')}>
              View my catalog
            </Button>
            <ButtonLink to="/dashboard/products/new" variant="primary" icon={<PackagePlus className="size-4" aria-hidden />}>
              Add product
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
              { label: 'Products', value: formatNumber(s?.totals.products ?? 0) },
              { label: 'Published', value: formatNumber(s?.totals.published ?? 0) },
              { label: 'Drafts', value: formatNumber(s?.totals.drafts ?? 0) },
              { label: 'Product page views', value: formatNumber(s?.totals.views ?? 0), hint: 'Last 30 days' },
              { label: 'AR launch attempts', value: formatNumber(s?.totals.arActivations ?? 0), hint: 'Last 30 days' },
            ]}
            footer={
              s?.isSample ? (
                <span className="flex items-center gap-2">
                  <SampleDataTag /> Includes seeded sample data. Not live production analytics.
                </span>
              ) : undefined
            }
          />
          <Card>
            <CardHeader title="Views and AR launch attempts" description="Last 30 days" actions={<Link to="/dashboard/analytics" className="text-[13px] font-medium text-accent-ink hover:underline">Open analytics</Link>} />
            <CardBody>{s ? <ActivityTrend data={s.series} compact /> : <Skeleton className="h-32 w-full" />}</CardBody>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Recent products" actions={<Link to="/dashboard/products" className="text-[13px] font-medium text-accent-ink hover:underline">All products</Link>} />
              <CardBody>
                {products.status === 'loading' && !products.data ? (
                  <SkeletonRows rows={4} />
                ) : products.status === 'error' && !products.data ? (
                  <ErrorState message="Your products could not be loaded." onRetry={products.refetch} />
                ) : recent.length === 0 ? (
                  <EmptyState
                    icon={Package}
                    title="Add your first product"
                    body="Products you publish appear in your catalog and behind your QR code."
                    action={
                      <ButtonLink to="/dashboard/products/new" variant="primary">
                        Add product
                      </ButtonLink>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {recent.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 py-2.5">
                        <Thumb src={primaryImage(p)?.url} alt="" />
                        <div className="min-w-0 flex-1">
                          <Link to={`/dashboard/products/${p.id}/edit`} className="block truncate text-sm font-medium hover:underline">
                            {p.name.en}
                          </Link>
                          <p className="text-xs text-ink-muted">Updated {formatRelative(p.updatedAt)}</p>
                        </div>
                        <ProductStatusBadge status={p.status} />
                      </li>
                    ))}
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
          </div>
        </div>
      )}
    </>
  )
}

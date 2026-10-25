import { useCan } from '@/auth/usePermission'
import { ArrowRight, Box, Building2, ClipboardList, Eye, Globe, Package, PackagePlus, PencilLine, Plus, QrCode } from 'lucide-react'
import { Link } from 'react-router'
import { ActivityTrend } from '@/components/charts/ActivityTrend'
import { usePendingApplications } from '@/components/layout/dashboardContext'
import { PageHeader, PanelHeader, panelLinkClass } from '@/components/layout/PageHeader'
import { BusinessStatusBadge, ProductStatusBadge, SampleDataTag } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { SmartImage } from '@/components/ui/SmartImage'
import { StatGroup } from '@/components/ui/StatGroup'
import { SkeletonRows, Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { formatNumber, formatPercent, formatRelative } from '@/lib/format'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { ActivityList } from '../shared/ActivityList'
import { applicationsAdminPath, businessAdminPath } from '@/lib/urls'
import { primaryImage } from '@/lib/product'
import { MostViewedList } from '../analytics/MostViewedList'
import { hasArModel } from '../products/productReadiness'
import { useBusinesses } from '../products/useCatalogData'

export default function AdminOverviewPage() {
  const can = useCan()
  const summary = useServiceQuery(() => service.getAnalytics(), [])
  const products = useServiceQuery(() => service.getProducts(), [])
  const { list: businesses, map: bizMap, query: bizQuery } = useBusinesses()
  const activity = useServiceQuery(() => service.getRecentActivity({ limit: 6 }), [])
  const s = summary.data

  const recentProducts = [...(products.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
  const recentBusinesses = [...businesses].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
  const productMap = new Map((products.data ?? []).map((p) => [p.id, p]))
  const top = (s?.byProduct ?? []).filter((r) => productMap.has(r.productId)).slice(0, 5)
  const activeBusinesses = businesses.filter((b) => b.status === 'active').length
  const withModel = products.data?.filter(hasArModel).length

  return (
    <>
      <PageHeader
        title="Overview"
        description="Applications, businesses, products and catalog activity across Sanctus."
        actions={
          <>
            {can('products.view') && (
              <ButtonLink to="/admin/catalogs" icon={<QrCode className="size-4" aria-hidden />}>
                View catalogs
              </ButtonLink>
            )}
            {can('products.edit') && (
              <ButtonLink to="/admin/products/new" icon={<PackagePlus className="size-4" aria-hidden />}>
                Add product
              </ButtonLink>
            )}
            {can('businesses.edit') && (
              <ButtonLink to="/admin/businesses/new" variant="primary" icon={<Plus className="size-4" aria-hidden />}>
                Create business
              </ButtonLink>
            )}
          </>
        }
      />

      <PendingApplications />

      {summary.status === 'error' && !s ? (
        <Card>
          <ErrorState message={summary.error.message} onRetry={summary.refetch} />
        </Card>
      ) : (
        <div className="space-y-8">
          <StatGroup
            loading={!s}
            stats={[
              { label: 'Businesses', icon: Building2, value: formatNumber(s?.totals.businesses ?? 0), hint: bizQuery.data ? `${formatNumber(activeBusinesses)} active` : undefined },
              { label: 'Products', icon: Package, value: formatNumber(s?.totals.products ?? 0), hint: withModel !== undefined ? `${formatNumber(withModel)} with a 3D model` : undefined },
              { label: 'Published', icon: Globe, value: formatNumber(s?.totals.published ?? 0), hint: s ? `of ${formatNumber(s.totals.products)} products` : undefined },
              { label: 'Drafts', icon: PencilLine, value: formatNumber(s?.totals.drafts ?? 0), hint: 'Not published yet' },
              { label: 'Product page views', icon: Eye, value: formatNumber(s?.totals.views ?? 0), hint: 'Last 30 days' },
              {
                label: 'AR launch attempts',
                icon: Box,
                value: formatNumber(s?.totals.arActivations ?? 0),
                hint: s && s.totals.views ? `Last 30 days · ${formatPercent(s.totals.arActivations / s.totals.views)} of views` : 'Last 30 days',
              },
            ]}
            footer={
              s?.isSample ? (
                <span className="flex flex-wrap items-center gap-2">
                  <SampleDataTag /> Views and AR figures are seeded sample data plus visits made in this demo, not live production analytics.
                </span>
              ) : undefined
            }
          />

          <Card>
            <PanelHeader
              title="Product views and AR launch attempts"
              description="All businesses, last 30 days"
              actions={
                <Link to="/admin/analytics" className={panelLinkClass}>
                  Open analytics <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            <CardBody className="sm:px-6 sm:pb-6">{s ? <ActivityTrend data={s.series} compact /> : <Skeleton className="h-32 w-full" />}</CardBody>
          </Card>

          {/* Grid items default to min-width: auto, so a long product name would widen the card past a phone screen. */}
          <div className="grid gap-6 lg:grid-cols-12 [&>*]:min-w-0">
            <Card className="lg:col-span-7">
              <PanelHeader
                title="Most viewed products"
                description="Product page views, last 30 days"
                actions={
                  <Link to="/admin/analytics" className={panelLinkClass}>
                    Full ranking <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                }
              />
              <CardBody className="sm:px-6">
                {products.status === 'error' && !products.data ? (
                  <ErrorState message={products.error.message} onRetry={products.refetch} />
                ) : !s || products.status === 'loading' ? (
                  <SkeletonRows rows={4} />
                ) : top.length === 0 ? (
                  <EmptyState title="No product activity yet" />
                ) : (
                  <MostViewedList rows={top} products={productMap} businesses={bizMap} editBase="/admin/products" />
                )}
              </CardBody>
            </Card>

            <Card className="lg:col-span-5">
              <PanelHeader title="Recent activity" description="Businesses and products" />
              <CardBody className="sm:px-6">
                <ActivityList query={activity} />
              </CardBody>
            </Card>

            <Card className="lg:col-span-6">
              <PanelHeader
                title="Recently added products"
                actions={
                  <Link to="/admin/products" className={panelLinkClass}>
                    All products <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                }
              />
              <CardBody className="sm:px-6">
                {products.status === 'loading' && !products.data ? (
                  <SkeletonRows rows={4} />
                ) : products.status === 'error' && !products.data ? (
                  <ErrorState message={products.error.message} onRetry={products.refetch} />
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
                      <li key={p.id} className="flex items-center gap-3 py-3">
                        <SmartImage src={primaryImage(p)?.url} alt="" className="size-11 shrink-0 border border-line" />
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

            <Card className="lg:col-span-6">
              <PanelHeader
                title="Recently created businesses"
                actions={
                  <Link to="/admin/businesses" className={panelLinkClass}>
                    All businesses <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                }
              />
              <CardBody className="sm:px-6">
                {bizQuery.status === 'loading' && !bizQuery.data ? (
                  <SkeletonRows rows={3} />
                ) : bizQuery.status === 'error' && !bizQuery.data ? (
                  <ErrorState message={bizQuery.error.message} onRetry={bizQuery.refetch} />
                ) : recentBusinesses.length === 0 ? (
                  <EmptyState icon={Building2} title="No businesses yet" />
                ) : (
                  <ul className="divide-y divide-line">
                    {recentBusinesses.map((b) => (
                      <li key={b.id} className="flex items-center gap-3 py-3">
                        <SmartImage src={b.logoUrl} alt="" className="size-11 shrink-0 border border-line bg-surface object-contain p-1" />
                        <div className="min-w-0 flex-1">
                          <Link to={businessAdminPath(b.id)} className="block truncate text-sm font-medium hover:underline">
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

/** Applications waiting for a decision (submitted or under review), so new submissions are seen without opening Applications. */
function PendingApplications() {
  const q = usePendingApplications()
  const d = q.data
  const total = d?.total ?? 0
  if (q.status === 'loading' && !d)
    return (
      <div className="mb-8 border border-line p-4" role="status" aria-label="Loading applications">
        <Skeleton className="h-4 w-1/3" />
      </div>
    )
  if (q.status === 'error' && !d)
    return (
      <Card className="mb-8">
        <ErrorState message={`Could not load applications. ${q.error.message}`} onRetry={q.refetch} className="py-6" />
      </Card>
    )
  if (!d || total === 0)
    return (
      <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 border border-line px-4 py-3 sm:px-5">
        <ClipboardList className="size-4 shrink-0 text-ink-faint" strokeWidth={1.5} aria-hidden />
        <h2 className="min-w-0 flex-1 text-sm text-ink-muted">No applications awaiting review</h2>
        <Link to={applicationsAdminPath()} className={panelLinkClass}>
          View applications <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    )
  return (
    <section className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-3 border border-accent/35 bg-accent-soft px-4 py-4 sm:px-5" aria-labelledby="pending-apps">
      <span className="grid size-10 shrink-0 place-items-center border border-accent/40 text-accent-ink" aria-hidden>
        <ClipboardList className="size-[18px]" strokeWidth={1.5} />
      </span>
      <div className="min-w-[10rem] flex-1">
        <h2 id="pending-apps" className="text-[15px] font-medium text-ink">
          {`${formatNumber(total)} application${total === 1 ? '' : 's'} awaiting review`}
        </h2>
        <p className="mt-0.5 text-[13px] text-ink-body">
          {formatNumber(d.submitted)} new · {formatNumber(d.underReview)} under review
        </p>
      </div>
      <Link
        to={applicationsAdminPath(d.submitted > 0 ? 'submitted' : 'under_review')}
        className="inline-flex min-h-11 w-full items-center gap-1.5 text-sm font-medium text-accent-ink hover:underline sm:w-auto"
      >
        Review applications <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  )
}

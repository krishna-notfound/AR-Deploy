import { useCan } from '@/auth/usePermission'
import { ArrowRight, PackagePlus, Plus, QrCode } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { ActivityTrend } from '@/components/charts/ActivityTrend'
import { usePendingApplications } from '@/components/layout/dashboardContext'
import { PageHeader, PanelHeader, panelLinkClass } from '@/components/layout/PageHeader'
import { SampleDataTag } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { StatGroup } from '@/components/ui/StatGroup'
import { SkeletonRows, Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { formatNumber } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { ActivityList } from '../shared/ActivityList'
import { applicationsAdminPath } from '@/lib/urls'
import { MostViewedList, formatArRate, mostViewed } from '../analytics/MostViewedList'
import { hasArModel } from '../products/productReadiness'
import { useBusinesses } from '../products/useCatalogData'
import { SetupProgressCard } from '../settings/OnboardingChecklist'

export default function AdminOverviewPage() {
  const can = useCan()
  const navigate = useNavigate()
  const prefs = usePreferences()
  const timeZone = prefs?.timezone
  const summary = useServiceQuery(() => service.getAnalytics({ timeZone }), [timeZone])
  const products = useServiceQuery(() => service.getProducts(), [])
  const { list: businesses, map: bizMap, query: bizQuery } = useBusinesses()
  const activity = useServiceQuery(() => service.getRecentActivity({ limit: 6 }), [])
  const s = summary.data

  const productMap = new Map((products.data ?? []).map((p) => [p.id, p]))
  const top = mostViewed(s?.byProduct ?? [], productMap)
  const activeBusinesses = businesses.filter((b) => b.status === 'active').length
  const withModel = products.data?.filter(hasArModel).length

  return (
    <>
      <PageHeader
        title="Overview"
        description="Applications, businesses, products and catalog activity across Sanctus."
        more={[
          ...(can('products.view') ? [{ label: 'View catalogs', icon: <QrCode aria-hidden />, onSelect: () => void navigate('/admin/catalogs') }] : []),
          ...(can('products.edit') ? [{ label: 'Add product', icon: <PackagePlus aria-hidden />, onSelect: () => void navigate('/admin/products/new') }] : []),
        ]}
        actions={
          <>
            {can('products.view') && (
              <ButtonLink to="/admin/catalogs" variant="ghost" className="max-sm:hidden" icon={<QrCode className="size-4" aria-hidden />}>
                View catalogs
              </ButtonLink>
            )}
            {can('products.edit') && (
              <ButtonLink to="/admin/products/new" variant="secondary" className="max-sm:hidden" icon={<PackagePlus className="size-4" aria-hidden />}>
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
      <SetupProgressCard scope="admin" className="mb-6 block" />

      {summary.status === 'error' && !s ? (
        <Card>
          <ErrorState message={summary.error.message} onRetry={summary.refetch} />
        </Card>
      ) : (
        <div className="space-y-6">
          <StatGroup
            loading={!s}
            stats={[
              { label: 'Businesses', value: formatNumber(s?.totals.businesses ?? 0), hint: bizQuery.data ? `${formatNumber(activeBusinesses)} active` : undefined },
              { label: 'Products', value: formatNumber(s?.totals.products ?? 0), hint: withModel !== undefined ? `${formatNumber(withModel)} with a 3D model` : undefined },
              { label: 'Published', value: formatNumber(s?.totals.published ?? 0), hint: s ? `of ${formatNumber(s.totals.products)} products` : undefined },
              { label: 'Drafts', value: formatNumber(s?.totals.drafts ?? 0), hint: 'Not published yet' },
              { label: 'Product page views', value: formatNumber(s?.totals.views ?? 0), hint: 'Last 30 days' },
              {
                label: 'AR launch attempts',
                value: formatNumber(s?.totals.arActivations ?? 0),
                hint: s && s.totals.views + s.totals.embedViews ? `Last 30 days · ${formatArRate(s.totals.arActivations / (s.totals.views + s.totals.embedViews))}` : 'Last 30 days',
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
            <CardBody className="sm:px-6 sm:pb-6">{s ? <ActivityTrend data={s.series} compact prefs={prefs} emptyBody="Views and AR opens will appear here once people visit published catalogs." /> : <Skeleton className="h-32 w-full" />}</CardBody>
          </Card>

          {/* Grid items default to min-width: auto, so a long product name would widen the card past a phone screen. */}
          <div className="grid gap-6 lg:grid-cols-12 [&>*]:min-w-0">
            <Card className="lg:col-span-7">
              <PanelHeader
                title="Most viewed products"
                description="Page and embed views, last 30 days"
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
      <div className="mb-6 rounded-[var(--radius-card)] border border-line px-4 py-4 sm:px-6" role="status" aria-label="Loading applications">
        <Skeleton className="h-4 w-1/3" />
      </div>
    )
  if (q.status === 'error' && !d)
    return (
      <Card className="mb-6">
        <ErrorState message={`Could not load applications. ${q.error.message}`} onRetry={q.refetch} className="py-6" />
      </Card>
    )
  if (!d || total === 0)
    return (
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-card)] border border-line px-4 py-4 sm:px-6">
        <h2 className="min-w-0 flex-1 text-[length:var(--text-ui-body)] text-ink-muted">No applications awaiting review</h2>
        <Link to={applicationsAdminPath()} className={panelLinkClass}>
          View applications <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    )
  return (
    <section className="mb-6 flex flex-wrap items-center justify-between gap-x-5 gap-y-1 rounded-[var(--radius-card)] border border-line bg-accent-soft px-4 py-4 sm:px-6" aria-labelledby="pending-apps">
      <div className="min-w-[10rem]">
        <h2 id="pending-apps" className="text-[15px] leading-tight font-medium text-ink">
          {`${formatNumber(total)} application${total === 1 ? '' : 's'} awaiting review`}
        </h2>
        <p className="mt-0.5 text-[length:var(--text-ui-small)] leading-tight text-ink-muted">
          {formatNumber(d.submitted)} new · {formatNumber(d.underReview)} under review
        </p>
      </div>
      <Link
        to={applicationsAdminPath(d.submitted > 0 ? 'submitted' : 'under_review')}
        className="inline-flex min-h-11 items-center gap-1.5 text-[length:var(--text-ui-body)] font-medium text-accent-ink hover:underline"
      >
        Review applications <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  )
}

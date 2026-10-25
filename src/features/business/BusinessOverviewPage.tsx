import { ArrowRight, BarChart3, Box, CheckCircle2, ChevronRight, Circle, ExternalLink, Eye, Globe, Package, PackagePlus, PencilLine } from 'lucide-react'
import { Link } from 'react-router'
import { useCurrentBusiness } from '@/auth/AccountProvider'
import { ActivityTrend } from '@/components/charts/ActivityTrend'
import { PageHeader, PanelHeader, panelLinkClass } from '@/components/layout/PageHeader'
import { BusinessStatusBadge, ProductStatusBadge, SampleDataTag } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { SmartImage } from '@/components/ui/SmartImage'
import { StatGroup } from '@/components/ui/StatGroup'
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { Business, Product } from '@/domain/types'
import { formatNumber, formatPercent, formatRelative } from '@/lib/format'
import { catalogLocalPath, myProductsPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { primaryImage } from '@/lib/product'
import { ActivityList } from '../shared/ActivityList'
import { MostViewedList } from '../analytics/MostViewedList'
import { hasArModel, productArReadiness } from '../products/productReadiness'

export default function BusinessOverviewPage() {
  const business = useCurrentBusiness()
  const summary = useServiceQuery(() => service.getBusinessAnalytics(business.id), [business.id])
  const products = useServiceQuery(() => service.getProductsByBusiness(business.id), [business.id])
  const activity = useServiceQuery(() => service.getRecentActivity({ businessId: business.id, limit: 6 }), [business.id])
  const s = summary.data
  const recent = [...(products.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)
  const isPublic = business.status === 'active'
  const nothingPublished = !!products.data && !products.data.some((p) => p.status === 'published')
  const productMap = new Map((products.data ?? []).map((p) => [p.id, p]))
  const top = (s?.byProduct ?? []).filter((r) => productMap.has(r.productId) && r.views > 0).slice(0, 5)
  const withModel = products.data?.filter(hasArModel).length

  return (
    <>
      <PageHeader
        title="Overview"
        eyebrow={business.name}
        description="Your products, catalog and what customers look at."
        meta={<BusinessStatusBadge status={business.status} />}
        actions={
          <>
            <Button icon={<ExternalLink className="size-4" aria-hidden />} onClick={() => window.open(catalogLocalPath(business, { preview: !isPublic }), '_blank', 'noopener')}>
              {isPublic ? 'View my catalog' : 'Preview catalog (not public yet)'}
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
        <div className="space-y-8">
          <StatGroup
            loading={!s}
            stats={[
              { label: 'Products', icon: Package, value: formatNumber(s?.totals.products ?? 0), hint: withModel !== undefined ? `${formatNumber(withModel)} with a 3D model` : undefined },
              { label: 'Published', icon: Globe, value: formatNumber(s?.totals.published ?? 0), hint: isPublic ? 'In your catalog' : 'Catalog not public yet' },
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
                  <SampleDataTag /> Includes seeded sample data. Not live production analytics.
                </span>
              ) : undefined
            }
          />
          <NextSteps business={business} products={products.data} failed={products.status === 'error' && !products.data} />
          <Card>
            <PanelHeader
              title="Views and AR launch attempts"
              description="Last 30 days"
              actions={
                <Link to="/dashboard/analytics" className={panelLinkClass}>
                  Open analytics <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            <CardBody className="sm:px-6 sm:pb-6">
              {/* With nothing published there is nothing to visit: flat lines would read as "no one is looking" (DUX-04). */}
              {nothingPublished && !s?.totals.views ? (
                <EmptyState icon={BarChart3} title="No published products yet" body="Views and AR launch attempts appear once customers can see your products." />
              ) : s ? (
                <ActivityTrend data={s.series} compact />
              ) : (
                <Skeleton className="h-32 w-full" />
              )}
            </CardBody>
          </Card>
          {/* Grid items default to min-width: auto, so a long product name would widen the card past a phone screen. */}
          <div className="grid gap-6 lg:grid-cols-12 [&>*]:min-w-0">
            <Card className="lg:col-span-7">
              <PanelHeader title="Most viewed products" description="Product page views, last 30 days" />
              <CardBody className="sm:px-6">
                {products.status === 'error' && !products.data ? (
                  <ErrorState message="Your products could not be loaded." onRetry={products.refetch} />
                ) : !s || (products.status === 'loading' && !products.data) ? (
                  <SkeletonRows rows={4} />
                ) : top.length === 0 ? (
                  <EmptyState icon={BarChart3} title="No product views yet" body="Products appear here once customers open their pages." />
                ) : (
                  <MostViewedList rows={top} products={productMap} editBase="/dashboard/products" />
                )}
              </CardBody>
            </Card>
            <Card className="lg:col-span-5">
              <PanelHeader title="Recent activity" />
              <CardBody className="sm:px-6">
                <ActivityList query={activity} />
              </CardBody>
            </Card>
            <Card className="lg:col-span-12">
              <PanelHeader
                title="Recent products"
                actions={
                  <Link to={myProductsPath()} className={panelLinkClass}>
                    All products <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                }
              />
              <CardBody className="sm:px-6">
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
                      <li key={p.id} className="flex items-center gap-3 py-3">
                        <SmartImage src={primaryImage(p)?.url} alt="" className="size-11 shrink-0 border border-line" />
                        <div className="min-w-0 flex-1">
                          <Link to={`/dashboard/products/${p.id}/edit`} className="block truncate py-1 text-sm font-medium hover:underline">
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
          </div>
        </div>
      )}
    </>
  )
}

interface Step {
  done?: boolean
  label: string
  to?: string
}

/**
 * What needs the owner's attention, from data the page already has (DUX-04): a getting-started checklist for an
 * empty catalogue, otherwise up to four rows that link to the matching filtered product list.
 */
function NextSteps({ business, products, failed }: { business: Business; products: Product[] | undefined; failed?: boolean }) {
  if (failed) return null // the Recent products card already reports the failure and offers a retry
  if (!products)
    return (
      <Card>
        <PanelHeader title="Next steps" />
        <CardBody className="sm:px-6">
          <SkeletonRows rows={2} />
        </CardBody>
      </Card>
    )
  if (products.length === 0) {
    const steps: Step[] = [
      { label: 'Add your first product: photos, price and dimensions', to: '/dashboard/products/new' },
      { label: 'Add a 3D model (GLB) and an iPhone AR file (USDZ) so customers can see it in their room' },
      { label: 'Publish it, then print your catalog QR code', to: '/dashboard/catalog' },
    ]
    return <StepsCard title="Get started" steps={steps} ordered />
  }
  const drafts = products.filter((p) => p.status === 'draft').length
  const readiness = products.map(productArReadiness)
  const noModel = readiness.filter((r) => r === 'photos-only').length
  const noUsdz = readiness.filter((r) => r === 'android-only').length
  const blocked = readiness.filter((r) => r === 'android-blocked').length
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const rows: Step[] = []
  if (business.status !== 'active')
    rows.push({ label: business.status === 'draft' ? 'Your catalog is not public yet' : 'Your catalog is paused: customers see “catalog unavailable”', to: '/dashboard/catalog' })
  if (drafts) rows.push({ label: `${count(drafts, 'draft is', 'drafts are')} not published`, to: myProductsPath({ status: 'draft' }) })
  if (noModel) rows.push({ label: `${count(noModel, 'product has', 'products have')} no 3D model (photos only)`, to: myProductsPath({ ar: 'photos-only' }) })
  if (blocked) rows.push({ label: `${count(blocked, 'model needs', 'models need')} re-exporting for Android AR`, to: myProductsPath({ ar: 'android-blocked' }) })
  if (noUsdz) rows.push({ label: `${count(noUsdz, 'product has', 'products have')} no iPhone AR file (USDZ)`, to: myProductsPath({ ar: 'android-only' }) })
  if (rows.length === 0) return <StepsCard title="Next steps" steps={[{ done: true, label: 'Every product is published with a 3D model and an iPhone AR file.' }]} />
  return <StepsCard title="Next steps" steps={rows} />
}

function StepsCard({ title, steps, ordered }: { title: string; steps: Step[]; ordered?: boolean }) {
  const List = ordered ? 'ol' : 'ul'
  return (
    <Card>
      <PanelHeader title={title} />
      <List className="divide-y divide-line border-t border-line">
        {steps.map((step, i) => {
          const marker = step.done ? (
            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
          ) : ordered ? (
            <span className="w-4 shrink-0 text-ink-muted tabular-nums" aria-hidden>
              {i + 1}.
            </span>
          ) : (
            <Circle className="size-2 shrink-0 fill-warning text-warning" aria-hidden />
          )
          return (
            <li key={step.label}>
              {step.to ? (
                <Link to={step.to} className="flex min-h-12 items-center gap-3 px-5 py-3 text-sm text-ink hover:bg-canvas/70 sm:px-6">
                  {marker}
                  <span className="min-w-0 flex-1">{step.label}</span>
                  <ChevronRight className="size-4 shrink-0 text-ink-faint" aria-hidden />
                </Link>
              ) : (
                <div className="flex min-h-12 items-center gap-3 px-5 py-3 text-sm text-ink-muted sm:px-6">
                  {marker}
                  <span className="min-w-0 flex-1">{step.label}</span>
                </div>
              )}
            </li>
          )
        })}
      </List>
    </Card>
  )
}

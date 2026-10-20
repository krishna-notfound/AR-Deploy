import { BarChart3, CheckCircle2, ChevronRight, Circle, ExternalLink, Package, PackagePlus } from 'lucide-react'
import { Link } from 'react-router'
import { useCurrentBusiness } from '@/auth/AccountProvider'
import { ActivityTrend } from '@/components/charts/ActivityTrend'
import { PageHeader } from '@/components/layout/PageHeader'
import { BusinessStatusBadge, ProductStatusBadge, SampleDataTag } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Thumb } from '@/components/ui/SmartImage'
import { StatGroup } from '@/components/ui/StatGroup'
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { Business, Product } from '@/domain/types'
import { formatNumber, formatRelative } from '@/lib/format'
import { catalogLocalPath, myProductsPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { primaryImage } from '@/lib/product'
import { ActivityList } from '../shared/ActivityList'
import { productArReadiness } from '../products/productReadiness'

/** Card-header text links get a taller hit area without changing their look (DUX-10). */
const headerLink = '-my-2 inline-block py-2.5 text-[13px] font-medium text-accent-ink hover:underline'

export default function BusinessOverviewPage() {
  const business = useCurrentBusiness()
  const summary = useServiceQuery(() => service.getBusinessAnalytics(business.id), [business.id])
  const products = useServiceQuery(() => service.getProductsByBusiness(business.id), [business.id])
  const activity = useServiceQuery(() => service.getRecentActivity({ businessId: business.id, limit: 6 }), [business.id])
  const s = summary.data
  const recent = [...(products.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)
  const isPublic = business.status === 'active'
  const nothingPublished = !!products.data && !products.data.some((p) => p.status === 'published')

  return (
    <>
      <PageHeader
        title="Overview"
        description={`How ${business.name}’s catalog is doing.`}
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
          <NextSteps business={business} products={products.data} failed={products.status === 'error' && !products.data} />
          <Card>
            <CardHeader title="Views and AR launch attempts" description="Last 30 days" actions={<Link to="/dashboard/analytics" className={headerLink}>Open analytics</Link>} />
            <CardBody>
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
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Recent products" actions={<Link to={myProductsPath()} className={headerLink}>All products</Link>} />
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
        <CardHeader title="Next steps" />
        <CardBody>
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
    return <StepsCard title="Get started" description="Three steps to a catalog customers can open in AR." steps={steps} ordered />
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
  return <StepsCard title="Next steps" description="What needs your attention." steps={rows} />
}

function StepsCard({ title, description, steps, ordered }: { title: string; description?: string; steps: Step[]; ordered?: boolean }) {
  const List = ordered ? 'ol' : 'ul'
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <List className="divide-y divide-line border-t border-line">
        {steps.map((step, i) => {
          const marker = step.done ? (
            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
          ) : ordered ? (
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-subtle text-[11px] font-medium text-ink-muted tabular-nums" aria-hidden>
              {i + 1}
            </span>
          ) : (
            <Circle className="size-2 shrink-0 fill-warning text-warning" aria-hidden />
          )
          return (
            <li key={step.label}>
              {step.to ? (
                <Link to={step.to} className="flex min-h-11 items-center gap-3 px-5 py-2.5 text-sm text-ink hover:bg-subtle">
                  {marker}
                  <span className="min-w-0 flex-1">{step.label}</span>
                  <ChevronRight className="size-4 shrink-0 text-ink-faint" aria-hidden />
                </Link>
              ) : (
                <div className="flex min-h-11 items-center gap-3 px-5 py-2.5 text-sm text-ink-muted">
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

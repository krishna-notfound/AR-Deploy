import { ArrowRight, BarChart3, CheckCircle2, ChevronRight, PackagePlus } from 'lucide-react'
import { useCallback } from 'react'
import { Link } from 'react-router'
import { useAccount, useCurrentBusiness } from '@/auth/AccountProvider'
import { ActivityTrend } from '@/components/charts/ActivityTrend'
import { PageHeader, PanelHeader, panelLinkClass } from '@/components/layout/PageHeader'
import { BusinessStatusBadge, SampleDataTag } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { StatGroup } from '@/components/ui/StatGroup'
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { Business, Product } from '@/domain/types'
import { formatDate, formatNumber, formatPercent } from '@/lib/format'
import { myProductsPath } from '@/lib/urls'
import { account, service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { useCancelClosure } from '../settings/useCancelClosure'
import { SetupProgressCard } from '../settings/OnboardingChecklist'
import { ActivityList } from '../shared/ActivityList'
import { MostViewedList } from '../analytics/MostViewedList'
import { hasArModel, productArReadiness } from '../products/productReadiness'

export default function BusinessOverviewPage() {
  const business = useCurrentBusiness()
  const summary = useServiceQuery(() => service.getBusinessAnalytics(business.id), [business.id])
  const products = useServiceQuery(() => service.getProductsByBusiness(business.id), [business.id])
  const activity = useServiceQuery(() => service.getRecentActivity({ businessId: business.id, limit: 6 }), [business.id])
  const s = summary.data
  const isPublic = business.status === 'active'
  const nothingPublished = !!products.data && !products.data.some((p) => p.status === 'published')
  const productMap = new Map((products.data ?? []).map((p) => [p.id, p]))
  const top = (s?.byProduct ?? []).filter((r) => productMap.has(r.productId) && r.views > 0).slice(0, 5)
  const withModel = products.data?.filter(hasArModel).length
  const productsFailed = products.status === 'error' && !products.data

  return (
    <>
      {/* The catalog link lives in the top bar only (D5); the header keeps the one primary action. */}
      <PageHeader
        title="Overview"
        description={business.name}
        meta={<BusinessStatusBadge status={business.status} />}
        actions={
          <ButtonLink to="/dashboard/products/new" variant="primary" className="max-sm:w-full" icon={<PackagePlus className="size-4" aria-hidden />}>
            Add product
          </ButtonLink>
        }
      />
      <ClosureBanner />
      <SetupProgressCard scope="business" className="mb-6 block" />
      {summary.status === 'error' && !s ? (
        <Card>
          <ErrorState message={summary.error.message} onRetry={summary.refetch} />
        </Card>
      ) : (
        <div className="space-y-6">
          <StatGroup
            loading={!s}
            stats={[
              { label: 'Products', value: formatNumber(s?.totals.products ?? 0), hint: withModel !== undefined ? `${formatNumber(withModel)} with a 3D model` : undefined },
              { label: 'Published', value: formatNumber(s?.totals.published ?? 0), hint: isPublic ? 'In your catalog' : 'Catalog not public yet' },
              { label: 'Drafts', value: formatNumber(s?.totals.drafts ?? 0), hint: 'Not published yet' },
              { label: 'Product page views', value: formatNumber(s?.totals.views ?? 0), hint: 'Last 30 days' },
              {
                label: 'AR launch attempts',
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
          {/* Grid items default to min-width: auto, so a long product name would widen a card past a phone screen. */}
          <div className="grid gap-6 lg:grid-cols-12 [&>*]:min-w-0">
            <NextSteps business={business} products={products.data} failed={productsFailed} className="lg:col-span-5" />
            <Card className={productsFailed ? 'lg:col-span-12' : 'lg:col-span-7'}>
              <PanelHeader
                title="Views and AR launch attempts"
                description="Last 30 days"
                actions={
                  <Link to="/dashboard/analytics" className={panelLinkClass}>
                    Open analytics <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                }
              />
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
            <Card className="lg:col-span-7">
              <PanelHeader title="Most viewed products" description="Product page views, last 30 days" />
              <CardBody>
                {productsFailed ? (
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
function NextSteps({ business, products, failed, className }: { business: Business; products: Product[] | undefined; failed?: boolean; className?: string }) {
  if (failed) return null // the Most viewed card already reports the failure and offers a retry
  if (!products)
    return (
      <Card className={className}>
        <PanelHeader title="Next steps" />
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
    return <StepsCard title="Get started" steps={steps} ordered className={className} />
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
  if (rows.length === 0)
    return <StepsCard title="Next steps" steps={[{ done: true, label: 'Every product is published with a 3D model and an iPhone AR file.' }]} className={className} />
  return <StepsCard title="Next steps" steps={rows} className={className} />
}

/** A card of rows: a small marker, one line of text and (for links) a chevron; 52px rows split by hairlines. */
function StepsCard({ title, steps, ordered, className }: { title: string; steps: Step[]; ordered?: boolean; className?: string }) {
  const List = ordered ? 'ol' : 'ul'
  return (
    <Card className={className}>
      <PanelHeader title={title} />
      <List className="divide-y divide-line px-6 pb-3">
        {steps.map((step, i) => {
          const marker = step.done ? (
            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
          ) : ordered ? (
            <span className="w-4 shrink-0 text-ink-muted tabular-nums" aria-hidden>
              {i + 1}.
            </span>
          ) : (
            <span className="size-2 shrink-0 rounded-[1px] bg-warning" aria-hidden />
          )
          const row = 'flex min-h-[52px] items-center gap-3 py-3 text-[length:var(--text-ui-body)] leading-[1.5]'
          return (
            <li key={step.label}>
              {step.to ? (
                <Link to={step.to} className={`${row} -mx-2 px-2 text-ink hover:bg-canvas/70`}>
                  {marker}
                  <span className="min-w-0 flex-1">{step.label}</span>
                  <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
                </Link>
              ) : (
                <div className={`${row} text-ink-muted`}>
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

/**
 * The owner asked to close the account (spec 8): the catalog is offline until the platform completes the closure,
 * and the owner can still withdraw the request here or in settings. Nothing shows while loading or on a failed check:
 * the closure state is not this page's data, and My account shows its own error.
 */
function ClosureBanner() {
  const { retry } = useAccount()
  const security = useServiceQuery(() => account.getSecurityState(), [])
  const { refetch } = security
  // The business status comes back too: load the business again so the status badge follows.
  const { cancel, cancelling } = useCancelClosure(
    useCallback(() => {
      refetch()
      retry()
    }, [refetch, retry]),
  )
  const closure = security.data?.closure
  if (!closure) return null

  return (
    <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-warning-soft px-4 py-3 text-ui-body text-warning">
      <p className="min-w-0">Closure requested on {formatDate(closure.requestedAt)} · Your catalog is offline.</p>
      <Button size="sm" onClick={() => void cancel()} loading={cancelling}>
        Cancel request
      </Button>
    </div>
  )
}

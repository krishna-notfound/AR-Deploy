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
import type { Business, BusinessStatus, Product } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { usePreferences } from '@/lib/preferences'
import { useFormat } from '@/lib/useFormat'
import { myProductsPath } from '@/lib/urls'
import { account, service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { useCancelClosure } from '../settings/useCancelClosure'
import { OWNER_CLOSURE_LINE } from '../businesses/closure'
import { SetupProgressCard } from '../settings/OnboardingChecklist'
import { ActivityList } from '../shared/ActivityList'
import { MostViewedList, formatArRate, mostViewed } from '../analytics/MostViewedList'
import { hasArModel, productArReadiness } from '../products/productReadiness'
import { PlatformChangesCard } from './PlatformChangesCard'

/** Where published products are, by the catalog's status (R-W5-8). */
const PUBLISHED_HINT: Record<BusinessStatus, TranslationKey> = {
  active: 'business.overview.publishedHint.active',
  draft: 'business.overview.publishedHint.draft',
  inactive: 'business.overview.publishedHint.inactive',
}

export default function BusinessOverviewPage() {
  const business = useCurrentBusiness()
  const { t, lang } = useI18n()
  const fmt = useFormat()
  const prefs = usePreferences()
  const timeZone = prefs?.timezone
  const summary = useServiceQuery(() => service.getBusinessAnalytics(business.id, { timeZone }), [business.id, timeZone])
  const products = useServiceQuery(() => service.getProductsByBusiness(business.id), [business.id])
  const activity = useServiceQuery(() => service.getRecentActivity({ businessId: business.id, limit: 6 }), [business.id])
  const s = summary.data
  const nothingPublished = !!products.data && !products.data.some((p) => p.status === 'published')
  const productMap = new Map((products.data ?? []).map((p) => [p.id, p]))
  const top = mostViewed(s?.byProduct ?? [], productMap)
  const withModel = products.data?.filter(hasArModel).length
  const productsFailed = products.status === 'error' && !products.data

  return (
    <>
      {/* The catalog link lives in the top bar only (D5); the header keeps the one primary action. */}
      <PageHeader
        title={t('business.overview.title')}
        description={business.name}
        meta={<BusinessStatusBadge status={business.status} />}
        actions={
          <ButtonLink to="/dashboard/products/new" variant="primary" className="max-sm:w-full" icon={<PackagePlus className="size-4" aria-hidden />}>
            {t('business.products.add')}
          </ButtonLink>
        }
      />
      <ClosureBanner />
      <SetupProgressCard scope="business" className="mb-6 block" />
      {summary.status === 'error' && !s ? (
        <Card>
          <ErrorState message={errorText(summary.error, t)} onRetry={summary.refetch} retryLabel={t('common.retry')} />
        </Card>
      ) : (
        <div className="space-y-6">
          <StatGroup
            loading={!s}
            stats={[
              { label: t('business.overview.stats.products'), value: fmt.number(s?.totals.products ?? 0), hint: withModel !== undefined ? t('business.overview.stats.withModel', { n: fmt.number(withModel) }) : undefined },
              { label: t('business.overview.stats.published'), value: fmt.number(s?.totals.published ?? 0), hint: t(PUBLISHED_HINT[business.status]) },
              { label: t('business.overview.stats.drafts'), value: fmt.number(s?.totals.drafts ?? 0), hint: t('business.overview.stats.draftsHint') },
              { label: t('business.overview.stats.views'), value: fmt.number(s?.totals.views ?? 0), hint: t('business.overview.last30') },
              {
                label: t('business.overview.stats.arAttempts'),
                value: fmt.number(s?.totals.arActivations ?? 0),
                hint: s && s.totals.views + s.totals.embedViews ? t('business.overview.stats.arRate', { rate: formatArRate(s.totals.arActivations / (s.totals.views + s.totals.embedViews), lang) }) : t('business.overview.last30'),
              },
            ]}
            footer={
              s?.isSample ? (
                <span className="flex flex-wrap items-center gap-2">
                  <SampleDataTag /> {t('business.overview.sampleNote')}
                </span>
              ) : undefined
            }
          />
          {/* Grid items default to min-width: auto, so a long product name would widen a card past a phone screen. */}
          <div className="grid gap-6 lg:grid-cols-12 [&>*]:min-w-0">
            <NextSteps business={business} products={products.data} failed={productsFailed} className="lg:col-span-5" />
            <Card className={productsFailed ? 'lg:col-span-12' : 'lg:col-span-7'}>
              <PanelHeader
                title={t('business.overview.trend.title')}
                description={t('business.overview.trend.description')}
                actions={
                  <Link to="/dashboard/analytics" className={panelLinkClass}>
                    {t('business.overview.trend.open')} <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                }
              />
              <CardBody>
                {/* With nothing published there is nothing to visit: flat lines would read as "no one is looking" (DUX-04). */}
                {nothingPublished && !s?.totals.views && !s?.totals.embedViews ? (
                  <EmptyState icon={BarChart3} title={t('business.overview.trend.emptyTitle')} body={t('business.overview.trend.emptyBody')} />
                ) : s ? (
                  <ActivityTrend data={s.series} compact prefs={prefs} />
                ) : (
                  <Skeleton className="h-32 w-full" />
                )}
              </CardBody>
            </Card>
            <Card className="lg:col-span-7">
              <PanelHeader title={t('business.overview.top.title')} description={t('business.overview.trend.description')} />
              <CardBody>
                {productsFailed ? (
                  <ErrorState message={t('business.overview.top.failed')} onRetry={products.refetch} retryLabel={t('common.retry')} />
                ) : !s || (products.status === 'loading' && !products.data) ? (
                  <SkeletonRows rows={4} />
                ) : top.length === 0 ? (
                  <EmptyState icon={BarChart3} title={t('business.overview.top.emptyTitle')} body={t('business.overview.top.emptyBody')} />
                ) : (
                  <MostViewedList rows={top} products={productMap} editBase="/dashboard/products" />
                )}
              </CardBody>
            </Card>
            <Card role="region" aria-label={t('business.overview.activity')} className="lg:col-span-5">
              <PanelHeader title={t('business.overview.activity')} />
              <CardBody>
                <ActivityList query={activity} />
              </CardBody>
            </Card>
            <PlatformChangesCard businessId={business.id} className="lg:col-span-12" />
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
  const { t, tn } = useI18n()
  if (failed) return null // the Most viewed card already reports the failure and offers a retry
  if (!products)
    return (
      <Card className={className}>
        <PanelHeader title={t('business.overview.next.title')} />
        <CardBody>
          <SkeletonRows rows={2} />
        </CardBody>
      </Card>
    )
  if (products.length === 0) {
    const steps: Step[] = [
      { label: t('business.overview.next.start1'), to: '/dashboard/products/new' },
      { label: t('business.overview.next.start2') },
      { label: t('business.overview.next.start3'), to: '/dashboard/catalog' },
    ]
    return <StepsCard title={t('business.overview.next.getStarted')} steps={steps} ordered className={className} />
  }
  const drafts = products.filter((p) => p.status === 'draft').length
  const readiness = products.map(productArReadiness)
  const noModel = readiness.filter((r) => r === 'photos-only').length
  const noUsdz = readiness.filter((r) => r === 'android-only').length
  const blocked = readiness.filter((r) => r === 'android-blocked').length
  const rows: Step[] = []
  if (business.status !== 'active')
    rows.push({ label: t(business.status === 'draft' ? 'business.overview.next.catalogDraft' : 'business.overview.next.catalogPaused'), to: '/dashboard/catalog' })
  if (drafts) rows.push({ label: tn('business.overview.next.drafts', drafts), to: myProductsPath({ status: 'draft' }) })
  if (noModel) rows.push({ label: tn('business.overview.next.noModel', noModel), to: myProductsPath({ ar: 'photos-only' }) })
  if (blocked) rows.push({ label: tn('business.overview.next.blocked', blocked), to: myProductsPath({ ar: 'android-blocked' }) })
  if (noUsdz) rows.push({ label: tn('business.overview.next.noUsdz', noUsdz), to: myProductsPath({ ar: 'android-only' }) })
  if (rows.length === 0)
    return <StepsCard title={t('business.overview.next.title')} steps={[{ done: true, label: t('business.overview.next.allDone') }]} className={className} />
  return <StepsCard title={t('business.overview.next.title')} steps={rows} className={className} />
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
  const { retry, business } = useAccount()
  const { t } = useI18n()
  const fmt = useFormat()
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
      <p className="min-w-0">
        {t('business.overview.closure.requested', { date: fmt.date(closure.requestedAt), line: OWNER_CLOSURE_LINE[business?.status ?? 'inactive'] })}
      </p>
      <Button size="sm" onClick={() => void cancel()} loading={cancelling}>
        {t('business.overview.closure.cancel')}
      </Button>
    </div>
  )
}

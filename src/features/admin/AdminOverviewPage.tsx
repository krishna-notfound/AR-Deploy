import { useCan } from '@/auth/usePermission'
import { ArrowRight, PackagePlus, Plus, QrCode } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { ActivityTrend } from '@/components/charts/ActivityTrend'
import { usePendingApplications } from '@/components/layout/dashboardContext'
import { PageHeader, PanelHeader, panelLinkClass } from '@/components/layout/PageHeader'
import { SampleDataTag } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { type Stat, StatGroup } from '@/components/ui/StatGroup'
import { SkeletonRows, Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { usePreferences } from '@/lib/preferences'
import { useFormat } from '@/lib/useFormat'
import { service } from '@/services'
import { ok } from '@/services/catalogService'
import { useServiceQuery } from '@/services/hooks'
import { ActivityList } from '../shared/ActivityList'
import { applicationsAdminPath } from '@/lib/urls'
import { MostViewedList, allViews, formatArRate, mostViewed } from '../analytics/MostViewedList'
import { hasArModel } from '../products/productReadiness'
import { useBusinesses } from '../products/useCatalogData'
import { SetupProgressCard } from '../settings/OnboardingChecklist'

export default function AdminOverviewPage() {
  const { t, lang } = useI18n()
  const f = useFormat()
  const can = useCan()
  const navigate = useNavigate()
  const prefs = usePreferences()
  const timeZone = prefs?.timezone
  // Each part needs its own permission (R-W5-1): the figures and Most viewed need analytics.view, the product counts
  // products.view and the business counts businesses.view. The database filters the same way.
  const canAnalytics = can('analytics.view')
  const canProducts = can('products.view')
  const canBusinesses = can('businesses.view')
  const needsSummary = canAnalytics || canProducts || canBusinesses
  const summary = useServiceQuery(() => (needsSummary ? service.getAnalytics({ timeZone }) : Promise.resolve(ok(null))), [timeZone, needsSummary])
  // Most viewed names products too: with analytics.view alone, RLS still returns the published ones.
  const needsProducts = canProducts || canAnalytics
  const products = useServiceQuery(() => (needsProducts ? service.getProducts() : Promise.resolve(ok(null))), [needsProducts])
  const { list: businesses, map: bizMap, query: bizQuery } = useBusinesses()
  const activity = useServiceQuery(() => service.getRecentActivity({ limit: 6 }), [])
  const s = summary.data

  const productMap = new Map((products.data ?? []).map((p) => [p.id, p]))
  const top = mostViewed(s?.byProduct ?? [], productMap)
  // Viewed products this person can't read (no products.view): say why they are missing instead of "no activity".
  const unnamedViews = !canProducts && (s?.byProduct ?? []).some((r) => allViews(r) > 0 && !productMap.has(r.productId))
  const activeBusinesses = businesses.filter((b) => b.status === 'active').length
  const withModel = products.data?.filter(hasArModel).length
  const stats: Stat[] = [
    ...(canBusinesses
      ? [{ label: t('nav.businesses'), value: f.number(s?.totals.businesses ?? 0), hint: bizQuery.data ? t('admin.overview.activeCount', { n: f.number(activeBusinesses) }) : undefined }]
      : []),
    ...(canProducts
      ? [
          { label: t('admin.overview.products'), value: f.number(s?.totals.products ?? 0), hint: withModel !== undefined ? t('admin.overview.withModel', { n: f.number(withModel) }) : undefined },
          { label: t('admin.overview.published'), value: f.number(s?.totals.published ?? 0), hint: s ? t('admin.overview.ofProducts', { n: f.number(s.totals.products) }) : undefined },
          { label: t('admin.overview.drafts'), value: f.number(s?.totals.drafts ?? 0), hint: t('admin.overview.notPublished') },
        ]
      : []),
    ...(canAnalytics
      ? [
          { label: t('admin.analytics.col.views'), value: f.number(s?.totals.views ?? 0), hint: t('admin.analytics.last30') },
          {
            label: t('admin.analytics.col.arAttempts'),
            value: f.number(s?.totals.arActivations ?? 0),
            hint: s && s.totals.views + s.totals.embedViews ? `${t('admin.analytics.last30')} · ${formatArRate(s.totals.arActivations / (s.totals.views + s.totals.embedViews), lang)}` : t('admin.analytics.last30'),
          },
        ]
      : []),
  ]

  const recentActivity = (
    <Card role="region" aria-label={t('admin.overview.recent')} className={canAnalytics ? 'lg:col-span-5' : 'lg:col-span-12'}>
      <PanelHeader title={t('admin.overview.recent')} description={t('admin.overview.recentDesc')} />
      <CardBody className="sm:px-6">
        <ActivityList query={activity} />
      </CardBody>
    </Card>
  )

  return (
    <>
      <PageHeader
        title={t('nav.overview')}
        description={t('admin.overview.description')}
        more={[
          ...(can('products.view') ? [{ label: t('admin.overview.viewCatalogs'), icon: <QrCode aria-hidden />, onSelect: () => void navigate('/admin/catalogs') }] : []),
          ...(can('products.edit') ? [{ label: t('admin.products.add'), icon: <PackagePlus aria-hidden />, onSelect: () => void navigate('/admin/products/new') }] : []),
        ]}
        actions={
          <>
            {can('products.view') && (
              <ButtonLink to="/admin/catalogs" variant="ghost" className="max-sm:hidden" icon={<QrCode className="size-4" aria-hidden />}>
                {t('admin.overview.viewCatalogs')}
              </ButtonLink>
            )}
            {can('products.edit') && (
              <ButtonLink to="/admin/products/new" variant="secondary" className="max-sm:hidden" icon={<PackagePlus className="size-4" aria-hidden />}>
                {t('admin.products.add')}
              </ButtonLink>
            )}
            {can('businesses.edit') && (
              <ButtonLink to="/admin/businesses/new" variant="primary" icon={<Plus className="size-4" aria-hidden />}>
                {t('admin.catalogs.createBusiness')}
              </ButtonLink>
            )}
          </>
        }
      />

      {can('applications.view') && <PendingApplications />}
      <SetupProgressCard scope="admin" className="mb-6 block" />

      {summary.status === 'error' && !s ? (
        <Card>
          <ErrorState message={errorText(summary.error, t)} onRetry={summary.refetch} />
        </Card>
      ) : (
        <div className="space-y-6">
          {stats.length > 0 && (
            <StatGroup
              loading={!s}
              stats={stats}
              footer={
                canAnalytics && s?.isSample ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <SampleDataTag /> {t('admin.overview.sampleFooter')}
                  </span>
                ) : undefined
              }
            />
          )}

          {canAnalytics ? (
            <Card>
              <PanelHeader
                title={t('admin.analytics.trendTitle')}
                description={t('admin.overview.trendDesc')}
                actions={
                  <Link to="/admin/analytics" className={panelLinkClass}>
                    {t('admin.overview.openAnalytics')} <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                }
              />
              <CardBody className="sm:px-6 sm:pb-6">{s ? <ActivityTrend data={s.series} compact prefs={prefs} emptyBody={t('admin.analytics.trendEmptyPlatform')} /> : <Skeleton className="h-32 w-full" />}</CardBody>
            </Card>
          ) : (
            <p className="rounded-[var(--radius-card)] border border-line px-4 py-4 text-[length:var(--text-ui-body)] text-ink-muted sm:px-6">{t('admin.overview.noAnalyticsAccess')}</p>
          )}

          {/* Grid items default to min-width: auto, so a long product name would widen the card past a phone screen. */}
          <div className="grid gap-6 lg:grid-cols-12 [&>*]:min-w-0">
            {canAnalytics && (
              <Card className="lg:col-span-7">
                <PanelHeader
                  title={t('admin.analytics.mostViewedTitle')}
                  description={t('admin.analytics.pageEmbedDesc')}
                  actions={
                    <Link to="/admin/analytics" className={panelLinkClass}>
                      {t('admin.overview.fullRanking')} <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  }
                />
                <CardBody className="sm:px-6">
                  {products.status === 'error' && !products.data ? (
                    <ErrorState message={errorText(products.error, t)} onRetry={products.refetch} />
                  ) : !s || products.status === 'loading' ? (
                    <SkeletonRows rows={4} />
                  ) : top.length === 0 && !unnamedViews ? (
                    <EmptyState title={t('admin.analytics.noActivityTitle')} />
                  ) : (
                    <>
                      {top.length > 0 && <MostViewedList rows={top} products={productMap} businesses={bizMap} editBase={can('products.edit') ? '/admin/products' : undefined} />}
                      {unnamedViews && <p className="py-3 text-[length:var(--text-ui-small)] text-ink-muted">{t('admin.overview.namesNeedPermission')}</p>}
                    </>
                  )}
                </CardBody>
              </Card>
            )}
            {recentActivity}
          </div>
        </div>
      )}
    </>
  )
}

/** Applications waiting for a decision (submitted or under review), so new submissions are seen without opening Applications. */
function PendingApplications() {
  const { t, tn } = useI18n()
  const f = useFormat()
  const q = usePendingApplications()
  const d = q.data
  const total = d?.total ?? 0
  if (q.status === 'loading' && !d)
    return (
      <div className="mb-6 rounded-[var(--radius-card)] border border-line px-4 py-4 sm:px-6" role="status" aria-label={t('admin.overview.loadingApplications')}>
        <Skeleton className="h-4 w-1/3" />
      </div>
    )
  if (q.status === 'error' && !d)
    return (
      <Card className="mb-6">
        <ErrorState message={`${t('admin.overview.loadApplicationsFailed')} ${errorText(q.error, t)}`} onRetry={q.refetch} className="py-6" />
      </Card>
    )
  if (!d || total === 0)
    return (
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-card)] border border-line px-4 py-4 sm:px-6">
        <h2 className="min-w-0 flex-1 text-[length:var(--text-ui-body)] text-ink-muted">{t('admin.overview.noPending')}</h2>
        <Link to={applicationsAdminPath()} className={panelLinkClass}>
          {t('admin.overview.viewApplications')} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    )
  return (
    <section className="mb-6 flex flex-wrap items-center justify-between gap-x-5 gap-y-1 rounded-[var(--radius-card)] border border-line bg-accent-soft px-4 py-4 sm:px-6" aria-labelledby="pending-apps">
      <div className="min-w-[10rem]">
        <h2 id="pending-apps" className="text-[15px] leading-tight font-medium text-ink">
          {tn('admin.overview.awaiting', total, { n: f.number(total) })}
        </h2>
        <p className="mt-0.5 text-[length:var(--text-ui-small)] leading-tight text-ink-muted">
          {t('admin.overview.newUnderReview', { new: f.number(d.submitted), review: f.number(d.underReview) })}
        </p>
      </div>
      <Link
        to={applicationsAdminPath(d.submitted > 0 ? 'submitted' : 'under_review')}
        className="inline-flex min-h-11 items-center gap-1.5 text-[length:var(--text-ui-body)] font-medium text-accent-ink hover:underline"
      >
        {t('admin.overview.reviewApplications')} <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  )
}

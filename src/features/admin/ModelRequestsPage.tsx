// The staff 3D model request queue, /admin/model-requests (S4 R-S4-10).
import { Box } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { Thumb } from '@/components/ui/SmartImage'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import type { ModelRequest, ModelRequestStatus } from '@/domain/modelRequests'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { modelRequestAdminPath, modelRequestsAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { useModelRequests } from '../modelRequests/hooks'
import { ModelRequestStatusBadge } from '../modelRequests/ModelRequestStatusBadge'

const PAGE_SIZE = 50

type Tab = 'open' | 'delivered' | 'rejected' | 'cancelled' | 'all'
const TABS: { value: Tab; label: TranslationKey; empty: TranslationKey; statuses?: ModelRequestStatus[] }[] = [
  { value: 'open', label: 'admin.modelRequests.tab.open', empty: 'admin.modelRequests.empty.open', statuses: ['requested', 'in_progress'] },
  { value: 'delivered', label: 'admin.modelRequests.tab.delivered', empty: 'admin.modelRequests.empty.delivered', statuses: ['delivered'] },
  { value: 'rejected', label: 'admin.modelRequests.tab.rejected', empty: 'admin.modelRequests.empty.rejected', statuses: ['rejected'] },
  { value: 'cancelled', label: 'admin.modelRequests.tab.cancelled', empty: 'admin.modelRequests.empty.cancelled', statuses: ['cancelled'] },
  { value: 'all', label: 'admin.modelRequests.tab.all', empty: 'admin.modelRequests.empty.all' },
]

/** Staff with models.manage: requests by tab, oldest open first (the next to start); the route is permission-gated. */
export default function ModelRequestsPage() {
  const { t, tn } = useI18n()
  const f = useFormat()
  const targetOf = (r: ModelRequest) => r.variantName?.en ?? t('admin.modelRequests.product')
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((x) => x.value === params.get('status')) ?? TABS[0]!
  const businessId = params.get('business') ?? undefined
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const q = useModelRequests({ status: tab.statuses, businessId, page, pageSize: PAGE_SIZE })
  // The name for the business filter chip; a failed read falls back to a neutral phrase.
  const business = useServiceQuery(() => (businessId ? service.getBusinessById(businessId) : Promise.resolve({ ok: true as const, data: null })), [businessId])
  const clearBusiness = modelRequestsAdminPath({ status: tab.value === 'open' ? undefined : tab.value })
  const emptyTitle = t(tab.empty)
  const emptyBody = tab.value === 'open' ? t('admin.modelRequests.emptyOpenBody') : undefined

  return (
    <>
      <PageHeader title={t('admin.modelRequests.title')} description={t('admin.modelRequests.description')} />

      <Tabs<Tab>
        label={t('admin.businesses.list.filterStatus')}
        variant="pill"
        tabs={TABS.map((x) => ({ value: x.value, label: t(x.label) }))}
        value={tab.value}
        onChange={(v) => setParam('status', v === 'open' ? '' : v)}
        className="mb-6"
      />

      {businessId && (
        <p data-testid="business-filter" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-ui-body text-ink-muted">
          <span>
            {t('admin.modelRequests.businessLabel')} <span className="font-medium text-ink">{business.data?.name ?? t('admin.modelRequests.thisBusiness')}</span>
          </span>
          <Link to={clearBusiness} className="font-medium text-accent-ink hover:underline">
            {t('admin.modelRequests.clearBusiness')}
          </Link>
        </p>
      )}

      <Card>
        <h2 className="sr-only">{t('admin.applications.results')}</h2>
        {q.status === 'loading' && !q.data ? (
          <div className="p-5 sm:px-6">
            <SkeletonRows rows={5} />
          </div>
        ) : q.status === 'error' && !q.data ? (
          <ErrorState message={t('admin.businesses.models.loadError')} onRetry={q.refetch} className="py-16" />
        ) : !q.data?.items.length && (q.data?.total ?? 0) > 0 ? (
          <EmptyState icon={Box} title={t('admin.modelRequests.pastLastTitle')} body={t('admin.modelRequests.pastLastBody', { page })} className="py-16" />
        ) : !q.data?.items.length ? (
          <EmptyState icon={Box} title={emptyTitle} body={emptyBody} className="py-16" />
        ) : (
          <>
            {/* Phones: one card per request with the same fields. */}
            <ul className="divide-y divide-subtle sm:hidden" aria-label={t('admin.modelRequests.title')}>
              {q.data.items.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3 break-words [overflow-wrap:anywhere]">
                  <Thumb src={r.productPhotoUrl} alt="" size="lg" />
                  <div className="min-w-0 flex-1">
                    <Link to={modelRequestAdminPath(r.id)} className="block text-sm leading-5 font-medium text-ink hover:underline">
                      {r.productName.en}
                    </Link>
                    <p className="text-[13px] leading-[18px] text-ink-muted">
                      {r.businessName} · {targetOf(r)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted">
                      <ModelRequestStatusBadge status={r.status} />
                      <span>{tn('admin.modelRequests.photos', r.photoCount, { n: f.number(r.photoCount) })}</span>
                      <span className="tabular-nums">
                        {f.date(r.createdAt)} · {f.relative(r.createdAt)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('admin.modelRequests.title')}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-[13px] leading-[18px] font-medium text-ink-muted">
                    <th scope="col" className="h-10 w-[30%] px-4 py-0 pl-6 font-medium whitespace-nowrap">
                      {t('admin.analytics.col.product')}
                    </th>
                    <th scope="col" className="h-10 px-4 py-0 font-medium whitespace-nowrap">
                      {t('admin.catalogs.business')}
                    </th>
                    <th scope="col" className="h-10 px-4 py-0 font-medium whitespace-nowrap">
                      {t('admin.modelRequests.target')}
                    </th>
                    <th scope="col" className="h-10 px-4 py-0 text-right font-medium whitespace-nowrap">
                      {t('admin.modelRequests.photosHeader')}
                    </th>
                    <th scope="col" className="h-10 px-4 py-0 font-medium whitespace-nowrap">
                      {t('admin.modelRequests.requested')}
                    </th>
                    <th scope="col" className="h-10 py-0 pr-6 pl-4 font-medium whitespace-nowrap">
                      {t('common.status')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {q.data.items.map((r) => (
                    <RequestRow key={r.id} r={r} />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={(p) => setParam('page', p > 1 ? String(p) : '')} noun={t('admin.modelRequests.noun')} />
          </>
        )}
      </Card>
    </>
  )
}

function RequestRow({ r }: { r: ModelRequest }) {
  const { t } = useI18n()
  const f = useFormat()
  const targetOf = (x: ModelRequest) => x.variantName?.en ?? t('admin.modelRequests.product')
  return (
    <tr className="h-[60px] transition-colors hover:bg-canvas/70">
      <td className="min-w-0 py-[11px] pr-4 pl-6 align-middle break-words [overflow-wrap:anywhere]">
        <div className="flex items-center gap-3">
          <Thumb src={r.productPhotoUrl} alt="" />
          <Link data-testid="request-product" to={modelRequestAdminPath(r.id)} className="text-sm leading-5 font-medium text-ink hover:underline">
            {r.productName.en}
          </Link>
        </div>
      </td>
      <td className="px-4 py-[11px] align-middle text-ink">{r.businessName}</td>
      <td className="px-4 py-[11px] align-middle text-ink">{targetOf(r)}</td>
      <td className="px-4 py-[11px] text-right align-middle tabular-nums text-ink">{f.number(r.photoCount)}</td>
      <td className="px-4 py-[11px] align-middle whitespace-nowrap tabular-nums">
        <p className="text-sm leading-5 text-ink">{f.date(r.createdAt)}</p>
        <p className="text-[13px] leading-[18px] text-ink-muted">{f.relative(r.createdAt)}</p>
      </td>
      <td className="py-[11px] pr-6 pl-4 align-middle">
        <ModelRequestStatusBadge status={r.status} />
      </td>
    </tr>
  )
}

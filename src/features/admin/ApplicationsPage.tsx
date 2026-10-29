import { Inbox } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormField, Input } from '@/components/ui/Form'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { APPLICATION_STATUSES, type ApplicationStatus, type BusinessApplication } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { applicationAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { ApplicationStatusBadge, joinPlace } from '../applications/labels'
import { Monogram } from '../applications/Monogram'

const PAGE_SIZE = 20

type TabValue = 'all' | ApplicationStatus

const isOpen = (s: ApplicationStatus) => s === 'submitted' || s === 'under_review'

/** Business applications from the public wizard (platform admins; rows come from the database). */
export default function ApplicationsPage() {
  const { t, tn } = useI18n()
  const f = useFormat()
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const status = (APPLICATION_STATUSES as readonly string[]).includes(params.get('status') ?? '') ? (params.get('status') as ApplicationStatus) : undefined
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const q = useServiceQuery(
    () => service.getApplications({ search, status, from: from || undefined, to: to || undefined, page, pageSize: PAGE_SIZE }),
    [search, status, from, to, page],
  )
  // Tab counts under the same search and dates, so each tab says how many rows it holds.
  const counts = useServiceQuery(async () => {
    const res = await Promise.all(
      APPLICATION_STATUSES.map((s) => service.getApplications({ search, status: s, from: from || undefined, to: to || undefined, pageSize: 1 })),
    )
    const failed = res.find((r) => !r.ok)
    if (failed && !failed.ok) return failed
    const by = Object.fromEntries(APPLICATION_STATUSES.map((s, i) => [s, (res[i] as { ok: true; data: { total: number } }).data.total])) as Record<ApplicationStatus, number>
    return { ok: true as const, data: by }
  }, [search, from, to])
  const filtered = !!(search || status || from || to)
  const count = (v: TabValue) => {
    if (!counts.data) return undefined
    return v === 'all' ? APPLICATION_STATUSES.reduce((n, s) => n + counts.data![s], 0) : counts.data[v]
  }
  const tabs = (['all', ...APPLICATION_STATUSES] as TabValue[]).map((v) => {
    const n = count(v)
    return {
      value: v,
      label: t(`admin.applications.status.${v}`),
      badge: n === undefined ? undefined : f.number(n),
    }
  })

  return (
    <>
      <PageHeader title={t('nav.applications')} description={t('admin.applications.description')} />

      <Tabs<TabValue> label={t('admin.businesses.list.filterStatus')} variant="pill" tabs={tabs} value={status ?? 'all'} onChange={(v) => setParam('status', v === 'all' ? '' : v)} className="mb-6" />

      <Card>
        <div className="grid grid-cols-2 items-end gap-3 border-b border-line p-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_10rem_10rem]">
          <FormField label={t('admin.applications.search')} className="col-span-2 md:col-span-1">
            <SearchInput value={search} onChange={(v) => setParam('q', v)} label={t('admin.applications.search')} placeholder={t('admin.applications.search')} className="w-full" />
          </FormField>
          <FormField label={t('admin.applications.submittedFrom')}>
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setParam('from', e.target.value)} />
          </FormField>
          <FormField label={t('admin.applications.to')}>
            <Input type="date" value={to} min={from || undefined} onChange={(e) => setParam('to', e.target.value)} />
          </FormField>
        </div>
        <h2 className="sr-only">{t('admin.applications.results')}</h2>
        {q.status === 'loading' && !q.data ? (
          <div className="p-5 sm:px-6">
            <SkeletonRows rows={5} />
          </div>
        ) : q.status === 'error' && !q.data ? (
          <ErrorState message={errorText(q.error, t)} onRetry={q.refetch} className="py-16" />
        ) : !q.data?.items.length && (q.data?.total ?? 0) > 0 ? (
          <EmptyState
            icon={Inbox}
            title={t('admin.applications.pastLastTitle')}
            body={tn('admin.applications.pastLastBody', q.data?.total ?? 0, { n: f.number(q.data?.total ?? 0), page })}
            action={<Button onClick={() => setParam('page', '')}>{t('admin.applications.firstPage')}</Button>}
            className="py-16"
          />
        ) : !q.data?.items.length ? (
          <EmptyState
            icon={Inbox}
            title={t(filtered ? 'admin.applications.noMatchTitle' : 'admin.applications.emptyTitle')}
            body={t(filtered ? 'admin.applications.noMatchBody' : 'admin.applications.emptyBody')}
            className="py-16"
          />
        ) : (
          <>
            {/* Phones: one two-line row per application. */}
            <ul className="divide-y divide-subtle sm:hidden" aria-label={t('admin.applications.list')}>
              {q.data.items.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3 break-words [overflow-wrap:anywhere]">
                  <Monogram name={a.businessName} />
                  <div className="min-w-0 flex-1">
                    <Link to={applicationAdminPath(a.id)} className="block text-sm leading-5 font-medium text-ink hover:underline">
                      {a.businessName}
                    </Link>
                    <p className="text-[13px] leading-[18px] text-ink-muted">
                      {[a.applicantName, joinPlace(a.city, a.country)].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted">
                      <ApplicationStatusBadge status={a.status} />
                      <span className="tabular-nums">{t('admin.applications.submittedOn', { date: f.date(a.createdAt) })}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('admin.applications.list')}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-[13px] leading-[18px] font-medium text-ink-muted">
                    <th scope="col" className="h-10 w-[35%] px-4 py-0 pl-6 font-medium whitespace-nowrap">
                      {t('admin.catalogs.business')}
                    </th>
                    <th scope="col" className="h-10 px-4 py-0 font-medium whitespace-nowrap">
                      {t('admin.applications.applicant')}
                    </th>
                    <th scope="col" className="h-10 px-4 py-0 font-medium whitespace-nowrap">
                      {t('common.status')}
                    </th>
                    <th scope="col" className="hidden h-10 px-4 py-0 text-right font-medium whitespace-nowrap lg:table-cell">
                      {t('admin.applications.status.submitted')}
                    </th>
                    <th scope="col" className="h-10 w-12 py-0 pr-6 pl-4 text-right font-medium whitespace-nowrap">
                      <span className="sr-only">{t('common.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {q.data.items.map((a) => (
                    <ApplicationRow key={a.id} a={a} />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={(p) => setParam('page', String(p))} noun={t('admin.applications.noun')} />
          </>
        )}
      </Card>
    </>
  )
}

function ApplicationRow({ a }: { a: BusinessApplication }) {
  const { t } = useI18n()
  const f = useFormat()
  const nameId = `app-${a.id}`
  return (
    <tr className="h-[60px] transition-colors hover:bg-canvas/70">
      <td className="min-w-0 py-[11px] pr-4 pl-6 align-middle break-words [overflow-wrap:anywhere]">
        <div className="flex items-center gap-3">
          <Monogram name={a.businessName} />
          <div className="min-w-0">
            <Link id={nameId} to={applicationAdminPath(a.id)} className="text-sm leading-5 font-medium text-ink hover:underline">
              {a.businessName}
            </Link>
            <p className="text-[13px] leading-[18px] text-ink-muted">
              #{a.reference} · <span className="capitalize">{a.category}</span>
              {joinPlace(a.city, a.country) && ` · ${joinPlace(a.city, a.country)}`}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-[11px] align-middle">
        <p className="text-sm leading-5 text-ink">{a.applicantName}</p>
        <p className="max-w-[16rem] truncate text-[13px] leading-[18px] text-ink-muted">{a.applicantEmail}</p>
      </td>
      <td className="px-4 py-[11px] align-middle">
        <ApplicationStatusBadge status={a.status} />
      </td>
      <td className="hidden px-4 py-[11px] text-right align-middle whitespace-nowrap tabular-nums lg:table-cell">
        <p className="text-sm leading-5 text-ink">{f.date(a.createdAt)}</p>
        <p className="text-[13px] leading-[18px] text-ink-muted">{t('admin.applications.updatedAgo', { when: f.relative(a.updatedAt) })}</p>
      </td>
      <td className="py-[11px] pr-6 pl-4 text-right align-middle">
        <ButtonLink to={applicationAdminPath(a.id)} size="sm" variant={isOpen(a.status) ? 'secondary' : 'ghost'} aria-describedby={nameId}>
          {t(isOpen(a.status) ? 'admin.applications.review' : 'admin.applications.view')}
        </ButtonLink>
      </td>
    </tr>
  )
}

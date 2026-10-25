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
import { formatDate, formatNumber, formatRelative } from '@/lib/format'
import { applicationAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { ApplicationStatusBadge, applicationStatusLabel } from '../applications/labels'
import { Monogram } from '../applications/Monogram'

const PAGE_SIZE = 20

type TabValue = 'all' | ApplicationStatus

const isOpen = (s: ApplicationStatus) => s === 'submitted' || s === 'under_review'

/** Business applications from the public wizard (platform admins; rows come from the database). */
export default function ApplicationsPage() {
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
      label: v === 'all' ? 'All' : applicationStatusLabel(v),
      badge: n === undefined ? undefined : <span className="tabular-nums opacity-75">({formatNumber(n)})</span>,
    }
  })

  return (
    <>
      <PageHeader title="Applications" description="Businesses that applied to join Sanctus. Approving one creates its business as a draft; then invite the owner." />

      <Card>
        <div className="grid grid-cols-2 items-end gap-3 border-b border-line p-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_10rem_10rem]">
          <FormField label="Search" className="col-span-2 md:col-span-1">
            <SearchInput value={search} onChange={(v) => setParam('q', v)} label="Search applications" placeholder="Business, applicant, email or reference" />
          </FormField>
          <FormField label="Submitted from">
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setParam('from', e.target.value)} />
          </FormField>
          <FormField label="to">
            <Input type="date" value={to} min={from || undefined} onChange={(e) => setParam('to', e.target.value)} />
          </FormField>
        </div>
        <div className="border-b border-line px-4 py-3 sm:px-6">
          <Tabs<TabValue> label="Filter by status" variant="pill" tabs={tabs} value={status ?? 'all'} onChange={(v) => setParam('status', v === 'all' ? '' : v)} />
        </div>

        <h2 className="sr-only">Results</h2>
        {q.status === 'loading' && !q.data ? (
          <div className="p-5 sm:px-6">
            <SkeletonRows rows={5} />
          </div>
        ) : q.status === 'error' && !q.data ? (
          <ErrorState message={q.error.message} onRetry={q.refetch} className="py-16" />
        ) : !q.data?.items.length && (q.data?.total ?? 0) > 0 ? (
          <EmptyState
            icon={Inbox}
            title="No applications on this page"
            body={`There are ${q.data?.total} applications, but page ${page} is past the last page.`}
            action={<Button onClick={() => setParam('page', '')}>Go to the first page</Button>}
            className="py-16"
          />
        ) : !q.data?.items.length ? (
          <EmptyState
            icon={Inbox}
            title={filtered ? 'No applications match these filters' : 'No applications yet'}
            body={filtered ? 'Change the search, status or dates.' : 'Applications from the public “Apply as a business” page appear here.'}
            className="py-16"
          />
        ) : (
          <>
            {/* Phones: one card per application. */}
            <ul className="divide-y divide-line md:hidden" aria-label="Business applications">
              {q.data.items.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-4">
                  <Monogram name={a.businessName} />
                  <div className="min-w-0 flex-1">
                    <Link to={applicationAdminPath(a.id)} className="block truncate text-sm font-medium text-ink hover:underline">
                      {a.businessName}
                    </Link>
                    <p className="truncate text-xs text-ink-muted">
                      {a.applicantName} · {a.city}, {a.country}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                      <ApplicationStatusBadge status={a.status} />
                      <span>Submitted {formatDate(a.createdAt)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Business applications</caption>
                <thead className="border-b border-line bg-canvas/50 text-[10.5px] tracking-[0.16em] text-ink-muted uppercase">
                  <tr>
                    <th scope="col" className="py-3 pr-4 pl-6 font-medium">
                      Business
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Applicant
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Status
                    </th>
                    <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">
                      Submitted
                    </th>
                    <th scope="col" className="py-3 pr-6 pl-4 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {q.data.items.map((a) => (
                    <ApplicationRow key={a.id} a={a} />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={(p) => setParam('page', String(p))} noun="applications" />
          </>
        )}
      </Card>
    </>
  )
}

function ApplicationRow({ a }: { a: BusinessApplication }) {
  const nameId = `app-${a.id}`
  return (
    <tr className="transition-colors hover:bg-canvas/70">
      <td className="py-4 pr-4 pl-6">
        <div className="flex items-center gap-3">
          <Monogram name={a.businessName} />
          <div className="min-w-0">
            <Link id={nameId} to={applicationAdminPath(a.id)} className="font-medium text-ink hover:underline">
              {a.businessName}
            </Link>
            <p className="text-xs text-ink-muted">
              #{a.reference} · <span className="capitalize">{a.category}</span> · {a.city}, {a.country}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <p className="text-ink-body">{a.applicantName}</p>
        <p className="max-w-[16rem] truncate text-xs text-ink-muted">{a.applicantEmail}</p>
      </td>
      <td className="px-4 py-4">
        <ApplicationStatusBadge status={a.status} />
      </td>
      <td className="hidden px-4 py-4 whitespace-nowrap lg:table-cell">
        <p className="text-ink-body">{formatDate(a.createdAt)}</p>
        <p className="text-xs text-ink-muted">Updated {formatRelative(a.updatedAt)}</p>
      </td>
      <td className="py-4 pr-6 pl-4 text-right">
        <ButtonLink to={applicationAdminPath(a.id)} size="sm" variant={isOpen(a.status) ? 'primary' : 'secondary'} aria-describedby={nameId}>
          {isOpen(a.status) ? 'Review' : 'View'}
        </ButtonLink>
      </td>
    </tr>
  )
}

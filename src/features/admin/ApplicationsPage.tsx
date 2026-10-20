import { Inbox } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormField, Input, Select } from '@/components/ui/Form'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { APPLICATION_STATUSES, type ApplicationStatus } from '@/domain/types'
import { formatDateTime } from '@/lib/format'
import { applicationAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { ApplicationStatusBadge, applicationStatusLabel } from '../applications/labels'

const PAGE_SIZE = 20

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
  const filtered = !!(search || status || from || to)

  return (
    <>
      <PageHeader title="Applications" description="Businesses that applied to join Sanctus. Approving one creates its business as a draft; then invite the owner." />
      <Card className="mb-5 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto_auto] md:items-end">
          <FormField label="Search">
            <SearchInput value={search} onChange={(v) => setParam('q', v)} label="Search applications" placeholder="Business, applicant, email or reference" />
          </FormField>
          <FormField label="Status">
            <Select value={status ?? ''} onChange={(e) => setParam('status', e.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              {APPLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {applicationStatusLabel(s)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Submitted from">
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setParam('from', e.target.value)} />
          </FormField>
          <FormField label="to">
            <Input type="date" value={to} min={from || undefined} onChange={(e) => setParam('to', e.target.value)} />
          </FormField>
        </div>
      </Card>

      <Card>
        <h2 className="sr-only">Results</h2>
        {q.status === 'loading' && !q.data ? (
          <div className="p-5">
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
            body={filtered ? 'Change the search or filters.' : 'Applications from the public “Apply as a business” page appear here.'}
            className="py-16"
          />
        ) : (
          <>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Business applications</caption>
              <thead className="border-b border-line text-xs text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Business</th>
                  <th className="hidden px-5 py-3 font-medium md:table-cell">Applicant</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="hidden px-5 py-3 font-medium lg:table-cell">Submitted</th>
                  <th className="hidden px-5 py-3 font-medium lg:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data.items.map((a) => (
                  <tr key={a.id} className="hover:bg-subtle/60">
                    <td className="px-5 py-3">
                      <Link to={applicationAdminPath(a.id)} className="font-medium text-ink hover:underline">
                        {a.businessName}
                      </Link>
                      <p className="text-xs text-ink-muted">
                        #{a.reference} · {a.category} · {a.city}, {a.country}
                      </p>
                    </td>
                    <td className="hidden px-5 py-3 md:table-cell">
                      <p className="text-ink-body">{a.applicantName}</p>
                      <p className="text-xs text-ink-muted">{a.applicantEmail}</p>
                    </td>
                    <td className="px-5 py-3">
                      <ApplicationStatusBadge status={a.status} />
                    </td>
                    <td className="hidden px-5 py-3 text-ink-muted lg:table-cell">{formatDateTime(a.createdAt)}</td>
                    <td className="hidden px-5 py-3 text-ink-muted lg:table-cell">{formatDateTime(a.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-line px-5 py-3">
              <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={(p) => setParam('page', String(p))} noun="applications" />
            </div>
          </>
        )}
      </Card>
    </>
  )
}

import { History } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { formatDateTime } from '@/lib/format'
import { applicationAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { eventLabel, statusWord } from '../applications/labels'

const PAGE_SIZE = 30

/** Administrative audit trail (append-only, written on the server). */
export default function AuditLogPage() {
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  const q = useServiceQuery(() => service.getAuditEvents({ search, page, pageSize: PAGE_SIZE }), [search, page])

  return (
    <>
      <PageHeader title="Audit log" description="Who did what, recorded by the server. Entries cannot be edited or deleted." />
      <Card className="mb-5 p-4">
        <SearchInput value={search} onChange={(v) => set('q', v)} label="Search events" placeholder="Event, e.g. approved, invitation, owner" className="md:max-w-md" />
      </Card>
      <Card>
        {q.status === 'loading' && !q.data ? (
          <div className="p-5">
            <SkeletonRows rows={6} />
          </div>
        ) : q.status === 'error' && !q.data ? (
          <ErrorState message={q.error.message} onRetry={q.refetch} className="py-16" />
        ) : !q.data?.items.length ? (
          <EmptyState icon={History} title={search ? 'No events match this search' : 'No events yet'} className="py-16" />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {q.data.items.map((e) => (
                <li key={e.id} className="grid gap-1 px-5 py-3 md:grid-cols-[200px_1fr_auto] md:items-center md:gap-4">
                  <span className="text-xs text-ink-muted">{formatDateTime(e.createdAt)}</span>
                  <span className="text-sm text-ink">
                    <span className="font-medium">{eventLabel(e.eventType)}</span>
                    {e.toStatus && (
                      <span className="text-ink-muted">
                        {' '}
                        · {e.fromStatus ? `${statusWord(e.fromStatus)} → ` : ''}
                        {statusWord(e.toStatus)}
                      </span>
                    )}
                    {e.applicationId && (
                      <Link to={applicationAdminPath(e.applicationId)} className="ml-2 text-xs text-accent-ink hover:underline">
                        Application
                      </Link>
                    )}
                    {e.businessId && (
                      <Link to={`/admin/businesses/${e.businessId}`} className="ml-2 text-xs text-accent-ink hover:underline">
                        Business
                      </Link>
                    )}
                  </span>
                  <span className="text-xs text-ink-muted">{e.actorEmail ?? (e.actorId ? `User ${e.actorId.slice(0, 8)}` : 'System')}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 py-3">
              <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={(p) => set('page', String(p))} noun="events" />
            </div>
          </>
        )}
      </Card>
    </>
  )
}

import { History } from 'lucide-react'
import { PanelHeader } from '@/components/layout/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { ID } from '@/domain/types'
import { formatDateTime } from '@/lib/format'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { eventLabel, statusWord } from './labels'

/** Server-recorded history of an application and/or a business (actors and times come from the database). */
export function AuditTimeline({ applicationId, businessId, title = 'History' }: { applicationId?: ID; businessId?: ID; title?: string }) {
  const q = useServiceQuery(
    () => service.getAuditEvents({ applicationId, businessId, pageSize: 100 }),
    [applicationId, businessId],
  )
  const items = [...(q.data?.items ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return (
    <Card>
      <PanelHeader title={title} />
      <CardBody>
        {q.status === 'loading' && !q.data ? (
          <SkeletonRows rows={3} />
        ) : q.status === 'error' && !q.data ? (
          <ErrorState message={q.error.message} onRetry={q.refetch} />
        ) : !items.length ? (
          <EmptyState icon={History} title="No history yet" className="py-6" />
        ) : (
          <ol className="relative space-y-4 border-l border-line pl-5">
            {items.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute top-2 -left-[25px] size-2 rounded-full bg-ink" aria-hidden />
                <p className="text-ui-body text-ink">
                  <span className="font-medium">{eventLabel(e.eventType)}</span>
                  {e.toStatus && (
                    <span className="text-ink-muted">
                      {' '}
                      · {e.fromStatus ? `${statusWord(e.fromStatus)} → ` : ''}
                      {statusWord(e.toStatus)}
                    </span>
                  )}
                </p>
                <p className="text-ui-small text-ink-muted tabular-nums">
                  {formatDateTime(e.createdAt)} · {e.actorEmail ?? (e.actorId ? `User ${e.actorId.slice(0, 8)}` : 'System')}
                </p>
                {typeof e.metadata.reason === 'string' && <p className="mt-1 text-ui-small text-ink-body">Reason: {e.metadata.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  )
}

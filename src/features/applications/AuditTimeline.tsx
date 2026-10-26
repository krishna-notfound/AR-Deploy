import { History } from 'lucide-react'
import { Link } from 'react-router'
import { PanelHeader } from '@/components/layout/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { ID } from '@/domain/types'
import { formatDateTime } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { businessAdminPath } from '@/lib/urls'
import { service } from '@/services'
import type { AuditEntry } from '@/services/catalogService'
import { useServiceQuery } from '@/services/hooks'
import { eventLabel, statusWord } from './labels'

/**
 * Who acted (R-W7-1): the account's email when it is known, a shortened id for a live account without one, and the
 * role recorded at insert for a person whose account was deleted. No actor and no label: the system.
 */
export function actorText(e: AuditEntry): string {
  if (e.actorEmail) return e.actorEmail
  if (e.actorId) return `User ${e.actorId.slice(0, 8)}`
  return e.actorLabel ? `Deleted user (${e.actorLabel})` : 'System'
}

/** Server-recorded history of an application and/or a business (actors and times come from the database). */
export function AuditTimeline({ applicationId, businessId, title = 'History', note }: { applicationId?: ID; businessId?: ID; title?: string; note?: string }) {
  const prefs = usePreferences()
  const q = useServiceQuery(
    () => service.getAuditEvents({ applicationId, businessId, pageSize: 100 }),
    [applicationId, businessId],
  )
  const items = [...(q.data?.items ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return (
    <Card>
      <PanelHeader title={title} description={note} />
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
                  <span className="font-medium">{eventLabel(e.eventType, e.metadata)}</span>
                  {e.toStatus && (
                    <span className="text-ink-muted">
                      {' '}
                      · {e.fromStatus ? `${statusWord(e.fromStatus)} → ` : ''}
                      {statusWord(e.toStatus)}
                    </span>
                  )}
                </p>
                {/* The business the row is about, when it is not the one this timeline is for, or no longer exists. */}
                {e.businessId && (e.businessDeleted || e.businessId !== businessId) && (
                  <p className="text-ui-small [overflow-wrap:anywhere] text-ink-muted">
                    {e.businessDeleted ? (
                      `${e.businessName ?? 'Business'} (deleted)`
                    ) : (
                      <Link to={businessAdminPath(e.businessId)} className="text-accent-ink hover:underline">
                        {e.businessName ?? 'Business'}
                      </Link>
                    )}
                  </p>
                )}
                <p className="text-ui-small text-ink-muted tabular-nums">
                  {formatDateTime(e.createdAt, 'en', prefs)} · {actorText(e)}
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

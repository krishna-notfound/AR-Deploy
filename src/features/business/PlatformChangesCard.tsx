import { ShieldCheck } from 'lucide-react'
import { PanelHeader } from '@/components/layout/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { ID } from '@/domain/types'
import { formatDateTime } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { service } from '@/services'
import { activityMessage } from '@/services/analytics'
import { useServiceQuery } from '@/services/hooks'
import { eventLabel } from '../applications/labels'

/**
 * R-W7-2: what the platform team (Owner, Admin or Team) changed in this business's catalogue, the last 20, read-only.
 * The owner is also emailed about pauses, activations, unpublished and deleted products; this is where they are listed.
 */
export function PlatformChangesCard({ businessId, className }: { businessId: ID; className?: string }) {
  const prefs = usePreferences()
  const q = useServiceQuery(() => service.getPlatformChanges(businessId), [businessId])
  return (
    <Card role="region" aria-label="Changes by the platform team" className={className}>
      <PanelHeader title="Changes by the platform team" />
      <CardBody>
        {q.status === 'loading' && !q.data ? (
          <SkeletonRows rows={3} />
        ) : q.status === 'error' && !q.data ? (
          <ErrorState message={q.error.message} onRetry={q.refetch} />
        ) : !q.data?.length ? (
          <EmptyState icon={ShieldCheck} title="No changes by the platform team." className="py-6" />
        ) : (
          <ol className="space-y-4">
            {q.data.map((e) => (
              <li key={e.id} className="min-w-0">
                <p className="text-[length:var(--text-ui-body)] leading-snug break-words text-ink">{activityMessage(e) ?? eventLabel(e.eventType)}</p>
                <p className="mt-0.5 text-[length:var(--text-ui-small)] text-ink-muted tabular-nums">
                  <time dateTime={e.createdAt}>{formatDateTime(e.createdAt, 'en', prefs)}</time> · Sanctus team
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  )
}

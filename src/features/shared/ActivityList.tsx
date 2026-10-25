import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { ActivityItem } from '@/domain/types'
import { formatRelative } from '@/lib/format'
import type { QueryResult } from '@/services/hooks'

/** Recent changes as plain sentences: 14px message, 13px relative time below, 16px apart, no icon tiles (BRIEF §4). */
export function ActivityList({ query }: { query: QueryResult<ActivityItem[]> }) {
  if (query.status === 'loading' && !query.data) return <SkeletonRows rows={4} />
  if (query.status === 'error' && !query.data) return <ErrorState message={query.error.message} onRetry={query.refetch} />
  const items = query.data ?? []
  if (items.length === 0) return <EmptyState title="No activity yet" body="Changes to businesses and products will appear here." />
  return (
    <ol className="space-y-4">
      {items.map((a) => (
        <li key={a.id} className="min-w-0">
          <p className="text-[length:var(--text-ui-body)] leading-snug break-words text-ink">{a.message}</p>
          <p className="mt-0.5 text-[length:var(--text-ui-small)] text-ink-muted tabular-nums">
            <time dateTime={a.at}>{formatRelative(a.at)}</time>
          </p>
        </li>
      ))}
    </ol>
  )
}

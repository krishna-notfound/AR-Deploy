import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { ActivityItem } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import type { QueryResult } from '@/services/hooks'

/** Recent changes as plain sentences: 14px message, 13px relative time below, 16px apart, no icon tiles (BRIEF §4). */
export function ActivityList({ query }: { query: QueryResult<ActivityItem[]> }) {
  const { t } = useI18n()
  const fmt = useFormat()
  if (query.status === 'loading' && !query.data) return <SkeletonRows rows={4} />
  if (query.status === 'error' && !query.data) return <ErrorState message={errorText(query.error, t)} onRetry={query.refetch} retryLabel={t('common.retry')} />
  const items = query.data ?? []
  if (items.length === 0) return <EmptyState title={t('business.shared.activity.emptyTitle')} body={t('business.shared.activity.emptyBody')} />
  return (
    <ol className="space-y-4">
      {items.map((a) => (
        <li key={a.id} className="min-w-0">
          <p className="text-[length:var(--text-ui-body)] leading-snug break-words text-ink">{a.message}</p>
          <p className="mt-0.5 text-[length:var(--text-ui-small)] text-ink-muted tabular-nums">
            <time dateTime={a.at}>{fmt.relative(a.at)}</time>
          </p>
        </li>
      ))}
    </ol>
  )
}

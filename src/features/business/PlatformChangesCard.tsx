import { ShieldCheck } from 'lucide-react'
import { PanelHeader } from '@/components/layout/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { ID } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { service } from '@/services'
import { activityMessage } from '@/services/analytics'
import { useServiceQuery } from '@/services/hooks'
import { eventLabel } from '../shared/auditLabels'

/**
 * R-W7-2: what the platform team (Owner, Admin or Team) changed in this business's catalogue, the last 20, read-only.
 * The owner is also emailed about pauses, activations, unpublished and deleted products; this is where they are listed.
 */
export function PlatformChangesCard({ businessId, className }: { businessId: ID; className?: string }) {
  const { t } = useI18n()
  const fmt = useFormat()
  const q = useServiceQuery(() => service.getPlatformChanges(businessId), [businessId])
  return (
    <Card role="region" aria-label={t('business.platformChanges.title')} className={className}>
      <PanelHeader title={t('business.platformChanges.title')} />
      <CardBody>
        {q.status === 'loading' && !q.data ? (
          <SkeletonRows rows={3} />
        ) : q.status === 'error' && !q.data ? (
          <ErrorState message={errorText(q.error, t)} onRetry={q.refetch} retryLabel={t('common.retry')} />
        ) : !q.data?.length ? (
          <EmptyState icon={ShieldCheck} title={t('business.platformChanges.empty')} className="py-6" />
        ) : (
          <ol className="space-y-4">
            {q.data.map((e) => (
              <li key={e.id} className="min-w-0">
                <p className="text-[length:var(--text-ui-body)] leading-snug break-words text-ink">{activityMessage(e, undefined, t) ?? eventLabel(e.eventType, e.metadata, t)}</p>
                <p className="mt-0.5 text-[length:var(--text-ui-small)] text-ink-muted tabular-nums">
                  <time dateTime={e.createdAt}>{fmt.dateTime(e.createdAt)}</time> · {t('business.platformChanges.team')}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  )
}

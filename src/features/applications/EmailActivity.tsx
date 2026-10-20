import { Mail } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { ID } from '@/domain/types'
import { formatDateTime } from '@/lib/format'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { EMAIL_KIND_LABEL, EmailStatusBadge, emailReason } from './labels'

/** Every email attempt for an application or a business, newest first. Resends are new rows; nothing is overwritten. */
export function EmailActivity({ applicationId, businessId }: { applicationId?: ID; businessId?: ID }) {
  const q = useServiceQuery(() => service.getEmailAttempts({ applicationId, businessId }), [applicationId, businessId])
  return (
    <Card>
      <CardHeader title="Email activity" description="Each attempt as recorded by the platform. “Accepted” means Resend took the message; only “Delivered” confirms arrival." />
      <CardBody>
        {q.status === 'loading' && !q.data ? (
          <SkeletonRows rows={3} />
        ) : q.status === 'error' && !q.data ? (
          <ErrorState message={q.error.message} onRetry={q.refetch} />
        ) : !q.data?.length ? (
          <EmptyState icon={Mail} title="No emails yet" body="Confirmation, notification and invitation emails will appear here." className="py-6" />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {q.data.map((e) => (
              <li key={e.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {EMAIL_KIND_LABEL[e.kind] ?? e.kind}
                    {e.attempt > 1 && <span className="ml-2 text-xs font-normal text-ink-muted">attempt {e.attempt}</span>}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    To {e.recipient} · {formatDateTime(e.createdAt)}
                  </p>
                  {emailReason(e.error) && <p className="mt-1 text-xs text-ink-muted">{emailReason(e.error)}</p>}
                </div>
                <EmailStatusBadge status={e.status} />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

import { Mail } from 'lucide-react'
import { PanelHeader } from '@/components/layout/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { ID } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { EmailStatusBadge, emailKindLabel, emailReason } from './labels'

/** Every email attempt for an application or a business, newest first. Resends are new rows; nothing is overwritten. */
export function EmailActivity({ applicationId, businessId }: { applicationId?: ID; businessId?: ID }) {
  const { t, lang } = useI18n()
  const fmt = useFormat()
  const q = useServiceQuery(() => service.getEmailAttempts({ applicationId, businessId }), [applicationId, businessId])
  return (
    <Card>
      <PanelHeader title={t('applications.email.title')} description={t('applications.email.description')} />
      <CardBody>
        {q.status === 'loading' && !q.data ? (
          <SkeletonRows rows={3} />
        ) : q.status === 'error' && !q.data ? (
          <ErrorState message={errorText(q.error, t)} onRetry={q.refetch} retryLabel={t('common.retry')} />
        ) : !q.data?.length ? (
          <EmptyState icon={Mail} title={t('applications.email.empty')} body={t('applications.email.emptyBody')} className="py-6" />
        ) : (
          <ul className="divide-y divide-subtle border-y border-line">
            {q.data.map((e) => (
              <li key={e.id} className="grid justify-items-start gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-start sm:justify-items-stretch sm:gap-4">
                <div className="min-w-0">
                  <p className="text-ui-body font-medium text-ink">
                    {emailKindLabel(e.kind, lang)}
                    {e.attempt > 1 && <span className="ml-2 text-ui-small font-normal text-ink-muted">{t('applications.email.attempt', { n: e.attempt })}</span>}
                  </p>
                  <p className="text-ui-small [overflow-wrap:anywhere] text-ink-muted tabular-nums">
                    {t('applications.email.to', { recipient: e.recipient })} · {fmt.dateTime(e.createdAt)}
                  </p>
                  {emailReason(e.error, lang) && <p className="mt-1 text-ui-small text-ink-muted">{emailReason(e.error, lang)}</p>}
                </div>
                <div className="sm:justify-self-end">
                  <EmailStatusBadge status={e.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

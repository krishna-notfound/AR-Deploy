import { Card } from '@/components/ui/Card'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { SecurityEvent } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { accountErrorText } from '../accountError'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { describeUserAgent } from '@/lib/userAgent'
import { account, isDemoMode } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { SectionHeader } from '../SettingsUi'

// The account_% audit event types (spec 6), in plain words for the person they belong to.
const LABELS: Record<string, TranslationKey> = {
  account_signed_in: 'settings.activity.event.signedIn',
  account_password_changed: 'settings.activity.event.passwordChanged',
  account_email_change_requested: 'settings.activity.event.emailChangeRequested',
  account_2fa_enabled: 'settings.activity.event.twoFaOn',
  account_2fa_disabled: 'settings.activity.event.twoFaOff',
  account_recovery_used: 'settings.activity.event.recoveryUsed',
  account_recovery_regenerated: 'settings.activity.event.recoveryRegenerated',
  account_2fa_reset_by_owner: 'settings.activity.event.twoFaReset',
  account_closure_requested: 'settings.activity.event.closureRequested',
  account_closure_cancelled: 'settings.activity.event.closureCancelled',
  account_closure_completed: 'settings.activity.event.closureCompleted',
  account_closure_restored: 'settings.activity.event.closureRestored',
  account_deleted: 'settings.activity.event.deleted',
  platform_security_policy_changed: 'settings.activity.event.policyChanged',
}

export function securityEventLabel(e: SecurityEvent, t: (key: TranslationKey) => string): string {
  if (e.type === 'account_deleted' && e.deleteFailed) return t('settings.activity.event.deleteFailed')
  const known = LABELS[e.type]
  if (known) return t(known)
  const words = e.type.replace(/^account_/, '').replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : t('settings.activity.event.other')
}

/**
 * A failed staff self-delete logs account_deleted twice: before the attempt, then again with delete_failed. Only the
 * failure is news, so the plain entry up to a minute before it is hidden. The list is newest first.
 */
export function visibleSecurityEvents(events: SecurityEvent[]): SecurityEvent[] {
  const hidden = new Set<string>()
  for (const failed of events) {
    if (failed.type !== 'account_deleted' || !failed.deleteFailed) continue
    const failedAt = new Date(failed.at).getTime()
    const plain = events.find((e) => {
      if (e.type !== 'account_deleted' || e.deleteFailed || hidden.has(e.id)) return false
      const gap = failedAt - new Date(e.at).getTime()
      return gap >= 0 && gap <= 60_000
    })
    if (plain) hidden.add(plain.id)
  }
  return events.filter((e) => !hidden.has(e.id))
}

export default function ActivitySection() {
  const { t } = useI18n()
  const fmt = useFormat()
  const q = useServiceQuery(() => account.listSecurityEvents(), [])
  const events = q.data ? visibleSecurityEvents(q.data) : []

  return (
    <>
      <SectionHeader
        title={t('settings.section.activity')}
        description={isDemoMode ? t('settings.activity.descriptionDemo') : t('settings.activity.description')}
      />
      <Card>
        {q.status === 'loading' && !q.data ? (
          <div className="px-4 py-3 sm:px-6" aria-busy="true" aria-label={t('settings.activity.loading')}>
            <SkeletonRows rows={4} />
          </div>
        ) : q.status === 'error' && !q.data ? (
          <ErrorState message={`${t('settings.activity.loadFailed')} ${accountErrorText(q.error, t)}`} onRetry={q.refetch} className="py-12" />
        ) : !events.length ? (
          <EmptyState title={t('settings.activity.emptyTitle')} body={t('settings.activity.emptyBody')} className="py-12" />
        ) : (
          <ul aria-label={t('settings.activity.listLabel')} className="divide-y divide-subtle">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-6">
                <div className="min-w-0">
                  <p className="text-ui-body font-medium text-ink">{securityEventLabel(e, t)}</p>
                  <p className="text-ui-small break-words text-ink-muted">
                    {describeUserAgent(e.userAgent)}
                    {e.ip && <> · IP {e.ip}</>}
                  </p>
                </div>
                <time dateTime={e.at} className="shrink-0 text-ui-small text-ink-muted tabular-nums sm:text-ui-body sm:text-ink">
                  {fmt.dateTime(e.at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

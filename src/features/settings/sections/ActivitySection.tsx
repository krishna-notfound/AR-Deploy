import { Card } from '@/components/ui/Card'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { SecurityEvent } from '@/domain/types'
import { formatDateTime } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { describeUserAgent } from '@/lib/userAgent'
import { account, isDemoMode } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { SectionHeader } from '../SettingsUi'

// The account_% audit event types (spec 6), in plain words for the person they belong to.
const LABELS: Record<string, string> = {
  account_signed_in: 'Signed in',
  account_password_changed: 'Password changed',
  account_email_change_requested: 'Email change requested',
  account_2fa_enabled: '2FA turned on',
  account_2fa_disabled: '2FA turned off',
  account_recovery_used: 'Recovery code used',
  account_recovery_regenerated: 'New recovery codes created',
  account_2fa_reset_by_owner: '2FA reset by the platform owner',
  account_closure_requested: 'Account closure requested',
  account_closure_cancelled: 'Account closure cancelled',
  account_closure_completed: 'Account closure completed',
  account_closure_restored: 'Account restored',
  account_deleted: 'Account deleted',
  platform_security_policy_changed: 'Security policy changed',
}

export function securityEventLabel(e: SecurityEvent): string {
  if (e.type === 'account_deleted' && e.deleteFailed) return 'Account deletion failed'
  const known = LABELS[e.type]
  if (known) return known
  const words = e.type.replace(/^account_/, '').replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Account event'
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
  const q = useServiceQuery(() => account.listSecurityEvents(), [])
  const prefs = usePreferences()
  const events = q.data ? visibleSecurityEvents(q.data) : []

  return (
    <>
      <SectionHeader
        title="Security activity"
        description={
          isDemoMode
            ? 'Your last 50 sign-ins and changes to your account security. Demo: only actions taken in this browser session are listed.'
            : 'Your last 50 sign-ins and changes to your account security. If something here was not you, change your password and turn on 2FA.'
        }
      />
      <Card>
        {q.status === 'loading' && !q.data ? (
          <div className="px-4 py-3 sm:px-6" aria-busy="true" aria-label="Loading security activity">
            <SkeletonRows rows={4} />
          </div>
        ) : q.status === 'error' && !q.data ? (
          <ErrorState message={`Could not load your security activity. ${q.error.message}`} onRetry={q.refetch} className="py-12" />
        ) : !events.length ? (
          <EmptyState title="No security activity yet" body="Sign-ins and changes to your password, email address and 2FA will show here." className="py-12" />
        ) : (
          <ul aria-label="Security events" className="divide-y divide-subtle">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-6">
                <div className="min-w-0">
                  <p className="text-ui-body font-medium text-ink">{securityEventLabel(e)}</p>
                  <p className="text-ui-small break-words text-ink-muted">
                    {describeUserAgent(e.userAgent)}
                    {e.ip && <> · IP {e.ip}</>}
                  </p>
                </div>
                <time dateTime={e.at} className="shrink-0 text-ui-small text-ink-muted tabular-nums sm:text-ui-body sm:text-ink">
                  {formatDateTime(e.at, 'en', prefs)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

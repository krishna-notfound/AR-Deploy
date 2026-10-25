// Platform → Security policy (spec 3, 8 and 13): the Owner decides who must use 2FA. The lockout guard: "Require 2FA
// for staff" can't be turned on until the Owner's own 2FA is on and this session is at aal2, or the policy would lock
// them out of staff data. The database refuses the update at aal1 too (RLS); a refusal shows the same reason.
import { useState } from 'react'
import { Link } from 'react-router'
import { useCan } from '@/auth/usePermission'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Switch } from '@/components/ui/Form'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState, InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { PlatformSettings } from '@/domain/types'
import { formatDateTime } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { settingsPath } from '@/lib/urls'
import { account } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { SectionHeader, SettingsCard } from '../SettingsUi'

type Key = 'require2faStaff' | 'require2faBusiness'

/** The lockout reason: shown on the disabled switches and after a save refused with aal2_required. */
export const OWN_2FA_FIRST = 'Turn on your own 2FA first.'
/** 2FA is set up but this session never proved it (aal1): RLS refuses every policy update until it does. */
export const SIGN_IN_WITH_CODE = 'Sign in with your 2FA code to change these.'

const POLICY: Record<Key, { label: string; description: string; who: string; on: string; off: string }> = {
  require2faStaff: {
    label: 'Require 2FA for staff',
    description: 'Platform admins and team members must use an authenticator app.',
    who: 'Staff',
    on: 'Staff now need 2FA',
    off: 'Staff no longer need 2FA',
  },
  require2faBusiness: {
    label: 'Require 2FA for business owners',
    description: 'Business owners must use an authenticator app to manage their catalog.',
    who: 'Business owners',
    on: 'Business owners now need 2FA',
    off: 'Business owners no longer need 2FA',
  },
}

export default function SecurityPolicySection() {
  const can = useCan()
  return (
    <>
      <SectionHeader title="Security policy" description="Who must use two-step verification on this platform." />
      {/* The hub shows this section to the Owner only; the controls stay hidden for anyone else who reaches it. */}
      {can('owner') ? <Policy /> : <InlineNotice tone="neutral">Only the platform Owner can change the security policy.</InlineNotice>}
    </>
  )
}

function Policy() {
  const prefs = usePreferences()
  const confirm = useConfirm()
  const toast = useToast()
  const settings = useServiceQuery(() => account.getPlatformSettings(), [])
  const security = useServiceQuery(() => account.getSecurityState(), [])
  // What a switch shows while its save is in flight (optimistic), then the saved value again.
  const [pending, setPending] = useState<{ key: Key; value: boolean } | null>(null)
  const [saved, setSaved] = useState<PlatformSettings | null>(null)
  const [refused, setRefused] = useState(false)

  const loading = (settings.status === 'loading' && !settings.data) || (security.status === 'loading' && !security.data)
  const failed = (settings.status === 'error' && !settings.data) || (security.status === 'error' && !security.data)
  const policy = saved ?? settings.data
  const own = security.data
  // Every policy update needs aal2 (RLS), and staff 2FA without the Owner's own 2FA would lock them out: the switches
  // work only once the Owner's 2FA is on and this session proved it. `reason` says which step is missing.
  const reason = !own ? null : !own.hasVerifiedFactor ? OWN_2FA_FIRST : own.aal !== 'aal2' ? SIGN_IN_WITH_CODE : null

  const change = async (key: Key, value: boolean) => {
    if (pending) return
    const p = POLICY[key]
    if (value) {
      const ok = await confirm({
        title: `${p.label}?`,
        body: `${p.who} without 2FA will be asked to set it up at their next request.`,
        confirmLabel: 'Require 2FA',
      })
      if (!ok) return
    }
    setPending({ key, value })
    setRefused(false)
    const r = await account.updatePlatformSettings({ [key]: value })
    setPending(null)
    if (r.ok) {
      setSaved(r.data)
      toast.success(value ? p.on : p.off)
      return
    }
    if (r.error.reason === 'aal2_required') {
      // The session is not at aal2 after all: say why, and read the security state again so the guard follows.
      setRefused(true)
      security.refetch()
      return
    }
    toast.error('Could not save the security policy', r.error.message)
  }

  return (
    <SettingsCard title="Two-step verification" description="People who must use 2FA are asked to set it up before they can see any data.">
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading the security policy">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="h-4 w-56" />
        </div>
      ) : failed || !policy || !own ? (
        <ErrorState
          message={`Could not load the security policy. ${(settings.status === 'error' ? settings.error.message : security.status === 'error' ? security.error.message : '') || 'Try again.'}`}
          onRetry={() => {
            settings.refetch()
            security.refetch()
          }}
          className="py-4"
        />
      ) : (
        <div className="space-y-5">
          {reason === SIGN_IN_WITH_CODE && !refused && <InlineNotice tone="warning">{SIGN_IN_WITH_CODE}</InlineNotice>}
          {(reason === OWN_2FA_FIRST || refused) && (
            <InlineNotice tone="warning">
              <span>
                {OWN_2FA_FIRST} Turning on staff 2FA without it would lock you out of staff data.{' '}
                <Link to={settingsPath('admin', 'security')} className="font-medium underline">
                  Go to Security & 2FA
                </Link>
              </span>
            </InlineNotice>
          )}
          {(['require2faStaff', 'require2faBusiness'] as const).map((key) => {
            const checked = pending?.key === key ? pending.value : policy[key]
            return (
              <div key={key} className="border-t border-line pt-5 first:border-t-0 first:pt-0">
                <Switch
                  checked={checked}
                  disabled={pending !== null || reason !== null}
                  onChange={(v) => void change(key, v)}
                  label={POLICY[key].label}
                  description={reason ? `${POLICY[key].description} ${reason}` : POLICY[key].description}
                />
              </div>
            )
          })}
          {policy.updatedAt && <p className="border-t border-line pt-4 text-ui-small text-ink-muted">Last changed {formatDateTime(policy.updatedAt, 'en', prefs)}</p>}
        </div>
      )}
    </SettingsCard>
  )
}

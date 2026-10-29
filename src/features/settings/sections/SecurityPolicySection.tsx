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
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { accountErrorText } from '../accountError'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { settingsPath } from '@/lib/urls'
import { account } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { SectionHeader, SettingsCard } from '../SettingsUi'

type Key = 'require2faStaff' | 'require2faBusiness'

/** The lockout reason: shown on the disabled switches and after a save refused with aal2_required. */
const OWN_2FA_FIRST = 'own' as const
/** 2FA is set up but this session never proved it (aal1): RLS refuses every policy update until it does. */
const SIGN_IN_WITH_CODE = 'code' as const
const REASON_KEY: Record<typeof OWN_2FA_FIRST | typeof SIGN_IN_WITH_CODE, TranslationKey> = {
  own: 'settings.policy.own2faFirst',
  code: 'settings.policy.signInWithCode',
}

const POLICY: Record<Key, { label: TranslationKey; description: TranslationKey; who: TranslationKey; on: TranslationKey; off: TranslationKey }> = {
  require2faStaff: {
    label: 'settings.policy.staff.label',
    description: 'settings.policy.staff.description',
    who: 'settings.policy.staff.who',
    on: 'settings.policy.staff.on',
    off: 'settings.policy.staff.off',
  },
  require2faBusiness: {
    label: 'settings.policy.business.label',
    description: 'settings.policy.business.description',
    who: 'settings.policy.business.who',
    on: 'settings.policy.business.on',
    off: 'settings.policy.business.off',
  },
}

export default function SecurityPolicySection() {
  const { t } = useI18n()
  const can = useCan()
  return (
    <>
      <SectionHeader title={t('settings.section.securityPolicy')} description={t('settings.policy.description')} />
      {/* The hub shows this section to the Owner only; the controls stay hidden for anyone else who reaches it. */}
      {can('owner') ? <Policy /> : <InlineNotice tone="neutral">{t('settings.policy.ownerOnly')}</InlineNotice>}
    </>
  )
}

function Policy() {
  const { t } = useI18n()
  const fmt = useFormat()
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
        title: `${t(p.label)}?`,
        body: t('settings.policy.confirmBody', { who: t(p.who) }),
        confirmLabel: t('settings.policy.confirm'),
      })
      if (!ok) return
    }
    setPending({ key, value })
    setRefused(false)
    const r = await account.updatePlatformSettings({ [key]: value })
    setPending(null)
    if (r.ok) {
      setSaved(r.data)
      toast.success(t(value ? p.on : p.off))
      return
    }
    if (r.error.reason === 'aal2_required') {
      // The session is not at aal2 after all: say why, and read the security state again so the guard follows.
      setRefused(true)
      security.refetch()
      return
    }
    toast.error(t('settings.policy.saveFailed'), accountErrorText(r.error, t))
  }

  return (
    <SettingsCard title={t('settings.policy.title')} description={t('settings.policy.cardDescription')}>
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label={t('settings.policy.loading')}>
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="h-4 w-56" />
        </div>
      ) : failed || !policy || !own ? (
        <ErrorState
          message={`${t('settings.policy.loadFailed')} ${settings.status === 'error' ? accountErrorText(settings.error, t) : security.status === 'error' ? accountErrorText(security.error, t) : t('common.retry')}`}
          onRetry={() => {
            settings.refetch()
            security.refetch()
          }}
          className="py-4"
        />
      ) : (
        <div className="space-y-5">
          {reason === SIGN_IN_WITH_CODE && !refused && <InlineNotice tone="warning">{t(REASON_KEY.code)}</InlineNotice>}
          {(reason === OWN_2FA_FIRST || refused) && (
            <InlineNotice tone="warning">
              <span>
                {t(REASON_KEY.own)} {t('settings.policy.lockout')}{' '}
                <Link to={settingsPath('admin', 'security')} className="font-medium underline">
                  {t('settings.policy.goToSecurity')}
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
                  label={t(POLICY[key].label)}
                  description={reason ? `${t(POLICY[key].description)} ${t(REASON_KEY[reason])}` : t(POLICY[key].description)}
                />
              </div>
            )
          })}
          {policy.updatedAt && <p className="border-t border-line pt-4 text-ui-small text-ink-muted">{t('settings.policy.lastChanged', { date: fmt.dateTime(policy.updatedAt) })}</p>}
        </div>
      )}
    </SettingsCard>
  )
}

import { useState } from 'react'
import { useCan } from '@/auth/usePermission'
import { Badge } from '@/components/ui/Badge'
import { Switch } from '@/components/ui/Form'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { accountErrorText } from '../accountError'
import { useI18n } from '@/i18n/LanguageProvider'
import { useProfileSettings } from '@/lib/preferences'
import { useSettingsScope } from '../sections'
import { SectionHeader, SettingsCard } from '../SettingsUi'

// Spec 8: the new-applications email is for platform staff who can see applications; security emails always go out.
export default function NotificationsSection() {
  const { t } = useI18n()
  const scope = useSettingsScope()
  const can = useCan()
  const staffWithApplications = scope === 'admin' && can('applications.view')

  return (
    <>
      <SectionHeader title={t('settings.section.notifications')} description={t('settings.notifications.description')} />
      <div className="space-y-6">
        {staffWithApplications && <ApplicationsEmail />}
        <SettingsCard title={t('settings.notifications.securityTitle')} description={t('settings.notifications.securityDescription')}>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 max-w-xl">
              <p className="text-ui-body font-medium text-ink">{t('settings.notifications.securityEmails')}</p>
              <p className="text-ui-small text-ink-muted">
                {t('settings.notifications.securityBody')}
              </p>
            </div>
            <Badge tone="neutral">{t('settings.notifications.alwaysOn')}</Badge>
          </div>
        </SettingsCard>
      </div>
    </>
  )
}

function ApplicationsEmail() {
  const { t } = useI18n()
  const { state, reload, save } = useProfileSettings()
  const toast = useToast()
  // What the switch shows while a save is in flight (optimistic), then the saved value again.
  const [pending, setPending] = useState<boolean | null>(null)

  const change = async (next: boolean) => {
    setPending(next)
    const r = await save({ notifyNewApplications: next })
    setPending(null)
    if (r.ok) toast.success(next ? t('settings.notifications.applicationsOn') : t('settings.notifications.applicationsOff'))
    else toast.error(t('settings.notifications.saveFailed'), accountErrorText(r.error, t))
  }

  return (
    <SettingsCard title={t('settings.notifications.applications')} description={t('settings.notifications.applicationsDescription')}>
      {state.status === 'loading' ? (
        <div className="space-y-2" aria-busy="true" aria-label={t('settings.notifications.loading')}>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      ) : state.status === 'error' ? (
        <ErrorState message={t('settings.notifications.loadFailed')} onRetry={reload} className="py-4" />
      ) : (
        <Switch
          checked={pending ?? state.profile.notifyNewApplications}
          disabled={pending !== null}
          onChange={(v) => void change(v)}
          label={t('settings.notifications.newApplications')}
          description={t('settings.notifications.newApplicationsBody')}
        />
      )}
    </SettingsCard>
  )
}

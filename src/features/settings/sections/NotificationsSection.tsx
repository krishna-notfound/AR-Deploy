import { useState } from 'react'
import { useCan } from '@/auth/usePermission'
import { Badge } from '@/components/ui/Badge'
import { Switch } from '@/components/ui/Form'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { useProfileSettings } from '@/lib/preferences'
import { useSettingsScope } from '../sections'
import { SectionHeader, SettingsCard } from '../SettingsUi'

// Spec 8: the new-applications email is for platform staff who can see applications; security emails always go out.
export default function NotificationsSection() {
  const scope = useSettingsScope()
  const can = useCan()
  const staffWithApplications = scope === 'admin' && can('applications.view')

  return (
    <>
      <SectionHeader title="Notifications" description="Which emails you get from the platform." />
      <div className="space-y-6">
        {staffWithApplications && <ApplicationsEmail />}
        <SettingsCard title="Account security" description="Sent to your sign-in email address.">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 max-w-xl">
              <p className="text-ui-body font-medium text-ink">Security emails</p>
              <p className="text-ui-small text-ink-muted">
                Codes for risky actions and notices when your password, email address or 2FA changes. They protect your account, so they can't be turned off.
              </p>
            </div>
            <Badge tone="neutral">Always on</Badge>
          </div>
        </SettingsCard>
      </div>
    </>
  )
}

function ApplicationsEmail() {
  const { state, reload, save } = useProfileSettings()
  const toast = useToast()
  // What the switch shows while a save is in flight (optimistic), then the saved value again.
  const [pending, setPending] = useState<boolean | null>(null)

  const change = async (next: boolean) => {
    setPending(next)
    const r = await save({ notifyNewApplications: next })
    setPending(null)
    if (r.ok) toast.success(next ? 'You will get new application emails' : 'New application emails turned off')
    else toast.error('Could not save the notification setting', r.error.message)
  }

  return (
    <SettingsCard title="Applications" description="Emails about businesses applying to join the platform.">
      {state.status === 'loading' ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading notification settings">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      ) : state.status === 'error' ? (
        <ErrorState message={`Could not load your notification settings. ${state.message}`} onRetry={reload} className="py-4" />
      ) : (
        <Switch
          checked={pending ?? state.profile.notifyNewApplications}
          disabled={pending !== null}
          onChange={(v) => void change(v)}
          label="New business applications"
          description="Email me when a business applies to join the platform."
        />
      )}
    </SettingsCard>
  )
}

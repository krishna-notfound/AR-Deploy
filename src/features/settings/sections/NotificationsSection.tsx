import { Badge } from '@/components/ui/Badge'
import { useI18n } from '@/i18n/LanguageProvider'
import { SectionHeader, SettingsCard } from '../SettingsUi'
import { NotificationChannels } from './PhoneNotifications'

// Settings → Notifications: the phone card, then one row per kind of update with its In-app and Email switches (ADR-0056, ADR-0078).
// Security emails, invitations and replies to your own requests are not optional: they are shown as always on.
export default function NotificationsSection() {
  const { t } = useI18n()

  return (
    <>
      <SectionHeader title={t('settings.section.notifications')} description={t('settings.notifications.description')} />
      <div className="space-y-6">
        <NotificationChannels />
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
import { Navigate } from 'react-router'
import { useOptionalAccount } from '@/auth/AccountProvider'
import { SIGN_IN_PATH } from '@/auth/RequireRole'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { useI18n } from '@/i18n/LanguageProvider'
import { EMAIL_PREFERENCES_PATH, settingsPath } from '@/lib/urls'

/**
 * The "Email preferences" link at the foot of every email (ADR-0078). One address for everyone: a signed-in platform member opens
 * their console's Notifications settings, a signed-in business owner opens the dashboard's, and a visitor who is not signed in is
 * sent to sign in and then back here.
 */
export default function EmailPreferencesRedirect() {
  const { t } = useI18n()
  const user = useOptionalAccount()?.user
  if (user === undefined) return <FullPageSpinner label={t('emailPrefs.opening')} />
  if (user === null) return <Navigate to={`${SIGN_IN_PATH}?next=${encodeURIComponent(EMAIL_PREFERENCES_PATH)}`} replace />
  return <Navigate to={settingsPath(user.role === 'super_admin' ? 'admin' : 'business', 'notifications')} replace />
}

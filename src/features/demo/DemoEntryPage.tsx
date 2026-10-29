import { useDocumentTitle } from '@/components/layout/PageHeader'
import { useI18n } from '@/i18n/LanguageProvider'
import { isDemoMode } from '@/services'
import { AuthHeading, AuthLayout } from '../auth/AuthLayout'
import { DemoAccounts } from './DemoAccounts'

/** /demo: choose a mock account or open a public catalog. No real authentication in demo mode. */
export default function DemoEntryPage() {
  const { t } = useI18n()
  useDocumentTitle(t('demo.title'))
  return (
    <AuthLayout
      photo="lounge"
      wide
      footer={
        <>
          {t('site.credits')}
          {isDemoMode ? ` ${t('site.sampleData')}` : ''}
        </>
      }
    >
      <AuthHeading eyebrow={isDemoMode ? t('demo.title') : t('auth.login.eyebrow')} title={t('demo.heading')}>
        <p>
          {isDemoMode
            ? t('demo.introDemo')
            : t('demo.introLive')}
        </p>
      </AuthHeading>
      <div className="mt-10">
        <DemoAccounts />
      </div>
      {isDemoMode && (
        <p className="mt-10 text-xs leading-5 text-ink-muted">
          {t('demo.footnote')}
        </p>
      )}
    </AuthLayout>
  )
}

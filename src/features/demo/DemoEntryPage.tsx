import { useDocumentTitle } from '@/components/layout/PageHeader'
import { translate } from '@/i18n/translate'
import { isDemoMode } from '@/services'
import { AuthHeading, AuthLayout } from '../auth/AuthLayout'
import { DemoAccounts } from './DemoAccounts'

/** /demo: choose a mock account or open a public catalog. No real authentication in demo mode. English-only. */
export default function DemoEntryPage() {
  useDocumentTitle('Demo')
  return (
    <AuthLayout
      photo="lounge"
      wide
      footer={
        <>
          {translate('en', 'site.credits')}
          {isDemoMode ? ` ${translate('en', 'site.sampleData')}` : ''}
        </>
      }
    >
      <AuthHeading eyebrow={isDemoMode ? 'Demo' : 'Platform access'} title="Choose how to explore the platform.">
        <p>
          {isDemoMode
            ? 'Pick an account to open a dashboard, or open a public catalog as a customer would.'
            : 'Sign in to open a dashboard, or open a public catalog as a customer would.'}
        </p>
      </AuthHeading>
      <div className="mt-10">
        <DemoAccounts />
      </div>
      {isDemoMode && (
        <p className="mt-10 text-xs leading-5 text-ink-muted">
          Demo mode: there is no real authentication, and all changes are stored only in this browser. Account roles here are for navigation, not
          security.
        </p>
      )}
    </AuthLayout>
  )
}

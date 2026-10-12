import { useDocumentTitle } from '@/components/layout/PageHeader'
import { isDemoMode } from '@/services'
import { SiteFooter, SiteHeader } from '../marketing/SiteChrome'
import { DemoAccounts } from './DemoAccounts'

/** /demo: choose a mock account or open a public catalog. No real authentication in demo mode. */
export default function DemoEntryPage() {
  useDocumentTitle('Demo')
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SiteHeader cta={false} />
      <main className="mx-auto w-full max-w-[1040px] flex-1 px-5 py-14 sm:px-8 sm:py-20">
        <h1 className="max-w-2xl text-headline font-light">Choose how to explore the platform.</h1>
        <p className="mt-4 max-w-xl text-lead text-ink-muted">
          {isDemoMode
            ? 'Pick an account to open a dashboard, or open a public catalog as a customer would.'
            : 'Sign in to open a dashboard, or open a public catalog as a customer would.'}
        </p>
        <div className="mt-12">
          <DemoAccounts />
        </div>
        {isDemoMode && (
          <p className="mt-12 max-w-2xl text-xs leading-5 text-ink-muted">
            Demo mode: there is no real authentication, and all changes are stored only in this browser. Account roles here are for navigation, not
            security.
          </p>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}

import { LogIn } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { useLeaveAccount } from '@/auth/RequireRole'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { auth } from '@/services'
import { APPLY_PATH } from '@/lib/urls'
import { SiteHeader } from '../marketing/SiteChrome'

/** Real sign-in (Supabase mode). In demo mode this route forwards to the demo account picker. */
export default function LoginPage() {
  useDocumentTitle('Sign in')
  const [params] = useSearchParams()
  const next = params.get('next')
  const { user, signedInEmail, accountError } = useAccount()
  const leave = useLeaveAccount()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const authService = auth
  if (!authService) return <Navigate to={`/demo${next ? `?next=${encodeURIComponent(next)}` : ''}`} replace />
  if (user) {
    const home = user.role === 'super_admin' ? '/admin' : '/dashboard'
    return <Navigate to={next?.startsWith(home) ? next : home} replace />
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setPending(true)
    const res = await authService.signInWithPassword(email.trim(), password)
    setPending(false)
    // On success the auth listener reloads the account and the redirect above takes over.
    setError(res.ok ? null : res.error.message)
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <SiteHeader cta={false} />
      <main className="mx-auto max-w-sm px-5 py-16 sm:py-24">
        <h1 className="text-title font-normal">Sign in</h1>
        <p className="mt-2 text-sm text-ink-muted">For platform admins and business owners.</p>

        {signedInEmail ? (
          <div className="mt-8 space-y-6">
            <InlineNotice tone="neutral">
              Signed in as <strong className="font-medium">{signedInEmail}</strong>. This account does not manage a business.
            </InlineNotice>
            <p className="text-sm text-ink-muted">
              Business owners get access by invitation from the Sanctus team after their application is approved. If you applied, we will email you
              when it has been reviewed.
            </p>
            <Button onClick={() => void leave({ signOut: true })}>Sign out</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            {(error || accountError) && (
              <InlineNotice tone="warning">
                <span role="alert">{error ?? accountError}</span>
              </InlineNotice>
            )}
            <FormField label="Email">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
            <FormField label="Password">
              <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormField>
            <Button type="submit" variant="primary" className="w-full" loading={pending} icon={<LogIn className="size-4" aria-hidden />} disabled={!email || !password}>
              Sign in
            </Button>
            <p className="text-center text-sm">
              <Link to="/reset-password" className="text-accent-ink hover:underline">
                Forgot your password?
              </Link>
            </p>
            <p className="text-center text-sm">
              <Link to={APPLY_PATH} className="text-accent-ink hover:underline">
                New to Sanctus? Apply as a business
              </Link>
            </p>
          </form>
        )}
      </main>
    </div>
  )
}

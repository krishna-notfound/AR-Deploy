import { ArrowRight } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { useLeaveAccount } from '@/auth/RequireRole'
import { needsCodeStep } from '@/auth/SecurityGate'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { auth } from '@/services'
import { APPLY_PATH, settingsPath } from '@/lib/urls'
import { cn } from '@/lib/cn'
import { TAP_TARGET } from '../public/tapTarget'
import { AuthHeading, AuthLayout, authFieldsClass } from './AuthLayout'
import { RECOVERED_NOTICE, TwoFactorStep } from './TwoFactorStep'

/** Real sign-in (Supabase mode). In demo mode this route forwards to the demo account picker. */
export default function LoginPage() {
  useDocumentTitle('Sign in')
  const [params] = useSearchParams()
  const next = params.get('next')
  const { user, signedInEmail, accountError, securityState, securityError, refreshSecurity } = useAccount()
  const leave = useLeaveAccount()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [recovered, setRecovered] = useState(false)

  const authService = auth
  if (!authService) return <Navigate to={`/demo${next ? `?next=${encodeURIComponent(next)}` : ''}`} replace />
  // Signed in: once the security state is known, either the code step or the dashboard. A failed check goes on to
  // the dashboard, whose 2FA gate reports it with a retry.
  const checking = !!user && !securityState && !securityError
  if (user && !checking) {
    const scope = user.role === 'super_admin' ? 'admin' : 'business'
    if (recovered) return <Navigate to={settingsPath(scope, 'security')} replace />
    if (securityState && needsCodeStep(securityState)) {
      return (
        <AuthLayout>
          <AuthHeading eyebrow="Platform access" title="Two-step verification">
            <p>Your account is protected with an authenticator app.</p>
          </AuthHeading>
          <TwoFactorStep
            className={cn('mt-8', authFieldsClass)}
            onVerified={refreshSecurity}
            onRecovered={async () => {
              toast.show({ tone: 'info', title: RECOVERED_NOTICE }, 10_000)
              setRecovered(true)
              await refreshSecurity()
            }}
            onSignOut={() => void leave({ signOut: true })}
          />
        </AuthLayout>
      )
    }
    const home = scope === 'admin' ? '/admin' : '/dashboard'
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
    <AuthLayout>
      <AuthHeading eyebrow="Platform access" title="Sign in">
        <p>For platform admins and business owners.</p>
      </AuthHeading>

      {signedInEmail ? (
        <div className="mt-8 space-y-6">
          <InlineNotice tone="neutral">
            Signed in as <strong className="font-medium">{signedInEmail}</strong>. This account does not manage a business.
          </InlineNotice>
          <p className="text-sm leading-6 text-ink-muted">
            Business owners get access by invitation from the Sanctus team after their application is approved. If you applied, we will email you
            when it has been reviewed.
          </p>
          <Button onClick={() => void leave({ signOut: true })}>Sign out</Button>
        </div>
      ) : (
        <form onSubmit={submit} className={cn('mt-8 space-y-5', authFieldsClass)} noValidate>
          {(error || accountError) && (
            <InlineNotice tone="warning">
              <span role="alert">{error ?? accountError}</span>
            </InlineNotice>
          )}
          <FormField label="Email">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField
            label="Password"
            aside={
              <Link to="/reset-password" className={cn(TAP_TARGET, 'text-xs text-accent-ink hover:underline')}>
                Forgot your password?
              </Link>
            }
          >
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending || checking} disabled={!email || !password}>
            Sign in
            {!pending && !checking && <ArrowRight className="size-4" aria-hidden />}
          </Button>
          <div className="flex items-center gap-3 text-xs text-ink-muted" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          {/* Placeholder until Google sign-in is configured in Supabase Auth: disabled and labelled, so it is not a dead button. */}
          <Button type="button" variant="secondary" className="h-11 w-full" disabled icon={<GoogleMark />} aria-describedby="google-soon">
            Continue with Google
          </Button>
          <p id="google-soon" className="-mt-3 text-center text-xs text-ink-muted">
            Coming soon
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-canvas px-5 py-4 text-sm">
            <span className="text-ink-muted">New to Sanctus?</span>
            <Link to={APPLY_PATH} className="inline-flex min-h-11 items-center gap-2 text-label text-ink hover:text-accent-ink">
              Apply as a business <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  )
}

/** Google's "G" mark, inline so no icon dependency is needed. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}

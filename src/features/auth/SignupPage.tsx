import { MailCheck, UserPlus } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { absoluteLocalUrl } from '@/lib/urls'
import { auth } from '@/services'
import { SiteHeader } from '../marketing/SiteChrome'
import { MIN_PASSWORD_LENGTH } from './ResetPasswordPage'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Business-owner sign-up (Supabase mode). Only works where the project allows sign-ups (staging today;
 * production sign-ups stay off until the owner approves). An account alone grants nothing: after confirming
 * their email, the owner registers a new draft business or redeems a claim link (see LoginPage).
 */
export default function SignupPage() {
  useDocumentTitle('Create an account')
  const { user, signedInEmail } = useAccount()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)

  const authService = auth
  if (!authService) return <Navigate to="/demo" replace />
  if (user || signedInEmail) return <Navigate to="/login" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!EMAIL.test(value)) return setError('Enter a valid email address.')
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`)
    setPending(true)
    const res = await authService.signUp(value, password, absoluteLocalUrl('/login'))
    setPending(false)
    if (!res.ok) return setError(res.error.message)
    setError(null)
    setSent(true)
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <SiteHeader cta={false} />
      <main className="mx-auto max-w-sm px-5 py-16 sm:py-24">
        <h1 className="text-title font-normal">Create an account</h1>
        <p className="mt-2 text-sm text-ink-muted">For business owners. After confirming your email you can register your business for approval.</p>

        {sent ? (
          <InlineNotice className="mt-8" icon={<MailCheck className="size-4 shrink-0" aria-hidden />}>
            <span role="status">
              Check your inbox for <strong className="font-medium">{email.trim()}</strong> and open the confirmation link. If the address already
              has an account, sign in instead.
            </span>
          </InlineNotice>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            {error && (
              <InlineNotice tone="warning">
                <span role="alert">{error}</span>
              </InlineNotice>
            )}
            <FormField label="Email">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
            <FormField label="Password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
              <Input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormField>
            <Button type="submit" variant="primary" className="w-full" loading={pending} icon={<UserPlus className="size-4" aria-hidden />} disabled={!email || !password}>
              Create account
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-sm">
          <Link to="/login" className="text-accent-ink hover:underline">
            Already have an account? Sign in
          </Link>
        </p>
      </main>
    </div>
  )
}

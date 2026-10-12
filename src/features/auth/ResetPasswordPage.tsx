import { KeyRound, MailCheck } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { auth } from '@/services'
import { SiteHeader } from '../marketing/SiteChrome'

export const MIN_PASSWORD_LENGTH = 12
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Password recovery (Supabase mode). Without a session it asks for an email and sends a reset link;
 * opened from that link (recovery session) or while signed in, it sets a new password.
 */
export default function ResetPasswordPage() {
  useDocumentTitle('Reset password')
  const navigate = useNavigate()
  const toast = useToast()
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!auth) return
    const service = auth
    const check = () => void service.getSession().then((r) => setHasSession(r.ok && !!r.data))
    check()
    // The recovery link signs the user in asynchronously (PASSWORD_RECOVERY / SIGNED_IN).
    return service.onAuthStateChange(check)
  }, [])

  if (!auth) return <Navigate to="/demo" replace />
  const authService = auth

  const requestLink = async (e: FormEvent) => {
    e.preventDefault()
    if (!EMAIL.test(email.trim())) return setError('Enter a valid email address.')
    setPending(true)
    const res = await authService.requestPasswordReset(email.trim(), `${window.location.origin}/reset-password`)
    setPending(false)
    if (!res.ok) return setError(res.error.message)
    setError(null)
    setSent(true)
  }

  const setNewPassword = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    if (password !== confirm) return setError('The passwords do not match.')
    setPending(true)
    const res = await authService.updatePassword(password)
    setPending(false)
    if (!res.ok) return setError(res.error.message)
    toast.success('Password updated')
    navigate('/login', { replace: true })
  }

  const errorNotice = error && (
    <InlineNotice tone="warning">
      <span role="alert">{error}</span>
    </InlineNotice>
  )

  return (
    <div className="min-h-dvh bg-canvas">
      <SiteHeader cta={false} />
      <main className="mx-auto max-w-sm px-5 py-16 sm:py-24">
        {hasSession === null ? (
          <p className="text-sm text-ink-muted" role="status">
            Checking your session…
          </p>
        ) : hasSession ? (
          <>
            <h1 className="text-title font-normal">Choose a new password</h1>
            <form onSubmit={setNewPassword} className="mt-8 space-y-4" noValidate>
              {errorNotice}
              <FormField label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
                <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </FormField>
              <FormField label="Repeat new password">
                <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </FormField>
              <Button type="submit" variant="primary" className="w-full" loading={pending} icon={<KeyRound className="size-4" aria-hidden />} disabled={!password || !confirm}>
                Save new password
              </Button>
            </form>
          </>
        ) : sent ? (
          <>
            <MailCheck className="size-6 text-accent" aria-hidden />
            <h1 className="mt-4 text-title font-normal">Check your email</h1>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              If an account exists for {email.trim()}, a link to reset the password is on its way. The link opens this page.
            </p>
            <Link to="/login" className="mt-6 inline-block text-sm text-accent-ink hover:underline">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-title font-normal">Reset your password</h1>
            <p className="mt-2 text-sm text-ink-muted">We will email you a link to choose a new password.</p>
            <form onSubmit={requestLink} className="mt-8 space-y-4" noValidate>
              {errorNotice}
              <FormField label="Email">
                <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </FormField>
              <Button type="submit" variant="primary" className="w-full" loading={pending} disabled={!email}>
                Send reset link
              </Button>
              <p className="text-center text-sm">
                <Link to="/login" className="text-accent-ink hover:underline">
                  Back to sign in
                </Link>
              </p>
            </form>
          </>
        )}
      </main>
    </div>
  )
}

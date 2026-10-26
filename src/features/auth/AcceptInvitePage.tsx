import { ArrowRight } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { type LogoutResult, useAccount } from '@/auth/AccountProvider'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { ErrorState, InlineNotice } from '@/components/ui/States'
import { useI18n } from '@/i18n/LanguageProvider'
import { auth } from '@/services'
import { cn } from '@/lib/cn'
import { AuthHeading, AuthLayout, StepIndicator, authFieldsClass } from './AuthLayout'
import { MIN_PASSWORD_LENGTH } from './ResetPasswordPage'
import { authErrorText, normalizeCode } from './authErrors'

/**
 * Landing page of an owner invitation (ADR-0024, ADR-0027). The owner signs in with the email address and the
 * one-time code from the invitation email (verified by Supabase Auth, never stored by us), then sets a password;
 * the acceptance is recorded by complete_owner_onboarding().
 *
 * It never sets the password of whoever happens to be signed in (R-W1-9): staff and owners who already accepted go to
 * their console, and an owner with a pending invitation is told which account is signed in, with a way to sign out.
 */
export default function AcceptInvitePage() {
  const { t } = useI18n()
  useDocumentTitle(t('invite.title'))
  const { user, business, accountError, retry, logout } = useAccount()
  // Links from invitations sent before ADR-0027 still land here; Supabase reports expired or used ones in the fragment.
  const [linkError] = useState(() => new URLSearchParams(window.location.hash.replace(/^#/, '')).get('error_code'))

  let body
  // Step of the code flow (ADR-0027): 0 = verify the code, 1 = set the password. Null when no step applies.
  let step: number | null = null
  if (!auth) body = <InlineNotice tone="neutral">{t('invite.demo')}</InlineNotice>
  else if (user === undefined && accountError) body = <ErrorState message={t('invite.loadFailed')} onRetry={retry} retryLabel={t('common.retry')} />
  else if (user === undefined) return <FullPageSpinner label={t('invite.checking')} />
  else if (!user) {
    step = 0
    body = <EnterCode linkError={linkError} />
  }
  else if (user.role === 'super_admin') return <Navigate to="/admin" replace />
  else if (!user.invitationPending) return <Navigate to="/dashboard" replace />
  else {
    step = 1
    body = (
      <>
        <SignedInAs email={user.email} logout={logout} />
        <SetPassword userId={user.id} businessName={business?.name ?? ''} />
      </>
    )
  }

  return (
    <AuthLayout>
      {step !== null && <StepIndicator label={t('invite.steps')} current={step} steps={[t('invite.step.code'), t('invite.step.password')]} className="mb-10" />}
      <AuthHeading eyebrow={t('invite.eyebrow')} title={t('invite.title')} />
      <div className="mt-6 space-y-6">{body}</div>
    </AuthLayout>
  )
}

/** Which account is signed in, above the password step: the invitation may be meant for someone else (R-W1-9). */
function SignedInAs({ email, logout }: { email: string; logout: () => Promise<LogoutResult> }) {
  const { t } = useI18n()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signOut = async () => {
    setPending(true)
    setError(null)
    const r = await logout()
    // Signed out: the account reload swaps this step for the code step.
    if (!r.signedOut) {
      setPending(false)
      setError(t('auth.error.network'))
    }
  }

  return (
    <InlineNotice tone="neutral">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span>{t('invite.signedInAs', { email })}</span>
        <Button type="button" variant="secondary" size="sm" loading={pending} onClick={signOut}>
          {t('invite.signOut')}
        </Button>
      </div>
      {error && (
        <span role="alert" className="mt-2 block">
          {error}
        </span>
      )}
    </InlineNotice>
  )
}

/** Email and invitation code. On success the auth listener reloads the account and the password form replaces this. */
function EnterCode({ linkError }: { linkError: string | null }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!auth) return
    if (!EMAIL.test(email.trim())) return setError(t('auth.error.emailInvalid'))
    const token = normalizeCode(code)
    if (!token) return setError(t('auth.error.codeFormat'))
    setPending(true)
    const res = await auth.verifyEmailCode(email.trim().toLowerCase(), token, 'invite')
    if (!res.ok) {
      setPending(false)
      return setError(authErrorText(t, res.error))
    }
    // Stays pending: the account reload swaps this form for the password step.
  }

  return (
    <form onSubmit={submit} className={cn('space-y-5', authFieldsClass)} noValidate>
      {linkError && <InlineNotice tone="warning">{linkError === 'otp_expired' ? t('invite.expired') : t('invite.invalid')}</InlineNotice>}
      <p className="text-[15px] leading-7 text-ink-muted">{t('invite.codeIntro')}</p>
      {error && (
        <InlineNotice tone="warning">
          <span role="alert">{error}</span>
        </InlineNotice>
      )}
      <FormField label={t('invite.email')} required>
        <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>
      <FormField label={t('invite.code')} hint={t('invite.codeHelp')} required>
        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={14} value={code} onChange={(e) => setCode(e.target.value)} className="tracking-[0.2em]" />
      </FormField>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} disabled={!email.trim() || !code.trim()}>
        {t('invite.verify')}
        {!pending && <ArrowRight className="size-4" aria-hidden />}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-canvas px-5 py-3 text-sm">
        <span className="text-ink-muted">{t('invite.haveAccount')}</span>
        <Link to="/login" className="inline-flex min-h-11 items-center gap-2 text-label text-ink hover:text-accent-ink">
          {t('invite.signIn')} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </form>
  )
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Remembers (per tab, per user) that the password is set, so a retry after a failed onboarding step does not ask for it again. */
export const PASSWORD_SAVED_KEY = 'arfurn:invitePasswordSaved'

function readPasswordSaved(userId: string): boolean {
  try {
    return sessionStorage.getItem(PASSWORD_SAVED_KEY) === userId
  } catch {
    return false
  }
}

function writePasswordSaved(userId: string | null) {
  try {
    if (userId) sessionStorage.setItem(PASSWORD_SAVED_KEY, userId)
    else sessionStorage.removeItem(PASSWORD_SAVED_KEY)
  } catch {
    // Storage blocked: the password form shows again after a reload, and re-entering the same password still works.
  }
}

function SetPassword({ userId, businessName }: { userId: string; businessName: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(() => readPasswordSaved(userId))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!auth) return
    if (!passwordSaved) {
      if (password.length < MIN_PASSWORD_LENGTH) return setError(t('invite.passwordShort', { n: MIN_PASSWORD_LENGTH }))
      if (password !== confirm) return setError(t('invite.passwordMismatch'))
    }
    setPending(true)
    if (!passwordSaved) {
      const pw = await auth.updatePassword(password)
      if (!pw.ok) {
        setPending(false)
        return setError(authErrorText(t, pw.error))
      }
      writePasswordSaved(userId)
      setPasswordSaved(true)
    }
    if (name.trim()) await auth.updateDisplayName(name.trim())
    const done = await auth.completeOwnerOnboarding()
    setPending(false)
    if (!done.ok) return setError(t('invite.failed'))
    writePasswordSaved(null)
    navigate('/dashboard', { replace: true })
  }

  return (
    <form onSubmit={submit} className={cn('space-y-5', authFieldsClass)} noValidate>
      <p className="text-[15px] leading-7 text-ink-muted">{t('invite.intro', { business: businessName })}</p>
      {error && (
        <InlineNotice tone="warning">
          <span role="alert">{error}</span>
        </InlineNotice>
      )}
      {passwordSaved && !error && <InlineNotice tone="neutral">{t('invite.passwordSaved')}</InlineNotice>}
      <FormField label={t('invite.name')} optional>
        <Input autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </FormField>
      {!passwordSaved && (
        <>
          <FormField label={t('invite.password')} hint={t('invite.passwordHint', { n: MIN_PASSWORD_LENGTH })} required>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <FormField label={t('invite.passwordRepeat')} required>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </FormField>
        </>
      )}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        loading={pending}
        disabled={!passwordSaved && (!password || !confirm)}
      >
        {passwordSaved ? t('invite.continue') : t('invite.submit')}
        {!pending && <ArrowRight className="size-4" aria-hidden />}
      </Button>
    </form>
  )
}

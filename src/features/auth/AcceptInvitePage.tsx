import { KeyRound } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { Button, ButtonLink } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { ErrorState, InlineNotice } from '@/components/ui/States'
import { useI18n } from '@/i18n/LanguageProvider'
import { auth } from '@/services'
import { SiteHeader } from '../marketing/SiteChrome'
import { MIN_PASSWORD_LENGTH } from './ResetPasswordPage'
import { authErrorText } from './authErrors'

/**
 * Landing page of an owner invitation (ADR-0024). Supabase Auth signs the visitor in from the link
 * (the invite/magic-link tokens arrive in the URL fragment and are consumed by supabase-js, never stored by us);
 * the owner then sets a password and the acceptance is recorded by complete_owner_onboarding().
 */
export default function AcceptInvitePage() {
  const { t } = useI18n()
  useDocumentTitle(t('invite.title'))
  const { user, business, accountError, retry } = useAccount()
  // Supabase reports expired or used links in the fragment (#error=access_denied&error_code=otp_expired).
  const [linkError] = useState(() => new URLSearchParams(window.location.hash.replace(/^#/, '')).get('error_code'))

  let body
  if (!auth) body = <InlineNotice tone="neutral">{t('invite.demo')}</InlineNotice>
  else if (linkError) body = <Invalid expired={linkError === 'otp_expired'} />
  else if (user === undefined && accountError) body = <ErrorState message={t('invite.loadFailed')} onRetry={retry} retryLabel={t('common.retry')} />
  else if (user === undefined) return <FullPageSpinner label={t('invite.checking')} />
  else if (!user) body = <Invalid expired />
  else if (user.role === 'super_admin') return <Navigate to="/admin" replace />
  else body = <SetPassword userId={user.id} businessName={business?.name ?? ''} />

  return (
    <div className="min-h-dvh bg-canvas">
      <SiteHeader cta={false} />
      <main className="mx-auto max-w-md px-5 py-16 sm:py-24">
        <h1 className="text-title font-normal">{t('invite.title')}</h1>
        <div className="mt-8 space-y-6">{body}</div>
      </main>
    </div>
  )
}

function Invalid({ expired }: { expired: boolean }) {
  const { t } = useI18n()
  return (
    <>
      <InlineNotice tone="warning">{expired ? t('invite.expired') : t('invite.invalid')}</InlineNotice>
      <ButtonLink to="/login">{t('invite.signIn')}</ButtonLink>
    </>
  )
}

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
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-ink-muted">{t('invite.intro', { business: businessName })}</p>
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
        className="w-full"
        loading={pending}
        icon={<KeyRound className="size-4" aria-hidden />}
        disabled={!passwordSaved && (!password || !confirm)}
      >
        {passwordSaved ? t('invite.continue') : t('invite.submit')}
      </Button>
    </form>
  )
}

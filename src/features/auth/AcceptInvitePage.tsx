import { KeyRound } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { Button, ButtonLink } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { useI18n } from '@/i18n/LanguageProvider'
import { auth } from '@/services'
import { SiteHeader } from '../marketing/SiteChrome'
import { MIN_PASSWORD_LENGTH } from './ResetPasswordPage'

/**
 * Landing page of an owner invitation (ADR-0024). Supabase Auth signs the visitor in from the link
 * (the invite/magic-link tokens arrive in the URL fragment and are consumed by supabase-js, never stored by us);
 * the owner then sets a password and the acceptance is recorded by complete_owner_onboarding().
 */
export default function AcceptInvitePage() {
  const { t } = useI18n()
  useDocumentTitle(t('invite.title'))
  const { user, business } = useAccount()
  // Supabase reports expired or used links in the fragment (#error=access_denied&error_code=otp_expired).
  const [linkError] = useState(() => new URLSearchParams(window.location.hash.replace(/^#/, '')).get('error_code'))

  let body
  if (!auth) body = <InlineNotice tone="neutral">{t('invite.demo')}</InlineNotice>
  else if (linkError) body = <Invalid expired={linkError === 'otp_expired'} />
  else if (user === undefined) return <FullPageSpinner label={t('invite.checking')} />
  else if (!user) body = <Invalid expired />
  else if (user.role === 'super_admin') return <Navigate to="/admin" replace />
  else body = <SetPassword businessName={business?.name ?? ''} />

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

function SetPassword({ businessName }: { businessName: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!auth) return
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t('invite.passwordShort', { n: MIN_PASSWORD_LENGTH }))
    if (password !== confirm) return setError(t('invite.passwordMismatch'))
    setPending(true)
    const pw = await auth.updatePassword(password)
    if (!pw.ok) {
      setPending(false)
      return setError(pw.error.message)
    }
    if (name.trim()) await auth.updateDisplayName(name.trim())
    const done = await auth.completeOwnerOnboarding()
    setPending(false)
    if (!done.ok) return setError(t('invite.failed'))
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
      <FormField label={t('invite.name')} optional>
        <Input autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label={t('invite.password')} hint={t('invite.passwordHint', { n: MIN_PASSWORD_LENGTH })} required>
        <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </FormField>
      <FormField label={t('invite.passwordRepeat')} required>
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </FormField>
      <Button type="submit" variant="primary" className="w-full" loading={pending} icon={<KeyRound className="size-4" aria-hidden />} disabled={!password || !confirm}>
        {t('invite.submit')}
      </Button>
    </form>
  )
}

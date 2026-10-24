import { KeyRound, MailCheck } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { useI18n } from '@/i18n/LanguageProvider'
import { auth } from '@/services'
import { SiteHeader } from '../marketing/SiteChrome'
import { authErrorText, normalizeCode } from './authErrors'

export const MIN_PASSWORD_LENGTH = 12
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Password recovery (Supabase mode, ADR-0027). Without a session it asks for an email, emails a one-time code and
 * signs in with that code (recovery session); with a session it sets a new password.
 */
export default function ResetPasswordPage() {
  const { t } = useI18n()
  useDocumentTitle(t('reset.title'))
  const navigate = useNavigate()
  const toast = useToast()
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  const [resending, setResending] = useState(false)

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
    if (!EMAIL.test(email.trim())) return setError(t('auth.error.emailInvalid'))
    setPending(true)
    const res = await authService.requestPasswordReset(email.trim(), `${window.location.origin}/reset-password`)
    setPending(false)
    if (!res.ok) return setError(authErrorText(t, res.error))
    setError(null)
    setSent(true)
  }

  const verifyCode = async (e: FormEvent) => {
    e.preventDefault()
    const token = normalizeCode(code)
    if (!token) return setError(t('auth.error.codeFormat'))
    setPending(true)
    const res = await authService.verifyEmailCode(email.trim(), token, 'recovery')
    setPending(false)
    if (!res.ok) return setError(authErrorText(t, res.error))
    setError(null)
    setHasSession(true)
  }

  const resendCode = async () => {
    setResending(true)
    const res = await authService.requestPasswordReset(email.trim(), `${window.location.origin}/reset-password`)
    setResending(false)
    if (!res.ok) return setError(authErrorText(t, res.error))
    setError(null)
    setCode('')
    toast.success(t('reset.resent'))
  }

  const setNewPassword = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t('reset.passwordShort', { n: MIN_PASSWORD_LENGTH }))
    if (password !== confirm) return setError(t('reset.passwordMismatch'))
    setPending(true)
    // Also signs out the account's other sessions (see AuthService.updatePassword).
    const res = await authService.updatePassword(password)
    setPending(false)
    if (!res.ok) return setError(authErrorText(t, res.error))
    toast.success(t('reset.updated'))
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
            {t('reset.checking')}
          </p>
        ) : hasSession ? (
          <>
            <h1 className="text-title font-normal">{t('reset.newTitle')}</h1>
            <form onSubmit={setNewPassword} className="mt-8 space-y-4" noValidate>
              {errorNotice}
              <FormField label={t('reset.newPassword')} hint={t('reset.passwordHint', { n: MIN_PASSWORD_LENGTH })}>
                <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </FormField>
              <FormField label={t('reset.passwordRepeat')}>
                <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </FormField>
              <Button type="submit" variant="primary" className="w-full" loading={pending} icon={<KeyRound className="size-4" aria-hidden />} disabled={!password || !confirm}>
                {t('reset.save')}
              </Button>
            </form>
          </>
        ) : sent ? (
          <>
            <MailCheck className="size-6 text-accent" aria-hidden />
            <h1 className="mt-4 text-title font-normal">{t('reset.sentTitle')}</h1>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{t('reset.sentBody', { email: email.trim() })}</p>
            <form onSubmit={verifyCode} className="mt-8 space-y-4" noValidate>
              {errorNotice}
              <FormField label={t('reset.code')}>
                <Input inputMode="numeric" autoComplete="one-time-code" maxLength={14} value={code} onChange={(e) => setCode(e.target.value)} />
              </FormField>
              <Button type="submit" variant="primary" className="w-full" loading={pending} disabled={!code.trim()}>
                {t('reset.verify')}
              </Button>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 text-sm">
                <Button type="button" variant="ghost" size="sm" loading={resending} onClick={() => void resendCode()}>
                  {t('reset.resend')}
                </Button>
                <button
                  type="button"
                  className="text-accent-ink hover:underline"
                  onClick={() => {
                    setSent(false)
                    setCode('')
                    setError(null)
                  }}
                >
                  {t('reset.otherEmail')}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-title font-normal">{t('reset.requestTitle')}</h1>
            <p className="mt-2 text-sm text-ink-muted">{t('reset.requestIntro')}</p>
            <form onSubmit={requestLink} className="mt-8 space-y-4" noValidate>
              {errorNotice}
              <FormField label={t('reset.email')}>
                <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </FormField>
              <Button type="submit" variant="primary" className="w-full" loading={pending} disabled={!email}>
                {t('reset.send')}
              </Button>
              <p className="text-center text-sm">
                <Link to="/login" className="text-accent-ink hover:underline">
                  {t('reset.back')}
                </Link>
              </p>
            </form>
          </>
        )}
      </main>
    </div>
  )
}

import { ArrowRight } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { useI18n } from '@/i18n/LanguageProvider'
import { auth } from '@/services'
import { cn } from '@/lib/cn'
import { AuthHeading, AuthLayout, StepIndicator, authFieldsClass } from './AuthLayout'
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

  const step = hasSession ? 2 : sent ? 1 : 0
  const signInRow = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-canvas px-5 py-3 text-sm">
      <span className="text-ink-muted">{t('reset.remembered')}</span>
      <Link to="/login" className="inline-flex min-h-11 items-center gap-2 text-label text-ink hover:text-accent-ink">
        {t('reset.signIn')} <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  )

  return (
    <AuthLayout>
      {hasSession === null ? (
        <p className="text-sm text-ink-muted" role="status">
          {t('reset.checking')}
        </p>
      ) : (
        <>
          <StepIndicator
            label={t('reset.steps')}
            current={step}
            steps={[t('reset.step.request'), t('reset.step.verify'), t('reset.step.password')]}
            className="mb-10"
          />
          {hasSession ? (
            <>
              <AuthHeading eyebrow={t('reset.eyebrow')} title={t('reset.newTitle')} />
              <form onSubmit={setNewPassword} className={cn('mt-8 space-y-5', authFieldsClass)} noValidate>
                {errorNotice}
                <FormField label={t('reset.newPassword')} hint={t('reset.passwordHint', { n: MIN_PASSWORD_LENGTH })}>
                  <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </FormField>
                <FormField label={t('reset.passwordRepeat')}>
                  <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </FormField>
                <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} disabled={!password || !confirm}>
                  {t('reset.save')}
                  {!pending && <ArrowRight className="size-4" aria-hidden />}
                </Button>
              </form>
            </>
          ) : sent ? (
            <>
              <AuthHeading eyebrow={t('reset.eyebrow')} title={t('reset.sentTitle')}>
                <p>{t('reset.sentBody', { email: email.trim() })}</p>
              </AuthHeading>
              <form onSubmit={verifyCode} className={cn('mt-8 space-y-5', authFieldsClass)} noValidate>
                {errorNotice}
                <FormField label={t('reset.code')}>
                  <Input inputMode="numeric" autoComplete="one-time-code" maxLength={14} value={code} onChange={(e) => setCode(e.target.value)} className="tracking-[0.2em]" />
                </FormField>
                <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} disabled={!code.trim()}>
                  {t('reset.verify')}
                  {!pending && <ArrowRight className="size-4" aria-hidden />}
                </Button>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
                  <Button type="button" variant="ghost" size="sm" className="-ml-3" loading={resending} onClick={() => void resendCode()}>
                    {t('reset.resend')}
                  </Button>
                  <button
                    type="button"
                    className="min-h-11 text-accent-ink hover:underline sm:min-h-0"
                    onClick={() => {
                      setSent(false)
                      setCode('')
                      setError(null)
                    }}
                  >
                    {t('reset.otherEmail')}
                  </button>
                </div>
                {signInRow}
              </form>
            </>
          ) : (
            <>
              <AuthHeading eyebrow={t('reset.eyebrow')} title={t('reset.requestTitle')}>
                <p>{t('reset.requestIntro')}</p>
              </AuthHeading>
              <form onSubmit={requestLink} className={cn('mt-8 space-y-5', authFieldsClass)} noValidate>
                {errorNotice}
                <FormField label={t('reset.email')}>
                  <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </FormField>
                <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} disabled={!email}>
                  {t('reset.send')}
                  {!pending && <ArrowRight className="size-4" aria-hidden />}
                </Button>
                <div className="pt-3">{signInRow}</div>
              </form>
            </>
          )}
        </>
      )}
    </AuthLayout>
  )
}

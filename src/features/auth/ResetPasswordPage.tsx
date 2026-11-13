import { ArrowRight } from 'lucide-react'
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useOptionalAccount } from '@/auth/AccountProvider'
import { clearRecoveryPending, isRecoveryPending, markRecoveryPending } from '@/auth/recoveryPending'
import { SIGN_IN_PATH } from '@/auth/RequireRole'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Button, ButtonLink } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { RESET_PASSWORD_PATH, settingsPath } from '@/lib/urls'
import { DEMO_RESET_CODE, PASSWORD_MAX, PASSWORD_MIN, type ServiceError, account, isDemoMode, passwordReset } from '@/services'
import { cn } from '@/lib/cn'
import { AuthHeading, AuthLayout, StepIndicator, authFieldsClass } from './AuthLayout'
import { authErrorText, normalizeCode } from './authErrors'
import { TwoFactorStep } from './TwoFactorStep'

export const MIN_PASSWORD_LENGTH = PASSWORD_MIN
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Supabase sends a reset email to one address at most once a minute (max_frequency); the page waits as long. */
export const RESET_RESEND_COOLDOWN_S = 60
/** Never left in the address bar: a link from an old email, or Supabase's error redirect, carries these. */
const URL_SECRETS = ['access_token', 'refresh_token', 'token', 'token_hash', 'code', 'type', 'error', 'error_code', 'error_description', 'expires_at', 'expires_in', 'provider_token']

type Step = 'checking' | 'signed-in' | 'request' | 'code' | 'second-factor' | 'password'

/** The reset_password refusals, in the visitor's language (the public pages load only the auth dictionary). */
const RESET_ERRORS: Record<string, TranslationKey> = {
  reset_expired: 'reset.expired',
  not_signed_in: 'reset.expired',
  rate_limited: 'auth.error.rateLimited',
}

const urlParts = () => ({ hash: new URLSearchParams(window.location.hash.replace(/^#/, '')), search: new URLSearchParams(window.location.search) })

/** Did the visitor arrive from a link that no longer works (Supabase's error redirect)? Read only, so safe to call twice. */
function cameFromFailedLink(): boolean {
  if (typeof window === 'undefined') return false
  const { hash, search } = urlParts()
  return hash.has('error') || hash.has('error_code') || search.has('error') || search.has('error_code')
}

/**
 * Takes anything token-like and Supabase's error redirect out of the address bar (history, Referer, screenshots;
 * ADR-0066). Supabase's client reads the URL at start-up, before this runs.
 */
function scrubUrl(): void {
  const { hash, search } = urlParts()
  if (!URL_SECRETS.some((k) => hash.has(k) || search.has(k)) && window.location.hash.length <= 1) return
  for (const k of URL_SECRETS) search.delete(k)
  const query = search.toString()
  window.history.replaceState(window.history.state, '', `${RESET_PASSWORD_PATH}${query ? `?${query}` : ''}`)
}

/**
 * "Forgot password" (ADR-0027 codes; ADR-0066 hardening). Without a session: email → emailed code → (authenticator
 * code when the account has 2FA) → new password. The new password is set by the account-security function, which
 * ends every session; the person then signs in again. A session that did not start here (someone already signed in)
 * is pointed to Settings instead: changing a known password there needs the current password and an emailed code.
 */
export default function ResetPasswordPage() {
  const { t } = useI18n()
  useDocumentTitle(t('reset.title'))
  const navigate = useNavigate()
  const toast = useToast()
  const signedInUser = useOptionalAccount()?.user
  const [step, setStep] = useState<Step>('checking')
  const [linkFailed] = useState(cameFromFailedLink)
  useEffect(scrubUrl, [])
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [pending, setPending] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const live = useRef(true)

  /** After a verified code (or on reload mid-reset): the authenticator step when the account has 2FA, else the password. */
  const afterCode = useCallback(async () => {
    const a = await account.getAssurance()
    if (!live.current) return
    setStep(a.ok && a.data.currentLevel === 'aal1' && a.data.nextLevel === 'aal2' ? 'second-factor' : 'password')
  }, [])

  useEffect(() => {
    live.current = true
    void (async () => {
      const s = await passwordReset.hasSession()
      if (!live.current) return
      const session = s.ok && s.data
      if (session && isRecoveryPending()) return afterCode()
      if (!session) clearRecoveryPending()
      setStep(session ? 'signed-in' : 'request')
    })()
    return () => {
      live.current = false
    }
  }, [afterCode])

  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000))
  useEffect(() => {
    if (resendAt <= Date.now()) return
    const id = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n >= resendAt) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [resendAt])
  const startCooldown = () => {
    const n = Date.now()
    setNow(n)
    setResendAt(n + RESET_RESEND_COOLDOWN_S * 1000)
  }

  const fail = (message: string) => {
    setPending(false)
    setError(message)
  }

  const requestCode = async (e: FormEvent) => {
    e.preventDefault()
    if (!EMAIL.test(email.trim())) return setError(t('auth.error.emailInvalid'))
    setPending(true)
    const res = await passwordReset.requestCode(email.trim())
    if (!res.ok) return fail(authErrorText(t, res.error))
    setPending(false)
    setError(null)
    setExpired(false)
    startCooldown()
    setStep('code')
  }

  const verifyCode = async (e: FormEvent) => {
    e.preventDefault()
    const token = normalizeCode(code)
    if (!token) return setError(t('auth.error.codeFormat'))
    setPending(true)
    const res = await passwordReset.verifyCode(email.trim(), token)
    if (!res.ok) return fail(authErrorText(t, res.error))
    setPending(false)
    setError(null)
    setCode('')
    markRecoveryPending()
    await afterCode()
  }

  const resendCode = async () => {
    if (cooldown > 0) return
    setResending(true)
    const res = await passwordReset.requestCode(email.trim())
    setResending(false)
    if (!res.ok) return setError(authErrorText(t, res.error))
    setError(null)
    setCode('')
    startCooldown()
    toast.success(t('reset.resent'))
  }

  /** Leaves a half-finished reset: the recovery session in this browser ends, and the page starts over. */
  const startOver = async () => {
    clearRecoveryPending()
    await passwordReset.signOutHere()
    if (!live.current) return
    setPassword('')
    setConfirm('')
    setCode('')
    setError(null)
    setStep('request')
  }

  const setNewPassword = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < PASSWORD_MIN) return setError(t('reset.passwordShort', { n: PASSWORD_MIN }))
    if (password.length > PASSWORD_MAX) return setError(t('reset.passwordLong', { n: PASSWORD_MAX }))
    if (password !== confirm) return setError(t('reset.passwordMismatch'))
    setPending(true)
    // The function sets it and ends every session of the account, this one too (ADR-0066).
    const res = await account.resetPassword(password)
    if (!res.ok) return resetFailed(res.error)
    clearRecoveryPending()
    setPending(false)
    toast.success(t('reset.updated'), t('reset.updatedBody'))
    navigate(SIGN_IN_PATH, { replace: true })
  }

  const resetFailed = (e: ServiceError) => {
    setPending(false)
    if (e.reason === 'aal2_required') return setStep('second-factor')
    if (e.reason === 'weak_password') return setError(t('reset.passwordShort', { n: PASSWORD_MIN }))
    if (e.reason === 'reset_expired' || e.reason === 'not_signed_in') setExpired(true)
    setError(t((e.reason && RESET_ERRORS[e.reason]) || 'auth.error.generic'))
  }

  const errorNotice = error && (
    <InlineNotice tone="warning">
      <span role="alert">{error}</span>
    </InlineNotice>
  )

  const stepIndex = step === 'password' ? 2 : step === 'code' || step === 'second-factor' ? 1 : 0
  const signInRow = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-canvas px-5 py-3 text-sm">
      <span className="text-ink-muted">{t('reset.remembered')}</span>
      <Link to={SIGN_IN_PATH} onClick={clearRecoveryPending} className="inline-flex min-h-11 items-center gap-2 text-label text-ink hover:text-accent-ink">
        {t('reset.signIn')} <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  )

  let body: ReactNode
  if (step === 'signed-in') {
    const scope = signedInUser?.role === 'super_admin' ? 'admin' : 'business'
    body = (
      <>
        <AuthHeading eyebrow={t('reset.eyebrow')} title={t('reset.signedInTitle')}>
          <p>{t('reset.signedInBody')}</p>
        </AuthHeading>
        <div className={cn('mt-8 flex flex-wrap gap-3', authFieldsClass)}>
          {signedInUser && (
            <ButtonLink to={settingsPath(scope, 'account')} variant="primary">
              {t('reset.toSettings')}
            </ButtonLink>
          )}
          <Button onClick={() => void startOver()}>{t('reset.signOutAndReset')}</Button>
        </div>
      </>
    )
  } else if (step === 'second-factor') {
    body = (
      <>
        <AuthHeading eyebrow={t('reset.eyebrow')} title={t('reset.twoFactorTitle')}>
          <p>{t('reset.twoFactorBody')}</p>
        </AuthHeading>
        <TwoFactorStep
          className={cn('mt-8', authFieldsClass)}
          onVerified={() => setStep('password')}
          onRecovered={() => {
            toast.show({ tone: 'info', title: t('auth.twoFactor.recovered') }, 10_000)
            setStep('password')
          }}
          onSignOut={() => void startOver()}
        />
      </>
    )
  } else if (step === 'password') {
    body = (
      <>
        <AuthHeading eyebrow={t('reset.eyebrow')} title={t('reset.newTitle')} />
        <form onSubmit={setNewPassword} className={cn('mt-8 space-y-5', authFieldsClass)} noValidate>
          {errorNotice}
          {expired ? (
            <Button variant="primary" size="lg" className="w-full" onClick={() => void startOver()}>
              {t('reset.startAgain')}
            </Button>
          ) : (
            <>
              <FormField label={t('reset.newPassword')} hint={t('reset.passwordHint', { min: PASSWORD_MIN, max: PASSWORD_MAX })}>
                <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </FormField>
              <FormField label={t('reset.passwordRepeat')}>
                <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </FormField>
              <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} disabled={!password || !confirm}>
                {t('reset.save')}
                {!pending && <ArrowRight className="size-4" aria-hidden />}
              </Button>
            </>
          )}
        </form>
      </>
    )
  } else if (step === 'code') {
    body = (
      <>
        <AuthHeading eyebrow={t('reset.eyebrow')} title={t('reset.sentTitle')}>
          <p>{t('reset.sentBody', { email: email.trim() })}</p>
        </AuthHeading>
        <form onSubmit={verifyCode} className={cn('mt-8 space-y-5', authFieldsClass)} noValidate>
          {isDemoMode && <InlineNotice tone="neutral">{t('reset.demoCode', { code: DEMO_RESET_CODE })}</InlineNotice>}
          {errorNotice}
          <FormField label={t('reset.code')}>
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={14} value={code} onChange={(e) => setCode(e.target.value)} className="tracking-[0.2em]" />
          </FormField>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} disabled={!code.trim()}>
            {t('reset.verify')}
            {!pending && <ArrowRight className="size-4" aria-hidden />}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
            <Button type="button" variant="ghost" size="sm" className="-ml-3" loading={resending} disabled={cooldown > 0} onClick={() => void resendCode()}>
              {cooldown > 0 ? t('reset.resendIn', { n: cooldown }) : t('reset.resend')}
            </Button>
            <button
              type="button"
              className="min-h-11 text-accent-ink hover:underline sm:min-h-0"
              onClick={() => {
                setStep('request')
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
    )
  } else {
    body = (
      <>
        <AuthHeading eyebrow={t('reset.eyebrow')} title={t('reset.requestTitle')}>
          <p>{t('reset.requestIntro')}</p>
        </AuthHeading>
        <form onSubmit={requestCode} className={cn('mt-8 space-y-5', authFieldsClass)} noValidate>
          {linkFailed && <InlineNotice tone="warning">{t('reset.linkInvalid')}</InlineNotice>}
          {isDemoMode && <InlineNotice tone="neutral">{t('reset.demoRequest')}</InlineNotice>}
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
    )
  }

  return (
    <AuthLayout page="resetPassword">
      {step === 'checking' ? (
        <p className="text-sm text-ink-muted" role="status">
          {t('reset.checking')}
        </p>
      ) : (
        <>
          {step !== 'signed-in' && (
            <StepIndicator label={t('reset.steps')} current={stepIndex} steps={[t('reset.step.request'), t('reset.step.verify'), t('reset.step.password')]} className="mb-10" />
          )}
          {body}
        </>
      )}
    </AuthLayout>
  )
}

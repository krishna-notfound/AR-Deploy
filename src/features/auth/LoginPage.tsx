import { ArrowRight } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { RECOVERED_PATCH, VERIFIED_PATCH, clearPasswordSignIn, markPasswordSignIn, needsCodeStep, useAccount, useSecurityState } from '@/auth/AccountProvider'
import { clearRecoveryPending } from '@/auth/recoveryPending'
import { useLeaveAccount } from '@/auth/RequireRole'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { preloadDashboardDictionaries } from '@/i18n/dashboardLoader'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { auth } from '@/services'
import { APPLY_PATH, RESET_PASSWORD_PATH, settingsPath } from '@/lib/urls'
import { cn } from '@/lib/cn'
import { TAP_TARGET } from '../public/tapTarget'
import { AuthHeading, AuthLayout, authFieldsClass } from './AuthLayout'
import { authErrorText } from './authErrors'
import { TwoFactorStep } from './TwoFactorStep'

/** Real sign-in (Supabase mode). In demo mode this route forwards to the demo account picker. */
export default function LoginPage() {
  const { t, lang } = useI18n()
  useDocumentTitle(t('auth.login.title'))
  // Signing in leads to a dashboard: fetch its text while the person types, so the dashboard opens without waiting for it.
  useEffect(() => preloadDashboardDictionaries(lang), [lang])
  const [params] = useSearchParams()
  const next = params.get('next')
  const { user, signedInEmail, accessDeactivated, accountFailure } = useAccount()
  const security = useSecurityState()
  const leave = useLeaveAccount()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // 'verifying'/'recovering': the step stays up while the account reloads after the code; then on to the app.
  const [stage, setStage] = useState<'idle' | 'verifying' | 'recovering' | 'recovered'>('idle')

  const authService = auth
  if (!authService) return <Navigate to={`/demo${next ? `?next=${encodeURIComponent(next)}` : ''}`} replace />
  // Signed in: once the security state has answered, either the code step or the app. A failed check goes on to the
  // app: the database still refuses data, and the 2FA gate there retries the check in the background.
  const checking = !!user && !security.loaded
  const codeStep = stage === 'recovering' || (stage === 'verifying' && !user) || (!!user && !checking && stage === 'idle' && needsCodeStep(security))
  if (user && !checking && !codeStep) {
    const scope = user.role === 'super_admin' ? 'admin' : 'business'
    if (stage === 'recovered') return <Navigate to={settingsPath(scope, 'security')} replace />
    const home = scope === 'admin' ? '/admin' : '/dashboard'
    return <Navigate to={next?.startsWith(home) ? next : home} replace />
  }
  if (codeStep) {
    return (
      <AuthLayout page="login">
        <AuthHeading eyebrow={t('auth.login.eyebrow')} title={t('auth.twoFactor.title')}>
          <p>{t('auth.twoFactor.intro')}</p>
        </AuthHeading>
        <TwoFactorStep
          className={cn('mt-8', authFieldsClass)}
          onVerified={async () => {
            setStage('verifying')
            // Known at once; the reload confirms it (and a failed reload keeps it).
            security.patch(VERIFIED_PATCH)
            await security.refresh()
          }}
          onRecovered={async () => {
            setStage('recovering')
            toast.show({ tone: 'info', title: t('auth.twoFactor.recovered') }, 10_000)
            security.patch(RECOVERED_PATCH)
            await security.refresh()
            setStage('recovered')
          }}
          onSignOut={() => {
            setStage('idle')
            void leave({ signOut: true })
          }}
        />
      </AuthLayout>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setPending(true)
    // This tab records the sign-in once it is complete (after the code step, also across a reload).
    markPasswordSignIn()
    const res = await authService.signInWithPassword(email.trim(), password)
    setPending(false)
    if (!res.ok) clearPasswordSignIn()
    // A password sign-in replaces any half-finished reset in this tab (ADR-0066).
    else clearRecoveryPending()
    // On success the auth listener reloads the account and the redirect above takes over.
    setError(res.ok ? null : authErrorText(t, res.error))
  }

  return (
    <AuthLayout page="login">
      <AuthHeading eyebrow={t('auth.login.eyebrow')} title={t('auth.login.title')}>
        <p>{t('auth.login.intro')}</p>
      </AuthHeading>

      {signedInEmail ? (
        <div className="mt-8 space-y-6">
          <InlineNotice tone="neutral">
            {t('auth.login.signedInAs')} <strong className="font-medium">{signedInEmail}</strong>.{' '}
            <span>{accessDeactivated ? t('auth.login.deactivated') : t('auth.login.noBusiness')}</span>
          </InlineNotice>
          {!accessDeactivated && (
            <p className="text-sm leading-6 text-ink-muted">
              {t('auth.login.invitationOnly')}
            </p>
          )}
          <Button onClick={() => void leave({ signOut: true })}>{t('auth.signOut')}</Button>
        </div>
      ) : (
        <form onSubmit={submit} className={cn('mt-8 space-y-5', authFieldsClass)} noValidate>
          {(error || accountFailure) && (
            <InlineNotice tone="warning">
              <span role="alert">{error ?? (accountFailure ? errorText(accountFailure, t) : undefined)}</span>
            </InlineNotice>
          )}
          <FormField label={t('common.email')}>
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField
            label={t('auth.login.password')}
            aside={
              <Link to={RESET_PASSWORD_PATH} className={cn(TAP_TARGET, 'text-xs text-accent-ink hover:underline')}>
                {t('auth.login.forgot')}
              </Link>
            }
          >
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending || checking} disabled={!email || !password}>
            {t('auth.login.title')}
            {!pending && !checking && <ArrowRight className="size-4" aria-hidden />}
          </Button>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-canvas px-5 py-4 text-sm">
            <span className="text-ink-muted">{t('auth.login.newTo')}</span>
            <Link to={APPLY_PATH} className="inline-flex min-h-11 items-center gap-2 text-label text-ink hover:text-accent-ink">
              {t('auth.login.apply')} <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  )
}

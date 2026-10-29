import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { translate } from '@/i18n/translate'
import { cn } from '@/lib/cn'
import { type ServiceError, account, isDemoMode } from '@/services'

/** English forms of two sentences, for callers outside the language context (tests, the 2FA gate); screens use t('auth.twoFactor.codePrompt') and t('auth.twoFactor.recovered'). */
export const CODE_PROMPT = translate('en', 'auth.twoFactor.codePrompt')
/** Shown after a recovery-code sign-in: the server removed the authenticator, so 2FA has to be set up again. */
export const RECOVERED_NOTICE = translate('en', 'auth.twoFactor.recovered')

const linkClass = 'inline-flex min-h-11 items-center text-ui-small font-medium text-accent-ink hover:underline disabled:opacity-60'

/**
 * The second sign-in step for an account with an authenticator: a 6-digit code (sent on the sixth digit), or one of
 * the recovery codes instead. The sign-in page and the 2FA gate share it. `onVerified` runs once the session is aal2;
 * `onRecovered` once a recovery code was accepted (the server then removes the authenticator).
 */
export function TwoFactorStep({
  onVerified,
  onRecovered,
  onSignOut,
  className,
}: {
  onVerified: () => void | Promise<void>
  onRecovered: () => void | Promise<void>
  /** Adds a "Sign out" link: the way back for someone who can't finish this step. */
  onSignOut?: () => void
  className?: string
}) {
  const { t } = useI18n()
  // An account-level rate limit is not the invitation limit that common.error.reason.rate_limited words.
  const failText = (e: ServiceError) => (e.reason === 'rate_limited' ? t('common.error.RATE_LIMITED') : errorText(e, t))
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  // Input takes no ref: the field's wrapper finds it.
  const field = useRef<HTMLDivElement>(null)
  const focusInput = () => field.current?.querySelector('input')?.focus()

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    focusInput()
  }, [mode])

  const refuse = (message: string) => {
    setBusy(false)
    setError(message)
    focusInput()
  }

  const verify = async (digits: string) => {
    if (busy) return
    if (!/^\d{6}$/.test(digits)) return refuse(t('auth.twoFactor.notSixDigits'))
    setError(null)
    setBusy(true)
    const r = await account.verifyTotpForSignIn(digits)
    if (!mounted.current) return
    if (!r.ok) {
      setCode('')
      return refuse(r.error.reason === 'invalid_code' ? t('auth.twoFactor.wrongCode') : failText(r.error))
    }
    // The button spins while the caller moves on; if this step is still shown afterwards, it is usable again.
    await onVerified()
    if (mounted.current) setBusy(false)
  }

  const redeem = async () => {
    if (busy) return
    const value = code.trim()
    if (!value) return refuse(t('auth.twoFactor.noRecovery'))
    setError(null)
    setBusy(true)
    const r = await account.redeemRecoveryCode(value)
    if (!mounted.current) return
    if (!r.ok) return refuse(r.error.reason === 'invalid_code' ? t('auth.twoFactor.wrongRecovery') : failText(r.error))
    await onRecovered()
    if (mounted.current) setBusy(false)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void (mode === 'totp' ? verify(code) : redeem())
  }

  const switchMode = () => {
    setMode((m) => (m === 'totp' ? 'recovery' : 'totp'))
    setCode('')
    setError(null)
  }

  return (
    <form noValidate onSubmit={submit} className={cn('space-y-5', className)}>
      {isDemoMode && (
        <InlineNotice tone="neutral">
          <strong className="font-medium text-ink">{t('auth.twoFactor.demoLabel')}</strong> {t('auth.twoFactor.demoNote')}
        </InlineNotice>
      )}
      {mode === 'totp' ? (
        <>
          <p className="text-ui-body text-ink">{t('auth.twoFactor.codePrompt')}</p>
          <div ref={field}>
            <FormField label={t('auth.twoFactor.codeLabel')} error={error ?? undefined} className="max-w-60">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                readOnly={busy}
                onChange={(e) => {
                  // No maxLength: it would cut a pasted '123 456' before the space is stripped.
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setCode(digits)
                  if (error) setError(null)
                  if (digits.length === 6) void verify(digits)
                }}
              />
            </FormField>
          </div>
        </>
      ) : (
        <>
          <p className="text-ui-body text-ink">{t('auth.twoFactor.recoveryPrompt')}</p>
          <div ref={field}>
            <FormField label={t('auth.twoFactor.recoveryLabel')} error={error ?? undefined} className="max-w-72">
              <Input
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={24}
                value={code}
                readOnly={busy}
                onChange={(e) => {
                  setCode(e.target.value)
                  if (error) setError(null)
                }}
              />
            </FormField>
          </div>
        </>
      )}
      {/* The field shows the error; this live region announces it, also when focus was already there. */}
      {error && (
        <p role="alert" className="sr-only">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
        {mode === 'totp' ? t('auth.twoFactor.verify') : t('auth.twoFactor.signInRecovery')}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <button type="button" className={linkClass} disabled={busy} onClick={switchMode}>
          {mode === 'totp' ? t('auth.twoFactor.useRecovery') : t('auth.twoFactor.useApp')}
        </button>
        {onSignOut && (
          <button type="button" className={linkClass} disabled={busy} onClick={onSignOut}>
            {t('auth.signOut')}
          </button>
        )}
      </div>
    </form>
  )
}

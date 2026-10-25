import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { cn } from '@/lib/cn'
import { account, isDemoMode } from '@/services'

export const CODE_PROMPT = 'Enter the 6-digit code from your authenticator app'
/** Shown after a recovery-code sign-in: the server removed the authenticator, so 2FA has to be set up again. */
export const RECOVERED_NOTICE = 'Your authenticator was removed. Set it up again.'

const WRONG_CODE = "That code didn't match. Check the time on your phone and enter the newest code."
const NOT_SIX_DIGITS = 'Enter all 6 digits of the code.'
const WRONG_RECOVERY = "That recovery code didn't work. Check it, or try another of your codes."
const NO_RECOVERY = 'Enter one of your recovery codes.'

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
    if (!/^\d{6}$/.test(digits)) return refuse(NOT_SIX_DIGITS)
    setError(null)
    setBusy(true)
    const r = await account.verifyTotpForSignIn(digits)
    if (!mounted.current) return
    if (!r.ok) {
      setCode('')
      return refuse(r.error.reason === 'invalid_code' ? WRONG_CODE : r.error.message)
    }
    // The button keeps spinning until the caller has moved on.
    await onVerified()
  }

  const redeem = async () => {
    if (busy) return
    const value = code.trim()
    if (!value) return refuse(NO_RECOVERY)
    setError(null)
    setBusy(true)
    const r = await account.redeemRecoveryCode(value)
    if (!mounted.current) return
    if (!r.ok) return refuse(r.error.reason === 'invalid_code' ? WRONG_RECOVERY : r.error.message)
    await onRecovered()
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
          <strong className="font-medium text-ink">Demo.</strong> No authenticator app is checked: the code is 123456.
        </InlineNotice>
      )}
      {mode === 'totp' ? (
        <>
          <p className="text-ui-body text-ink">{CODE_PROMPT}</p>
          <div ref={field}>
            <FormField label="6-digit code" error={error ?? undefined} className="max-w-60">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                readOnly={busy}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '')
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
          <p className="text-ui-body text-ink">Enter one of the recovery codes you saved when you set up 2FA. Each code works once.</p>
          <div ref={field}>
            <FormField label="Recovery code" error={error ?? undefined} className="max-w-72">
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
        {mode === 'totp' ? 'Verify' : 'Sign in with recovery code'}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <button type="button" className={linkClass} disabled={busy} onClick={switchMode}>
          {mode === 'totp' ? 'Use a recovery code' : 'Use your authenticator app'}
        </button>
        {onSignOut && (
          <button type="button" className={linkClass} disabled={busy} onClick={onSignOut}>
            Sign out
          </button>
        )}
      </div>
    </form>
  )
}

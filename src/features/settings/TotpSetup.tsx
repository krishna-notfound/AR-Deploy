import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CopyButton } from '@/components/ui/CopyButton'
import { FormField, Input } from '@/components/ui/Form'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState, InlineNotice } from '@/components/ui/States'
import type { TotpEnrollment } from '@/domain/types'
import { account, isDemoMode } from '@/services'
import { RecoveryCodes } from './RecoveryCodes'

const NOT_AVAILABLE = '2FA is not available yet: an administrator must enable it.'
const WRONG_CODE = "That code didn't match. Check the time on your phone and enter the newest code."
const NOT_SIX_DIGITS = 'Enter the 6-digit code from your authenticator app.'

/**
 * The image source for the enrolment QR code. The contract gives the SVG markup; supabase-js already hands back a
 * `data:image/svg+xml;utf-8,<svg…` URI, so a data URI is unwrapped first and never prefixed twice.
 */
export function qrImageSrc(qr: string): string {
  let svg = qr.trim()
  if (svg.startsWith('data:')) svg = svg.slice(svg.indexOf(',') + 1)
  if (/^%3C/i.test(svg)) {
    try {
      svg = decodeURIComponent(svg)
    } catch {
      // keep it as it is
    }
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** The setup key in groups of four, easier to type into an authenticator app. */
const groupKey = (secret: string) => secret.replace(/\s/g, '').replace(/(.{4})(?=.)/g, '$1 ')

type Stage =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string; unavailable: boolean }
  | { kind: 'scan'; enrollment: TotpEnrollment }
  | { kind: 'codes'; codes: string[] }
  | { kind: 'codesFailed'; message: string }

/**
 * Authenticator (TOTP) setup, self-contained: enrol, scan the QR code or type the setup key, confirm a 6-digit code,
 * then save the first set of recovery codes. `onDone` runs once 2FA is on (Security settings, the sign-in policy gate
 * and onboarding reuse it). `onCancel`, when given, adds a Cancel button while the code is not yet confirmed;
 * `onEnabled`, when given, runs as soon as the code is accepted (2FA is on from then, before the codes are saved).
 */
export function TotpSetup({ onDone, onCancel, onEnabled }: { onDone: () => void; onCancel?: () => void; onEnabled?: () => void }) {
  const [stage, setStage] = useState<Stage>({ kind: 'loading' })
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [generating, setGenerating] = useState(false)
  const mounted = useRef(false)
  const started = useRef(false)

  const start = useCallback(async () => {
    setStage({ kind: 'loading' })
    setCode('')
    setCodeError(null)
    const r = await account.startTotpEnrollment()
    if (!mounted.current) return
    if (r.ok) setStage({ kind: 'scan', enrollment: r.data })
    else if (r.error.reason === 'mfa_not_enabled') setStage({ kind: 'failed', message: NOT_AVAILABLE, unavailable: true })
    else setStage({ kind: 'failed', message: r.error.message, unavailable: false })
  }, [])

  useEffect(() => {
    mounted.current = true
    // One enrolment per setup, also under StrictMode's double effect: each new enrolment removes the unconfirmed one.
    if (!started.current) {
      started.current = true
      void start()
    }
    return () => {
      mounted.current = false
    }
  }, [start])

  const generate = async () => {
    setGenerating(true)
    // The first set straight after enrolment needs no emailed code.
    const r = await account.generateRecoveryCodes()
    if (!mounted.current) return
    setGenerating(false)
    setStage(r.ok ? { kind: 'codes', codes: r.data } : { kind: 'codesFailed', message: r.error.message })
  }

  const verify = async (e: FormEvent, enrollment: TotpEnrollment) => {
    e.preventDefault()
    const clean = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(clean)) {
      setCodeError(NOT_SIX_DIGITS)
      return
    }
    setCodeError(null)
    setVerifying(true)
    const r = await account.confirmTotpEnrollment(enrollment.factorId, clean)
    if (!mounted.current) return
    if (!r.ok) {
      setVerifying(false)
      setCodeError(r.error.reason === 'invalid_code' ? WRONG_CODE : r.error.reason === 'mfa_not_enabled' ? NOT_AVAILABLE : r.error.message)
      return
    }
    onEnabled?.()
    // The button keeps spinning while the recovery codes are made; the next stage replaces the form.
    await generate()
    setVerifying(false)
  }

  if (stage.kind === 'loading') {
    return (
      <div role="status" aria-label="Preparing 2FA setup" className="flex flex-col gap-4 sm:flex-row">
        <Skeleton className="size-44 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="mt-4 h-9 w-40" />
        </div>
      </div>
    )
  }

  if (stage.kind === 'failed') {
    return (
      <div className="space-y-3">
        {stage.unavailable ? (
          <InlineNotice tone="warning">{stage.message}</InlineNotice>
        ) : (
          <ErrorState message={stage.message} onRetry={() => void start()} />
        )}
        {onCancel && (
          <div className="flex justify-end">
            <Button onClick={onCancel}>{stage.unavailable ? 'Close' : 'Cancel'}</Button>
          </div>
        )}
      </div>
    )
  }

  if (stage.kind === 'codes') return <RecoveryCodes codes={stage.codes} onDone={onDone} />

  if (stage.kind === 'codesFailed') {
    return (
      <div className="space-y-3">
        <div role="alert" className="space-y-1">
          <p className="text-ui-body text-ink">2FA is on, but we couldn't create your recovery codes.</p>
          <p className="text-ui-small text-ink-muted">{stage.message} You can also create them later in Security settings.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onDone}>Finish without codes</Button>
          <Button variant="primary" loading={generating} onClick={() => void generate()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  const { enrollment } = stage
  return (
    <form noValidate onSubmit={(e) => void verify(e, enrollment)} className="space-y-5">
      {isDemoMode && (
        <InlineNotice tone="neutral">
          <strong className="font-medium text-ink">Demo.</strong> The QR code is a placeholder and no authenticator app is checked: use the code it shows.
        </InlineNotice>
      )}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <img
          src={qrImageSrc(enrollment.qrSvg)}
          alt="QR code for your authenticator app"
          width={176}
          height={176}
          className="size-44 shrink-0 rounded-[var(--radius-control)] border border-line bg-white p-2"
        />
        <div className="min-w-0 space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-ui-body text-ink">
            <li>Open an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password.</li>
            <li>Scan the QR code, or enter the setup key below.</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <div>
            <p className="text-ui-small text-ink-muted">Setup key</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="rounded-[2px] bg-subtle px-2 py-1 font-mono text-ui-body break-all text-ink">{groupKey(enrollment.secret)}</code>
              <CopyButton text={enrollment.secret.replace(/\s/g, '')} label="Copy key" toastTitle="Setup key copied" />
            </div>
          </div>
        </div>
      </div>
      <FormField label="6-digit code" error={codeError ?? undefined} className="max-w-60">
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={7}
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            if (codeError) setCodeError(null)
          }}
        />
      </FormField>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
        <Button type="submit" variant="primary" loading={verifying}>
          Verify and turn on
        </Button>
      </div>
    </form>
  )
}

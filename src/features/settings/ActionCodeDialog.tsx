// The shared dialog for risky account actions (spec 8 "Risky actions"): it emails a 6-digit code when it opens, takes
// the code, and runs the action only when the server accepts it. Used by My account (closure), Security & 2FA
// (turn off 2FA, new recovery codes) and the Owner's admin actions (reset 2FA, complete closure).
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { InlineNotice } from '@/components/ui/States'
import { type ActionPurpose, type Result, type ServiceError, account, isDemoMode } from '@/services'

/** Seconds before another code can be sent (spec: resend cooldown 30 s). */
export const RESEND_COOLDOWN_S = 30
const CODE_LENGTH = 6

/** Fixed copy for the code errors; any other failure shows its own (already user-safe) message. */
const CODE_ERRORS: Record<string, string> = {
  invalid_code: "That code isn't right. Check it and try again.",
  code_expired: 'That code has expired. Send a new code and try again.',
  too_many_attempts: 'Too many wrong attempts. Send a new code and try again.',
  rate_limited: 'Too many codes were requested. Wait a few minutes and try again.',
}
const SEND_ERRORS: Record<string, string> = {
  email_failed: "We couldn't send the code. Try again.",
  rate_limited: CODE_ERRORS.rate_limited as string,
}
/** After these the code in hand is no longer usable: clear the field so the next step is a new code. */
const CODE_SPENT = new Set(['code_expired', 'too_many_attempts'])

const codeMessage = (e: ServiceError) => (e.reason && Object.hasOwn(CODE_ERRORS, e.reason) ? (CODE_ERRORS[e.reason] as string) : e.message)
const sendMessage = (e: ServiceError) => (e.reason && Object.hasOwn(SEND_ERRORS, e.reason) ? (SEND_ERRORS[e.reason] as string) : e.message)

type Send = { status: 'sending' } | { status: 'sent'; sentTo: string } | { status: 'failed'; message: string }

export interface ActionCodeDialogProps {
  open: boolean
  purpose: ActionPurpose
  title: string
  description?: string
  confirmLabel: string
  destructive?: boolean
  onClose: () => void
  /** Runs the action with the code. On success the dialog closes (it calls onClose); on failure it shows the reason. */
  onConfirm: (code: string) => Promise<Result<unknown>>
}

export function ActionCodeDialog(props: ActionCodeDialogProps) {
  // A fresh dialog per opening: no code, error or cooldown carries over from the last time.
  if (!props.open) return null
  return <OpenActionCodeDialog {...props} />
}

function OpenActionCodeDialog({ purpose, title, description, confirmLabel, destructive, onClose, onConfirm }: ActionCodeDialogProps) {
  const [send, setSend] = useState<Send>({ status: 'sending' })
  // Resend waits until this time (ms); `now` ticks once a second while it is in the future.
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const live = useRef(true)
  const sendId = useRef(0)
  const sentOnOpen = useRef(false)
  // Set synchronously, so two submits before a re-render (Enter repeat, double tap) still run the action once.
  const submitting = useRef(false)
  // The shared Input takes no ref: reach the field through its wrapper.
  const codeField = useRef<HTMLDivElement>(null)
  const formId = useId()

  const sendCode = useCallback(async () => {
    const id = ++sendId.current
    setSend({ status: 'sending' })
    const r = await account.sendActionCode(purpose)
    if (!live.current || id !== sendId.current) return
    if (r.ok) {
      setSend({ status: 'sent', sentTo: r.data.sentTo })
      const t = Date.now()
      setNow(t)
      setResendAt(t + RESEND_COOLDOWN_S * 1000)
    } else {
      // No cooldown after a failure: nothing was sent, so Resend is the next step straight away.
      setSend({ status: 'failed', message: sendMessage(r.error) })
    }
  }, [purpose])

  useEffect(() => {
    live.current = true
    // Once per opening, also under StrictMode's double effect: every send counts toward the hourly limit.
    if (!sentOnOpen.current) {
      sentOnOpen.current = true
      void sendCode()
    }
    return () => {
      live.current = false
    }
  }, [sendCode])

  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000))
  useEffect(() => {
    if (resendAt <= Date.now()) return
    // Measured against the clock, so a throttled background tab still counts down correctly.
    const t = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n >= resendAt) clearInterval(t)
    }, 1000)
    return () => clearInterval(t)
  }, [resendAt])

  const resend = () => {
    setError(null)
    setCode('')
    void sendCode()
  }

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (submitting.current || send.status !== 'sent') return
    if (code.length !== CODE_LENGTH) {
      setError('Enter the 6-digit code.')
      return
    }
    submitting.current = true
    setPending(true)
    setError(null)
    const r = await onConfirm(code)
    submitting.current = false
    if (!live.current) return
    setPending(false)
    if (r.ok) {
      onClose()
      return
    }
    setError(codeMessage(r.error))
    if (r.error.reason && CODE_SPENT.has(r.error.reason)) setCode('')
  }

  const sent = send.status === 'sent'
  // Ready for the code as soon as it is sent, and again after a refused attempt (the field is disabled while it runs).
  useEffect(() => {
    if (sent && !pending) codeField.current?.querySelector('input')?.focus()
  }, [sent, pending])
  const canResend = send.status !== 'sending' && cooldown <= 0 && !pending

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!pending}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant={destructive ? 'danger' : 'primary'} loading={pending} disabled={!sent}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        {/* One polite live region announces the sending state, the sent address and a send failure. */}
        <div aria-live="polite">
          {send.status === 'sending' && <p className="text-ui-body text-ink-muted">Sending a code to your email…</p>}
          {send.status === 'sent' && (
            <p className="text-ui-body text-ink">
              We emailed a 6-digit code to <strong className="font-medium break-words">{send.sentTo}</strong>. It is valid for 10 minutes.
            </p>
          )}
          {send.status === 'failed' && (
            <InlineNotice tone="warning">{send.message}</InlineNotice>
          )}
        </div>
        {isDemoMode && (
          <InlineNotice tone="neutral">Demo: no email is sent. Use the code 123456.</InlineNotice>
        )}
        <div ref={codeField}>
          <FormField label="6-digit code" error={error ?? undefined}>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              value={code}
              disabled={!sent || pending}
              onChange={(e) => {
                // No maxLength: it would cut a pasted '123 456' before the space is stripped.
                setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))
                if (error) setError(null)
              }}
              className="font-mono tracking-[0.3em]"
            />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button size="sm" variant="ghost" onClick={resend} disabled={!canResend} className="-ml-3!">
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </Button>
          {cooldown <= 0 && send.status === 'sent' && <span className="text-ui-small text-ink-muted">A new code replaces the last one.</span>}
        </div>
      </form>
    </Modal>
  )
}

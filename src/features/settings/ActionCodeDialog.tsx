// The shared dialog for risky account actions (spec 8 "Risky actions"): it emails a 6-digit code when it opens, takes
// the code, and runs the action only when the server accepts it. Used by My account (closure), Security & 2FA
// (turn off 2FA, new recovery codes) and the Owner's admin actions (reset 2FA, complete closure).
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { InlineNotice } from '@/components/ui/States'
import { useOptionalAccount } from '@/auth/AccountProvider'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { accountErrorText } from './accountError'
import { useI18n } from '@/i18n/LanguageProvider'
import { type ActionPurpose, type Result, type ServiceError, account, isDemoMode } from '@/services'

/** Seconds before another code can be sent (spec: resend cooldown 30 s). */
export const RESEND_COOLDOWN_S = 30
const CODE_LENGTH = 6

/** Fixed copy for the code errors; any other failure shows the shared sentence for its code. */
const CODE_ERRORS: Record<string, TranslationKey> = {
  invalid_code: 'settings.code.err.invalid',
  code_expired: 'settings.code.err.expired',
  too_many_attempts: 'settings.code.err.tooMany',
  rate_limited: 'settings.code.err.rateLimited',
}
const SEND_ERRORS: Record<string, TranslationKey> = {
  email_failed: 'settings.code.err.sendFailed',
  email_blocked: 'settings.code.emailBlocked',
  rate_limited: 'settings.code.err.rateLimited',
}

/**
 * R-W7-7: once the server says this address can't be emailed (a blocked send), no further code is asked for in this
 * browser session: a retry can't succeed until the platform side changes. Every request would also count toward the
 * hourly code limit. Kept in sessionStorage, so a new session tries again.
 */
const BLOCKED_KEY = 'arfurn:action-code-email-blocked'
/** Keyed by the signed-in user, so another account on the same tab is not affected. */
const sendBlocked = (uid: string) => {
  try {
    return sessionStorage.getItem(`${BLOCKED_KEY}:${uid}`) === '1'
  } catch {
    return false
  }
}
const rememberBlocked = (uid: string) => {
  try {
    sessionStorage.setItem(`${BLOCKED_KEY}:${uid}`, '1')
  } catch {
    // Storage unavailable: this dialog still disables Resend until it closes.
  }
}
/** After these the code in hand is no longer usable: clear the field so the next step is a new code. */
const CODE_SPENT = new Set(['code_expired', 'too_many_attempts'])

type T = ReturnType<typeof useI18n>['t']
const codeMessage = (e: ServiceError, t: T) => (e.reason && Object.hasOwn(CODE_ERRORS, e.reason) ? t(CODE_ERRORS[e.reason] as TranslationKey) : accountErrorText(e, t))
const sendMessage = (e: ServiceError, t: T) => (e.reason && Object.hasOwn(SEND_ERRORS, e.reason) ? t(SEND_ERRORS[e.reason] as TranslationKey) : accountErrorText(e, t))

type Send = { status: 'sending' } | { status: 'sent'; sentTo: string } | { status: 'failed'; error: ServiceError } | { status: 'blocked' }

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
  const { t } = useI18n()
  const uid = useOptionalAccount()?.user?.id ?? ''
  const [send, setSend] = useState<Send>(() => (sendBlocked(uid) ? { status: 'blocked' } : { status: 'sending' }))
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
    if (!r.ok && r.error.reason === 'email_blocked') {
      rememberBlocked(uid)
      setSend({ status: 'blocked' })
    } else if (r.ok) {
      setSend({ status: 'sent', sentTo: r.data.sentTo })
      const at = Date.now()
      setNow(at)
      setResendAt(at + RESEND_COOLDOWN_S * 1000)
    } else {
      // No cooldown after a failure: nothing was sent, so Resend is the next step straight away.
      setSend({ status: 'failed', error: r.error })
    }
  }, [purpose, uid])

  useEffect(() => {
    live.current = true
    // Once per opening, also under StrictMode's double effect: every send counts toward the hourly limit.
    if (!sentOnOpen.current) {
      sentOnOpen.current = true
      if (!sendBlocked(uid)) void sendCode()
    }
    return () => {
      live.current = false
    }
  }, [sendCode, uid])

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
      setError(t('settings.code.enter'))
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
    setError(codeMessage(r.error, t))
    if (r.error.reason && CODE_SPENT.has(r.error.reason)) setCode('')
  }

  const sent = send.status === 'sent'
  // Ready for the code as soon as it is sent, and again after a refused attempt (the field is disabled while it runs).
  useEffect(() => {
    if (sent && !pending) codeField.current?.querySelector('input')?.focus()
  }, [sent, pending])
  const canResend = send.status !== 'sending' && send.status !== 'blocked' && cooldown <= 0 && !pending

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
            {t('common.cancel')}
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
          {send.status === 'sending' && <p className="text-ui-body text-ink-muted">{t('settings.code.sending')}</p>}
          {send.status === 'sent' && (
            <p className="text-ui-body text-ink">
              {t('settings.code.sentTo')} <strong className="font-medium break-words">{send.sentTo}</strong>. {t('settings.code.valid')}
            </p>
          )}
          {send.status === 'failed' && (
            <InlineNotice tone="warning">{sendMessage(send.error, t)}</InlineNotice>
          )}
          {send.status === 'blocked' && <InlineNotice tone="warning">{t('settings.code.emailBlocked')}</InlineNotice>}
        </div>
        {isDemoMode && (
          <InlineNotice tone="neutral">{t('settings.code.demo')}</InlineNotice>
        )}
        <div ref={codeField}>
          <FormField label={t('settings.code.label')} error={error ?? undefined}>
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
            {cooldown > 0 ? t('settings.code.resendIn', { n: cooldown }) : t('settings.code.resend')}
          </Button>
          {cooldown <= 0 && send.status === 'sent' && <span className="text-ui-small text-ink-muted">{t('settings.code.replaces')}</span>}
        </div>
      </form>
    </Modal>
  )
}

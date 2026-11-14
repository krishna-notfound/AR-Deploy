// Settings > My account > "Sign-in emails" (ADR-0077). The platform Owner only: the primary email (the Auth email, which
// gets every email and the reset codes) and up to 3 aliases, which only sign in. Everything goes through `account`
// (the account-security function; an in-memory harness in demo mode). The caller shows this card to the Owner only.
import { Mail, Plus } from 'lucide-react'
import { type FormEvent, useId, useRef, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { FormField, Input } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { useI18n } from '@/i18n/LanguageProvider'
import { MAX_ALIASES, type Result, type ServiceError, account } from '@/services'
import { EMAIL_PATTERN } from '@/services/accountService'
import { useServiceQuery } from '@/services/hooks'
import { accountErrorText } from '../accountError'
import { SettingsCard } from '../SettingsUi'

const CODE_LENGTH = 6
/** The reasons that mean "that code no longer works": the field is cleared for the next one. */
const CODE_SPENT = new Set(['code_expired', 'too_many_attempts'])

export function SignInEmailsCard() {
  const { t } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const emails = useServiceQuery(() => account.listSignInEmails(), [])
  const [adding, setAdding] = useState(false)
  const [promoting, setPromoting] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const data = emails.data
  const full = (data?.aliases.length ?? 0) >= MAX_ALIASES

  const remove = async (email: string) => {
    const go = await confirm({
      title: t('settings.signIn.removeTitle', { email }),
      body: t('settings.signIn.removeBody'),
      confirmLabel: t('settings.signIn.remove'),
      destructive: true,
    })
    if (!go) return
    setRemoving(email)
    const r = await account.removeAlias(email)
    setRemoving(null)
    if (!r.ok) {
      toast.error(t('settings.signIn.removeFailed'), accountErrorText(r.error, t))
      return
    }
    toast.success(t('settings.signIn.removed'))
    emails.refetch()
  }

  let body
  if (emails.status === 'loading' && !data) body = <Skeleton className="h-24 w-full" />
  else if (emails.status === 'error' && !data) body = <ErrorState message={`${t('settings.signIn.loadFailed')} ${accountErrorText(emails.error, t)}`} onRetry={emails.refetch} className="py-6" />
  else if (data)
    body = (
      <div className="space-y-4">
        <ul aria-label={t('settings.signIn.listLabel')} className="divide-y divide-line rounded-[var(--radius-control)] border border-line">
          <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <Mail className="size-4 shrink-0 text-ink-muted" aria-hidden />
            <span className="min-w-0 flex-1 text-ui-body font-medium break-words text-ink">{data.primary}</span>
            <Badge tone="accent">{t('settings.signIn.primary')}</Badge>
          </li>
          {data.aliases.map((a) => (
            <li key={a.email} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <Mail className="size-4 shrink-0 text-ink-muted" aria-hidden />
              <span className="min-w-0 flex-1 basis-48 text-ui-body break-words text-ink">{a.email}</span>
              <span className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setPromoting(a.email)} disabled={removing !== null}>
                  {t('settings.signIn.makePrimary')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(a.email)} loading={removing === a.email} disabled={removing !== null && removing !== a.email}>
                  {t('settings.signIn.remove')}
                </Button>
              </span>
            </li>
          ))}
        </ul>
        {data.aliases.length === 0 && <p className="text-ui-small text-ink-muted">{t('settings.signIn.empty')}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button variant="primary" onClick={() => setAdding(true)} disabled={full}>
            <Plus className="size-4" aria-hidden />
            {t('settings.signIn.add')}
          </Button>
          <span className="text-ui-small text-ink-muted">{t('settings.signIn.count', { n: data.aliases.length, max: MAX_ALIASES })}</span>
        </div>
        {full && <p className="text-ui-small text-ink-muted">{t('settings.signIn.limitReached', { max: MAX_ALIASES })}</p>}
      </div>
    )

  return (
    <SettingsCard title={t('settings.signIn.title')} description={t('settings.signIn.description')}>
      {body}
      {adding && (
        <AddAliasDialog
          onClose={() => setAdding(false)}
          onAdded={(email) => {
            setAdding(false)
            toast.success(t('settings.signIn.added'), t('settings.signIn.addedBody', { email }))
            emails.refetch()
          }}
        />
      )}
      {promoting && data && (
        <MakePrimaryDialog
          alias={promoting}
          oldPrimary={data.primary}
          onClose={() => setPromoting(null)}
          onDone={(othersSignedOut) => {
            toast.success(t('settings.signIn.primaryDone'), `${t('settings.signIn.primaryDoneBody', { email: promoting })}${othersSignedOut ? '' : ` ${t('settings.signIn.primaryDonePartial')}`}`)
            setPromoting(null)
            emails.refetch()
          }}
        />
      )}
    </SettingsCard>
  )
}

/** Two steps in one dialog: the address, then the code that was sent to it (not to the primary). */
function AddAliasDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (email: string) => void }) {
  const { t } = useI18n()
  const formId = useId()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<{ email: string; to: string } | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // Set synchronously, so two submits before a re-render (Enter repeat, double tap) still run the action once.
  const busy = useRef(false)

  const send = async (to: string) => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    const r = await account.sendAliasCode(to)
    busy.current = false
    setPending(false)
    if (!r.ok) {
      setError(accountErrorText(r.error, t))
      return
    }
    setError(null)
    setCode('')
    setSent({ email: to, to: r.data.sentTo })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!sent) {
      const next = email.trim()
      if (!EMAIL_PATTERN.test(next)) return setError(t('common.validation.emailInvalid'))
      await send(next)
      return
    }
    if (code.length !== CODE_LENGTH) return setError(t('settings.code.enter'))
    if (busy.current) return
    busy.current = true
    setPending(true)
    const r: Result<void> = await account.addAlias(sent.email, code)
    busy.current = false
    setPending(false)
    if (r.ok) return onAdded(sent.email)
    setError(codeError(r.error, t))
    if (r.error.reason && CODE_SPENT.has(r.error.reason)) setCode('')
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!pending}
      title={t('settings.signIn.addTitle')}
      description={sent ? undefined : t('settings.signIn.addIntro')}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={pending}>
            {sent ? t('settings.signIn.addConfirm') : t('settings.signIn.addSend')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        {sent ? (
          <>
            <p role="status" className="text-ui-body text-ink">
              {t('settings.signIn.codeSentTo', { email: sent.to })}
            </p>
            <FormField label={t('settings.code.label')} error={error ?? undefined}>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                value={code}
                disabled={pending}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))
                  if (error) setError(null)
                }}
                className="font-mono tracking-[0.3em]"
              />
            </FormField>
            <Button size="sm" variant="ghost" onClick={() => void send(sent.email)} disabled={pending} className="-ml-3!">
              {t('settings.signIn.resend')}
            </Button>
          </>
        ) : (
          <FormField label={t('settings.signIn.addEmail')} error={error ?? undefined}>
            <Input
              type="email"
              autoComplete="off"
              value={email}
              disabled={pending}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setError(null)
              }}
            />
          </FormField>
        )}
      </form>
    </Modal>
  )
}

/** The authenticator code is the only proof asked: aal2 and a fresh code are what the server checks (ADR-0077). */
function MakePrimaryDialog({ alias, oldPrimary, onClose, onDone }: { alias: string; oldPrimary: string; onClose: () => void; onDone: (othersSignedOut: boolean) => void }) {
  const { t } = useI18n()
  const formId = useId()
  const [totp, setTotp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy.current) return
    if (totp.length !== CODE_LENGTH) return setError(t('settings.code.totpEnter'))
    busy.current = true
    setPending(true)
    const r = await account.makeAliasPrimary(alias, totp)
    busy.current = false
    setPending(false)
    if (r.ok) return onDone(r.data.othersSignedOut)
    setError(accountErrorText(r.error, t))
    // An authenticator code works once per 30 s window: the next try needs the newest one.
    if (r.error.reason === 'invalid_totp' || r.error.reason === 'totp_required') setTotp('')
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!pending}
      title={t('settings.signIn.primaryTitle', { email: alias })}
      description={t('settings.signIn.primaryBody', { email: alias, old: oldPrimary })}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={pending}>
            {t('settings.signIn.primaryConfirm')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        <FormField label={t('settings.code.totpLabel')} hint={t('settings.code.totpHint')} error={error ?? undefined}>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            value={totp}
            disabled={pending}
            onChange={(e) => {
              setTotp(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))
              if (error) setError(null)
            }}
            className="font-mono tracking-[0.3em]"
          />
        </FormField>
      </form>
    </Modal>
  )
}

const codeError = (e: ServiceError, t: ReturnType<typeof useI18n>['t']) => {
  if (e.reason === 'invalid_code') return t('settings.code.err.invalid')
  if (e.reason === 'code_expired') return t('settings.code.err.expired')
  if (e.reason === 'too_many_attempts') return t('settings.code.err.tooMany')
  return accountErrorText(e, t)
}

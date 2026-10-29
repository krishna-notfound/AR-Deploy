// My account (spec 8): the sign-in email, the password and account closure. Every change goes through `account`
// (Supabase Auth and the account-security function in a Supabase build; an in-memory Demo harness otherwise).
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { SIGN_IN_PATH } from '@/auth/RequireRole'
import { useCan } from '@/auth/usePermission'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { FormField, Input } from '@/components/ui/Form'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState, InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { accountErrorText } from '../accountError'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { PASSWORD_MAX, PASSWORD_MIN, type SecurityState, account, auth, isDemoMode } from '@/services'
import { EMAIL_PATTERN } from '@/services/accountService'
import { type QueryResult, useServiceQuery } from '@/services/hooks'
import { ActionCodeDialog } from '../ActionCodeDialog'
import { useCancelClosure } from '../useCancelClosure'
import { SectionHeader, SettingsCard } from '../SettingsUi'

type Security = QueryResult<SecurityState>

const CLOSURE_LINE = {
  inactive: 'settings.account.closureLine.inactive',
  draft: 'settings.account.closureLine.draft',
  active: 'settings.account.closureLine.active',
} as const

export default function AccountSection() {
  const { t } = useI18n()
  const { user } = useAccount()
  const security = useServiceQuery(() => account.getSecurityState(), [])
  const { refetch } = security

  // A confirmed email change happens in another tab or app: look again when this window regains focus, and when Auth
  // reports a change (USER_UPDATED).
  useEffect(() => {
    const again = () => refetch()
    window.addEventListener('focus', again)
    const off = auth?.onAuthStateChange(again)
    return () => {
      window.removeEventListener('focus', again)
      off?.()
    }
  }, [refetch])

  return (
    <>
      <SectionHeader title={t('settings.section.account')} description={t('settings.account.description')} />
      <div className="space-y-6">
        {isDemoMode && (
          <InlineNotice tone="neutral">{t('settings.account.demoNotice')}</InlineNotice>
        )}
        <EmailCard currentEmail={user?.email ?? ''} security={security} />
        <PasswordCard />
        <ClosureCard security={security} />
      </div>
    </>
  )
}

/* ---------- Email ---------- */

function EmailCard({ currentEmail, security }: { currentEmail: string; security: Security }) {
  const { t } = useI18n()
  const pendingEmail = security.data?.pendingEmail ?? null
  return (
    <SettingsCard title={t('settings.account.email')} description={t('settings.account.emailDescription')}>
      <div className="space-y-5">
        <div>
          <p className="text-ui-small text-ink-muted">{t('settings.account.signInEmail')}</p>
          <p className="mt-0.5 text-ui-body font-medium break-words text-ink">{currentEmail}</p>
        </div>
        {security.status === 'loading' && !security.data ? (
          <Skeleton className="h-24 w-full" />
        ) : pendingEmail ? (
          <PendingEmail currentEmail={currentEmail} pendingEmail={pendingEmail} onChanged={security.refetch} />
        ) : (
          <EmailForm currentEmail={currentEmail} onRequested={security.refetch} />
        )}
        {security.status === 'error' && !security.data && (
          <p role="alert" className="text-ui-small text-danger">
            {t('settings.account.pendingCheckFailed')} {accountErrorText(security.error, t)}
          </p>
        )}
      </div>
    </SettingsCard>
  )
}

function EmailForm({ currentEmail, onRequested }: { currentEmail: string; onRequested: () => void }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next = email.trim()
    const found: typeof errors = {}
    if (!EMAIL_PATTERN.test(next)) found.email = t('common.validation.emailInvalid')
    else if (next.toLowerCase() === currentEmail.toLowerCase()) found.email = t('settings.account.sameEmail')
    if (!password) found.password = t('settings.account.enterCurrent')
    setErrors(found)
    if (found.email || found.password) return
    setPending(true)
    const r = await account.requestEmailChange(password, next)
    setPending(false)
    if (r.ok) {
      setPassword('')
      setEmail('')
      onRequested()
      return
    }
    const reason = r.error.reason
    if (reason === 'password_incorrect') setErrors({ password: t('settings.account.passwordIncorrect') })
    else if (reason === 'email_taken') setErrors({ email: accountErrorText(r.error, t) })
    else if (reason === 'invalid_email') setErrors({ email: accountErrorText(r.error, t) })
    else setErrors({ form: accountErrorText(r.error, t) })
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
      <p className="text-ui-small text-ink-muted">{t('settings.account.emailChangeIntro')}</p>
      <FormField label={t('settings.account.newEmail')} error={errors.email}>
        <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>
      <FormField label={t('settings.account.currentPassword')} error={errors.password}>
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </FormField>
      {errors.form && <FormAlert>{errors.form}</FormAlert>}
      <Button type="submit" variant="primary" loading={pending}>
        {t('settings.account.changeEmail')}
      </Button>
    </form>
  )
}

function PendingEmail({ currentEmail, pendingEmail, onChanged }: { currentEmail: string; pendingEmail: string; onChanged: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [resending, setResending] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'resend' | 'cancel' | null>(null)

  const cancel = async () => {
    setBusy('cancel')
    const r = await account.cancelEmailChange()
    setBusy(null)
    if (!r.ok) {
      toast.error(t('settings.account.cancelEmailFailed'), accountErrorText(r.error, t))
      return
    }
    toast.success(t('settings.account.emailCancelled'), t('settings.account.emailCancelledBody', { email: currentEmail }))
    onChanged()
  }

  const resend = async (e: FormEvent) => {
    e.preventDefault()
    if (!password) {
      setError(t('settings.account.enterCurrent'))
      return
    }
    setBusy('resend')
    const r = await account.requestEmailChange(password, pendingEmail)
    setBusy(null)
    if (!r.ok) {
      setError(r.error.reason === 'password_incorrect' ? t('settings.account.passwordIncorrect') : accountErrorText(r.error, t))
      return
    }
    setPassword('')
    setError(null)
    setResending(false)
    toast.success(t('settings.account.linkResent'), t('settings.account.linkResentBody', { email: pendingEmail }))
    onChanged()
  }

  return (
    <div role="status" className="space-y-3 rounded-[var(--radius-control)] bg-info-soft px-4 py-3.5 text-ui-body text-ink">
      <p>
        {t('settings.account.pendingIntro')} <strong className="font-medium break-words">{pendingEmail}</strong>. {t('settings.account.pendingUntil')}{' '}
        <span className="break-words">{currentEmail}</span>.
      </p>
      {resending ? (
        <form onSubmit={(e) => void resend(e)} noValidate className="space-y-3">
          <FormField label={t('settings.account.currentPassword')} error={error ?? undefined} hint={t('settings.account.resendHint')}>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="primary" loading={busy === 'resend'}>
              {t('settings.account.sendAgain')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResending(false)} disabled={busy !== null}>
              {t('common.back')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setResending(true)} disabled={busy !== null}>
            {t('settings.account.resend')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void cancel()} loading={busy === 'cancel'}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
    </div>
  )
}

/* ---------- Password ---------- */

/** Length is the only rule (spec 8: a strength hint, no composition rules). */
function lengthHint(n: number, t: ReturnType<typeof useI18n>['t'], tn: ReturnType<typeof useI18n>['tn']): string {
  if (n === 0) return t('settings.account.pw.range', { min: PASSWORD_MIN, max: PASSWORD_MAX })
  if (n < PASSWORD_MIN) return tn('settings.account.pw.short', PASSWORD_MIN - n)
  if (n > PASSWORD_MAX) return t('settings.account.pw.long', { max: PASSWORD_MAX })
  if (n < 16) return t('settings.account.pw.ok')
  return t('settings.account.pw.strong')
}

function PasswordCard() {
  const { t, tn } = useI18n()
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmNext, setConfirmNext] = useState('')
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string; form?: string }>({})
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const found: typeof errors = {}
    if (!current) found.current = t('settings.account.enterCurrent')
    if (next.length < PASSWORD_MIN) found.next = t('settings.account.pw.min', { n: PASSWORD_MIN })
    else if (next.length > PASSWORD_MAX) found.next = t('settings.account.pw.max', { n: PASSWORD_MAX })
    else if (confirmNext !== next) found.confirm = t('settings.account.pw.mismatch')
    setErrors(found)
    if (Object.keys(found).length) return
    setPending(true)
    const r = await account.changePassword(current, next)
    setPending(false)
    if (r.ok) {
      setCurrent('')
      setNext('')
      setConfirmNext('')
      toast.success(t('settings.account.pw.changed'))
      return
    }
    const reason = r.error.reason
    if (reason === 'current_password_mismatch') setErrors({ current: accountErrorText(r.error, t) })
    else if (reason === 'same_password') setErrors({ next: accountErrorText(r.error, t) })
    else if (reason === 'weak_password') setErrors({ next: accountErrorText(r.error, t) })
    else setErrors({ form: accountErrorText(r.error, t) })
  }

  return (
    <SettingsCard title={t('settings.account.pw.title')} description={t('settings.account.pw.description')}>
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        <FormField label={t('settings.account.currentPassword')} error={errors.current}>
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </FormField>
        <FormField label={t('settings.account.pw.new')} error={errors.next} hint={lengthHint(next.length, t, tn)}>
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </FormField>
        <FormField label={t('settings.account.pw.confirm')} error={errors.confirm}>
          <Input type="password" autoComplete="new-password" value={confirmNext} onChange={(e) => setConfirmNext(e.target.value)} />
        </FormField>
        {errors.form && <FormAlert>{errors.form}</FormAlert>}
        <Button type="submit" variant="primary" loading={pending}>
          {t('settings.account.pw.change')}
        </Button>
      </form>
    </SettingsCard>
  )
}

/* ---------- Closure ---------- */

function ClosureCard({ security }: { security: Security }) {
  const { t } = useI18n()
  const { user } = useAccount()
  const can = useCan()
  if (!user) return null
  if (user.role === 'business_admin') return <BusinessClosure security={security} />
  if (can('owner')) {
    return (
      <SettingsCard title={t('settings.account.delete.title')}>
        <p className="text-ui-body text-ink-muted">{t('settings.account.delete.ownerNote')}</p>
      </SettingsCard>
    )
  }
  return <StaffDeletion />
}

function BusinessClosure({ security }: { security: Security }) {
  const { t } = useI18n()
  const fmt = useFormat()
  const { business } = useAccount()
  const confirm = useConfirm()
  const toast = useToast()
  const [dialog, setDialog] = useState(false)
  const { cancel: cancelRequest, cancelling } = useCancelClosure(security.refetch)
  const closure = security.data?.closure ?? null

  const start = async () => {
    const go = await confirm({
      title: t('settings.account.closure.confirmTitle'),
      body: (
        <ul className="list-disc space-y-1.5 pl-5">
          <li>{t('settings.account.closure.point1')}</li>
          <li>{t('settings.account.closure.point2')}</li>
          <li>{t('settings.account.closure.point3')}</li>
        </ul>
      ),
      confirmLabel: t('common.continue'),
      destructive: true,
    })
    if (go) setDialog(true)
  }

  let body: ReactNode
  if (security.status === 'loading' && !security.data) body = <Skeleton className="h-16 w-full" />
  else if (security.status === 'error' && !security.data) body = <ErrorState message={accountErrorText(security.error, t)} onRetry={security.refetch} className="py-6" />
  else if (closure)
    body = (
      <div className="space-y-3">
        <div role="status" className="rounded-[var(--radius-control)] bg-warning-soft px-4 py-3 text-ui-body text-warning">
          {t('settings.account.closure.requestedOn', { date: fmt.date(closure.requestedAt) })} · {t(CLOSURE_LINE[business?.status ?? 'inactive'])}
        </div>
        <p className="text-ui-small text-ink-muted">{t('settings.account.closure.pendingNote')}</p>
        <Button onClick={() => void cancelRequest()} loading={cancelling}>
          {t('settings.account.closure.cancelRequest')}
        </Button>
      </div>
    )
  else
    body = (
      <div className="space-y-4">
        <p className="text-ui-body text-ink-muted">{t('settings.account.closure.note')}</p>
        <Button variant="danger" onClick={() => void start()}>
          {t('settings.account.closure.request')}
        </Button>
      </div>
    )

  return (
    <SettingsCard title={t('settings.account.closure.title')} tone="danger">
      {body}
      <ActionCodeDialog
        open={dialog}
        purpose="request_closure"
        title={t('settings.account.closure.dialogTitle')}
        description={t('settings.account.closure.dialogBody')}
        confirmLabel={t('settings.account.closure.request')}
        destructive
        onClose={() => setDialog(false)}
        onConfirm={async (code) => {
          const r = await account.requestClosure(code)
          if (r.ok) toast.success(t('settings.account.closure.requested'), t('settings.account.closure.requestedBody'))
          // An open request found by the server shows here too.
          if (r.ok || r.error.reason === 'already_requested') security.refetch()
          return r
        }}
      />
    </SettingsCard>
  )
}

function StaffDeletion() {
  const { t } = useI18n()
  const confirm = useConfirm()
  const toast = useToast()
  const navigate = useNavigate()
  const { logout } = useAccount()
  const [dialog, setDialog] = useState(false)

  const start = async () => {
    const go = await confirm({
      title: t('settings.account.delete.confirmTitle'),
      body: t('settings.account.delete.confirmBody'),
      confirmLabel: t('common.continue'),
      destructive: true,
    })
    if (go) setDialog(true)
  }

  return (
    <SettingsCard title={t('settings.account.delete.title')} tone="danger">
      <div className="space-y-4">
        <p className="text-ui-body text-ink-muted">{t('settings.account.delete.note')}</p>
        <Button variant="danger" onClick={() => void start()}>
          {t('settings.account.delete.title')}
        </Button>
      </div>
      <ActionCodeDialog
        open={dialog}
        purpose="request_closure"
        title={t('settings.account.delete.dialogTitle')}
        description={t('settings.account.delete.dialogBody')}
        confirmLabel={t('settings.account.delete.title')}
        destructive
        onClose={() => setDialog(false)}
        onConfirm={async (code) => {
          const r = await account.requestClosure(code)
          if (!r.ok) return r
          // The server has ended the sessions; logout() ends this one (global, with a local fallback). The account is
          // gone either way, so the person leaves for the sign-in page even when only this device was signed out.
          const out = await logout()
          toast.info(t('settings.account.delete.done'), out.signedOut && !out.error ? t('settings.account.delete.signedOut') : t('settings.account.delete.signedOutHere'))
          // The route guard may get there first (with ?next= back to settings); either way the person lands on sign-in.
          navigate(SIGN_IN_PATH, { replace: true })
          return r
        }}
      />
    </SettingsCard>
  )
}

function FormAlert({ children }: { children: ReactNode }) {
  return (
    <InlineNotice tone="warning">
      <span role="alert">{children}</span>
    </InlineNotice>
  )
}

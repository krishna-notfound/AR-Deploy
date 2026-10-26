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
import { formatDate } from '@/lib/format'
import { PASSWORD_MAX, PASSWORD_MIN, type SecurityState, account, auth, isDemoMode } from '@/services'
import { EMAIL_PATTERN } from '@/services/accountService'
import { type QueryResult, useServiceQuery } from '@/services/hooks'
import { ActionCodeDialog } from '../ActionCodeDialog'
import { useCancelClosure } from '../useCancelClosure'
import { OWNER_CLOSURE_LINE } from '@/features/businesses/closure'
import { SectionHeader, SettingsCard } from '../SettingsUi'

type Security = QueryResult<SecurityState>

export default function AccountSection() {
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
      <SectionHeader title="My account" description="Your sign-in email, password and account closure." />
      <div className="space-y-6">
        {isDemoMode && (
          <InlineNotice tone="neutral">Demo: no email is sent, and changes here last until you reload this tab.</InlineNotice>
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
  const pendingEmail = security.data?.pendingEmail ?? null
  return (
    <SettingsCard title="Email" description="The address you sign in with. We send security notices here.">
      <div className="space-y-5">
        <div>
          <p className="text-ui-small text-ink-muted">Sign-in email</p>
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
            We couldn't check for a pending email change. {security.error.message}
          </p>
        )}
      </div>
    </SettingsCard>
  )
}

function EmailForm({ currentEmail, onRequested }: { currentEmail: string; onRequested: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next = email.trim()
    const found: typeof errors = {}
    if (!EMAIL_PATTERN.test(next)) found.email = 'Enter a valid email address.'
    else if (next.toLowerCase() === currentEmail.toLowerCase()) found.email = 'This is already your sign-in email.'
    if (!password) found.password = 'Enter your current password.'
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
    if (reason === 'password_incorrect') setErrors({ password: 'Password is incorrect.' })
    else if (reason === 'email_taken' || reason === 'invalid_email') setErrors({ email: r.error.message })
    else setErrors({ form: r.error.message })
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
      <p className="text-ui-small text-ink-muted">We send a confirmation link to the new address. Your sign-in email changes once you open it.</p>
      <FormField label="New email" error={errors.email}>
        <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>
      <FormField label="Current password" error={errors.password}>
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </FormField>
      {errors.form && <FormAlert>{errors.form}</FormAlert>}
      <Button type="submit" variant="primary" loading={pending}>
        Change email
      </Button>
    </form>
  )
}

function PendingEmail({ currentEmail, pendingEmail, onChanged }: { currentEmail: string; pendingEmail: string; onChanged: () => void }) {
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
      toast.error("Couldn't cancel the email change", r.error.message)
      return
    }
    toast.success('Email change cancelled', `You keep signing in with ${currentEmail}.`)
    onChanged()
  }

  const resend = async (e: FormEvent) => {
    e.preventDefault()
    if (!password) {
      setError('Enter your current password.')
      return
    }
    setBusy('resend')
    const r = await account.requestEmailChange(password, pendingEmail)
    setBusy(null)
    if (!r.ok) {
      setError(r.error.reason === 'password_incorrect' ? 'Password is incorrect.' : r.error.message)
      return
    }
    setPassword('')
    setError(null)
    setResending(false)
    toast.success('Link sent again', `Check ${pendingEmail} for the new confirmation link.`)
    onChanged()
  }

  return (
    <div role="status" className="space-y-3 rounded-[var(--radius-control)] bg-info-soft px-4 py-3.5 text-ui-body text-ink">
      <p>
        Confirm your new email: we sent a link to <strong className="font-medium break-words">{pendingEmail}</strong>. Until you open it you sign in
        with <span className="break-words">{currentEmail}</span>.
      </p>
      {resending ? (
        <form onSubmit={(e) => void resend(e)} noValidate className="space-y-3">
          <FormField label="Current password" error={error ?? undefined} hint="Needed to send the link again.">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="primary" loading={busy === 'resend'}>
              Send link again
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResending(false)} disabled={busy !== null}>
              Back
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setResending(true)} disabled={busy !== null}>
            Resend
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void cancel()} loading={busy === 'cancel'}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}

/* ---------- Password ---------- */

/** Length is the only rule (spec 8: a strength hint, no composition rules). */
function lengthHint(n: number): string {
  if (n === 0) return `Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters. A longer passphrase is stronger.`
  if (n < PASSWORD_MIN) {
    const left = PASSWORD_MIN - n
    return `Too short: ${left} more ${left === 1 ? 'character' : 'characters'} needed.`
  }
  if (n > PASSWORD_MAX) return `Too long: use at most ${PASSWORD_MAX} characters.`
  if (n < 16) return 'Long enough. Longer is stronger.'
  return 'Strong length.'
}

function PasswordCard() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmNext, setConfirmNext] = useState('')
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string; form?: string }>({})
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const found: typeof errors = {}
    if (!current) found.current = 'Enter your current password.'
    if (next.length < PASSWORD_MIN) found.next = `Use at least ${PASSWORD_MIN} characters.`
    else if (next.length > PASSWORD_MAX) found.next = `Use at most ${PASSWORD_MAX} characters.`
    else if (confirmNext !== next) found.confirm = "The passwords don't match."
    setErrors(found)
    if (Object.keys(found).length) return
    setPending(true)
    const r = await account.changePassword(current, next)
    setPending(false)
    if (r.ok) {
      setCurrent('')
      setNext('')
      setConfirmNext('')
      toast.success('Password changed. Other devices were signed out.')
      return
    }
    const reason = r.error.reason
    if (reason === 'current_password_mismatch') setErrors({ current: r.error.message })
    else if (reason === 'same_password' || reason === 'weak_password') setErrors({ next: r.error.message })
    else setErrors({ form: r.error.message })
  }

  return (
    <SettingsCard title="Password" description="Changing it signs you out on every other device.">
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        <FormField label="Current password" error={errors.current}>
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </FormField>
        <FormField label="New password" error={errors.next} hint={lengthHint(next.length)}>
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </FormField>
        <FormField label="Confirm new password" error={errors.confirm}>
          <Input type="password" autoComplete="new-password" value={confirmNext} onChange={(e) => setConfirmNext(e.target.value)} />
        </FormField>
        {errors.form && <FormAlert>{errors.form}</FormAlert>}
        <Button type="submit" variant="primary" loading={pending}>
          Change password
        </Button>
      </form>
    </SettingsCard>
  )
}

/* ---------- Closure ---------- */

function ClosureCard({ security }: { security: Security }) {
  const { user } = useAccount()
  const can = useCan()
  if (!user) return null
  if (user.role === 'business_admin') return <BusinessClosure security={security} />
  if (can('owner')) {
    return (
      <SettingsCard title="Delete account">
        <p className="text-ui-body text-ink-muted">
          The platform needs its Owner, so the Owner's account can't be deleted. Admins and team members can delete their own accounts.
        </p>
      </SettingsCard>
    )
  }
  return <StaffDeletion />
}

function BusinessClosure({ security }: { security: Security }) {
  const { business } = useAccount()
  const confirm = useConfirm()
  const toast = useToast()
  const [dialog, setDialog] = useState(false)
  const { cancel: cancelRequest, cancelling } = useCancelClosure(security.refetch)
  const closure = security.data?.closure ?? null

  const start = async () => {
    const go = await confirm({
      title: 'Request closure?',
      body: (
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Your catalog goes offline now.</li>
          <li>The platform completes the deletion of your business and account within 30 days.</li>
          <li>You can cancel the request until then, and your catalog comes back as it was.</li>
        </ul>
      ),
      confirmLabel: 'Continue',
      destructive: true,
    })
    if (go) setDialog(true)
  }

  let body: ReactNode
  if (security.status === 'loading' && !security.data) body = <Skeleton className="h-16 w-full" />
  else if (security.status === 'error' && !security.data) body = <ErrorState message={security.error.message} onRetry={security.refetch} className="py-6" />
  else if (closure)
    body = (
      <div className="space-y-3">
        <div role="status" className="rounded-[var(--radius-control)] bg-warning-soft px-4 py-3 text-ui-body text-warning">
          Closure requested on {formatDate(closure.requestedAt)} · {OWNER_CLOSURE_LINE[business?.status ?? 'inactive']}
        </div>
        <p className="text-ui-small text-ink-muted">
          The platform completes the deletion within 30 days. Cancel before then to keep your account; your catalog returns to its previous status.
        </p>
        <Button onClick={() => void cancelRequest()} loading={cancelling}>
          Cancel request
        </Button>
      </div>
    )
  else
    body = (
      <div className="space-y-4">
        <p className="text-ui-body text-ink-muted">
          Your catalog goes offline as soon as you ask. The platform deletes your business and your account within 30 days, and you can cancel
          until then.
        </p>
        <Button variant="danger" onClick={() => void start()}>
          Request closure
        </Button>
      </div>
    )

  return (
    <SettingsCard title="Close your account" tone="danger">
      {body}
      <ActionCodeDialog
        open={dialog}
        purpose="request_closure"
        title="Confirm closure request"
        description="Enter the code to request closure. Your catalog goes offline straight away."
        confirmLabel="Request closure"
        destructive
        onClose={() => setDialog(false)}
        onConfirm={async (code) => {
          const r = await account.requestClosure(code)
          if (r.ok) toast.success('Closure requested', 'Your catalog is offline. You can cancel until the platform completes it.')
          // An open request found by the server shows here too.
          if (r.ok || r.error.reason === 'already_requested') security.refetch()
          return r
        }}
      />
    </SettingsCard>
  )
}

function StaffDeletion() {
  const confirm = useConfirm()
  const toast = useToast()
  const navigate = useNavigate()
  const { logout } = useAccount()
  const [dialog, setDialog] = useState(false)

  const start = async () => {
    const go = await confirm({
      title: 'Delete your account?',
      body: "Your platform access ends now and you are signed out on every device. This can't be undone.",
      confirmLabel: 'Continue',
      destructive: true,
    })
    if (go) setDialog(true)
  }

  return (
    <SettingsCard title="Delete account" tone="danger">
      <div className="space-y-4">
        <p className="text-ui-body text-ink-muted">Deleting your account ends your platform access straight away and signs you out. This can't be undone.</p>
        <Button variant="danger" onClick={() => void start()}>
          Delete account
        </Button>
      </div>
      <ActionCodeDialog
        open={dialog}
        purpose="request_closure"
        title="Confirm account deletion"
        description="Enter the code to delete your account."
        confirmLabel="Delete account"
        destructive
        onClose={() => setDialog(false)}
        onConfirm={async (code) => {
          const r = await account.requestClosure(code)
          if (!r.ok) return r
          // The server has ended the sessions; logout() ends this one (global, with a local fallback). The account is
          // gone either way, so the person leaves for the sign-in page even when only this device was signed out.
          const out = await logout()
          toast.info('Your account was deleted', out.signedOut && !out.error ? 'You have been signed out.' : 'You were signed out on this device only.')
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

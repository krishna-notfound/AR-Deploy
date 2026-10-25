// /join (ADR-0030): where a platform invitation link lands. The link secret is in the URL fragment (#t=...), so it never
// reaches the server logs; the page reads it, removes it from the address bar and asks what it is for. Nothing is used up
// until the person presses Create account (or, with an existing login, Accept invitation). English only, like the console.
import { ArrowRight } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import type { InviteInspection } from '@/domain/types'
import { formatDate } from '@/lib/format'
import { auth, service } from '@/services'
import { TEAM_ERRORS } from '@/services/catalogService'
import { AuthHeading, AuthLayout } from '../auth/AuthLayout'
import { ROLE_LABEL } from '../team/permissions'

type State = { kind: 'checking' } | { kind: 'error'; message: string } | { kind: 'ready'; token: string; invite: InviteInspection }

const STATE_MESSAGE: Record<'expired' | 'revoked' | 'used' | 'invalid', string> = {
  expired: TEAM_ERRORS.invite_expired!.message,
  revoked: TEAM_ERRORS.invite_revoked!.message,
  used: TEAM_ERRORS.invite_used!.message,
  invalid: TEAM_ERRORS.invite_invalid!.message,
}

/** Reads the secret once, then drops it from the address bar (history, screenshots, shared screens). */
function takeToken(): string {
  const m = /[#&]t=([^&]+)/.exec(window.location.hash)
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search)
  return m ? decodeURIComponent(m[1]!) : ''
}

export default function JoinPage() {
  useDocumentTitle('Join Sanctus')
  const [state, setState] = useState<State>({ kind: 'checking' })
  const token = useRef<string | null>(null)

  useEffect(() => {
    token.current ??= takeToken()
    const t = token.current
    if (!t) {
      setState({ kind: 'error', message: STATE_MESSAGE.invalid })
      return
    }
    void service.inspectInvite(t).then((r) => {
      if (!r.ok) setState({ kind: 'error', message: r.error.message })
      else if (r.data.state !== 'valid') setState({ kind: 'error', message: STATE_MESSAGE[r.data.state] })
      else setState({ kind: 'ready', token: t, invite: r.data })
    })
  }, [])

  return (
    <AuthLayout photo="lounge">
      {state.kind === 'checking' ? (
        <p className="text-sm text-ink-muted" role="status">
          Checking your invitation…
        </p>
      ) : state.kind === 'error' ? (
        <div className="space-y-6">
          <AuthHeading eyebrow="Platform invitation" title="This invitation can't be used" />
          <InlineNotice tone="warning">
            <span role="alert">{state.message}</span>
          </InlineNotice>
          <p className="text-sm">
            <Link to="/login" className="font-medium text-accent-ink hover:underline">
              Go to sign in
            </Link>
          </p>
        </div>
      ) : state.invite.accountExists ? (
        <AcceptWithLogin token={state.token} invite={state.invite} />
      ) : (
        <CreateAccount token={state.token} invite={state.invite} />
      )}
    </AuthLayout>
  )
}

function Intro({ invite }: { invite: InviteInspection }) {
  return (
    <AuthHeading eyebrow="Platform invitation" title="Join Sanctus">
      You've been invited{invite.invitedBy ? ` by ${invite.invitedBy}` : ''} to the platform console as {ROLE_LABEL[invite.role ?? 'team']}. This
      invitation expires on {invite.expiresAt ? formatDate(invite.expiresAt) : 'soon'}.
    </AuthHeading>
  )
}

function CreateAccount({ token, invite }: { token: string; invite: InviteInspection }) {
  const navigate = useNavigate()
  const { signInAs } = useAccount()
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) return setError('Enter your name.')
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError("Passwords don't match.")
    setError(null)
    setPending(true)
    const r = await service.acceptInviteCreate({ token, fullName: fullName.trim(), password })
    if (!r.ok) {
      setPending(false)
      return setError(r.error.message)
    }
    if (auth) {
      const s = await auth.signInWithPassword(r.data.email, password)
      if (!s.ok) {
        setPending(false)
        return setError('Your account is ready, but signing in failed. Sign in with your new password.')
      }
    } else {
      // Demo mode: no real accounts; switch the demo session to the accepted role.
      signInAs({ role: 'super_admin', platformRole: invite.role ?? 'team' })
    }
    navigate('/admin', { replace: true })
  }

  return (
    <div className="space-y-8">
      <Intro invite={invite} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <InlineNotice tone="warning">
            <span role="alert">{error}</span>
          </InlineNotice>
        )}
        <FormField label="Email">
          <Input type="email" value={invite.email ?? ''} readOnly />
        </FormField>
        <FormField label="Full name">
          <Input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </FormField>
        <FormField label="Password" hint="At least 8 characters. Passwords found in known leaks are refused.">
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <FormField label="Confirm password">
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </FormField>
        <Button type="submit" variant="primary" className="w-full" loading={pending} icon={<ArrowRight className="size-4" aria-hidden />}>
          Create account
        </Button>
      </form>
    </div>
  )
}

function AcceptWithLogin({ token, invite }: { token: string; invite: InviteInspection }) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!auth || !invite.email) return setError(TEAM_ERRORS.invite_invalid!.message)
    setPending(true)
    const s = await auth.signInWithPassword(invite.email, password)
    if (!s.ok) {
      setPending(false)
      return setError(s.error.message)
    }
    const r = await service.acceptInviteExisting(token)
    if (!r.ok) {
      setPending(false)
      return setError(r.error.message)
    }
    navigate('/admin', { replace: true })
  }

  return (
    <div className="space-y-8">
      <Intro invite={invite} />
      <InlineNotice tone="neutral">{TEAM_ERRORS.account_exists!.message}</InlineNotice>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <InlineNotice tone="warning">
            <span role="alert">{error}</span>
          </InlineNotice>
        )}
        <FormField label="Email">
          <Input type="email" value={invite.email ?? ''} readOnly />
        </FormField>
        <FormField label="Password">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <Button type="submit" variant="primary" className="w-full" loading={pending} disabled={!password} icon={<ArrowRight className="size-4" aria-hidden />}>
          Sign in and accept
        </Button>
      </form>
    </div>
  )
}

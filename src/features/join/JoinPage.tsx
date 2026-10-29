// /join (ADR-0030): where a platform invitation link lands. The link secret is in the URL fragment (#t=...), so it never
// reaches the server logs; the page reads it, removes it from the address bar and asks what it is for. Nothing is used up
// until the person presses Create account (or, with an existing login, Accept invitation).
import { ArrowRight } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import type { InviteInspection } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { PASSWORD_MIN, auth, service } from '@/services'
import { type ServiceError, TEAM_ERRORS } from '@/services/catalogService'
import { AuthHeading, AuthLayout } from '../auth/AuthLayout'
import { authErrorText } from '../auth/authErrors'

type State = { kind: 'checking' } | { kind: 'error'; error: ServiceError } | { kind: 'ready'; token: string; invite: InviteInspection }

/** The failure behind each state that is not 'valid'; shown through errorText (common.error.reason.invite_*). */
const teamError = (reason: string): ServiceError => ({ ...TEAM_ERRORS[reason]!, reason })
const STATE_ERROR: Record<'expired' | 'revoked' | 'used' | 'invalid', ServiceError> = {
  expired: teamError('invite_expired'),
  revoked: teamError('invite_revoked'),
  used: teamError('invite_used'),
  invalid: teamError('invite_invalid'),
}

/** Reads the secret once, then drops it from the address bar (history, screenshots, shared screens). */
function takeToken(): string {
  const m = /[#&]t=([^&]+)/.exec(window.location.hash)
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search)
  return m ? decodeURIComponent(m[1]!) : ''
}

export default function JoinPage() {
  const { t } = useI18n()
  useDocumentTitle(t('join.title'))
  const [state, setState] = useState<State>({ kind: 'checking' })
  const token = useRef<string | null>(null)

  useEffect(() => {
    token.current ??= takeToken()
    const t = token.current
    if (!t) {
      setState({ kind: 'error', error: STATE_ERROR.invalid })
      return
    }
    void service.inspectInvite(t).then((r) => {
      if (!r.ok) setState({ kind: 'error', error: r.error })
      else if (r.data.state !== 'valid') setState({ kind: 'error', error: STATE_ERROR[r.data.state] })
      else setState({ kind: 'ready', token: t, invite: r.data })
    })
  }, [])

  return (
    <AuthLayout photo="lounge">
      {state.kind === 'checking' ? (
        <p className="text-sm text-ink-muted" role="status">
          {t('join.checking')}
        </p>
      ) : state.kind === 'error' ? (
        <div className="space-y-6">
          <AuthHeading eyebrow={t('join.eyebrow')} title={t('join.unusable')} />
          <InlineNotice tone="warning">
            <span role="alert">{errorText(state.error, t)}</span>
          </InlineNotice>
          <p className="text-sm">
            <Link to="/login" className="font-medium text-accent-ink hover:underline">
              {t('invite.signIn')}
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
  const { t } = useI18n()
  const f = useFormat()
  const role = t(invite.role === 'admin' ? 'join.role.admin' : 'join.role.team')
  const expires = invite.expiresAt ? f.date(invite.expiresAt) : t('join.expiresSoon')
  return (
    <AuthHeading eyebrow={t('join.eyebrow')} title={t('join.title')}>
      {invite.invitedBy ? t('join.introBy', { by: invite.invitedBy, role }) : t('join.intro', { role })} {t('join.expires', { date: expires })}
    </AuthHeading>
  )
}

/** Supabase Auth (bcrypt) hashes only the first 72 bytes of a password, so a longer one is refused here (R-W1-7). */
const STAFF_PASSWORD_MAX = 72

function CreateAccount({ token, invite }: { token: string; invite: InviteInspection }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { signInAs } = useAccount()
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) return setError(t('join.nameRequired'))
    if (password.length < PASSWORD_MIN) return setError(t('reset.passwordShort', { n: PASSWORD_MIN }))
    if (password.length > STAFF_PASSWORD_MAX) return setError(t('join.passwordLong', { n: STAFF_PASSWORD_MAX }))
    if (password !== confirm) return setError(t('join.passwordMismatch'))
    setError(null)
    setPending(true)
    const r = await service.acceptInviteCreate({ token, fullName: fullName.trim(), password })
    if (!r.ok) {
      setPending(false)
      return setError(errorText(r.error, t))
    }
    if (auth) {
      const s = await auth.signInWithPassword(r.data.email, password)
      if (!s.ok) {
        setPending(false)
        return setError(t('join.signInFailed'))
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
        <FormField label={t('common.email')}>
          <Input type="email" value={invite.email ?? ''} readOnly />
        </FormField>
        <FormField label={t('join.fullName')}>
          <Input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </FormField>
        <FormField label={t('auth.login.password')} hint={t('join.passwordHint', { n: PASSWORD_MIN })}>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <FormField label={t('join.confirmPassword')}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </FormField>
        <Button type="submit" variant="primary" className="w-full" loading={pending} icon={<ArrowRight className="size-4" aria-hidden />}>
          {t('join.create')}
        </Button>
      </form>
    </div>
  )
}

function AcceptWithLogin({ token, invite }: { token: string; invite: InviteInspection }) {
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!auth || !invite.email) return setError(errorText(teamError('invite_invalid'), t))
    setPending(true)
    const s = await auth.signInWithPassword(invite.email, password)
    if (!s.ok) {
      setPending(false)
      return setError(authErrorText(t, s.error))
    }
    const r = await service.acceptInviteExisting(token)
    if (!r.ok) {
      setPending(false)
      return setError(errorText(r.error, t))
    }
    // The account was loaded at sign-in, before the membership existed: a full load picks up the new role.
    window.location.assign('/admin')
  }

  return (
    <div className="space-y-8">
      <Intro invite={invite} />
      <InlineNotice tone="neutral">{errorText(teamError('account_exists'), t)}</InlineNotice>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <InlineNotice tone="warning">
            <span role="alert">{error}</span>
          </InlineNotice>
        )}
        <FormField label={t('common.email')}>
          <Input type="email" value={invite.email ?? ''} readOnly />
        </FormField>
        <FormField label={t('auth.login.password')}>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <Button type="submit" variant="primary" className="w-full" loading={pending} disabled={!password} icon={<ArrowRight className="size-4" aria-hidden />}>
          {t('join.signInAccept')}
        </Button>
      </form>
    </div>
  )
}

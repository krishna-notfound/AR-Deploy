// After-sign-in checks that stand between a signed-in user and the dashboards (spec §8, Sign-in). UX only, NOT a
// security boundary: with the 2FA policy on, RLS refuses an aal1 session's data requests; this gate explains why and
// offers the way through instead of empty tables. Task 12 adds the onboarding checklist as a later check.
import { ShieldCheck } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { DashboardContext, type DashboardContextValue } from '@/components/layout/dashboardContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { SecurityState, User } from '@/domain/types'
import { RECOVERED_NOTICE, TwoFactorStep } from '@/features/auth/TwoFactorStep'
import { TotpSetup } from '@/features/settings/TotpSetup'
import { settingsPath } from '@/lib/urls'
import { useAccount, useSecurityState } from './AccountProvider'
import { useLeaveAccount } from './RequireRole'

/** Signed in with the password only, but the account has an authenticator: the code step comes first. */
export const needsCodeStep = (s: SecurityState) => s.hasVerifiedFactor && s.aal === 'aal1'
/** The policy requires 2FA and the account has none yet. */
export const needsTwoFactorSetup = (s: SecurityState) => s.requires2fa && s.aal === 'aal1' && !s.hasVerifiedFactor

export interface GateContext {
  state: SecurityState
  user: User
  scope: 'admin' | 'business'
  refresh: () => Promise<void>
}

export interface GateScreenProps {
  ctx: GateContext
  /** Keeps this screen up while it finishes (true), even after its check stops applying; false lets go. */
  hold: (on: boolean) => void
}

export interface GateCheck {
  id: string
  applies: (ctx: GateContext) => boolean
  Screen: (props: GateScreenProps) => ReactNode
}

function GateHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <span className="mb-4 grid size-11 place-items-center rounded-full bg-subtle text-ink">
        <ShieldCheck className="size-5" aria-hidden />
      </span>
      <h1 className="font-display text-[length:var(--text-ui-h1)] leading-[1.15] font-medium tracking-[-0.01em] text-ink">{title}</h1>
      <p className="mt-1.5 text-ui-sub text-ink-muted">{children}</p>
    </div>
  )
}

/** A session at aal1 with an authenticator (for example a reload before the code was given): ask for the code. */
function CodeGate({ ctx }: GateScreenProps) {
  const leave = useLeaveAccount()
  const navigate = useNavigate()
  const toast = useToast()
  return (
    <>
      <GateHeading title="Two-step verification">Your account is protected with an authenticator app.</GateHeading>
      <Card className="p-5 sm:p-6">
        <TwoFactorStep
          onVerified={ctx.refresh}
          onRecovered={async () => {
            toast.show({ tone: 'info', title: RECOVERED_NOTICE }, 10_000)
            await ctx.refresh()
            navigate(settingsPath(ctx.scope, 'security'))
          }}
          onSignOut={() => void leave({ signOut: true })}
        />
      </Card>
    </>
  )
}

/** The policy requires 2FA: set it up (TotpSetup) or sign out. Nothing else of the app shows until it is done. */
function SetupGate({ ctx, hold }: GateScreenProps) {
  const leave = useLeaveAccount()
  return (
    <>
      <GateHeading title="Set up 2FA to continue">
        Your account must use two-step verification (2FA). Set up an authenticator app on your phone to continue.
      </GateHeading>
      <Card className="p-5 sm:p-6">
        <TotpSetup
          email={ctx.user.email}
          // The session is aal2 as soon as the code is accepted; stay until the recovery codes are saved.
          onEnabled={() => hold(true)}
          onDone={() => {
            void ctx.refresh().then(() => hold(false))
          }}
        />
      </Card>
      <div className="mt-5 flex justify-end">
        <Button onClick={() => void leave({ signOut: true })}>Sign out</Button>
      </div>
    </>
  )
}

/** The gate checks, in order: the first that applies is shown. */
export const GATE_CHECKS: readonly GateCheck[] = [
  { id: '2fa-code', applies: ({ state }) => needsCodeStep(state), Screen: CodeGate },
  { id: '2fa-setup', applies: ({ state }) => needsTwoFactorSetup(state), Screen: SetupGate },
]

function GateFrame({ scope, children }: { scope: 'admin' | 'business'; children: ReactNode }) {
  const { business } = useAccount()
  const dashboard = useMemo<DashboardContextValue>(
    () =>
      scope === 'admin'
        ? { variant: 'admin', home: 'Sanctus Admin', homeTo: '/admin', eyebrow: 'Security' }
        : { variant: 'business', home: business?.name ?? 'My business', homeTo: '/dashboard', eyebrow: 'Security' },
    [scope, business?.name],
  )
  return (
    <DashboardContext.Provider value={dashboard}>
      <main data-surface="dashboard" className="min-h-dvh bg-canvas px-4 py-10 text-ink-body sm:py-16">
        <div className="mx-auto w-full max-w-xl">{children}</div>
      </main>
    </DashboardContext.Provider>
  )
}

/**
 * Wraps the /admin and /dashboard trees and the settings routes (inside RequireRole). Shows the first gate check that
 * applies to the signed-in user instead of the app; with none, the app.
 */
export function SecurityGate({ children, checks = GATE_CHECKS }: { children: ReactNode; checks?: readonly GateCheck[] }) {
  const { user } = useAccount()
  const { state, error, refresh } = useSecurityState()
  const leave = useLeaveAccount()
  const [held, setHeld] = useState<string | null>(null)

  // Signed out or still resolving: RequireRole decides.
  if (!user) return <>{children}</>
  const scope = user.role === 'super_admin' ? 'admin' : 'business'
  if (!state) {
    if (!error) return <FullPageSpinner />
    return (
      <GateFrame scope={scope}>
        <ErrorState message={`We could not check your sign-in security. ${error}`} onRetry={() => void refresh()} />
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" onClick={() => void leave({ signOut: true })}>
            Sign out
          </Button>
        </div>
      </GateFrame>
    )
  }
  const ctx: GateContext = { state, user, scope, refresh }
  const active = (held ? checks.find((c) => c.id === held) : undefined) ?? checks.find((c) => c.applies(ctx))
  if (!active) return <>{children}</>
  const { Screen } = active
  return (
    <GateFrame scope={scope}>
      <Screen key={active.id} ctx={ctx} hold={(on) => setHeld(on ? active.id : null)} />
    </GateFrame>
  )
}

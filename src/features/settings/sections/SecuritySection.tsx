import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState, InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { SecurityState } from '@/domain/types'
import { account } from '@/services'
import type { Result } from '@/services/catalogService'
import { ActionCodeDialog } from '../ActionCodeDialog'
import { RecoveryCodes } from '../RecoveryCodes'
import { SectionHeader, SettingsCard } from '../SettingsUi'
import { TotpSetup } from '../TotpSetup'

const RECOVERY_SET = 8

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; state: SecurityState }

const toLoad = (r: Result<SecurityState>): Load => (r.ok ? { kind: 'ready', state: r.data } : { kind: 'error', message: r.error.message })

function recoveryLine(left: number | null) {
  if (left === null) return null
  if (left === 0) return <Badge tone="warning">No recovery codes left</Badge>
  return <span className="text-ui-small text-ink-muted">{`${left} of ${RECOVERY_SET} recovery codes left`}</span>
}

function TwoFactorCard({ state, onChanged }: { state: SecurityState; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const [settingUp, setSettingUp] = useState(false)
  const [dialog, setDialog] = useState<'regenerate' | 'disable' | null>(null)
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null)
  // Set once the setup's code is accepted: 2FA is on while the person is still saving the first recovery codes.
  const [justEnabled, setJustEnabled] = useState(false)
  const on = state.hasVerifiedFactor
  // Regenerate and turn off run at aal2 only: a session from before 2FA was set up would be refused by the server.
  const elevated = state.aal === 'aal2'

  const finishSetup = async () => {
    setSettingUp(false)
    setJustEnabled(false)
    toast.success('2FA is on', 'You will be asked for a code from your authenticator app when you sign in.')
    await onChanged()
  }

  const regenerate = async (code: string) => {
    const r = await account.generateRecoveryCodes(code)
    if (r.ok) {
      setDialog(null)
      setFreshCodes(r.data)
      void onChanged()
    }
    return r
  }

  const disable = async (code: string) => {
    const r = await account.disable2fa(code)
    if (r.ok) {
      setDialog(null)
      setFreshCodes(null)
      toast.success('2FA is off')
      await onChanged()
    }
    return r
  }

  return (
    <SettingsCard
      title="Two-step verification (2FA)"
      description="When you sign in, you also enter a 6-digit code from an authenticator app on your phone."
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-ui-body font-medium text-ink">Authenticator app</span>
          <Badge tone={on || justEnabled ? 'success' : 'neutral'} dot>
            {on || justEnabled ? 'On' : 'Off'}
          </Badge>
          {on && recoveryLine(state.recoveryCodesLeft)}
        </div>

        {!on && !settingUp && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-ui-small text-ink-muted">
              {state.requires2fa ? 'Your organisation requires 2FA. Set it up to keep using the dashboard.' : 'Recommended: it keeps your account safe even if your password leaks.'}
            </p>
            <Button variant="primary" onClick={() => setSettingUp(true)}>
              Turn on 2FA
            </Button>
          </div>
        )}

        {!on && settingUp && <TotpSetup onDone={() => void finishSetup()} onCancel={() => setSettingUp(false)} onEnabled={() => setJustEnabled(true)} />}

        {on && freshCodes && <RecoveryCodes codes={freshCodes} onDone={() => setFreshCodes(null)} />}

        {on && !freshCodes && !elevated && (
          <InlineNotice tone="info">
            To change 2FA or your recovery codes, sign out and sign in again with your authenticator code.
          </InlineNotice>
        )}

        {on && !freshCodes && elevated && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 flex-1 basis-60 text-ui-small text-ink-muted">
                Recovery codes let you sign in without your phone. A new set replaces the old one. We email you a code to confirm.
              </p>
              <Button onClick={() => setDialog('regenerate')}>Regenerate recovery codes</Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              {state.requires2fa ? (
                <p className="text-ui-small text-ink-muted">Your organisation requires 2FA, so it can&rsquo;t be turned off.</p>
              ) : (
                <>
                  <p className="min-w-0 flex-1 basis-60 text-ui-small text-ink-muted">Turning 2FA off removes your authenticator and recovery codes.</p>
                  <Button variant="danger" onClick={() => setDialog('disable')}>
                    Turn off 2FA
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <ActionCodeDialog
        open={dialog === 'regenerate'}
        purpose="regenerate_recovery"
        title="Regenerate recovery codes"
        description="Your current recovery codes stop working and you get a new set of 8."
        confirmLabel="Regenerate codes"
        onClose={() => setDialog(null)}
        onConfirm={regenerate}
      />
      <ActionCodeDialog
        open={dialog === 'disable'}
        purpose="disable_2fa"
        title="Turn off 2FA?"
        description="Signing in will need only your password. Your authenticator and recovery codes are removed."
        confirmLabel="Turn off 2FA"
        destructive
        onClose={() => setDialog(null)}
        onConfirm={disable}
      />
    </SettingsCard>
  )
}

function DevicesCard() {
  const confirm = useConfirm()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const signOutOthers = async () => {
    const yes = await confirm({
      title: 'Sign out other devices?',
      body: 'Every other browser and device signed in to your account is signed out. This one stays signed in.',
      confirmLabel: 'Sign out other devices',
    })
    if (!yes) return
    setBusy(true)
    const r = await account.signOutOtherDevices()
    setBusy(false)
    if (r.ok) toast.success('Other devices were signed out')
    else toast.error("Couldn't sign out other devices", r.error.message)
  }

  return (
    <SettingsCard title="Signed-in devices" description="Signed in somewhere you no longer use, or on a shared computer? Sign out everywhere else.">
      <div className="flex justify-end">
        <Button loading={busy} onClick={() => void signOutOthers()}>
          Sign out other devices
        </Button>
      </div>
    </SettingsCard>
  )
}

export default function SecuritySection() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })

  const refresh = useCallback(async () => {
    setLoad(toLoad(await account.getSecurityState()))
  }, [])

  useEffect(() => {
    let live = true
    account.getSecurityState().then((r) => {
      if (live) setLoad(toLoad(r))
    })
    return () => {
      live = false
    }
  }, [])

  return (
    <>
      <SectionHeader title="Security & 2FA" description="Two-step verification, recovery codes and signed-in devices." />
      <div className="space-y-6">
        {load.kind === 'loading' && (
          <div role="status" aria-label="Loading security settings" className="space-y-3 rounded-[var(--radius-card)] bg-surface p-6">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-9 w-36" />
          </div>
        )}
        {load.kind === 'error' && (
          <ErrorState
            message={load.message}
            onRetry={() => {
              setLoad({ kind: 'loading' })
              void refresh()
            }}
          />
        )}
        {load.kind === 'ready' && <TwoFactorCard state={load.state} onChanged={refresh} />}
        {load.kind !== 'loading' && <DevicesCard />}
      </div>
    </>
  )
}

// UX-only routing guard for the demo. NOT a security boundary.
// Production access control must be enforced by the backend.
import { ShieldAlert } from 'lucide-react'
import { type ReactNode, useCallback } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import type { Role } from '@/domain/types'
import { Button, ButtonLink } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { isDemoMode } from '@/services'
import { useAccount } from './AccountProvider'

/** Where to go to choose an account: the demo picker, or the real sign-in page in Supabase mode. */
export const SIGN_IN_PATH = isDemoMode ? '/demo' : '/login'

const ROLE_LABEL: Record<Role, string> = { super_admin: 'Super Admin', business_admin: 'Business Admin' }

/**
 * Opens the sign-in page, after ending the session when `signOut` is set (awaited: the sign-in page sends a
 * signed-in user straight back). A failed sign-out shows a toast; the user stays put while still signed in.
 */
export function useLeaveAccount() {
  const { logout } = useAccount()
  const navigate = useNavigate()
  const toast = useToast()
  return useCallback(
    async ({ signOut, next }: { signOut: boolean; next?: string }) => {
      if (signOut) {
        const r = await logout()
        if (r.error) toast.error(r.signedOut ? 'Signed out on this device only' : 'Could not sign out', r.error)
        if (!r.signedOut) return
      }
      navigate(next ? `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}` : SIGN_IN_PATH)
    },
    [logout, navigate, toast],
  )
}

export function RequireRole({ allow: role, children }: { allow: Role; children: ReactNode }) {
  const { user, accountError, retry } = useAccount()
  const location = useLocation()
  const leave = useLeaveAccount()
  if (user === undefined) {
    if (!accountError) return <FullPageSpinner />
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas p-6">
        <ErrorState message={`We could not load your account. ${accountError}`} onRetry={retry} />
      </main>
    )
  }
  if (user === null) return <Navigate to={`${SIGN_IN_PATH}?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (user.role !== role) {
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas p-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-warning-soft text-warning">
            <ShieldAlert className="size-5" aria-hidden />
          </span>
          <h1 className="text-lg font-semibold">This area is for {ROLE_LABEL[role]} accounts</h1>
          <p className="mt-1 text-sm text-ink-muted">
            You are signed in as {ROLE_LABEL[user.role]}. {isDemoMode ? 'Switch account to continue.' : 'Sign in with another account to continue.'}
          </p>
          {isDemoMode ? (
            <ButtonLink to={`${SIGN_IN_PATH}?next=${encodeURIComponent(location.pathname)}`} variant="primary" className="mt-5">
              Switch account
            </ButtonLink>
          ) : (
            // The sign-in page sends a signed-in user straight back, so the session ends first.
            <Button variant="primary" className="mt-5" onClick={() => void leave({ signOut: true, next: location.pathname })}>
              Switch account
            </Button>
          )}
        </div>
      </main>
    )
  }
  return <>{children}</>
}

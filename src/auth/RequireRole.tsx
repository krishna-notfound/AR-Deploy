// UX-only routing guard for the demo. NOT a security boundary.
// Production access control must be enforced by the backend.
import { ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import type { Role } from '@/domain/types'
import { ButtonLink } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { isDemoMode } from '@/services'
import { useAccount } from './AccountProvider'

/** Where to go to choose an account: the demo picker, or the real sign-in page in Supabase mode. */
export const SIGN_IN_PATH = isDemoMode ? '/demo' : '/login'

const ROLE_LABEL: Record<Role, string> = { super_admin: 'Super Admin', business_admin: 'Business Admin' }

export function RequireRole({ allow: role, children }: { allow: Role; children: ReactNode }) {
  const { user } = useAccount()
  const location = useLocation()
  if (user === undefined) return <FullPageSpinner />
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
          <ButtonLink to={`${SIGN_IN_PATH}?next=${encodeURIComponent(location.pathname)}`} variant="primary" className="mt-5">
            Switch account
          </ButtonLink>
        </div>
      </main>
    )
  }
  return <>{children}</>
}

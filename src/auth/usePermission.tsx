// What the signed-in platform user may do (ADR-0029), for showing and hiding places and actions.
// UX only: the database refuses anything outside the role's permissions whatever the page shows.
import { ShieldAlert } from 'lucide-react'
import { type ReactNode, useCallback } from 'react'
import type { Permission } from '@/domain/types'
import { useOptionalAccount } from './AccountProvider'

export type Need = Permission | 'owner'

/** can('products.publish'), can('owner'). Business owners have no platform permissions. */
export function useCan(): (need: Need | Need[]) => boolean {
  const account = useOptionalAccount()
  const user = account?.user
  return useCallback(
    (need: Need | Need[]) => {
      // Outside the app shell (standalone component tests) there is no account: show everything; the database decides.
      if (!account) return true
      if (!user || user.role !== 'super_admin') return false
      // A platform session without access details is the original single super admin (the Owner).
      const access = user.platform ?? { role: 'owner' as const, permissions: [] }
      const one = (n: Need) => access.role === 'owner' || (n !== 'owner' && access.permissions.includes(n))
      return Array.isArray(need) ? need.some(one) : one(need)
    },
    [account, user],
  )
}

/** Wraps an admin page: with no matching permission, a plain explanation instead of the page. Any of `need` is enough. */
export function RequirePermission({ need, children }: { need: Need | Need[]; children: ReactNode }) {
  const can = useCan()
  if (can(need)) return <>{children}</>
  return (
    <div className="grid min-h-[50vh] place-items-center px-6 py-16">
      <div className="max-w-sm text-center">
        <ShieldAlert className="mx-auto mb-4 size-6 text-ink-muted" aria-hidden strokeWidth={1.5} />
        <h1 className="font-display text-title font-normal">You don't have access to this page</h1>
        <p className="mt-2 text-sm text-ink-muted">Ask the platform owner if you need it.</p>
      </div>
    </div>
  )
}

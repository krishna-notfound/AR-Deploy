import { createContext, useContext } from 'react'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'

export interface DashboardContextValue {
  variant: 'admin' | 'business'
  /** First breadcrumb in the top bar ("Sanctus Admin" or the business name). */
  home: string
  homeTo: string
  /** Default eyebrow above a page title when the page passes none. */
  eyebrow: string
}

export const DashboardContext = createContext<DashboardContextValue | null>(null)

export const useDashboard = () => useContext(DashboardContext)

/** True under the dashboard shell (React context passes through portals, so dialogs and menus count too). */
export const useInDashboard = () => useContext(DashboardContext) !== null

/**
 * Applications waiting for a decision (submitted or under review), counted by the service. Platform admins only:
 * pass `enabled: false` elsewhere so an owner's session never asks for applications.
 */
export function usePendingApplications(enabled = true) {
  return useServiceQuery(async () => {
    if (!enabled) return { ok: true as const, data: null }
    const [submitted, reviewing] = await Promise.all([
      service.getApplications({ status: 'submitted', pageSize: 1 }),
      service.getApplications({ status: 'under_review', pageSize: 1 }),
    ])
    if (!submitted.ok) return submitted
    if (!reviewing.ok) return reviewing
    return { ok: true as const, data: { submitted: submitted.data.total, underReview: reviewing.data.total, total: submitted.data.total + reviewing.data.total } }
  }, [enabled])
}

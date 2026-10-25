// The 2FA gate's non-blocking notice (the security check could not answer), shown inline at the top of the
// dashboards' main column. SecurityGate provides it; DashboardShell and SettingsLayout render the slot.
import { type ReactNode, createContext, useContext } from 'react'

export const SecurityNoticeContext = createContext<ReactNode>(null)

/** Renders the gate's notice, if any, at the top of a main column. */
export function SecurityNoticeSlot() {
  const notice = useContext(SecurityNoticeContext)
  return notice ? <div className="mb-5">{notice}</div> : null
}

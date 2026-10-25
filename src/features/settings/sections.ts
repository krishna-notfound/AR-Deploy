// The settings hub's sections (spec 4 and 5): one registry drives the section list, the routes and the redirects.
// Visibility is UX only: the database refuses what a role may not change, whatever the hub shows.
import { type ComponentType, type LazyExoticComponent, createContext, lazy, useContext } from 'react'
import { useOptionalAccount } from '@/auth/AccountProvider'
import type { Need } from '@/auth/usePermission'

// Shared contract (constraints.md). Task 4 adds the same type to src/domain/types.ts; at merge this becomes a re-export.
export type SettingsSection = 'account' | 'profile' | 'security' | 'notifications' | 'preferences' | 'activity' | 'business' | 'platform' | 'security-policy'

/** Which dashboard the hub belongs to: the platform admin (/admin) or a business owner's (/dashboard). */
export type SettingsScope = 'admin' | 'business'

export type SettingsGroup = 'Your account' | 'Your business' | 'Platform'

export interface SectionContext {
  scope: SettingsScope
  can: (need: Need | Need[]) => boolean
}

export interface SettingsSectionDef {
  id: SettingsSection
  label: string
  group: SettingsGroup
  visible: (ctx: SectionContext) => boolean
  element: LazyExoticComponent<ComponentType>
}

const everyone = () => true
const businessOnly = ({ scope }: SectionContext) => scope === 'business'
const ownerOnly = ({ scope, can }: SectionContext) => scope === 'admin' && can('owner')

export const SECTIONS: SettingsSectionDef[] = [
  { id: 'account', label: 'My account', group: 'Your account', visible: everyone, element: lazy(() => import('./sections/AccountSection')) },
  { id: 'profile', label: 'Profile', group: 'Your account', visible: everyone, element: lazy(() => import('./sections/ProfileSection')) },
  { id: 'security', label: 'Security & 2FA', group: 'Your account', visible: everyone, element: lazy(() => import('./sections/SecuritySection')) },
  { id: 'notifications', label: 'Notifications', group: 'Your account', visible: everyone, element: lazy(() => import('./sections/NotificationsSection')) },
  { id: 'preferences', label: 'Preferences', group: 'Your account', visible: everyone, element: lazy(() => import('./sections/PreferencesSection')) },
  { id: 'activity', label: 'Security activity', group: 'Your account', visible: everyone, element: lazy(() => import('./sections/ActivitySection')) },
  { id: 'business', label: 'Business profile', group: 'Your business', visible: businessOnly, element: lazy(() => import('./sections/BusinessSection')) },
  { id: 'platform', label: 'General', group: 'Platform', visible: ownerOnly, element: lazy(() => import('./sections/PlatformSection')) },
  { id: 'security-policy', label: 'Security policy', group: 'Platform', visible: ownerOnly, element: lazy(() => import('./sections/SecurityPolicySection')) },
]

export const SETTINGS_GROUPS: SettingsGroup[] = ['Your account', 'Your business', 'Platform']

/** The sections this person may open, in list order. */
export function visibleSections(ctx: SectionContext): SettingsSectionDef[] {
  return SECTIONS.filter((s) => s.visible(ctx))
}

/** Router state that tells the hub where its close button and Esc go back to. */
export interface SettingsReturnState {
  from: string
}

/** Pass as a link's `state` when opening settings, so closing returns to `here` (path plus query). */
export const settingsReturnState = (here: string): SettingsReturnState => ({ from: here })

/** The page that opened settings, if the router state names a dashboard page outside the hub. */
export function readReturnState(state: unknown): string | null {
  const from = (state as Partial<SettingsReturnState> | null)?.from
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return null
  return /^\/(admin|dashboard)\/settings(\/|$|\?)/.test(from) ? null : from
}

export const SettingsScopeContext = createContext<SettingsScope | null>(null)

/** The hub's dashboard: set by the settings layout; outside it, the signed-in role decides. */
export function useSettingsScope(): SettingsScope {
  const scope = useContext(SettingsScopeContext)
  const account = useOptionalAccount()
  if (scope) return scope
  return account?.user?.role === 'super_admin' ? 'admin' : 'business'
}

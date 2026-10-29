// The settings hub's sections (spec 4 and 5): one registry drives the section list, the routes and the redirects.
// Visibility is UX only: the database refuses what a role may not change, whatever the hub shows.
import { type ComponentType, type LazyExoticComponent, createContext, lazy, useContext } from 'react'
import { useOptionalAccount } from '@/auth/AccountProvider'
import type { Need } from '@/auth/usePermission'
import type { SettingsSection } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { isDemoMode } from '@/services'

export type { SettingsSection } from '@/domain/types'

/** Which dashboard the hub belongs to: the platform admin (/admin) or a business owner's (/dashboard). */
export type SettingsScope = 'admin' | 'business'

export type SettingsGroup = 'account' | 'business' | 'platform'

export const GROUP_LABEL_KEY: Record<SettingsGroup, TranslationKey> = {
  account: 'settings.group.account',
  business: 'settings.group.business',
  platform: 'settings.group.platform',
}

export interface SectionContext {
  scope: SettingsScope
  can: (need: Need | Need[]) => boolean
}

export interface SettingsSectionDef {
  id: SettingsSection
  labelKey: TranslationKey
  group: SettingsGroup
  visible: (ctx: SectionContext) => boolean
  element: LazyExoticComponent<ComponentType>
}

const everyone = () => true
const businessOnly = ({ scope }: SectionContext) => scope === 'business'
const ownerOnly = ({ scope, can }: SectionContext) => scope === 'admin' && can('owner')

export const SECTIONS: SettingsSectionDef[] = [
  { id: 'account', labelKey: 'settings.section.account', group: 'account', visible: everyone, element: lazy(() => import('./sections/AccountSection')) },
  { id: 'profile', labelKey: 'settings.section.profile', group: 'account', visible: everyone, element: lazy(() => import('./sections/ProfileSection')) },
  { id: 'security', labelKey: 'settings.section.security', group: 'account', visible: everyone, element: lazy(() => import('./sections/SecuritySection')) },
  { id: 'notifications', labelKey: 'settings.section.notifications', group: 'account', visible: everyone, element: lazy(() => import('./sections/NotificationsSection')) },
  { id: 'preferences', labelKey: 'settings.section.preferences', group: 'account', visible: everyone, element: lazy(() => import('./sections/PreferencesSection')) },
  { id: 'activity', labelKey: 'settings.section.activity', group: 'account', visible: everyone, element: lazy(() => import('./sections/ActivitySection')) },
  { id: 'business', labelKey: 'settings.section.business', group: 'business', visible: businessOnly, element: lazy(() => import('./sections/BusinessSection')) },
  // Demo data tools and sample credits only: the live site has no General section (owner 2026-10-26).
  { id: 'platform', labelKey: 'settings.section.platform', group: 'platform', visible: (c) => isDemoMode && ownerOnly(c), element: lazy(() => import('./sections/PlatformSection')) },
  { id: 'security-policy', labelKey: 'settings.section.securityPolicy', group: 'platform', visible: ownerOnly, element: lazy(() => import('./sections/SecurityPolicySection')) },
]

export const SETTINGS_GROUPS: SettingsGroup[] = ['account', 'business', 'platform']

/** The sections this person may open, in list order. */
export function visibleSections(ctx: SectionContext): SettingsSectionDef[] {
  return SECTIONS.filter((s) => s.visible(ctx))
}

export const SettingsScopeContext = createContext<SettingsScope | null>(null)

/** The hub's dashboard: set by the settings layout; outside it, the signed-in role decides. */
export function useSettingsScope(): SettingsScope {
  const scope = useContext(SettingsScopeContext)
  const account = useOptionalAccount()
  if (scope) return scope
  return account?.user?.role === 'super_admin' ? 'admin' : 'business'
}

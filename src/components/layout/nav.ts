import {
  BarChart3,
  Box,
  Building2,
  ClipboardList,
  FilePenLine,
  History,
  LayoutDashboard,
  type LucideIcon,
  Package,
  QrCode,
  Settings,
  Store,
  Users,
} from 'lucide-react'
import type { Need } from '@/auth/usePermission'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { settingsPath } from '@/lib/urls'

export interface NavItem {
  to: string
  /** Dictionary key of the item's name (common area file), rendered with t(). */
  labelKey: TranslationKey
  icon: LucideIcon
  /** Match only the exact path (for index routes). */
  end?: boolean
  /** A live count shown next to the label (real data only). */
  badge?: 'pendingApplications' | 'requestedModelRequests'
  /** Platform permission(s) needed to see this place; any one is enough (ADR-0029). Omitted: everyone. */
  requires?: Need | Need[]
  /** Opens a full-screen view (the settings hub) whose close button returns to the page it was opened from. */
  returnsHere?: boolean
}

export const adminNav: NavItem[] = [
  { to: '/admin', labelKey: 'nav.overview', icon: LayoutDashboard, end: true },
  { to: '/admin/applications', labelKey: 'nav.applications', icon: ClipboardList, badge: 'pendingApplications', requires: 'applications.view' },
  { to: '/admin/businesses', labelKey: 'nav.businesses', icon: Building2, requires: 'businesses.view' },
  { to: '/admin/products', labelKey: 'nav.allProducts', icon: Package, requires: 'products.view' },
  { to: '/admin/model-requests', labelKey: 'nav.modelRequests', icon: Box, badge: 'requestedModelRequests', requires: 'models.manage' },
  { to: '/admin/analytics', labelKey: 'nav.analytics', icon: BarChart3, requires: 'analytics.view' },
  { to: '/admin/catalogs', labelKey: 'nav.catalogsQr', icon: QrCode, requires: 'products.view' },
  { to: '/admin/editor', labelKey: 'editor.nav', icon: FilePenLine, requires: 'content.manage' },
  { to: '/admin/team', labelKey: 'nav.team', icon: Users, requires: 'owner' },
  { to: '/admin/activity', labelKey: 'nav.auditLog', icon: History, requires: ['records.view', 'access.view'] },
  // Every platform role has account settings; the Owner-only sections are hidden inside the hub.
  { to: settingsPath('admin'), labelKey: 'nav.settings', icon: Settings, returnsHere: true },
]

export const businessNav: NavItem[] = [
  { to: '/dashboard', labelKey: 'nav.overview', icon: LayoutDashboard, end: true },
  // Not `end`: the product editor (/dashboard/products/:id/edit and /new) keeps "My Products" active (DUX-11).
  // "Add product" is an action, not a place: it is the primary button on Overview and My Products.
  { to: '/dashboard/products', labelKey: 'nav.myProducts', icon: Package },
  { to: '/dashboard/analytics', labelKey: 'nav.analytics', icon: BarChart3 },
  { to: '/dashboard/catalog', labelKey: 'nav.myCatalog', icon: Store },
  { to: settingsPath('business'), labelKey: 'nav.settings', icon: Settings, returnsHere: true },
]

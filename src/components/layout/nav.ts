import {
  BarChart3,
  Building2,
  ClipboardList,
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
import { settingsPath } from '@/lib/urls'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Match only the exact path (for index routes). */
  end?: boolean
  /** A live count shown next to the label (real data only). */
  badge?: 'pendingApplications'
  /** Platform permission(s) needed to see this place; any one is enough (ADR-0029). Omitted: everyone. */
  requires?: Need | Need[]
  /** Opens a full-screen view (the settings hub) whose close button returns to the page it was opened from. */
  returnsHere?: boolean
}

export const adminNav: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/applications', label: 'Applications', icon: ClipboardList, badge: 'pendingApplications', requires: 'applications.view' },
  { to: '/admin/businesses', label: 'Businesses', icon: Building2, requires: 'businesses.view' },
  { to: '/admin/products', label: 'All Products', icon: Package, requires: 'products.view' },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, requires: 'analytics.view' },
  { to: '/admin/catalogs', label: 'Catalogs & QR Codes', icon: QrCode, requires: 'products.view' },
  { to: '/admin/team', label: 'Team & Access', icon: Users, requires: 'owner' },
  { to: '/admin/activity', label: 'Audit log', icon: History, requires: ['records.view', 'access.view'] },
  // Every platform role has account settings; the Owner-only sections are hidden inside the hub.
  { to: settingsPath('admin'), label: 'Settings', icon: Settings, returnsHere: true },
]

export const businessNav: NavItem[] = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
  // Not `end`: the product editor (/dashboard/products/:id/edit and /new) keeps "My Products" active (DUX-11).
  // "Add product" is an action, not a place: it is the primary button on Overview and My Products.
  { to: '/dashboard/products', label: 'My Products', icon: Package },
  { to: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/dashboard/catalog', label: 'My Catalog & QR', icon: Store },
  { to: settingsPath('business'), label: 'Settings', icon: Settings, returnsHere: true },
]

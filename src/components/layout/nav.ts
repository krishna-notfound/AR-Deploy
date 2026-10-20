import {
  BarChart3,
  Building2,
  ClipboardList,
  History,
  LayoutDashboard,
  type LucideIcon,
  Package,
  PackagePlus,
  QrCode,
  Settings,
  Store,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Match only the exact path (for index routes). */
  end?: boolean
}

export const adminNav: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/applications', label: 'Applications', icon: ClipboardList },
  { to: '/admin/businesses', label: 'Businesses', icon: Building2 },
  { to: '/admin/products', label: 'All Products', icon: Package },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/catalogs', label: 'Catalogs & QR Codes', icon: QrCode },
  { to: '/admin/activity', label: 'Audit log', icon: History },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

export const businessNav: NavItem[] = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/dashboard/products', label: 'My Products', icon: Package, end: true },
  { to: '/dashboard/products/new', label: 'Add Product', icon: PackagePlus },
  { to: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/dashboard/catalog', label: 'My Catalog & QR', icon: Store },
  { to: '/dashboard/settings', label: 'Business Settings', icon: Settings },
]

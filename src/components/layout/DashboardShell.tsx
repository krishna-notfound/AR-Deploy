import { Bell, ChevronsLeft, ChevronsRight, LogOut, Menu, Repeat, X } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { useLeaveAccount } from '@/auth/RequireRole'
import { initials } from '@/auth/accounts'
import { cn } from '@/lib/cn'
import { catalogLocalPath } from '@/lib/urls'
import { formatRelative } from '@/lib/format'
import { isDemoMode, service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { IconButton } from '../ui/Button'
import { useFocusTrap } from '../ui/Modal'
import { Popover } from '../ui/Menu'
import { BrandMark, Wordmark } from '../ui/BrandMark'
import { SmartImage } from '../ui/SmartImage'
import { InlineNotice } from '../ui/States'
import { FullPageSpinner } from './FullPageSpinner'
import type { NavItem } from './nav'

const SIDEBAR_KEY = 'arfurn:sidebar'
const NOTIF_SEEN_KEY = 'arfurn:notifSeen'

export function DashboardShell({ nav, variant }: { nav: NavItem[]; variant: 'admin' | 'business' }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1')
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setMobileOpen(false), [location.pathname])
  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  return (
    <div className="min-h-dvh bg-canvas" style={{ '--sidebar-w': collapsed ? '68px' : '240px' } as React.CSSProperties}>
      <a href="#main" className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface transition-[width] duration-150 lg:flex',
          collapsed ? 'w-[68px]' : 'w-60',
        )}
      >
        <SidebarContent nav={nav} variant={variant} collapsed={collapsed} />
        <div className="border-t border-line p-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className="flex h-9 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-[13px] text-ink-muted hover:bg-subtle hover:text-ink"
          >
            {collapsed ? <ChevronsRight className="size-4 shrink-0" aria-hidden /> : <ChevronsLeft className="size-4 shrink-0" aria-hidden />}
            {!collapsed && 'Collapse'}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && <MobileDrawer nav={nav} variant={variant} onClose={() => setMobileOpen(false)} />}

      <div className={cn('transition-[padding] duration-150', collapsed ? 'lg:pl-[68px]' : 'lg:pl-60')}>
        <Topbar onMenu={() => setMobileOpen(true)} variant={variant} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1320px] px-4 pt-5 pb-16 outline-none sm:px-6 lg:px-8">
          {variant === 'business' && <CatalogStatusNotice />}
          <Suspense fallback={<FullPageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

/**
 * Every owner page says when customers cannot see the catalogue (DUX-01). Approved applications become draft
 * businesses that stay private until a platform admin activates them (ADR-0024); a platform admin can also pause
 * (inactivate) an active catalogue.
 */
export function CatalogStatusNotice() {
  const { business } = useAccount()
  if (!business || business.status === 'active') return null
  const preview = (
    <a href={catalogLocalPath(business, { preview: true })} target="_blank" rel="noopener" className="font-medium underline underline-offset-2">
      Preview your catalog
    </a>
  )
  return (
    <InlineNotice tone="warning" className="mb-5">
      {business.status === 'draft' ? (
        <>
          <strong className="font-medium">{business.name} is not public yet.</strong> You can add products now. Customers will see your
          catalog once the platform team activates it. {preview}
        </>
      ) : (
        <>
          <strong className="font-medium">Your catalog is paused.</strong> Customers who scan your QR code or open your links see “catalog
          unavailable”. Contact the platform team to reactivate it. {preview}
        </>
      )}
    </InlineNotice>
  )
}

function Brand({ collapsed, variant }: { collapsed?: boolean; variant: 'admin' | 'business' }) {
  const { business } = useAccount()
  if (variant === 'business' && business) {
    return (
      <Link to="/dashboard" aria-label={collapsed ? `${business.name}, business dashboard` : undefined} className="flex min-w-0 items-center gap-2.5">
        <SmartImage src={business.logoUrl} alt="" className="size-8 shrink-0 rounded-lg object-contain" />
        {!collapsed && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{business.name}</span>
            <span className="block text-[11px] text-ink-muted">Business dashboard</span>
          </span>
        )}
      </Link>
    )
  }
  return (
    <Link to="/admin" aria-label={collapsed ? 'Sanctus platform admin' : undefined} className="flex items-center gap-2.5">
      {collapsed ? <BrandMark className="text-ink" /> : <Wordmark sub="Platform admin" className="text-ink" />}
    </Link>
  )
}

function SidebarContent({ nav, variant, collapsed, onNavigate }: { nav: NavItem[]; variant: 'admin' | 'business'; collapsed?: boolean; onNavigate?: () => void }) {
  const leave = useLeaveAccount()
  return (
    <>
      <div className={cn('flex h-16 items-center border-b border-line', collapsed ? 'justify-center px-2' : 'px-4')}>
        <Brand collapsed={collapsed} variant={variant} />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {nav.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-9 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm transition-colors',
                    collapsed && 'justify-center px-0',
                    isActive
                      ? 'bg-subtle font-medium text-ink before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-accent'
                      : 'text-ink-muted hover:bg-subtle hover:text-ink',
                  )
                }
              >
                <item.icon className="size-[18px] shrink-0" aria-hidden />
                <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => void leave({ signOut: true })}
              title={collapsed ? 'Log out' : undefined}
              className={cn(
                'flex h-9 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm text-ink-muted hover:bg-subtle hover:text-ink',
                collapsed && 'justify-center px-0',
              )}
            >
              <LogOut className="size-[18px] shrink-0" aria-hidden />
              <span className={cn(collapsed && 'sr-only')}>Log out</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  )
}

function MobileDrawer({ nav, variant, onClose }: { nav: NavItem[]; variant: 'admin' | 'business'; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, true, onClose)
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 animate-fade-in bg-ink/40" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Navigation" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-[var(--shadow-pop)]">
        <IconButton aria-label="Close navigation" onClick={onClose} className="absolute top-3 right-2">
          <X className="size-5" />
        </IconButton>
        <SidebarContent nav={nav} variant={variant} onNavigate={onClose} />
      </div>
    </div>
  )
}

function Topbar({ onMenu, variant }: { onMenu: () => void; variant: 'admin' | 'business' }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-canvas px-4 sm:px-6 lg:px-8">
      <IconButton aria-label="Open navigation" onClick={onMenu} className="-ml-2 lg:hidden">
        <Menu className="size-5" />
      </IconButton>
      <div className="lg:hidden">
        <Brand variant={variant} collapsed />
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {/* Honest labelling in the demo; a production owner has no use for the data source's name (DUX-08). */}
        {isDemoMode && <span className="hidden rounded-full border border-line-strong px-2.5 py-1 text-[11px] font-medium text-ink-muted sm:inline">Demo mode</span>}
        <Notifications variant={variant} />
        <ProfileMenu />
      </div>
    </header>
  )
}

function Notifications({ variant }: { variant: 'admin' | 'business' }) {
  const { business } = useAccount()
  const businessId = variant === 'business' ? business?.id : undefined
  const q = useServiceQuery(() => service.getRecentActivity({ businessId, limit: 8 }), [businessId])
  const [seen, setSeen] = useState(() => localStorage.getItem(NOTIF_SEEN_KEY) ?? '')
  const items = q.data ?? []
  const unread = items.filter((i) => i.at > seen).length
  const markSeen = () => {
    const latest = items[0]?.at ?? new Date().toISOString()
    localStorage.setItem(NOTIF_SEEN_KEY, latest)
    setSeen(latest)
  }
  return (
    <Popover
      label={unread ? `Notifications, ${unread} new` : 'Notifications'}
      triggerClassName="relative grid size-10 place-items-center rounded-[var(--radius-control)] text-ink-muted hover:bg-subtle hover:text-ink"
      trigger={
        <>
          <Bell className="size-[18px]" aria-hidden />
          {unread > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-danger ring-2 ring-canvas" aria-hidden />}
        </>
      }
      panelClassName="w-[min(22rem,calc(100vw-2rem))]"
    >
      {() => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Recent activity</p>
            {unread > 0 && (
              <button type="button" onClick={markSeen} className="text-xs font-medium text-accent-ink hover:underline">
                Mark all as read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">No activity yet.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {items.map((a) => (
                <li key={a.id} className="flex gap-3 px-4 py-2.5">
                  <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', a.at > seen ? 'bg-accent' : 'bg-transparent')} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[13px] text-ink">{a.message}</p>
                    <p className="text-xs text-ink-faint">{formatRelative(a.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Popover>
  )
}

function ProfileMenu() {
  const { user } = useAccount()
  const leave = useLeaveAccount()
  if (!user) return null
  return (
    <Popover
      label="Account menu"
      triggerClassName="grid size-9 place-items-center rounded-full bg-ink text-xs font-semibold text-white hover:opacity-90 pointer-coarse:size-11"
      trigger={initials(user.name)}
      panelClassName="w-64"
    >
      {(close) => (
        <div className="py-1.5">
          <div className="border-b border-line px-4 pt-2 pb-3">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
            <p className="mt-1.5 text-[11px] text-ink-faint">{user.role === 'super_admin' ? 'Super Admin' : 'Business Admin'}
              {isDemoMode && ' · demo account'}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              close()
              // Supabase mode: the sign-in page sends a signed-in user straight back, so end the session first.
              void leave({ signOut: !isDemoMode })
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm hover:bg-subtle"
          >
            <Repeat className="size-4 text-ink-muted" aria-hidden /> Switch account
          </button>
          <button
            type="button"
            onClick={() => {
              close()
              void leave({ signOut: true })
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm hover:bg-subtle"
          >
            <LogOut className="size-4 text-ink-muted" aria-hidden /> Log out
          </button>
        </div>
      )}
    </Popover>
  )
}

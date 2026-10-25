import { ArrowUpRight, ChevronsLeft, ChevronsRight, LogOut, Menu, Repeat, X } from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { useLeaveAccount } from '@/auth/RequireRole'
import { initials } from '@/auth/accounts'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'
import { catalogLocalPath } from '@/lib/urls'
import { isDemoMode } from '@/services'
import { IconButton } from '../ui/Button'
import { useFocusTrap } from '../ui/Modal'
import { BrandMark, Wordmark } from '../ui/BrandMark'
import { InlineNotice } from '../ui/States'
import { DashboardContext, type DashboardContextValue, useDashboard, usePendingApplications } from './dashboardContext'
import { FullPageSpinner } from './FullPageSpinner'
import type { NavItem } from './nav'

const SIDEBAR_KEY = 'arfurn:sidebar'

type Variant = 'admin' | 'business'

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

export function DashboardShell({ nav, variant }: { nav: NavItem[]; variant: Variant }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const { business } = useAccount()

  useEffect(() => setMobileOpen(false), [location.pathname])
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
    } catch {
      // Storage can be unavailable (private mode); the sidebar just forgets its state.
    }
  }, [collapsed])

  const ctx = useMemo<DashboardContextValue>(
    () =>
      variant === 'admin'
        ? { variant, home: 'Sanctus Admin', homeTo: '/admin', eyebrow: 'Platform admin' }
        : { variant, home: business?.name ?? 'My business', homeTo: '/dashboard', eyebrow: 'Business dashboard' },
    [variant, business?.name],
  )

  return (
    <DashboardContext.Provider value={ctx}>
      <div className="min-h-dvh bg-canvas" style={{ '--sidebar-w': collapsed ? '72px' : '256px' } as React.CSSProperties}>
        <a href="#main" className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          Skip to content
        </a>
        {/* Desktop sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-30 hidden flex-col bg-obsidian text-chalk transition-[width] duration-150 lg:flex',
            collapsed ? 'w-[72px]' : 'w-64',
          )}
        >
          <SidebarContent
            nav={nav}
            variant={variant}
            collapsed={collapsed}
            footer={
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
                className={cn(
                  'flex h-9 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-[13px] text-chalk/70 hover:bg-white/5 hover:text-chalk focus-visible:outline-accent-bright',
                  collapsed && 'justify-center px-0',
                )}
              >
                {collapsed ? <ChevronsRight className="size-4 shrink-0" aria-hidden /> : <ChevronsLeft className="size-4 shrink-0" aria-hidden />}
                {!collapsed && 'Collapse'}
              </button>
            }
          />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && <MobileDrawer nav={nav} variant={variant} onClose={() => setMobileOpen(false)} />}

        <div className={cn('transition-[padding] duration-150', collapsed ? 'lg:pl-[72px]' : 'lg:pl-64')}>
          <Topbar onMenu={() => setMobileOpen(true)} nav={nav} variant={variant} />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-16 outline-none sm:px-6 lg:px-10 lg:pt-10">
            {variant === 'business' && <CatalogStatusNotice />}
            <Suspense fallback={<FullPageSpinner />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </DashboardContext.Provider>
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
    <InlineNotice tone="warning" className="mb-6">
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

function Brand({ collapsed, variant }: { collapsed?: boolean; variant: Variant }) {
  const { business } = useAccount()
  const label = variant === 'business' ? (business?.name ?? 'Business dashboard') : 'Admin console'
  const to = variant === 'business' ? '/dashboard' : '/admin'
  if (collapsed) {
    return (
      <Link to={to} aria-label={variant === 'business' ? `${label}, business dashboard` : 'Sanctus admin console'} className="grid size-10 place-items-center rounded-[var(--radius-control)] focus-visible:outline-accent-bright">
        <BrandMark className="size-7 text-chalk" />
      </Link>
    )
  }
  return (
    <Link to={to} className="flex min-w-0 flex-col items-start gap-2.5 rounded-[var(--radius-control)] focus-visible:outline-accent-bright">
      <Wordmark size={15} className="text-chalk" />
      <span className="max-w-full truncate border border-chalk/25 px-1.5 py-0.5 text-[10px] leading-none font-medium tracking-[0.18em] text-chalk/75 uppercase">
        {label}
      </span>
    </Link>
  )
}

function NavBadge({ kind, collapsed }: { kind: NonNullable<NavItem['badge']>; collapsed?: boolean }) {
  const q = usePendingApplications(kind === 'pendingApplications')
  const n = q.data?.total ?? 0
  if (!n) return null
  const text = n > 99 ? '99+' : formatNumber(n)
  return (
    <>
      <span className="sr-only">, {formatNumber(n)} awaiting review</span>
      <span
        aria-hidden
        className={cn(
          'grid h-[18px] min-w-[18px] place-items-center rounded-[var(--radius-control)] bg-accent-bright px-1 text-[10.5px] leading-none font-semibold text-obsidian tabular-nums',
          collapsed ? 'absolute top-0.5 right-1.5' : 'ml-auto',
        )}
      >
        {text}
      </span>
    </>
  )
}

function SidebarContent({
  nav,
  variant,
  collapsed,
  onNavigate,
  footer,
}: {
  nav: NavItem[]
  variant: Variant
  collapsed?: boolean
  onNavigate?: () => void
  footer?: React.ReactNode
}) {
  return (
    <>
      <div className={cn('flex min-h-[84px] items-center border-b border-white/10', collapsed ? 'justify-center px-2' : 'px-5')}>
        <Brand collapsed={collapsed} variant={variant} />
      </div>
      {/* The user block sits inside the "Main" navigation so Log out stays with the other places to go. */}
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col">
        <ul className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {nav.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[13.5px] transition-colors focus-visible:outline-accent-bright',
                    collapsed && 'justify-center px-0',
                    isActive
                      ? 'bg-white/[0.08] font-medium text-chalk before:absolute before:inset-y-2 before:left-0 before:w-[2px] before:bg-accent-bright'
                      : 'text-chalk/70 hover:bg-white/[0.04] hover:text-chalk',
                  )
                }
              >
                <item.icon className="size-[18px] shrink-0" strokeWidth={1.6} aria-hidden />
                <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
                {item.badge && <NavBadge kind={item.badge} collapsed={collapsed} />}
              </NavLink>
            </li>
          ))}
        </ul>
        {footer && <div className="px-3 pb-2">{footer}</div>}
        <UserBlock collapsed={collapsed} />
      </nav>
    </>
  )
}

function UserBlock({ collapsed }: { collapsed?: boolean }) {
  const { user } = useAccount()
  const leave = useLeaveAccount()
  const iconBtn =
    'grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] text-chalk/70 hover:bg-white/[0.06] hover:text-chalk focus-visible:outline-accent-bright pointer-coarse:size-11'
  const actions = (
    <>
      <button
        type="button"
        // Supabase mode: the sign-in page sends a signed-in user straight back, so end the session first.
        onClick={() => void leave({ signOut: !isDemoMode })}
        aria-label="Switch account"
        title="Switch account"
        className={iconBtn}
      >
        <Repeat className="size-4" aria-hidden />
      </button>
      <button type="button" onClick={() => void leave({ signOut: true })} aria-label="Log out" title="Log out" className={iconBtn}>
        <LogOut className="size-4" aria-hidden />
      </button>
    </>
  )
  return (
    <div className={cn('border-t border-white/10 p-3', collapsed && 'flex flex-col items-center gap-1')}>
      {collapsed ? (
        actions
      ) : (
        <div className="flex items-center gap-2.5">
          {user && (
            <span className="grid size-9 shrink-0 place-items-center border border-chalk/25 font-display text-[15px] text-chalk" aria-hidden>
              {initials(user.name)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-chalk">{user?.name ?? 'Signed in'}</p>
            <p className="truncate text-[11px] text-chalk/65">
              {user?.email}
              {isDemoMode && ' · demo'}
            </p>
          </div>
          {actions}
        </div>
      )}
    </div>
  )
}

function MobileDrawer({ nav, variant, onClose }: { nav: NavItem[]; variant: Variant; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, true, onClose)
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 animate-fade-in bg-obsidian/50" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Navigation" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-obsidian text-chalk shadow-[var(--shadow-pop)]">
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="absolute top-5 right-3 grid size-11 place-items-center rounded-[var(--radius-control)] text-chalk/75 hover:bg-white/[0.06] hover:text-chalk focus-visible:outline-accent-bright"
        >
          <X className="size-5" aria-hidden />
        </button>
        <SidebarContent nav={nav} variant={variant} onNavigate={onClose} />
      </div>
    </div>
  )
}

/** The nav item the current path belongs to (longest match), for the top bar's breadcrumb. */
function useSection(nav: NavItem[]) {
  const { pathname } = useLocation()
  return [...nav]
    .filter((i) => pathname === i.to || (!i.end && pathname.startsWith(`${i.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0]
}

function Topbar({ onMenu, nav, variant }: { onMenu: () => void; nav: NavItem[]; variant: Variant }) {
  const section = useSection(nav)
  const { business } = useAccount()
  const { home, homeTo } = useDashboard() ?? { home: 'Sanctus', homeTo: '/' }
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-canvas px-4 sm:px-6 lg:px-10">
      <IconButton aria-label="Open navigation" onClick={onMenu} className="-ml-2 lg:hidden pointer-coarse:size-11">
        <Menu className="size-5" />
      </IconButton>
      <Link to={homeTo} aria-label="Sanctus, dashboard home" className="text-ink lg:hidden">
        <Wordmark size={12} />
      </Link>
      <nav aria-label="You are here" className="hidden min-w-0 lg:block">
        <ol className="flex min-w-0 items-center gap-2 text-[13px] text-ink-muted">
          <li className="min-w-0 truncate">
            <Link to={homeTo} className="hover:text-ink hover:underline">
              {home}
            </Link>
          </li>
          {section && (
            <>
              <li aria-hidden className="text-line-strong">
                /
              </li>
              <li aria-current="page" className="truncate font-medium text-ink">
                {section.label}
              </li>
            </>
          )}
        </ol>
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {/* Honest labelling in the demo; a production owner has no use for the data source's name (DUX-08). */}
        {isDemoMode && (
          <span className="hidden border border-line-strong px-2 py-1 text-[10.5px] font-medium tracking-[0.14em] text-ink-muted uppercase sm:inline">Demo mode</span>
        )}
        {variant === 'business' && business && (
          <a
            href={catalogLocalPath(business, { preview: business.status !== 'active' })}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-10 items-center gap-1.5 px-2 text-[13px] font-medium text-ink hover:underline pointer-coarse:min-h-11"
          >
            <span className="hidden sm:inline">{business.status === 'active' ? 'View catalog' : 'Preview catalog'}</span>
            <span className="sm:hidden">Catalog</span>
            <ArrowUpRight className="size-4" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
    </header>
  )
}

// The full-screen settings hub (spec 5), outside the dashboard shell: a grouped section list on the left, the
// section on the right, and a close button (and Esc) that returns to the page that opened it. Below 640px the
// list is its own first screen and a section opens with a "Settings" back link.
import { ChevronLeft, ChevronRight, LogOut, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { useLeaveAccount } from '@/auth/RequireRole'
import { SecurityNoticeSlot } from '@/auth/securityNotice'
import { useCan } from '@/auth/usePermission'
import { DashboardContext, type DashboardContextValue } from '@/components/layout/dashboardContext'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/Button'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { cn } from '@/lib/cn'
import { readReturnState, settingsReturnState } from '@/lib/settingsReturn'
import { settingsPath } from '@/lib/urls'
import { isDemoMode } from '@/services'
import { SettingsSectionPage } from './SettingsSectionPage'
import { TitleFocusContext } from './SettingsUi'
import { useMyProfile } from './useMyProfile'
import {
  SETTINGS_GROUPS,
  type SettingsScope,
  SettingsScopeContext,
  type SettingsSectionDef,
  visibleSections,
} from './sections'

const WIDE = '(min-width: 640px)'

function subscribeWide(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const m = window.matchMedia(WIDE)
  m.addEventListener?.('change', onChange)
  return () => m.removeEventListener?.('change', onChange)
}
// No matchMedia (tests, very old browsers): the two-column layout.
const isWide = () => typeof window.matchMedia !== 'function' || window.matchMedia(WIDE).matches

export default function SettingsLayout({ scope }: { scope: SettingsScope }) {
  const can = useCan()
  const { user, business } = useAccount()
  const leave = useLeaveAccount()
  const navigate = useNavigate()
  const location = useLocation()
  const { section } = useParams()
  const wide = useSyncExternalStore(subscribeWide, isWide)
  // Read once: moving between sections keeps the page that opened settings.
  const [from] = useState(() => readReturnState(location.state))
  const home = scope === 'admin' ? '/admin' : '/dashboard'
  const sections = useMemo(() => visibleSections({ scope, can }), [scope, can])
  const current = sections.find((s) => s.id === section)
  const returnState = from ? settingsReturnState(from) : undefined
  const mainRef = useRef<HTMLElement>(null)
  const shownSection = useRef(current?.id)
  const titleFocus = useRef(false)
  // True once for the first section title to mount after a section change.
  const takeTitleFocus = useMemo(
    () => ({
      take: () => {
        const want = titleFocus.current
        titleFocus.current = false
        return want
      },
    }),
    [],
  )

  const close = useCallback(() => navigate(from ?? home), [navigate, from, home])

  // Dialogs, menus and toasts render in portals under <body>: mark it so the dashboard type reaches them (as DashboardShell does).
  useEffect(() => {
    document.body.dataset.surface = 'dashboard'
    return () => {
      delete document.body.dataset.surface
    }
  }, [])

  // Esc closes settings, unless a dialog or menu used it first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
      if (document.querySelector('[aria-modal="true"], [role="menu"]')) return
      close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  // A new section starts at the top with focus on its title, for keyboard and screen-reader users. Back on the phone
  // list, focus returns to the link of the section just left.
  useEffect(() => {
    const prev = shownSection.current
    const next = current?.id
    if (prev === next) return
    shownSection.current = next
    window.scrollTo({ top: 0 })
    if (next) {
      // Already loaded: the title is here now. Still loading: SectionHeader takes focus when it mounts.
      const title = mainRef.current?.querySelector<HTMLElement>('h1')
      if (title) title.focus({ preventScroll: true })
      else titleFocus.current = true
    } else if (prev) {
      document.querySelector<HTMLElement>(`[data-section-link="${prev}"]`)?.focus({ preventScroll: true })
    }
  }, [current])

  const dashboard = useMemo<DashboardContextValue>(
    () =>
      scope === 'admin'
        ? { variant: 'admin', home: 'Sanctus Admin', homeTo: '/admin', eyebrow: 'Settings' }
        : { variant: 'business', home: business?.name ?? 'My business', homeTo: '/dashboard', eyebrow: 'Settings' },
    [scope, business?.name],
  )

  // Unknown sections and sections this role can't see go to My account, with no error flash (spec 5).
  if (section !== undefined && !current) return <Navigate to={settingsPath(scope, 'account')} replace state={returnState} />
  // Two columns always show a section; below 640px /settings is the section list itself.
  if (section === undefined && wide) return <Navigate to={settingsPath(scope, 'account')} replace state={returnState} />

  const closeButton = (
    <IconButton aria-label="Close settings" variant="secondary" onClick={close} className="rounded-full! pointer-coarse:size-11">
      <X className="size-5" aria-hidden />
    </IconButton>
  )

  return (
    <DashboardContext.Provider value={dashboard}>
      <SettingsScopeContext.Provider value={scope}>
        <TitleFocusContext.Provider value={takeTitleFocus}>
        <div data-surface="dashboard" data-settings-root className="flex min-h-dvh bg-canvas text-ink-body">
          {(wide || !current) && (
            <SectionList
              wide={wide}
              scope={scope}
              sections={sections}
              current={current}
              returnState={returnState}
              user={user ? { name: user.name, email: user.email } : null}
              closeButton={closeButton}
              onSignOut={() => void leave({ signOut: true })}
            />
          )}
          {current && (
            <div className="flex min-w-0 flex-[1_1_800px]">
              <main
                ref={mainRef}
                id="main"
                tabIndex={-1}
                aria-label={current.label}
                className={cn('min-w-0 flex-1 outline-none', wide ? 'px-8 py-8 lg:px-10 lg:py-14' : 'px-4 pt-3 pb-12')}
              >
                <div className="w-full max-w-[720px]">
                  <SecurityNoticeSlot />
                  {!wide && (
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <Link
                        to=".."
                        relative="path"
                        state={returnState}
                        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] px-2 text-ui-body font-medium text-ink hover:bg-subtle"
                      >
                        <ChevronLeft className="size-4" aria-hidden />
                        Settings
                      </Link>
                      <div className="flex items-center gap-4">
                        <LanguageSwitcher className="text-ink" />
                        {closeButton}
                      </div>
                    </div>
                  )}
                  <SettingsSectionPage section={current} />
                </div>
              </main>
              {wide && (
                <div className="shrink-0 pt-8 pr-4 lg:pt-14 lg:pr-8">
                  <div className="sticky top-8 flex flex-col items-center gap-1.5">
                    {closeButton}
                    <span aria-hidden className="text-[12px] leading-none text-ink-muted">
                      Esc
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        </TitleFocusContext.Provider>
      </SettingsScopeContext.Provider>
    </DashboardContext.Provider>
  )
}

function SectionList({
  wide,
  scope,
  sections,
  current,
  returnState,
  user,
  closeButton,
  onSignOut,
}: {
  wide: boolean
  scope: SettingsScope
  sections: SettingsSectionDef[]
  current: SettingsSectionDef | undefined
  returnState: ReturnType<typeof settingsReturnState> | undefined
  user: { name: string; email: string } | null
  closeButton: React.ReactNode
  onSignOut: () => void
}) {
  // Below 640px the list is a screen of its own, so it carries the page title; on wide screens the section's title is it.
  useDocumentTitle(wide ? undefined : 'Settings')
  const titleId = useId()
  // The name and photo set in Profile settings (shared with the sidebar); the account's own name until they load.
  const { profile } = useMyProfile()
  // Below 640px the list is the whole screen, so it is the page's main landmark; beside a section it is not.
  const Root = wide ? 'div' : 'main'
  const groups = SETTINGS_GROUPS.map((g) => ({ group: g, items: sections.filter((s) => s.group === g) })).filter((g) => g.items.length > 0)
  return (
    <Root
      aria-labelledby={wide ? undefined : titleId}
      className={cn(
        'flex bg-surface',
        wide ? 'sticky top-0 h-dvh flex-[1_0_272px] justify-end overflow-y-auto border-r border-line' : 'w-full flex-col',
      )}
    >
      <div className={cn('flex w-full flex-col', wide ? 'max-w-[272px] px-4 py-8 lg:py-14' : 'px-4 pt-3 pb-10')}>
        {wide ? (
          <div className="flex items-center justify-between gap-3 px-3 pb-4">
            <p className="text-ui-small text-ink-muted">Settings</p>
            <LanguageSwitcher className="text-ink" />
          </div>
        ) : (
          <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
            <h1 id={titleId} className="font-display text-[1.75rem] leading-[1.15] font-medium tracking-[-0.01em] text-ink">Settings</h1>
            <div className="flex items-center gap-4">
              <LanguageSwitcher className="text-ink" />
              {closeButton}
            </div>
          </div>
        )}
        {user && (
          <div data-settings-identity className="mb-5 flex min-w-0 items-center gap-3 px-3">
            <Avatar name={profile?.displayName || user.name} src={profile?.avatarUrl} size={40} />
            <div className="min-w-0">
              <p className="truncate text-ui-body font-medium text-ink">{profile?.displayName || user.name}</p>
              <p className="truncate text-ui-small text-ink-muted">
                {user.email}
                {isDemoMode && ' · demo'}
              </p>
            </div>
          </div>
        )}
        <nav aria-label="Settings sections" className="space-y-5">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <h2 className="px-3 pb-1 text-ui-small font-medium text-ink-muted">{group}</h2>
              <ul className="space-y-0.5">
                {items.map((s) => {
                  const active = s.id === current?.id
                  return (
                    <li key={s.id}>
                      <Link
                        to={settingsPath(scope, s.id)}
                        state={returnState}
                        data-section-link={s.id}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 text-ui-body transition-colors',
                          wide ? 'h-9' : 'h-12 border-b border-line last:border-b-0',
                          active ? 'bg-subtle font-medium text-ink' : wide ? 'text-ink-muted hover:bg-subtle hover:text-ink' : 'text-ink hover:bg-subtle',
                        )}
                      >
                        <span className="truncate">{s.label}</span>
                        {!wide && <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="mt-6 border-t border-line pt-4">
          <button
            type="button"
            onClick={onSignOut}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 text-left text-ui-body text-ink-muted hover:bg-subtle hover:text-ink',
              wide ? 'h-9' : 'h-12',
            )}
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            Sign out
          </button>
        </div>
      </div>
    </Root>
  )
}

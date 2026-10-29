import { createContext, type ReactNode, useContext, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'
import { Link } from 'react-router'
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { useDashboard, useInDashboard } from './dashboardContext'

export interface Crumb {
  label: string
  to?: string
}

/**
 * Where the dashboard top bar shows a page's breadcrumbs. The shell provides the slot element (once it has mounted)
 * and learns through `setHasCrumbs` when a page fills it, so it can hide its default trail instead of doubling it.
 */
export interface BreadcrumbSlot {
  slot: HTMLElement | null
  setHasCrumbs: (has: boolean) => void
}
export const BreadcrumbSlotContext = createContext<BreadcrumbSlot | null>(null)

/** Breadcrumbs for the top bar: the dashboard's name, then the page's own path (14px, current page in ink). */
function TopBarCrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const dashboard = useDashboard()
  const trail: Crumb[] = [{ label: dashboard?.home ?? 'Sanctus', to: dashboard?.homeTo ?? '/' }, ...crumbs]
  return <CrumbTrail trail={trail} className="hidden min-w-0 lg:block" textClass="text-[length:var(--text-ui-body)]" />
}

/** Below lg the top bar has no room for the trail, so the page shows its own path above the title (13px). */
function PageCrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return <CrumbTrail trail={crumbs} className="mb-2 min-w-0 lg:hidden" textClass="text-[length:var(--text-ui-small)]" />
}

function CrumbTrail({ trail, className, textClass }: { trail: Crumb[]; className: string; textClass: string }) {
  const { t } = useI18n()
  return (
    <nav aria-label={t('ui.header.breadcrumb')} className={className}>
      <ol className={cn('flex min-w-0 items-center gap-x-1.5 text-ink-muted', textClass)}>
        {trail.map((c, i) => {
          // The current page is the last crumb without a link; a trailing linked crumb (error and loading states pass only the
          // parent) stays a link, so there is always a way back.
          const last = i === trail.length - 1 && !c.to
          return (
            <li key={`${c.label}-${i}`} className={cn('flex items-center gap-x-1.5', last ? 'min-w-0' : 'shrink-0')}>
              {i > 0 && (
                <span aria-hidden className="text-ink-muted">
                  /
                </span>
              )}
              {c.to && !last ? (
                <Link to={c.to} className="hover:text-ink hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={cn('truncate', last && 'font-medium text-ink')}>
                  {c.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** Tells the shell this page owns the top bar's breadcrumb while it is mounted. */
function useClaimBreadcrumbSlot(active: boolean) {
  const setHasCrumbs = useContext(BreadcrumbSlotContext)?.setHasCrumbs
  useEffect(() => {
    if (!active || !setHasCrumbs) return
    setHasCrumbs(true)
    return () => setHasCrumbs(false)
  }, [active, setHasCrumbs])
}

/**
 * Dashboard page header. Inside the dashboard shell: a Cormorant title, one optional line (status `meta` first, then
 * the description) and right-aligned actions; the breadcrumb path moves to the top bar and there is no eyebrow.
 * Elsewhere it keeps its earlier look: a small uppercase eyebrow or breadcrumb above a larger serif title.
 *
 * `more` holds the tertiary actions for phones: below `sm` they sit in a "More actions" menu beside the title and the
 * actions row is full width (so the one primary is too). The caller still renders those actions inline in `actions`
 * with `max-sm:hidden`; the menu itself is `sm:hidden`, so only one copy is ever shown, focusable or announced.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  meta,
  eyebrow,
  more,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  breadcrumbs?: Crumb[]
  meta?: ReactNode
  eyebrow?: ReactNode
  more?: (MenuItem | 'separator')[]
}) {
  useDocumentTitle(typeof title === 'string' ? title : undefined)
  const { t } = useI18n()
  const inDashboard = useInDashboard()
  const slot = useContext(BreadcrumbSlotContext)
  const crumbs = breadcrumbs && breadcrumbs.length > 0 ? breadcrumbs : null
  useClaimBreadcrumbSlot(inDashboard && !!crumbs && !!slot?.slot)
  const hasMore = !!more && more.some((m) => m !== 'separator')
  const moreMenu = hasMore && (
    <div className="-my-0.5 shrink-0 sm:hidden">
      <DropdownMenu
        label={t('ui.header.moreActions')}
        items={more}
        trigger={<MoreHorizontal className="size-5" aria-hidden />}
        triggerClassName="size-11! border border-line-strong bg-surface text-ink!"
      />
    </div>
  )

  if (inDashboard) {
    return (
      <div className="mb-8">
        {crumbs && slot?.slot && createPortal(<TopBarCrumbs crumbs={crumbs} />, slot.slot)}
        {crumbs && <PageCrumbs crumbs={crumbs} />}
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 lg:flex-nowrap">
          <div data-header-title className={cn('min-w-0 lg:flex-1', hasMore && 'max-sm:w-full')}>
            <div className="flex items-start gap-3">
              <h1 className="min-w-0 flex-1 font-display text-[length:var(--text-ui-h1)] leading-[1.15] font-medium tracking-[-0.01em] break-words text-ink lg:line-clamp-2" title={typeof title === 'string' ? title : undefined}>
                {title}
              </h1>
              {moreMenu}
            </div>
            {(meta || description) && (
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {meta}
                {description && <p className="max-w-2xl text-[length:var(--text-ui-sub)] leading-[1.5] text-ink-muted">{description}</p>}
              </div>
            )}
          </div>
          {actions && (
            <div
              className={cn(
                'flex flex-wrap items-center gap-3 lg:shrink-0 lg:self-start',
                // Below sm only the primary is visible (tertiary actions are in More): the wrapper drops out of the
                // layout so the primary takes a full-width row, and a header with no primary adds no empty row.
                hasMore && 'max-sm:contents max-sm:*:w-full',
              )}
            >
              {actions}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-8 border-b border-line pb-6">
      {crumbs ? (
        <nav aria-label={t('ui.header.breadcrumb')} className="mb-3">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 font-medium tracking-[0.18em] text-ink-muted uppercase">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-2">
                {i > 0 && (
                  <span aria-hidden className="text-line-strong">
                    /
                  </span>
                )}
                {c.to ? (
                  <Link to={c.to} className="text-accent-ink hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="truncate text-ink-muted">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : (
        eyebrow && (
          <p className="mb-3 flex items-center gap-2 text-[11px] leading-4 font-medium tracking-[0.18em] text-accent-ink uppercase">
            <span className="size-1 shrink-0 bg-accent" aria-hidden />
            {eyebrow}
          </p>
        )
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          {moreMenu ? (
            <div className="flex items-start gap-3">
              <h1 className="font-display text-[2.125rem] leading-[1.08] font-normal text-ink sm:text-[2.75rem]">{title}</h1>
              {moreMenu}
            </div>
          ) : (
            <h1 className="font-display text-[2.125rem] leading-[1.08] font-normal text-ink sm:text-[2.75rem]">{title}</h1>
          )}
          {description && <p className="mt-2 max-w-2xl text-[15px] leading-6 text-ink-muted">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

/** A section heading for dashboard panels (cards): serif outside the shell, Inter 16/600 inside it. */
export function PanelHeader({
  title,
  description,
  actions,
  className,
  as: H = 'h2',
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
  as?: 'h2' | 'h3'
}) {
  const inDashboard = useInDashboard()
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5 pb-4 sm:px-6', className)}>
      <div className="min-w-0">
        {inDashboard ? (
          <H className="font-[family-name:var(--font-ui)] text-[length:var(--text-ui-card)] leading-[1.4] font-semibold text-ink">{title}</H>
        ) : (
          <H className="font-display text-[1.5rem] leading-tight font-normal text-ink">{title}</H>
        )}
        {description && (
          <p className={cn('mt-1 text-ink-muted', inDashboard ? 'text-[length:var(--text-ui-small)] leading-[1.45]' : 'text-[13px]')}>{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/** A small text link for panel headers, with a taller hit area that keeps its look (DUX-10). */
export const panelLinkClass = '-my-2 inline-flex items-center gap-1 py-2.5 text-[13px] font-medium text-accent-ink hover:underline'

export function useDocumentTitle(title?: string) {
  useEffect(() => {
    if (title) document.title = `${title} · Sanctus`
  }, [title])
}

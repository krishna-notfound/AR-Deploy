import { type ReactNode, useEffect } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'
import { useDashboard } from './dashboardContext'

export interface Crumb {
  label: string
  to?: string
}

/**
 * Dashboard page header: a small uppercase eyebrow (the breadcrumb path when given, otherwise the dashboard's name),
 * a large serif title, one optional line of description and right-aligned actions.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  meta,
  eyebrow,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  breadcrumbs?: Crumb[]
  meta?: ReactNode
  eyebrow?: ReactNode
}) {
  useDocumentTitle(typeof title === 'string' ? title : undefined)
  const dashboard = useDashboard()
  const fallbackEyebrow = eyebrow ?? dashboard?.eyebrow
  return (
    <div className="mb-8 border-b border-line pb-6">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 font-medium tracking-[0.18em] text-ink-muted uppercase">
            {breadcrumbs.map((c, i) => (
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
        fallbackEyebrow && (
          <p className="mb-3 flex items-center gap-2 text-[11px] leading-4 font-medium tracking-[0.18em] text-accent-ink uppercase">
            <span className="size-1 shrink-0 bg-accent" aria-hidden />
            {fallbackEyebrow}
          </p>
        )
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h1 className="font-display text-[2.125rem] leading-[1.08] font-normal text-ink sm:text-[2.75rem]">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-[15px] leading-6 text-ink-muted">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

/** A serif section heading for dashboard panels (cards), with an optional line of description and actions. */
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
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5 pb-4 sm:px-6', className)}>
      <div className="min-w-0">
        <H className="font-display text-[1.5rem] leading-tight font-normal text-ink">{title}</H>
        {description && <p className="mt-1 text-[13px] text-ink-muted">{description}</p>}
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

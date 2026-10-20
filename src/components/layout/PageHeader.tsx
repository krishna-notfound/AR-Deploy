import { ChevronRight } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { Link } from 'react-router'

export interface Crumb {
  label: string
  to?: string
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  meta,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  breadcrumbs?: Crumb[]
  meta?: ReactNode
}) {
  useDocumentTitle(typeof title === 'string' ? title : undefined)
  return (
    <div className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-[13px] text-ink-muted">
            {breadcrumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5 text-ink-faint" aria-hidden />}
                {c.to ? (
                  <Link to={c.to} className="hover:text-ink hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-ink">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] leading-tight font-normal text-ink sm:text-title">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function useDocumentTitle(title?: string) {
  useEffect(() => {
    if (title) document.title = `${title} · Sanctus`
  }, [title])
}

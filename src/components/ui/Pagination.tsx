import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'

/** Page numbers to show: the first, the last and the current page with its neighbours; gaps become ellipses. */
function pageList(page: number, pages: number): (number | 'gap')[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages))
  const out: (number | 'gap')[] = []
  let prev = 0
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push('gap')
    out.push(p)
    prev = p
  }
  return out
}

const stepClass =
  'inline-flex h-8 items-center gap-1 rounded-[var(--radius-control)] border border-line px-2.5 text-[12px] font-medium text-ink hover:bg-subtle disabled:pointer-events-none disabled:opacity-40 pointer-coarse:h-11'

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  noun = 'items',
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
  noun?: string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-muted sm:px-6">
      <p>
        Showing <span className="font-medium text-ink tabular-nums">{formatNumber(from)}–{formatNumber(to)}</span> of{' '}
        <span className="font-medium text-ink tabular-nums">{formatNumber(total)}</span> {noun}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous page" className={stepClass} disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Prev</span>
          </button>
          <ul className="hidden items-center gap-1 sm:flex">
            {pageList(page, pages).map((p, i) =>
              p === 'gap' ? (
                <li key={`gap-${i}`} aria-hidden className="px-1 text-ink-faint">
                  …
                </li>
              ) : (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => onPage(p)}
                    aria-label={`Page ${p}`}
                    aria-current={p === page ? 'page' : undefined}
                    className={cn(
                      'grid h-8 min-w-8 place-items-center rounded-[var(--radius-control)] px-2 text-[12px] font-medium tabular-nums',
                      p === page ? 'bg-obsidian text-chalk' : 'border border-line text-ink hover:bg-subtle',
                    )}
                  >
                    {p}
                  </button>
                </li>
              ),
            )}
          </ul>
          <span className="px-2 tabular-nums sm:hidden" aria-current="page">
            {page} / {pages}
          </span>
          <button type="button" aria-label="Next page" className={stepClass} disabled={page >= pages} onClick={() => onPage(page + 1)}>
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
    </nav>
  )
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  return items.slice((page - 1) * pageSize, page * pageSize)
}

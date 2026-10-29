import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { useInDashboard } from '@/components/layout/dashboardContext'

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

const stepClassBase =
  'inline-flex h-8 items-center gap-1 rounded-[var(--radius-control)] border border-line px-2.5 text-[12px] font-medium text-ink hover:bg-subtle disabled:pointer-events-none disabled:opacity-40 pointer-coarse:h-11'
/** Dashboard: the same control at 14px. */
const stepClassDash = stepClassBase.replace('text-[12px]', 'text-sm')

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  noun,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
  noun?: string
}) {
  const { t } = useI18n()
  const { number: formatNumber } = useFormat()
  const dash = useInDashboard()
  const stepClass = dash ? stepClassDash : stepClassBase
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav aria-label={t('ui.pagination.label')} className={
        dash
          ? 'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-muted sm:px-6'
          : 'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-muted sm:px-6'
      }
    >
      <p>
        {t('ui.pagination.showing')} <span className="font-medium text-ink tabular-nums">{formatNumber(from)}–{formatNumber(to)}</span> {t('ui.pagination.of')}{' '}
        <span className="font-medium text-ink tabular-nums">{formatNumber(total)}</span> {noun ?? t('ui.pagination.items')}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" aria-label={t('ui.pagination.previousPage')} className={stepClass} disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">{t('ui.pagination.prev')}</span>
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
                    aria-label={t('ui.pagination.page', { n: p })}
                    aria-current={p === page ? 'page' : undefined}
                    className={cn(
                      dash
                        ? 'grid h-8 min-w-8 place-items-center rounded-[var(--radius-control)] px-2 text-sm font-medium tabular-nums'
                        : 'grid h-8 min-w-8 place-items-center rounded-[var(--radius-control)] px-2 text-[12px] font-medium tabular-nums',
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
          <button type="button" aria-label={t('ui.pagination.nextPage')} className={stepClass} disabled={page >= pages} onClick={() => onPage(page + 1)}>
            <span className="hidden sm:inline">{t('ui.pagination.next')}</span>
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

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useInDashboard } from '@/components/layout/dashboardContext'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { Skeleton } from './Skeleton'

export interface Stat {
  label: string
  value: ReactNode
  hint?: ReactNode
  /** A small line icon shown top right on the public-style cards. The dashboard strip never renders it (BRIEF section 4). */
  icon?: LucideIcon
}

/**
 * Key figures. In the dashboard: one card split into equal columns by hairline dividers (a 2-column grid on phones),
 * each with a muted label, a 28px tabular value and a muted hint; the optional footer (e.g. the sample-data label)
 * is a row inside the same card. Outside the dashboard: a row of separate stat cards.
 */
export function StatGroup({ stats, loading, className, footer }: { stats: Stat[]; loading?: boolean; className?: string; footer?: ReactNode }) {
  const { t } = useI18n()
  const inDashboard = useInDashboard()
  if (inDashboard) {
    return (
      <section className={className} aria-label={t('ui.stats.label')}>
        <div className="overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]">
          <dl className="grid grid-cols-2 gap-px bg-line xl:grid-flow-col xl:auto-cols-fr xl:grid-cols-none xl:gap-0 xl:divide-x xl:divide-line">
            {stats.map((s) => (
              <div key={s.label} className="flex min-w-0 flex-col bg-surface px-4 py-5 sm:px-5 xl:px-6 xl:py-6 max-xl:[&:last-child:nth-child(odd)]:col-span-2">
                <div>
                  <dt className="text-ui-small font-medium text-ink-muted">{s.label}</dt>
                </div>
                <dd className="mt-2.5 text-ui-kpi font-medium tracking-[-0.01em] text-ink tabular-nums">
                  {loading ? <Skeleton className="h-7 w-16" /> : s.value}
                </dd>
                {s.hint && !loading && <dd className="mt-1.5 text-ui-small text-ink-muted">{s.hint}</dd>}
              </div>
            ))}
          </dl>
          {footer && <div className="border-t border-line px-4 py-3 text-ui-small text-ink-muted sm:px-6">{footer}</div>}
        </div>
      </section>
    )
  }
  return (
    <section className={className} aria-label={t('ui.stats.label')}>
      <dl
        className={cn(
          'grid grid-cols-2 gap-3 sm:gap-4',
          stats.length % 3 === 0 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 md:grid-cols-3',
          'xl:grid-flow-col xl:auto-cols-fr xl:grid-cols-none',
        )}
      >
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="flex min-w-0 flex-col rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
              <div className="flex min-h-8 items-start justify-between gap-2">
                <dt className="text-[10.5px] leading-4 font-medium tracking-[0.16em] text-ink-muted uppercase">{s.label}</dt>
                {Icon && <Icon className="size-4 shrink-0 text-ink-faint" strokeWidth={1.5} aria-hidden />}
              </div>
              <dd className="mt-3 font-display text-[2.125rem] leading-none text-ink lining-nums tabular-nums sm:text-[2.5rem]">
                {loading ? <Skeleton className="h-9 w-16" /> : s.value}
              </dd>
              {s.hint && !loading && <dd className="mt-2 text-xs leading-4 text-ink-muted">{s.hint}</dd>}
            </div>
          )
        })}
      </dl>
      {footer && <div className="mt-3 text-xs text-ink-muted">{footer}</div>}
    </section>
  )
}

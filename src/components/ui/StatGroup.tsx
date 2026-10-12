import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Skeleton } from './Skeleton'

export interface Stat {
  label: string
  value: ReactNode
  hint?: ReactNode
}

/**
 * A single strip of key figures separated by hairlines. Used instead of a row of
 * identical cards so the overview reads as one summary, not six widgets.
 */
export function StatGroup({ stats, loading, className, footer }: { stats: Stat[]; loading?: boolean; className?: string; footer?: ReactNode }) {
  return (
    <section className={cn('rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]', className)} aria-label="Key figures">
      <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-flow-col xl:auto-cols-fr xl:grid-cols-none">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              'flex flex-col gap-1 px-5 py-4',
              i > 0 && 'border-line xl:border-l',
              i % 2 === 1 && 'border-l sm:border-l-0',
              i % 3 !== 0 && 'sm:border-l xl:border-l',
              i >= 2 && 'border-t sm:border-t-0',
              i >= 3 && 'sm:border-t xl:border-t-0',
            )}
          >
            <dt className="text-[13px] text-ink-muted">{s.label}</dt>
            <dd className="text-2xl font-semibold tracking-tight text-ink tabular-nums">{loading ? <Skeleton className="mt-1 h-7 w-16" /> : s.value}</dd>
            {s.hint && !loading && <dd className="text-xs text-ink-faint">{s.hint}</dd>}
          </div>
        ))}
      </dl>
      {footer && <div className="border-t border-line px-5 py-2.5 text-xs text-ink-muted">{footer}</div>}
    </section>
  )
}

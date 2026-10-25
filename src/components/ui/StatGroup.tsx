import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Skeleton } from './Skeleton'

export interface Stat {
  label: string
  value: ReactNode
  hint?: ReactNode
  /** A small line icon shown top right. */
  icon?: LucideIcon
}

/**
 * Key figures as a row of stat cards: an uppercase label with a small line icon, a large serif number and a muted
 * sub-line. The optional footer (e.g. the sample-data label) sits under the row.
 */
export function StatGroup({ stats, loading, className, footer }: { stats: Stat[]; loading?: boolean; className?: string; footer?: ReactNode }) {
  return (
    <section className={className} aria-label="Key figures">
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

import { useInDashboard } from '@/components/layout/dashboardContext'
import { cn } from '@/lib/cn'

/** Dashboard bars are flat (no shimmer) so the loading layout does not flicker or shift (BRIEF section 7). */
export function Skeleton({ className }: { className?: string }) {
  const dash = useInDashboard()
  return <span className={cn('block rounded-[var(--radius-control)] bg-subtle', !dash && 'animate-shimmer', className)} aria-hidden />
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  const dash = useInDashboard()
  if (dash) {
    // Same pitch as a table row (52px) with a 14px and a 13px text bar.
    return (
      <div className={className} role="status" aria-label="Loading">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-[52px] items-center gap-3">
            <Skeleton className="size-8 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-[13px] w-1/5" />
            </div>
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-[var(--radius-control)]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="status" aria-label="Loading products">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-[4/3] w-full rounded-[var(--radius-card)]" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3.5 w-1/4" />
        </div>
      ))}
    </div>
  )
}

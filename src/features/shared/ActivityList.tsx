import { Building2, Eye, EyeOff, Package, PackagePlus, Pencil, Trash2 } from 'lucide-react'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { ActivityItem, ActivityKind } from '@/domain/types'
import { formatRelative } from '@/lib/format'
import type { QueryResult } from '@/services/hooks'

const ICON: Record<ActivityKind, typeof Package> = {
  business_created: Building2,
  business_updated: Pencil,
  business_deleted: Trash2,
  product_created: PackagePlus,
  product_updated: Pencil,
  product_published: Eye,
  product_unpublished: EyeOff,
  product_deleted: Trash2,
}

export function ActivityList({ query }: { query: QueryResult<ActivityItem[]> }) {
  if (query.status === 'loading' && !query.data) return <SkeletonRows rows={4} />
  if (query.status === 'error' && !query.data) return <ErrorState message={query.error.message} onRetry={query.refetch} />
  const items = query.data ?? []
  if (items.length === 0) return <EmptyState title="No activity yet" body="Changes to businesses and products will appear here." />
  return (
    <ol className="space-y-3.5">
      {items.map((a) => {
        const Icon = ICON[a.kind]
        return (
          <li key={a.id} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-subtle text-ink-muted">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[13px] leading-5 text-ink">{a.message}</p>
              <p className="text-xs text-ink-faint">
                <time dateTime={a.at}>{formatRelative(a.at)}</time>
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

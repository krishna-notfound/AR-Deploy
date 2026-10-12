import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from './Button'

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
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-muted">
      <p>
        {from}–{to} of {total} {noun}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <IconButton aria-label="Previous page" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <span className="px-2 tabular-nums" aria-current="page">
            {page} / {pages}
          </span>
          <IconButton aria-label="Next page" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            <ChevronRight className="size-4" />
          </IconButton>
        </div>
      )}
    </nav>
  )
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  return items.slice((page - 1) * pageSize, page * pageSize)
}

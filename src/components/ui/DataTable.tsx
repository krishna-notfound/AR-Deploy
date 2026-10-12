import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { Pagination, paginate } from './Pagination'
import { Skeleton } from './Skeleton'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  sortValue?: (row: T) => string | number
  align?: 'left' | 'right'
  className?: string
  /** Hide below the lg breakpoint (table view only). */
  priority?: 'high' | 'low'
  srOnlyHeader?: boolean
}

export type SortState = { key: string; dir: 'asc' | 'desc' }

/**
 * Sortable, paginated table. Below `md` it renders `mobileRow` cards instead of columns.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  mobileRow,
  loading,
  empty,
  pageSize = 10,
  initialSort,
  caption,
  noun,
  page: controlledPage,
  onPageChange,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  mobileRow: (row: T) => ReactNode
  loading?: boolean
  empty?: ReactNode
  pageSize?: number
  initialSort?: SortState
  caption: string
  noun?: string
  page?: number
  onPageChange?: (p: number) => void
}) {
  const [sort, setSort] = useState<SortState | undefined>(initialSort)
  const [localPage, setLocalPage] = useState(1)
  const page = controlledPage ?? localPage
  const setPage = onPageChange ?? setLocalPage

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    const get = col.sortValue
    return [...rows].sort((a, b) => {
      const va = get(a)
      const vb = get(b)
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort, columns])

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pages)
  const visible = paginate(sorted, safePage, pageSize)

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
    setPage(1)
  }

  if (loading) {
    return (
      <div className="space-y-4 p-5" role="status" aria-label="Loading">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="size-10 rounded-lg" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="hidden h-4 w-24 md:block" />
          </div>
        ))}
      </div>
    )
  }

  if (rows.length === 0) return <>{empty}</>

  return (
    <div>
      {/* Mobile cards */}
      <ul className="divide-y divide-line md:hidden" aria-label={caption}>
        {visible.map((row) => (
          <li key={rowKey(row)} className="px-4 py-3.5">
            {mobileRow(row)}
          </li>
        ))}
      </ul>
      {/* Table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-left text-[13px] text-ink-muted">
              {columns.map((c) => {
                const active = sort?.key === c.key
                const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : c.sortValue ? 'none' : undefined
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={cn(
                      'px-4 py-2.5 font-medium whitespace-nowrap first:pl-5 last:pr-5',
                      c.align === 'right' && 'text-right',
                      c.priority === 'low' && 'hidden lg:table-cell',
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn('inline-flex items-center gap-1 rounded hover:text-ink', c.align === 'right' && 'flex-row-reverse')}
                      >
                        {c.header}
                        {active ? (
                          sort.dir === 'asc' ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
                        )}
                      </button>
                    ) : (
                      <span className={c.srOnlyHeader ? 'sr-only' : undefined}>{c.header}</span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-canvas/60">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-4 py-3 align-middle first:pl-5 last:pr-5',
                      c.align === 'right' && 'text-right tabular-nums',
                      c.priority === 'low' && 'hidden lg:table-cell',
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={safePage} pageSize={pageSize} total={sorted.length} onPage={setPage} noun={noun} />
    </div>
  )
}

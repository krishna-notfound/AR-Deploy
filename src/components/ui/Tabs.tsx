import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'
import { useInDashboard } from '@/components/layout/dashboardContext'
import { cn } from '@/lib/cn'

export interface TabDef<T extends string> {
  value: T
  label: ReactNode
  badge?: ReactNode
}

/**
 * WAI-ARIA tabs (manual activation via arrow keys + Enter/Space or click). `underline` for page sections,
 * `pill` for filter tabs above a table (the selected one is filled; inside the dashboard a light segmented control).
 * Inside the dashboard a row that clips fades out on the right while it can scroll further.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
  variant = 'underline',
}: {
  tabs: TabDef<T>[]
  value: T
  onChange: (v: T) => void
  label: string
  className?: string
  variant?: 'underline' | 'pill'
}) {
  const id = useId()
  const inDashboard = useInDashboard()
  const listRef = useRef<HTMLDivElement>(null)
  const [moreRight, setMoreRight] = useState(false)
  const measure = useCallback(() => {
    const el = listRef.current
    if (el) setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])
  useEffect(() => {
    if (!inDashboard) return
    measure()
    const el = listRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [inDashboard, measure, tabs.length])
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const idx = tabs.findIndex((t) => t.value === value)
    const next = tabs[(idx + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
    if (next) {
      onChange(next.value)
      listRef.current?.querySelector<HTMLElement>(`[data-tab="${next.value}"]`)?.focus()
    }
  }
  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      onScroll={inDashboard ? measure : undefined}
      className={cn(
        inDashboard && variant === 'pill'
          ? 'inline-flex h-10 max-w-full gap-1 overflow-x-auto rounded-[var(--radius-control)] bg-subtle p-1 [scrollbar-width:none] pointer-coarse:h-[52px]'
          : 'flex gap-1 overflow-x-auto',
        variant === 'underline' && 'border-b border-line',
        // scroll padding keeps a keyboard-focused tab clear of the 24px fade
        inDashboard && 'scroll-pe-6',
        inDashboard && moreRight && '[mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)]',
        className,
      )}
    >
      {tabs.map((t) => {
        const selected = t.value === value
        return (
          <button
            key={t.value}
            id={`${id}-${t.value}`}
            data-tab={t.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 font-medium whitespace-nowrap transition-colors',
              inDashboard ? 'text-[14px] tracking-normal normal-case tabular-nums' : 'text-[12px] tracking-[0.12em] uppercase',
              variant === 'underline'
                ? cn('-mb-px min-h-11 border-b-2 px-3', selected ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink')
                : inDashboard
                  ? cn(
                      'h-8 rounded-[var(--radius-control)] border px-3 pointer-coarse:h-11',
                      selected ? 'border-line bg-surface text-ink' : 'border-transparent text-ink-muted hover:text-ink',
                    )
                  : cn('min-h-9 rounded-[var(--radius-control)] px-3 pointer-coarse:min-h-11', selected ? 'bg-obsidian text-chalk' : 'text-ink-muted hover:bg-subtle hover:text-ink'),
            )}
          >
            {t.label}
            {inDashboard && t.badge != null && t.badge !== false ? <span className="tabular-nums">{t.badge}</span> : t.badge}
          </button>
        )
      })}
    </div>
  )
}

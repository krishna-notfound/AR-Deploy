import { type ReactNode, useId, useRef } from 'react'
import { useInDashboard } from '@/components/layout/dashboardContext'
import { cn } from '@/lib/cn'

export interface TabDef<T extends string> {
  value: T
  label: ReactNode
  badge?: ReactNode
}

/**
 * WAI-ARIA tabs (manual activation via arrow keys + Enter/Space or click). `underline` for page sections,
 * `pill` for filter tabs above a table (the selected one is filled).
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
    <div ref={listRef} role="tablist" aria-label={label} onKeyDown={onKey} className={cn('flex gap-1 overflow-x-auto', variant === 'underline' && 'border-b border-line', className)}>
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
                : cn('min-h-9 rounded-[var(--radius-control)] px-3 pointer-coarse:min-h-11', selected ? 'bg-obsidian text-chalk' : 'text-ink-muted hover:bg-subtle hover:text-ink'),
            )}
          >
            {t.label}
            {inDashboard && t.badge !== undefined ? <span className="tabular-nums opacity-80">{t.badge}</span> : t.badge}
          </button>
        )
      })}
    </div>
  )
}

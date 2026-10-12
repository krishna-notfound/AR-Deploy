import { type ReactNode, useId, useRef } from 'react'
import { cn } from '@/lib/cn'

export interface TabDef<T extends string> {
  value: T
  label: ReactNode
  badge?: ReactNode
}

/** WAI-ARIA tabs (manual activation via arrow keys + Enter/Space or click). */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: TabDef<T>[]
  value: T
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  const id = useId()
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
    <div ref={listRef} role="tablist" aria-label={label} onKeyDown={onKey} className={cn('flex gap-1 border-b border-line', className)}>
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
              '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              selected ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.badge}
          </button>
        )
      })}
    </div>
  )
}

import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The editor's bordered segmented control (BRIEF section 6): hairline frame, 2px corners, the chosen segment on
 * `subtle`. `kind="radio"` is a form value (a radiogroup, e.g. the dimension unit); `kind="toggle"` switches the
 * view (a group of pressed buttons, e.g. EN | PT). On touch screens each segment gets a 44px hit area without
 * growing the drawn control.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  kind,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  label: string
  kind: 'radio' | 'toggle'
  size?: 'sm' | 'md'
}) {
  return (
    <div role={kind === 'radio' ? 'radiogroup' : 'group'} aria-label={label} className="inline-flex shrink-0 rounded-[var(--radius-control)] border border-line">
      {options.map((o, i) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            {...(kind === 'radio' ? { role: 'radio', 'aria-checked': on } : { 'aria-pressed': on })}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative inline-flex items-center gap-1 leading-none font-medium whitespace-nowrap transition-colors',
              'pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2.5',
              size === 'sm' ? 'h-6 px-2 text-[12px]' : 'h-8 px-3 text-[13px]',
              i > 0 && 'border-l border-line',
              on ? 'bg-subtle text-ink' : 'bg-surface text-ink-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

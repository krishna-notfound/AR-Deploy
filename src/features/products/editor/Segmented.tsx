import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The editor's bordered segmented control (BRIEF section 6): hairline frame, 2px corners, the chosen segment on
 * `subtle`. `kind="radio"` is a form value (a radiogroup, e.g. the dimension unit); `kind="toggle"` switches the
 * view (a group of pressed buttons, e.g. EN | PT). On touch screens each segment is at least 44px wide and its hit
 * area is 44px tall (sm) without growing the drawn control.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  kind,
  size = 'md',
  fill = false,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  label: string
  kind: 'radio' | 'toggle'
  size?: 'sm' | 'md'
  /** Below sm: full width, equal segments, labels may wrap (long labels, e.g. the editor's 3D choice). */
  fill?: boolean
}) {
  return (
    <div role={kind === 'radio' ? 'radiogroup' : 'group'} aria-label={label} className={cn('shrink-0 rounded-[var(--radius-control)] border border-line', fill ? 'flex w-full sm:inline-flex sm:w-auto' : 'inline-flex')}>
      {options.map((o, i) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            {...(kind === 'radio' ? { role: 'radio', 'aria-checked': on } : { 'aria-pressed': on })}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative inline-flex items-center gap-1 leading-none font-medium whitespace-nowrap transition-colors focus-visible:z-10',
              // Touch: at least 44px wide, and a hit area grown 12px up and 8px down. 8px is the gap to the input under
              // the label row, so the area never covers it.
              'pointer-coarse:min-w-11 pointer-coarse:justify-center pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-top-3 pointer-coarse:after:-bottom-2',
              size === 'sm' ? 'h-6 px-2 text-[12px]' : 'h-8 px-3 text-[13px]',
              fill && 'max-sm:h-auto max-sm:min-h-10 max-sm:flex-1 max-sm:justify-center max-sm:py-2 max-sm:text-center max-sm:leading-tight max-sm:whitespace-normal',
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

import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { useInDashboard } from '@/components/layout/dashboardContext'

/** True when the caller already sets a width, so the dashboard default must not fight it. */
const hasWidth = (c?: string) => !!c && /(^|\s)(\S+:)*(w|max-w|flex)-/.test(c)

/** Debounced search box. Calls onChange 250 ms after typing stops. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  label,
  className,
  delay = 250,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  label: string
  className?: string
  delay?: number
}) {
  const dash = useInDashboard()
  const [draft, setDraft] = useState(value)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => setDraft(value), [value])

  useEffect(() => {
    if (draft === value) return
    const t = setTimeout(() => onChangeRef.current(draft), delay)
    return () => clearTimeout(t)
  }, [draft, value, delay])

  return (
    <div className={dash ? cn('relative', !hasWidth(className) && 'sm:w-80', className) : cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        className={
          dash
            ? 'h-10 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface pr-9 pl-9 text-base placeholder:text-ink-faint hover:border-ink-faint focus-visible:border-accent focus-visible:outline-offset-0 sm:text-sm [&::-webkit-search-cancel-button]:hidden'
            : 'h-10 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface pr-9 pl-9 text-sm placeholder:text-ink-faint hover:border-ink-faint focus-visible:border-accent focus-visible:outline-offset-0 [&::-webkit-search-cancel-button]:hidden'
        }
      />
      {draft && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft('')
            onChangeRef.current('')
          }}
          className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-ink-faint hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}

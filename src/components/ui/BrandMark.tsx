import { cn } from '@/lib/cn'

/** Platform mark: an isometric box (the dimension drawing motif) with an orange anchor where it meets the floor. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn('size-6 shrink-0', className)} aria-hidden>
      <path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4L12 2.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M4 7.4 12 12l8-4.6M12 12v9.2" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="21.2" r="2.4" fill="var(--color-accent-bright)" />
    </svg>
  )
}

export function Wordmark({ className, sub }: { className?: string; sub?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5 text-ink', className)}>
      <BrandMark />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-[-0.01em]">Furnish AR</span>
        {sub && <span className="block text-[11px] text-ink-muted">{sub}</span>}
      </span>
    </span>
  )
}

import { useInDashboard } from '@/components/layout/dashboardContext'
import { cn } from '@/lib/cn'

/** Up to two initials from a name, skipping words that do not start with a letter or digit ("Oak & Ember" → "OE"). */
export function monogramOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((w) => /^[\p{L}\p{N}]/u.test(w))
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  )
}

/**
 * Initials in a hairline square, for rows that have no logo (applications, businesses without a logo, members).
 * Inside the dashboard: 32px, Inter 12/500 (BRIEF section 5); elsewhere the 40px serif mark.
 */
export function Monogram({ name, className }: { name: string; className?: string }) {
  const dash = useInDashboard()
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center border border-line-strong/50 bg-surface leading-none text-ink',
        dash ? 'size-8 font-[family-name:var(--font-ui)] text-[12px] font-medium' : 'size-10 font-display text-[17px]',
        className,
      )}
      aria-hidden
    >
      {monogramOf(name)}
    </span>
  )
}

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

/** Initials in a hairline square, for rows that have no logo (applications, businesses without a logo). */
export function Monogram({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center border border-line-strong/50 bg-surface font-display text-[17px] leading-none text-ink', className)} aria-hidden>
      {monogramOf(name)}
    </span>
  )
}

import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The sign-in pages' eyebrow (AuthHeading, AuthLayout's photo panel): a short rule and a spaced uppercase label. `onDark`
 * is the white version for text over a photograph or an obsidian field. Used by the landing, collection and product pages
 * so the public site and the sign-in page read as one (client request, round 2).
 */
export function Eyebrow({ children, onDark = false, className }: { children: ReactNode; onDark?: boolean; className?: string }) {
  return (
    <p className={cn('flex items-center gap-3 text-eyebrow', onDark ? 'text-chalk/85' : 'text-accent-ink', className)}>
      <span className={cn('h-px w-6 shrink-0', onDark ? 'bg-chalk/55' : 'bg-accent')} aria-hidden />
      {children}
    </p>
  )
}

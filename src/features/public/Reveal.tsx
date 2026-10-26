import { type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

type RevealTag = 'div' | 'section' | 'p' | 'h1' | 'h2' | 'li' | 'figure'

const DELAY = ['', 'motion-safe:delay-[80ms]', 'motion-safe:delay-[160ms]'] as const

/**
 * Gentle entrance for the public pages (ADR-0036 v2): the block rises 16px and fades in once, when it first enters
 * the viewport. `delay` staggers heading (0), text (1) and picture (2) by 80ms.
 * Only under `motion-safe:`; without IntersectionObserver (or with reduced motion) the content is simply shown.
 */
export function Reveal({ as: Tag = 'div', delay = 0, className, children }: { as?: RevealTag; delay?: 0 | 1 | 2; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (shown || !el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown])
  return (
    <Tag
      // A union of intrinsic tags: the ref type is the common HTMLElement.
      ref={ref as never}
      className={cn(
        'motion-safe:transition-[opacity,translate] motion-safe:duration-500 motion-safe:ease-out',
        shown ? DELAY[delay] : 'motion-safe:translate-y-4 motion-safe:opacity-0',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

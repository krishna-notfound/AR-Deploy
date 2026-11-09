import { useEffect, useState } from 'react'
import { ArPrimaryAction } from './ProductParts'
import type { ProductStage } from './useProductStage'

/**
 * A phone's main action (AR where it can start, else 3D) pinned to the bottom of the screen while the page's own action row is
 * still further down (round 2: "actions reachable without hunting"). It appears only on phones, only once the model has loaded
 * (the same rule as the button in the row), and goes away as soon as the row itself is on screen, so there are never two
 * buttons in view. Without IntersectionObserver (old browsers, jsdom) it simply never shows and the row is the only button.
 */
export function StickyActionBar({ stage, arLabel, row }: { stage: ProductStage; arLabel: string; row: HTMLElement | null }) {
  const [below, setBelow] = useState(false)
  useEffect(() => {
    if (!row || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => entry && setBelow(!entry.isIntersecting && entry.boundingClientRect.top > 0))
    io.observe(row)
    return () => io.disconnect()
  }, [row])
  if (!below || stage.modelState !== 'loaded') return null
  return (
    <div
      data-sticky-action
      className="fixed inset-x-0 bottom-0 z-30 flex flex-col border-t border-line bg-canvas px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] animate-fade-in motion-reduce:animate-none sm:hidden"
    >
      <ArPrimaryAction stage={stage} arLabel={arLabel} />
    </div>
  )
}

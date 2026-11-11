// Drag a question card to another place, in its section or into another one, with pointer events only (mouse, pen and
// touch; no library). The card is not moved while it is dragged: it follows the pointer and a line shows where it will
// land, and the move happens once, on release (`onDrop`). Sections are the elements marked `data-step-zone="<step id>"`,
// cards inside them `data-row="<field key>"`. Escape cancels. Near the top or bottom edge the scroll container scrolls.
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react'

export interface DragState {
  key: string
  /** Where it would land: the section and the position among that section's other cards. */
  stepId: string | null
  index: number
  /** How far the card has been pulled down (negative = up) since the drag began, scrolling included. */
  dy: number
}

const EDGE = 72
const STEP = 16
/** Pointer travel (px) below which a press on the handle is not a drag. */
const THRESHOLD = 4

function scrollParentOf(el: HTMLElement | null): HTMLElement {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

/** The section nearest to a height, and the position among its other cards. */
export function dropTargetAt(y: number, dragKey: string, root: ParentNode = document): { stepId: string; index: number } | null {
  const zones = [...root.querySelectorAll<HTMLElement>('[data-step-zone]')]
  let best: { el: HTMLElement; dist: number } | null = null
  for (const el of zones) {
    const r = el.getBoundingClientRect()
    const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
    if (!best || dist < best.dist) best = { el, dist }
  }
  if (!best) return null
  const rows = [...best.el.querySelectorAll<HTMLElement>('[data-row]')].filter((r) => r.dataset.row !== dragKey)
  let index = 0
  for (const row of rows) {
    const r = row.getBoundingClientRect()
    if (y > r.top + r.height / 2) index++
  }
  return { stepId: best.el.dataset.stepZone!, index }
}

export function useFieldDrag(onDrop: (key: string, stepId: string, index: number) => void) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const live = useRef<{ key: string; startY: number; startScroll: number; scroller: HTMLElement; x: number; y: number; moved: boolean; frame: number } | null>(null)
  const drop = useRef(onDrop)
  useEffect(() => {
    drop.current = onDrop
  })

  const measure = useCallback(() => {
    const s = live.current
    if (!s) return
    const target = dropTargetAt(s.y, s.key)
    setDrag({ key: s.key, stepId: target?.stepId ?? null, index: target?.index ?? 0, dy: s.y - s.startY + (s.scroller.scrollTop - s.startScroll) })
  }, [])

  const stop = useCallback(() => {
    const s = live.current
    if (s) cancelAnimationFrame(s.frame)
    live.current = null
    setDrag(null)
  }, [])

  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const s = live.current
      if (!s) return
      s.x = e.clientX
      s.y = e.clientY
      if (Math.abs(e.clientY - s.startY) > THRESHOLD) s.moved = true
      if (s.moved) measure()
    }
    const onUp = (e: PointerEvent) => {
      const s = live.current
      if (!s) return
      const target = s.moved ? dropTargetAt(e.clientY, s.key) : null
      const key = s.key
      stop()
      if (target) drop.current(key, target.stepId, target.index)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        stop()
      }
    }
    // Scrolls while the pointer rests near an edge, and keeps the landing line in step with what is under the pointer.
    const tick = () => {
      const s = live.current
      if (!s) return
      if (s.moved) {
        const box = s.scroller === document.scrollingElement || s.scroller === document.documentElement ? { top: 0, bottom: window.innerHeight } : s.scroller.getBoundingClientRect()
        if (s.y < box.top + EDGE) s.scroller.scrollTop -= STEP
        else if (s.y > box.bottom - EDGE) s.scroller.scrollTop += STEP
        measure()
      }
      s.frame = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('keydown', onKey)
    if (live.current) live.current.frame = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('keydown', onKey)
    }
    // Listeners live for the whole drag: they only need to be set up when it starts or ends.
  }, [dragging, measure, stop])

  const start = useCallback(
    (e: ReactPointerEvent<HTMLElement>, key: string) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.preventDefault()
      const scroller = scrollParentOf(e.currentTarget)
      live.current = { key, startY: e.clientY, startScroll: scroller.scrollTop, scroller, x: e.clientX, y: e.clientY, moved: false, frame: 0 }
      setDrag({ key, stepId: null, index: 0, dy: 0 })
    },
    [],
  )

  return { drag, start }
}

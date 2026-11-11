import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { useInDashboard } from '@/components/layout/dashboardContext'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
}

const GAP = 4
const EDGE = 8

interface MenuPosition {
  top: number
  left: number
  maxHeight: number
}

/**
 * Fixed position for a menu next to its trigger: below when it fits (or when there is more room
 * below than above), otherwise flipped above; the right edge (or left, for `start`) lines up with
 * the trigger and the menu is clamped EDGE px from the viewport edges.
 */
function placeMenu(trigger: DOMRect, menuHeight: number, menuWidth: number, align: 'start' | 'end'): MenuPosition {
  const vh = window.innerHeight
  const vw = window.innerWidth
  const below = vh - trigger.bottom - GAP - EDGE
  const above = trigger.top - GAP - EDGE
  const openBelow = menuHeight <= below || below >= above
  const maxHeight = Math.max(openBelow ? below : above, 0)
  const height = Math.min(menuHeight, maxHeight)
  const top = openBelow ? trigger.bottom + GAP : trigger.top - GAP - height
  const wanted = align === 'end' ? trigger.right - menuWidth : trigger.left
  const left = Math.max(EDGE, Math.min(wanted, vw - menuWidth - EDGE))
  return { top, left, maxHeight }
}

/**
 * Accessible dropdown menu (button + role=menu) with arrow-key navigation. The menu renders in a
 * portal on document.body with fixed positioning, so table scroll containers never clip it.
 */
export function DropdownMenu({
  trigger,
  items,
  label,
  align = 'end',
  triggerClassName,
  triggerTitle,
}: {
  trigger: ReactNode
  items: (MenuItem | 'separator')[]
  label: string
  align?: 'start' | 'end'
  triggerClassName?: string
  /** A tooltip for a trigger that shows only an icon. */
  triggerTitle?: string
}) {
  const dash = useInDashboard()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [pos, setPos] = useState<MenuPosition | null>(null)

  const reposition = useCallback(() => {
    const btn = btnRef.current
    const menu = menuRef.current
    if (!btn || !menu) return
    const height = menu.scrollHeight || menu.offsetHeight
    setPos(placeMenu(btn.getBoundingClientRect(), height, menu.offsetWidth, align))
  }, [align])

  // Position before paint so the menu never flashes in the wrong place.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    reposition()
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!wrapRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    const onScroll = (e: Event) => {
      // Scrolling inside the menu itself must not move it.
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return
      reposition()
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', reposition)
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, reposition])

  const onMenuKey = (e: React.KeyboardEvent) => {
    const els = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])]
    const idx = els.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      els[(idx + 1) % els.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      els[(idx - 1 + els.length) % els.length]?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      btnRef.current?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        title={triggerTitle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:bg-subtle hover:text-ink pointer-coarse:size-11',
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            tabIndex={-1}
            aria-label={label}
            onKeyDown={onMenuKey}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              maxHeight: pos?.maxHeight,
              visibility: pos ? undefined : 'hidden',
            }}
            className="z-[55] min-w-48 animate-fade-in overflow-y-auto rounded-[var(--radius-card)] bg-surface py-1.5 shadow-[var(--shadow-pop)]"
          >
            {items.map((item, i) =>
              item === 'separator' ? (
                <hr key={`sep-${i}`} className="my-1.5 border-line" />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false)
                    item.onSelect()
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 text-left text-sm outline-none hover:bg-subtle focus-visible:bg-subtle disabled:opacity-50',
                    dash ? 'h-9 whitespace-nowrap' : 'py-2',
                    item.destructive ? 'text-danger' : 'text-ink',
                  )}
                >
                  {item.icon && <span className="text-ink-muted [&_svg]:size-4" aria-hidden>{item.icon}</span>}
                  {item.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

/** Simple click-to-open panel (notifications, profile). */
export function Popover({
  trigger,
  label,
  children,
  align = 'end',
  panelClassName,
  triggerClassName,
}: {
  trigger: ReactNode
  label: string
  children: (close: () => void) => ReactNode
  align?: 'start' | 'end'
  panelClassName?: string
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Handled here: an outer Esc handler (the settings hub's close) must not act on it too.
        e.preventDefault()
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={cn(
            'absolute z-40 mt-2 animate-fade-in rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-pop)]',
            align === 'end' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { useInDashboard } from '@/components/layout/dashboardContext'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
}

/** Accessible dropdown menu (button + role=menu) with arrow-key navigation. */
export function DropdownMenu({
  trigger,
  items,
  label,
  align = 'end',
  triggerClassName,
}: {
  trigger: ReactNode
  items: (MenuItem | 'separator')[]
  label: string
  align?: 'start' | 'end'
  triggerClassName?: string
}) {
  const dash = useInDashboard()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus()
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

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
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          tabIndex={-1}
          aria-label={label}
          onKeyDown={onMenuKey}
          className={cn(
            'absolute z-40 mt-1 min-w-48 animate-fade-in rounded-[var(--radius-card)] bg-surface py-1.5 shadow-[var(--shadow-pop)]',
            align === 'end' ? 'right-0' : 'left-0',
          )}
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
        </div>
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

import { X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { IconButton } from './Button'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Traps focus inside `ref` while active and restores focus on cleanup. */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean, onEscape?: () => void) {
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape
  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return
    const previous = document.activeElement as HTMLElement | null
    const first = node.querySelector<HTMLElement>('[data-autofocus]') ?? node.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? node).focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onEscapeRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (items.length === 0) return
      const firstEl = items[0]!
      const lastEl = items[items.length - 1]!
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    node.addEventListener('keydown', onKey)
    return () => {
      node.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [active, ref])
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  closeLabel = 'Close dialog',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  dismissible?: boolean
  closeLabel?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  useFocusTrap(ref, open, dismissible ? onClose : undefined)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-ink/40" onClick={dismissible ? onClose : undefined} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92vh] w-full animate-toast-in flex-col rounded-t-[var(--radius-stage)] bg-surface shadow-[var(--shadow-pop)] sm:rounded-[var(--radius-card)]',
          { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-2">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-ink-muted">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <IconButton aria-label={closeLabel} size="sm" onClick={onClose} className="-mt-1 -mr-2">
              <X className="size-4" />
            </IconButton>
          )}
        </div>
        {children && <div className="overflow-y-auto px-5 py-3">{children}</div>}
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

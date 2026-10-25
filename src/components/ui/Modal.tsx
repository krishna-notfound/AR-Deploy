import { X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useInDashboard } from '@/components/layout/dashboardContext'
import { cn } from '@/lib/cn'
import { IconButton } from './Button'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Reads the surface the shell marks on <body> (data-surface); call it when an overlay is created, not while rendering. */
export function isDashboardSurface() {
  return typeof document !== 'undefined' && document.body.dataset.surface === 'dashboard'
}

/**
 * True under the dashboard shell. ToastProvider and ConfirmProvider sit above the shell, so context alone misses them:
 * the <body> mark is read as well.
 */
export function useDashboardSurface() {
  const inContext = useInDashboard()
  return inContext || isDashboardSurface()
}

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
  const dash = useDashboardSurface()
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
        <div className={cn('flex items-start justify-between gap-4 pb-2', dash ? 'px-6 pt-6' : 'px-5 pt-5')}>
          <div>
            <h2 id={titleId} className={cn('font-semibold text-ink', dash ? 'text-ui-card' : 'text-base')}>
              {title}
            </h2>
            {description && (
              <p id={descId} className={cn('mt-1 text-ink-muted', dash ? 'text-ui-body' : 'text-sm')}>
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
        {children && <div className={cn('overflow-y-auto py-3', dash ? 'px-6 text-ui-body' : 'px-5')}>{children}</div>}
        {footer && <div className={cn('flex flex-wrap justify-end gap-2 border-t border-line py-3.5', dash ? 'px-6' : 'px-5')}>{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

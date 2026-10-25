import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { type ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { isDashboardSurface } from './Modal'

export type ToastTone = 'success' | 'error' | 'info'
interface Toast {
  id: number
  tone: ToastTone
  title: string
  body?: ReactNode
  /** Whether the dashboard was showing when the toast was raised (a toast can outlive the page that raised it). */
  dash: boolean
}

interface ToastApi {
  show: (t: Omit<Toast, 'id' | 'dash'>, durationMs?: number) => void
  success: (title: string, body?: ReactNode) => void
  error: (title: string, body?: ReactNode) => void
  info: (title: string, body?: ReactNode) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info }
const TONES = { success: 'text-success', error: 'text-danger', info: 'text-info' }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])

  const show = useCallback<ToastApi['show']>(
    (t, durationMs) => {
      const id = nextId.current++
      setToasts((ts) => [...ts.slice(-3), { ...t, id, dash: isDashboardSurface() }])
      setTimeout(() => dismiss(id), durationMs ?? (t.tone === 'error' ? 7000 : 4500))
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, body) => show({ tone: 'success', title, body }),
      error: (title, body) => show({ tone: 'error', title, body }),
      info: (title, body) => show({ tone: 'info', title, body }),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.tone]
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-[var(--radius-card)] bg-surface px-4 py-3 shadow-[var(--shadow-pop)]"
            >
              <Icon className={cn('mt-0.5 size-[18px] shrink-0', TONES[t.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className={cn('font-medium text-ink', t.dash ? 'text-ui-body' : 'text-sm')}>{t.title}</p>
                {t.body && <div className={cn('mt-0.5 text-ink-muted', t.dash ? 'text-ui-small' : 'text-[13px]')}>{t.body}</div>}
              </div>
              <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="-mr-1 rounded p-0.5 text-ink-faint hover:text-ink">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

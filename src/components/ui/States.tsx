import { AlertTriangle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  body?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {Icon && (
        <span className="mb-4 grid size-11 place-items-center rounded-full bg-subtle text-ink-muted">
          <Icon className="size-5" aria-hidden />
        </span>
      )}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry, retryLabel = 'Try again', className }: { message: string; onRetry?: () => void; retryLabel?: string; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      <span className="mb-3 grid size-10 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-5" aria-hidden />
      </span>
      <p className="max-w-sm text-sm text-ink">{message}</p>
      {onRetry && (
        <Button className="mt-4" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}

export function InlineNotice({ tone = 'info', children, className, icon }: { tone?: 'info' | 'warning' | 'neutral'; children: ReactNode; className?: string; icon?: ReactNode }) {
  const t = { info: 'bg-info-soft text-info', warning: 'bg-warning-soft text-warning', neutral: 'bg-subtle text-ink-muted' }[tone]
  return (
    <div className={cn('flex gap-2.5 rounded-[var(--radius-control)] px-3.5 py-2.5 text-[13px] leading-5', t, className)}>
      {icon}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

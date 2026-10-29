import { AlertCircle, AlertTriangle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useInDashboard } from '@/components/layout/dashboardContext'
import { useI18n } from '@/i18n/LanguageProvider'
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
  // Dashboard (BRIEF section 7): one ink sentence, one muted sentence, at most one action; no icon tile.
  if (useInDashboard()) {
    return (
      <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
        <h3 className="text-ui-body font-medium text-ink">{title}</h3>
        {body && <p className="mt-1 max-w-sm text-ui-body text-ink-muted">{body}</p>}
        {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
      </div>
    )
  }
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {Icon && (
        <span className="mb-4 grid size-11 place-items-center border border-line text-ink-faint" aria-hidden>
          <Icon className="size-5" strokeWidth={1.5} />
        </span>
      )}
      <h3 className="font-display text-xl leading-tight font-normal text-ink">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry, retryLabel, className }: { message: string; onRetry?: () => void; retryLabel?: string; className?: string }) {
  const { t } = useI18n()
  const retry = retryLabel ?? t('common.retry')
  // Dashboard: the failure stays inside its block; danger colour on the 16px icon only, the retry is a quiet text button.
  if (useInDashboard()) {
    return (
      <div role="alert" className={cn('flex flex-col items-center px-6 py-8 text-center', className)}>
        <AlertCircle className="mb-2 size-4 text-danger" aria-hidden />
        <p className="max-w-sm text-ui-body text-ink">{message}</p>
        {onRetry && (
          <Button className="mt-2 underline underline-offset-2" variant="ghost" size="sm" onClick={onRetry}>
            {retry}
          </Button>
        )}
      </div>
    )
  }
  return (
    <div role="alert" className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      <AlertTriangle className="mb-3 size-5 text-danger" aria-hidden />
      <p className="max-w-sm text-sm text-ink">{message}</p>
      {onRetry && (
        <Button className="mt-4" size="sm" onClick={onRetry}>
          {retry}
        </Button>
      )}
    </div>
  )
}

export function InlineNotice({ tone = 'info', children, className, icon }: { tone?: 'info' | 'warning' | 'neutral'; children: ReactNode; className?: string; icon?: ReactNode }) {
  const dash = useInDashboard()
  const t = { info: 'bg-info-soft text-info', warning: 'bg-warning-soft text-warning', neutral: 'bg-subtle text-ink-muted' }[tone]
  return (
    <div className={cn('flex gap-2.5 rounded-[var(--radius-control)] px-3.5 py-2.5', dash ? 'text-ui-small' : 'text-[13px] leading-5', t, className)}>
      {icon}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

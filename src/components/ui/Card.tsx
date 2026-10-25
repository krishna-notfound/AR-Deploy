import type { HTMLAttributes, ReactNode } from 'react'
import { useInDashboard } from '@/components/layout/dashboardContext'
import { cn } from '@/lib/cn'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]', className)} {...rest} />
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  // Dashboard (BRIEF sections 1 and 2): 24px padding, Inter 16/600 title, 13px muted description.
  const dash = useInDashboard()
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', dash ? 'px-6 pt-6 pb-4' : 'px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h2 className={cn('font-semibold text-ink', dash ? 'text-ui-card' : 'text-[15px]')}>{title}</h2>
        {description && <p className={cn('text-ink-muted', dash ? 'mt-1 text-ui-small' : 'mt-0.5 text-[13px]')}>{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const dash = useInDashboard()
  return <div className={cn(dash ? 'px-6 pb-6' : 'px-5 pb-5', className)} {...rest} />
}

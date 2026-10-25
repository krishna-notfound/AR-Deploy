import type { ReactNode } from 'react'
import type { AssetStatus, BusinessStatus, ProductStatus } from '@/domain/types'
import { useInDashboard } from '@/components/layout/dashboardContext'
import { cn } from '@/lib/cn'

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

const tones: Record<Tone, string> = {
  neutral: 'bg-subtle text-ink-muted',
  accent: 'bg-accent-soft text-accent-ink',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
}

// In the dashboard (BRIEF section 5) a pill is 20px tall, sentence case, with dark ink on a pale tint; neutral is ink-body on subtle.
const dashboardTones: Record<Tone, string> = { ...tones, neutral: 'bg-subtle text-ink-body' }

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  const inDashboard = useInDashboard()
  return (
    <span
      className={cn(
        inDashboard
          ? 'inline-flex h-5 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-[12px] leading-5 font-medium tracking-normal whitespace-nowrap normal-case tabular-nums'
          : 'inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-[3px] text-[11px] leading-4 font-medium tracking-[0.06em] whitespace-nowrap uppercase',
        // A caller that passes its own background (the Owner role pill) replaces the tone; same-property utilities otherwise resolve by stylesheet order.
        inDashboard ? (className?.includes('bg-') ? undefined : dashboardTones[tone]) : tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

const productTone: Record<ProductStatus, Tone> = { published: 'success', draft: 'neutral' }
const productLabel: Record<ProductStatus, string> = { published: 'Published', draft: 'Draft' }
export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return (
    <Badge tone={productTone[status]} dot>
      {productLabel[status]}
    </Badge>
  )
}

const businessTone: Record<BusinessStatus, Tone> = { active: 'success', inactive: 'warning', draft: 'neutral' }
const businessLabel: Record<BusinessStatus, string> = { active: 'Active', inactive: 'Inactive', draft: 'Draft' }
export function BusinessStatusBadge({ status }: { status: BusinessStatus }) {
  return (
    <Badge tone={businessTone[status]} dot>
      {businessLabel[status]}
    </Badge>
  )
}

const assetTone: Record<AssetStatus, Tone> = { valid: 'success', invalid: 'danger', missing: 'warning', 'session-only': 'info' }
const assetLabel: Record<AssetStatus, string> = { valid: 'Linked', invalid: 'Invalid', missing: 'Missing', 'session-only': 'This session only' }
export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  return <Badge tone={assetTone[status]}>{assetLabel[status]}</Badge>
}

export function SampleDataTag({ className }: { className?: string }) {
  return (
    <Badge tone="info" className={className}>
      Sample data
    </Badge>
  )
}

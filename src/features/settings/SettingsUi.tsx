import { type ReactNode, useId } from 'react'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { cn } from '@/lib/cn'

/** A settings section's title (the page's h1) and one muted line under it. */
export function SectionHeader({ title, description }: { title: string; description?: ReactNode }) {
  useDocumentTitle(`${title} · Settings`)
  return (
    <header className="mb-8">
      <h1 className="font-display text-[length:var(--text-ui-h1)] leading-[1.15] font-medium tracking-[-0.01em] break-words text-ink">{title}</h1>
      {description && <p className="mt-1.5 max-w-2xl text-ui-sub text-ink-muted">{description}</p>}
    </header>
  )
}

/** One group of settings: a titled card (Inter 16/600), optionally in the danger tone for irreversible actions. */
export function SettingsCard({
  title,
  description,
  children,
  tone,
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  tone?: 'danger'
}) {
  const id = useId()
  return (
    <Card role="region" aria-labelledby={id} className={cn(tone === 'danger' && 'border border-danger/40')}>
      <div className="px-6 pt-6 pb-4">
        <h2 id={id} className={cn('text-ui-card font-semibold', tone === 'danger' ? 'text-danger' : 'text-ink')}>
          {title}
        </h2>
        {description && <p className="mt-1 text-ui-small text-ink-muted">{description}</p>}
      </div>
      <CardBody>{children}</CardBody>
    </Card>
  )
}

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function PublicMessage({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-subtle text-ink-muted">
        <Icon className="size-5" aria-hidden />
      </span>
      <h1 className="mt-5 text-title">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-ink-muted">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

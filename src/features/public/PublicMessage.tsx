import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Empty, not-found and paused states of the public pages: a line icon in a hairline square, a serif title, one line. */
export function PublicMessage({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <span className="grid size-12 place-items-center rounded-[2px] border border-line bg-surface">
        <Icon className="size-5 text-ink-muted" strokeWidth={1.4} aria-hidden />
      </span>
      <h1 className="mt-6 text-title">{title}</h1>
      <p className="mt-3 text-[14px] leading-6 text-ink-muted">{body}</p>
      {action && <div className="mt-8">{action}</div>}
    </div>
  )
}

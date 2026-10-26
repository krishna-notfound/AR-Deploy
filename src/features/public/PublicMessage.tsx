import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Empty, not-found and paused states of the public pages: a line icon on a soft tone disc, a serif title, one line. */
export function PublicMessage({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-subtle">
        <Icon className="size-5 text-ink-body" strokeWidth={1.4} aria-hidden />
      </span>
      <h1 className="mt-6 text-title">{title}</h1>
      <p className="mt-3 text-body-public text-ink-body">{body}</p>
      {action && <div className="mt-8">{action}</div>}
    </div>
  )
}

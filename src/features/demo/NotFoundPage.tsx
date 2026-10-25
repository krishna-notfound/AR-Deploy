import { Compass } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { useDocumentTitle } from '@/components/layout/PageHeader'

export default function NotFoundPage({ inShell }: { inShell?: boolean }) {
  useDocumentTitle('Page not found')
  return (
    <div className={inShell ? 'py-16' : 'grid min-h-dvh place-items-center bg-canvas p-6'}>
      <div className="mx-auto max-w-sm text-center">
        <span className="mx-auto mb-4 grid size-11 place-items-center border border-line text-ink-faint" aria-hidden>
          <Compass className="size-5" strokeWidth={1.5} />
        </span>
        {/* In the dashboard shell: no small uppercase text (ADR-0031); the public 404 keeps its eyebrow. */}
        <p className={inShell ? 'mb-2 text-[length:var(--text-ui-small)] font-medium text-ink-muted' : 'mb-2 text-[11px] font-medium tracking-[0.18em] text-accent-ink uppercase'}>Error 404</p>
        <h1 className="font-display text-[2rem] leading-tight font-normal">Page not found</h1>
        <p className="mt-1 text-sm text-ink-muted">The page you are looking for does not exist, or the item was deleted.</p>
        <ButtonLink to="/" variant="primary" className="mt-5">
          Go to the home page
        </ButtonLink>
      </div>
    </div>
  )
}

import { Compass } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { useDocumentTitle } from '@/components/layout/PageHeader'

export default function NotFoundPage({ inShell }: { inShell?: boolean }) {
  useDocumentTitle('Page not found')
  return (
    <div className={inShell ? 'py-16' : 'grid min-h-dvh place-items-center bg-canvas p-6'}>
      <div className="mx-auto max-w-sm text-center">
        <span className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-subtle text-ink-muted">
          <Compass className="size-5" aria-hidden />
        </span>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-ink-muted">The page you are looking for does not exist, or the item was deleted.</p>
        <ButtonLink to="/" variant="primary" className="mt-5">
          Go to the home page
        </ButtonLink>
      </div>
    </div>
  )
}

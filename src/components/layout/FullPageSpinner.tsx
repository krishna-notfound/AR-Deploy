import { Loader2 } from 'lucide-react'

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status">
      <Loader2 className="size-6 animate-spin text-ink-faint" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  )
}

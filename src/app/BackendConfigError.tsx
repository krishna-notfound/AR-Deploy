import { Wrench } from 'lucide-react'

/**
 * Shown instead of the app when VITE_DATA_MODE asks for Supabase but the configuration is incomplete,
 * so a broken setup is never mistaken for working (or demo) data.
 */
export function BackendConfigError({ problem }: { problem: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-6">
      <div className="max-w-lg">
        <span className="grid size-11 place-items-center rounded-full bg-warning-soft text-warning">
          <Wrench className="size-5" aria-hidden />
        </span>
        <h1 className="mt-5 text-title font-normal">The backend is not configured</h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-ink">
          {problem}
        </p>
        <p className="mt-4 text-sm leading-6 text-ink-muted">
          Set the variables in <code className="rounded bg-subtle px-1 py-0.5 text-[13px]">.env.local</code> and restart the dev server. To explore without a
          backend, remove <code className="rounded bg-subtle px-1 py-0.5 text-[13px]">VITE_DATA_MODE</code> or set it to{' '}
          <code className="rounded bg-subtle px-1 py-0.5 text-[13px]">demo</code>. See System_arch/design/19-supabase.md.
        </p>
      </div>
    </main>
  )
}

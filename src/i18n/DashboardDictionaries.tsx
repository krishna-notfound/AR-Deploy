import { type ReactNode, Suspense, useEffect, useReducer, useState } from 'react'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { dashboardReady, loadDashboardDictionaries } from './dashboardLoader'
import { useI18n } from './LanguageProvider'

function Pending() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8">
      <PageSkeleton />
    </div>
  )
}

/**
 * Wraps a dashboard route: renders its children only once the dashboard text for the current language is loaded, so a dashboard
 * screen never shows a raw key (ADR-0045). Shows the page skeleton meanwhile. `alongside` starts another download (the lazy
 * dashboard frame) at the same time instead of after the text. A failed download (offline, or an old chunk after a new
 * deployment) goes to the route's error page, which offers a reload.
 */
export function DashboardDictionaries({ children, alongside }: { children: ReactNode; alongside?: () => Promise<unknown> }) {
  const { lang } = useI18n()
  const ready = dashboardReady(lang)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [failure, setFailure] = useState<unknown>(null)

  useEffect(() => {
    if (ready) return
    let live = true
    alongside?.().catch(() => {}) // a failure shows when the frame itself renders
    loadDashboardDictionaries(lang).then(
      () => live && rerender(),
      (error: unknown) => live && setFailure(error ?? new Error('The dashboard text could not load.')),
    )
    return () => {
      live = false
    }
  }, [lang, ready, alongside])

  if (failure) throw failure
  if (!ready) return <Pending />
  return <Suspense fallback={<Pending />}>{children}</Suspense>
}

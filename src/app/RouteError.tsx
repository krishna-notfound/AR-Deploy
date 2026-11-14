import { useEffect } from 'react'
import { useRouteError } from 'react-router'
import { useI18n } from '@/i18n/LanguageProvider'

// Shown instead of React Router's built-in error page when a page fails to render or its code can't load
// (e.g. an old chunk after a new deployment). It speaks the language the person chose (the app-wide LanguageProvider sits
// above the router). `shell`: used as a route boundary inside a dashboard layout, so a crash in one page leaves the sidebar
// and header in place and only the page area shows this; without it, it fills the screen.
export function RouteError({ shell = false }: { shell?: boolean }) {
  const { t } = useI18n()
  const error = useRouteError()
  useEffect(() => {
    if (import.meta.env.DEV) console.error('[route error]', error)
  }, [error])
  return (
    <main role="alert" className={shell ? 'flex flex-col items-center gap-4 px-6 py-20 text-center' : 'flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center'}>
      <h1 className="text-title font-normal">{t('common.errorTitle')}</h1>
      <p className="max-w-sm text-sm text-ink-muted">{t('common.errorPage.body')}</p>
      <button type="button" onClick={() => window.location.reload()} className="rounded-[var(--radius-control)] bg-ink px-4 py-2 text-sm font-medium text-canvas">
        {t('common.errorPage.reload')}
      </button>
    </main>
  )
}

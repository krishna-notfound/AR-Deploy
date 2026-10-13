// Shown instead of React Router's built-in error page when a page fails to render or its code can't load
// (e.g. an old chunk after a new deployment). Renders outside every provider, so it picks EN/PT itself.
const PT = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('pt')

export function RouteError() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <h1 className="text-title font-normal">{PT ? 'Ocorreu um erro' : 'Something went wrong'}</h1>
      <p className="max-w-sm text-sm text-ink-muted">
        {PT ? 'A página não carregou. Recarregue para tentar novamente.' : 'This page could not load. Reload to try again.'}
      </p>
      <button type="button" onClick={() => window.location.reload()} className="rounded-[var(--radius-control)] bg-ink px-4 py-2 text-sm font-medium text-canvas">
        {PT ? 'Recarregar' : 'Reload'}
      </button>
    </main>
  )
}

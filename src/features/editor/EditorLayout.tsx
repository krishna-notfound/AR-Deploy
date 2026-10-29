import { AlertTriangle, Eye, History, Loader2 } from 'lucide-react'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useBlocker, useLocation, useNavigate } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { EDITOR_PATH, editorApplyPath, editorPagesPath, editorPreviewPath, editorSocialPath } from '@/lib/urls'
import { useFormat } from '@/lib/useFormat'
import { EditorContext } from './EditorContext'
import { EditorAreaSkeleton, EditorSkeleton } from './EditorSkeleton'
import { HistoryDialog } from './HistoryDialog'
import { PublishDialog } from './PublishDialog'
import { describeProblems } from './problems'
import { preloadEditorScreens } from './preload'
import { type DraftEditor, useDraftEditor } from './useDraftEditor'

// The layout's chunk has just run: fetch the screens it renders in parallel instead of after the draft arrives.
preloadEditorScreens()

const MENU: { to: string; key: TranslationKey }[] = [
  { to: editorPagesPath(), key: 'editor.menu.pages' },
  { to: editorApplyPath(), key: 'editor.menu.apply' },
  { to: editorSocialPath(), key: 'editor.menu.social' },
]

/** Navigation inside the Editor stays in the same working copy; the preview route is a different screen. */
const staysInEditor = (path: string) => path.startsWith(EDITOR_PATH) && !path.startsWith(`${EDITOR_PATH}/preview`)

/** Which preview the Preview button opens for the screen being edited. */
function previewTarget(pathname: string): string {
  const page = /^\/admin\/editor\/pages\/([^/]+)$/.exec(pathname)
  if (page) return `page/${page[1]}`
  if (pathname.startsWith(`${EDITOR_PATH}/apply`)) return 'apply'
  return 'footer'
}

/** The Editor (spec 8): a list of sections, the top bar (save status, Preview, History, Publish) and the active screen. */
export default function EditorLayout() {
  const editor = useDraftEditor()
  const { t } = useI18n()
  if (editor.load.status === 'loading') return <EditorSkeleton />
  if (editor.load.status === 'error')
    return (
      <>
        <PageHeader title={t('editor.title')} description={t('editor.description')} />
        <ErrorState message={errorText(editor.load.error, t)} onRetry={() => void editor.reload()} retryLabel={t('common.retry')} />
      </>
    )
  return (
    <EditorContext.Provider value={editor}>
      <EditorFrame editor={editor} />
    </EditorContext.Provider>
  )
}

function EditorFrame({ editor }: { editor: DraftEditor }) {
  const { t, tn } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [publishing, setPublishing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { flush, dirty, save } = editor

  // Leaving with something unsaved: save first; ask only if that fails.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !staysInEditor(nextLocation.pathname) && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    void (async () => {
      if (await flush()) return blocker.proceed()
      const leave = await confirm({ title: t('editor.leave.title'), body: t('editor.leave.body'), confirmLabel: t('editor.leave.confirm'), destructive: true })
      if (leave) blocker.proceed()
      else blocker.reset()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const problems = useMemo(() => describeProblems(editor.errors, editor.draft, t), [editor.errors, editor.draft, t])
  const preview = async () => {
    if (await flush()) navigate(editorPreviewPath(previewTarget(pathname)))
    else toast.error(t('editor.preview.notSaved'))
  }

  return (
    <>
      <PageHeader title={t('editor.title')} description={t('editor.description')} />

      <div
        role="toolbar"
        aria-label={t('editor.toolbar')}
        className="sticky top-0 z-20 -mx-1 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-canvas px-1 py-3"
      >
        <SaveStatus editor={editor} />
        <p className="text-ui-small text-ink-muted">
          <PublishedLine editor={editor} />
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" icon={<Eye className="size-4" aria-hidden />} onClick={() => void preview()}>
            {t('editor.preview')}
          </Button>
          <Button size="sm" icon={<History className="size-4" aria-hidden />} onClick={() => setHistoryOpen(true)}>
            {t('editor.history')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!editor.hasChanges || problems.length > 0}
            title={!editor.hasChanges ? t('editor.publish.noChanges') : undefined}
            onClick={() => void (async () => (await flush()) ? setPublishing(true) : toast.error(t('editor.preview.notSaved')))()}
          >
            {editor.hasChanges ? t('editor.publish') : t('editor.publish.noChanges')}
          </Button>
        </div>
      </div>

      {save.state === 'conflict' && (
        <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 border border-warning/40 bg-warning-soft px-4 py-3 text-ui-body text-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{t('editor.conflict.banner')}</span>
          <Button size="sm" onClick={() => void editor.reload()}>
            {t('editor.conflict.reload')}
          </Button>
        </div>
      )}
      {notice && (
        <p role="status" className="mb-6 border border-line-strong bg-subtle px-4 py-3 text-ui-body text-ink">
          {notice}
        </p>
      )}
      {problems.length > 0 && (
        <details className="mb-6 border border-danger/40 bg-surface px-4 py-3 text-ui-body">
          <summary className="cursor-pointer font-medium text-danger">{tn('editor.problems', problems.length)}</summary>
          <ul className="mt-3 space-y-1.5">
            {problems.map((p) => (
              <li key={p.path}>
                <Link to={p.to} className="underline underline-offset-2 hover:text-accent-ink">
                  {p.where}
                </Link>
                <span className="text-ink-muted">: {p.what}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
        <nav aria-label={t('editor.menu.label')} className="mb-6 flex gap-1 overflow-x-auto border-b border-line lg:mb-0 lg:flex-col lg:self-start lg:border-b-0">
          {MENU.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center whitespace-nowrap px-3 text-ui-body transition-colors lg:min-h-10',
                  isActive ? 'font-medium text-ink max-lg:border-b-2 max-lg:border-ink lg:bg-subtle' : 'text-ink-muted hover:text-ink lg:hover:bg-subtle',
                )
              }
            >
              {t(m.key)}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          <Suspense
            fallback={
              <div role="status" aria-label={t('common.loading')}>
                <EditorAreaSkeleton />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </div>

      {publishing && <PublishDialog editor={editor} onClose={() => setPublishing(false)} />}
      {historyOpen && (
        <HistoryDialog
          editor={editor}
          onClose={() => setHistoryOpen(false)}
          onRestored={(n) => {
            setNotice(t('editor.history.restored', { n }))
            navigate(editorPagesPath())
          }}
        />
      )}
    </>
  )
}

function SaveStatus({ editor }: { editor: DraftEditor }) {
  const { t } = useI18n()
  const format = useFormat()
  const { save } = editor
  let text: string
  switch (save.state) {
    case 'saving':
      text = t('common.saving')
      break
    case 'pending':
      text = t('editor.save.pending')
      break
    case 'failed':
      text = t('editor.save.failed')
      break
    case 'conflict':
      text = t('editor.save.conflict')
      break
    default:
      text = save.savedAt ? t('editor.save.saved', { time: format.time(save.savedAt) }) : t('editor.save.upToDate')
  }
  return (
    <p role="status" aria-label={t('editor.save.label')} className={cn('flex items-center gap-2 text-ui-small', save.state === 'failed' || save.state === 'conflict' ? 'text-danger' : 'text-ink-muted')}>
      {save.state === 'saving' && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      <span>{text}</span>
      {save.state === 'failed' && (
        <Button size="sm" variant="ghost" className="underline underline-offset-2" onClick={() => void editor.flush()}>
          {t('common.retry')}
        </Button>
      )}
    </p>
  )
}

function PublishedLine({ editor }: { editor: DraftEditor }) {
  const { t } = useI18n()
  return <>{editor.version > 0 ? t('editor.published.version', { n: editor.version }) : t('editor.published.never')}</>
}

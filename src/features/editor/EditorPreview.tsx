import { ArrowLeft } from 'lucide-react'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { SegmentedControl } from '@/components/ui/Form'
import { ErrorState } from '@/components/ui/States'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { editorApplyPath, editorPagePath, editorPagesPath } from '@/lib/urls'
import { useContentDraft } from '@/services/contentHooks'
import CustomPage from '../legal/CustomPage'
import LegalPage from '../legal/LegalPage'
import { SiteFooter } from '../marketing/SiteChrome'
import { SiteContentProvider } from '../marketing/SiteContentProvider'
import { PREVIEW_REFERENCE, guardApplicationSubmit } from './previewGuard'

const ApplyPage = lazy(() => import('@/features/apply/ApplyPage'))

type Target = { kind: 'page'; key: string } | { kind: 'apply' } | { kind: 'apply-done' } | { kind: 'footer' } | { kind: 'unknown' }

function parseTarget(rest: string): Target {
  const parts = rest.split('/').filter(Boolean)
  if (parts[0] === 'page' && parts[1]) return { kind: 'page', key: decodeURIComponent(parts[1]) }
  if (parts[0] === 'apply') return parts[1] === 'done' ? { kind: 'apply-done' } : { kind: 'apply' }
  if (parts[0] === 'footer') return { kind: 'footer' }
  return { kind: 'unknown' }
}

/**
 * /admin/editor/preview/...: the real public components (Terms or Privacy, a custom page, the application form, the footer)
 * inside a provider whose source is the saved draft, under a bar that says so. The Editor saves before it opens this, and
 * nothing here writes: the application form cannot send (previewGuard).
 */
export default function EditorPreview() {
  const rest = useParams()['*'] ?? ''
  const target = parseTarget(rest)
  const { t, lang, setLang } = useI18n()
  const [phone, setPhone] = useState(false)

  // The preview borrows the app-wide language switch; leaving it puts the person's own choice back.
  const originalLang = useRef(lang)
  useEffect(() => () => setLang(originalLang.current), [setLang])
  const sendsNothing = target.kind === 'apply' || target.kind === 'apply-done'
  useEffect(() => (sendsNothing ? guardApplicationSubmit() : undefined), [sendsNothing])

  const back = target.kind === 'page' ? editorPagePath(target.key) : target.kind === 'apply' || target.kind === 'apply-done' ? editorApplyPath() : editorPagesPath()

  return (
    <SiteContentProvider source="draft">
      <div className={cn('min-h-dvh pb-20', phone && 'mx-auto max-w-[390px] border-x border-line-strong')}>
        <Suspense fallback={<FullPageSpinner />}>
          <PreviewBody target={target} />
        </Suspense>
      </div>
      <div
        role="region"
        aria-label={t('editor.preview.bar')}
        className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line-strong bg-surface px-4 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
      >
        <Link to={back} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink hover:text-accent-ink">
          <ArrowLeft className="size-4" aria-hidden />
          {t('editor.preview.back')}
        </Link>
        <p className="text-sm font-medium text-ink">{t('editor.preview.bar')}</p>
        {sendsNothing && <p className="text-[13px] text-ink-muted">{t('editor.preview.sendsNothing')}</p>}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <SegmentedControl
            label={t('nav.language')}
            value={lang}
            onChange={setLang}
            options={[
              { value: 'en', label: 'EN' },
              { value: 'pt', label: 'PT' },
            ]}
          />
          <SegmentedControl
            label={t('editor.preview.width')}
            value={phone ? 'phone' : 'desktop'}
            onChange={(v) => setPhone(v === 'phone')}
            options={[
              { value: 'desktop', label: t('editor.preview.desktop') },
              { value: 'phone', label: t('editor.preview.phone') },
            ]}
          />
        </div>
      </div>
    </SiteContentProvider>
  )
}

function PreviewBody({ target }: { target: Target }) {
  const { t } = useI18n()
  const location = useLocation()
  const draft = useContentDraft()

  switch (target.kind) {
    case 'page': {
      if (target.key === 'terms' || target.key === 'privacy') return <LegalPage doc={target.key} />
      if (draft.status === 'error') return <ErrorState message={errorText(draft.error, t)} onRetry={draft.refetch} retryLabel={t('common.retry')} />
      if (draft.status === 'loading' && !draft.data) return <FullPageSpinner />
      const page = draft.data?.draft.customPages.find((p) => p.id === target.key)
      if (!page?.slug) return <ErrorState message={t(page ? 'editor.preview.noAddress' : 'editor.page.missingBody')} />
      return <CustomPage slug={page.slug} />
    }
    case 'apply':
      return <ApplyPage />
    case 'apply-done': {
      // The page shows its thank-you screen when it arrives with a confirmation; this one is a sample.
      if (!(location.state as { applyDone?: unknown } | null)?.applyDone)
        return <Navigate to={location.pathname} replace state={{ applyDone: { reference: PREVIEW_REFERENCE, email: 'name@example.com' } }} />
      return <ApplyPage />
    }
    case 'footer':
      return (
        <div className="flex min-h-[calc(100dvh-5rem)] flex-col bg-canvas">
          <div className="flex-1" />
          <SiteFooter />
        </div>
      )
    case 'unknown':
      return <Navigate to={editorPagesPath()} replace />
  }
}

import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { CollectionsBlock } from './CollectionsBlock'
import { useEditor } from './EditorContext'
import { HeroPictureBlock } from './HeroPictureBlock'
import { LandingTextsBlock } from './LandingTextsBlock'
import { NoPiecesPrompt, PiecePicker } from './PiecePicker'
import { SectionsBlock } from './SectionsBlock'
import { setExample, setFeatured } from './landingOps'
import { useShowcasePieces } from './useShowcasePieces'

/** One block of the Landing tab: a short title, one line of help, then the choice. */
function Block({ id, title, help, children }: { id: string; title: string; help: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border border-line bg-surface p-4 sm:p-5">
      <h3 id={id} className="text-ui-card font-medium text-ink">
        {title}
      </h3>
      <p className="mt-1 max-w-xl text-ui-small text-ink-muted">{help}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/**
 * /admin/editor/landing: the places of the landing page the admin chooses, in page order (ADR-0047, ADR-0049): the hero
 * picture, the live example of the hero, the 3D card and the collections. Everything is picked from the admin's own showcase pieces.
 */
export default function LandingScreen() {
  const { t } = useI18n()
  const { draft, setDraft, errors } = useEditor()
  const showcase = useShowcasePieces()
  const pieces = showcase.status === 'ready' ? showcase.pieces : []
  const withModel = pieces.filter((p) => p.hasModel)
  const err = (path: string) => {
    const key = errors[path]
    return key ? t(`editor.err.${key}` as Parameters<typeof t>[0]) : undefined
  }
  const refError = (base: string) => err(`${base}.businessSlug`) ?? err(`${base}.productSlug`)

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-ui-card font-medium text-ink">{t('editor.menu.landing')}</h2>
        <p className="mt-1 max-w-xl text-ui-small text-ink-muted">{t('editor.landing.description')}</p>
      </div>

      <Block id="landing-sections-heading" title={t('editor.sections.title')} help={t('editor.sections.help')}>
        <SectionsBlock />
      </Block>

      <Block id="landing-hero-heading" title={t('editor.landing.hero.title')} help={t('editor.landing.hero.help')}>
        <HeroPictureBlock />
      </Block>

      {showcase.status === 'error' && <ErrorState message={errorText(showcase.error, t)} onRetry={showcase.retry} retryLabel={t('common.retry')} />}

      {showcase.status === 'loading' && (
        <div role="status" aria-label={t('common.loading')} className="space-y-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {showcase.status === 'ready' && (
        <>
          <Block id="landing-example-heading" title={t('editor.landing.example.title')} help={t('editor.landing.example.help')}>
            {pieces.length === 0 ? (
              <NoPiecesPrompt />
            ) : (
              <>
                <PiecePicker
                  label={t('editor.landing.example.title')}
                  pieces={pieces}
                  value={draft.landing.example}
                  noneLabel={t('editor.landing.automatic')}
                  onChange={(ref) => setDraft((d) => setExample(d, ref))}
                />
                {refError('landing.example') && (
                  <p role="alert" className="mt-2 text-ui-small text-danger">
                    {refError('landing.example')}
                  </p>
                )}
              </>
            )}
          </Block>

          <Block id="landing-3d-heading" title={t('editor.landing.card3d.title')} help={t('editor.landing.card3d.help')}>
            {pieces.length === 0 ? (
              <NoPiecesPrompt />
            ) : withModel.length === 0 ? (
              <p className="border border-dashed border-line-strong bg-subtle px-4 py-3 text-ui-body text-ink-muted">{t('editor.landing.card3d.none')}</p>
            ) : (
              <>
                <PiecePicker
                  label={t('editor.landing.card3d.title')}
                  pieces={withModel}
                  value={draft.landing.featured}
                  noneLabel={t('editor.landing.automatic')}
                  onChange={(ref) => setDraft((d) => setFeatured(d, ref))}
                />
                {refError('landing.featured') && (
                  <p role="alert" className="mt-2 text-ui-small text-danger">
                    {refError('landing.featured')}
                  </p>
                )}
              </>
            )}
          </Block>

          <CollectionsBlock pieces={pieces} />
        </>
      )}

      <Block id="landing-texts-heading" title={t('editor.landing.texts.title')} help={t('editor.landing.texts.help')}>
        <LandingTextsBlock />
      </Block>

      <p className="text-ui-small text-ink-muted">{t('editor.landing.previewHint')}</p>
    </div>
  )
}

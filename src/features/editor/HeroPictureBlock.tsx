// The Landing tab's first block (ADR-0049): the hero's own picture, an optional 3D model that opens in place behind a small
// "3D" button, and the description (alt text and caption). Edits go through landingOps so an emptied hero is dropped.
import { Box, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { MAX_HERO_ALT } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { siteAssetUrl } from '@/services'
import { useEditor } from './EditorContext'
import { UploadButton } from './UploadButton'
import { setHeroAlt, setHeroImage, setHeroModel } from './landingOps'

const BUILTIN = '/images/sanctus/v2/hero-living.webp'

export function HeroPictureBlock() {
  const { t } = useI18n()
  const { draft, setDraft, errors } = useEditor()
  const hero = draft.landing.hero
  const err = (path: string) => {
    const key = errors[`landing.hero.${path}`]
    return key ? t(`editor.err.${key}` as TranslationKey) : undefined
  }
  const uploaded = hero?.image ? siteAssetUrl(hero.image) : ''
  const sessionOnly = !!hero?.image && !uploaded
  const modelName = hero?.model?.glb.path.split('/').pop()

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <fieldset className="min-w-0">
        <legend className="text-ui-small font-medium text-ink">{t('editor.landing.hero.picture')}</legend>
        <div className="mt-2 aspect-video w-full overflow-hidden border border-line bg-subtle">
          {sessionOnly ? (
            <span className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center text-ui-small text-ink-muted">
              <ImageIcon className="size-5" aria-hidden />
              {t('editor.showcase.sessionOnly')}
            </span>
          ) : (
            <img src={uploaded || BUILTIN} alt={t('editor.landing.hero.pictureCurrent')} className="size-full object-cover" />
          )}
        </div>
        {!hero?.image && <p className="mt-2 text-ui-small text-ink-muted">{t('editor.landing.hero.builtin')}</p>}
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <UploadButton
            kind="image"
            label={t(hero?.image ? 'editor.showcase.replacePicture' : 'editor.showcase.uploadPicture')}
            onUploaded={(asset) => setDraft((d) => setHeroImage(d, asset))}
          />
          {hero?.image && (
            <Button size="sm" aria-label={`${t('editor.showcase.remove')}: ${t('editor.landing.hero.picture')}`} onClick={() => setDraft((d) => setHeroImage(d, undefined))}>
              {t('editor.showcase.remove')}
            </Button>
          )}
        </div>
        <p className="mt-1 text-ui-small text-ink-muted">{t('editor.showcase.pictureHint')}</p>
        {err('image') && (
          <p role="alert" className="mt-2 text-ui-small text-danger">
            {err('image')}
          </p>
        )}
      </fieldset>

      <div className="min-w-0 space-y-6">
        <fieldset className="min-w-0">
          <legend className="text-ui-small font-medium text-ink">{t('editor.landing.hero.model')}</legend>
          <p className="mt-0.5 max-w-xl text-ui-small text-ink-muted">{t('editor.landing.hero.modelHelp')}</p>
          <div className="mt-3 flex min-h-11 items-center gap-3 border border-line bg-subtle px-3 py-2 text-ui-small text-ink-muted">
            <Box className="size-4 shrink-0 text-accent-ink" aria-hidden />
            <span className="min-w-0 truncate">{modelName ? t('editor.landing.hero.modelFile', { name: modelName }) : t('editor.landing.hero.modelNone')}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-start gap-2">
            <UploadButton
              kind="glb"
              label={t(hero?.model ? 'editor.landing.hero.replaceModel' : 'editor.landing.hero.uploadModel')}
              onUploaded={(asset) => setDraft((d) => setHeroModel(d, asset))}
            />
            {hero?.model && (
              <Button size="sm" aria-label={`${t('editor.showcase.remove')}: ${t('editor.landing.hero.model')}`} onClick={() => setDraft((d) => setHeroModel(d, undefined))}>
                {t('editor.showcase.remove')}
              </Button>
            )}
          </div>
          {err('model.glb') && (
            <p role="alert" className="mt-2 text-ui-small text-danger">
              {err('model.glb')}
            </p>
          )}
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="text-ui-small font-medium text-ink">{t('editor.landing.hero.alt')}</legend>
          <p className="mt-0.5 max-w-xl text-ui-small text-ink-muted">{t('editor.landing.hero.altHelp')}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <FormField label={t('editor.landing.hero.altEn')} error={err('alt.en')} hint={t('editor.landing.textHint', { max: MAX_HERO_ALT })}>
              <Input value={hero?.alt?.en ?? ''} maxLength={MAX_HERO_ALT} onChange={(e) => setDraft((d) => setHeroAlt(d, 'en', e.target.value))} />
            </FormField>
            <FormField label={t('editor.landing.hero.altPt')} optional={t('common.optional')} error={err('alt.pt')} hint={t('editor.landing.ptHint')}>
              <Input value={hero?.alt?.pt ?? ''} maxLength={MAX_HERO_ALT} onChange={(e) => setDraft((d) => setHeroAlt(d, 'pt', e.target.value))} />
            </FormField>
          </div>
        </fieldset>
      </div>
    </div>
  )
}

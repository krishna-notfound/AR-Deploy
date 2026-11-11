// The Site tab's "Catalogue banner" panel (ADR-0065): the platform's default picture at the top of every catalogue whose company has
// not set its own. Upload, Edit picture and Remove go through the same buttons as the other website pictures (cropped to 2:1 on upload,
// original kept); it is part of the draft and goes live with Publish.
import { ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { imageFrame } from '@/lib/imageFrames'
import { siteAssetUrl } from '@/services'
import { CATALOG_PHOTO } from '../public/catalogBanner'
import { EditPictureButton } from './EditPictureButton'
import { useEditor } from './EditorContext'
import { UploadButton } from './UploadButton'
import { setCatalogBanner } from './siteOps'

const shape = imageFrame('catalogBanner')

export function CatalogBannerBlock() {
  const { t } = useI18n()
  const { draft, setDraft, errors } = useEditor()
  const banner = draft.chrome?.catalogBanner
  const url = banner ? siteAssetUrl(banner) : ''
  const sessionOnly = !!banner && !url
  const error = Object.entries(errors).find(([path]) => path.startsWith('chrome.catalogBanner'))?.[1]

  return (
    <section aria-labelledby="site-banner-heading" className="border border-line bg-surface p-4 sm:p-5">
      <h3 id="site-banner-heading" className="text-ui-card font-medium text-ink">
        {t('editor.site.banner.title')}
      </h3>
      <p className="mt-1 max-w-xl text-ui-small text-ink-muted">{t('editor.site.banner.help')}</p>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className={cn('w-full overflow-hidden border border-line bg-subtle', shape.aspectClass)}>
            {sessionOnly ? (
              <span className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center text-ui-small text-ink-muted">
                <ImageIcon className="size-5" aria-hidden />
                {t('editor.showcase.sessionOnly')}
              </span>
            ) : (
              <img src={url || CATALOG_PHOTO} alt={t('editor.site.banner.current')} className={cn('size-full', shape.fitClass)} />
            )}
          </div>
          {!banner && <p className="mt-2 text-ui-small text-ink-muted">{t('editor.site.banner.builtin')}</p>}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start gap-2">
            <UploadButton
              kind="image"
              frame="catalogBanner"
              label={t(banner ? 'editor.showcase.replacePicture' : 'editor.showcase.uploadPicture')}
              onUploaded={(asset) => setDraft((d) => setCatalogBanner(d, asset))}
            />
            {banner && !sessionOnly && (
              <EditPictureButton image={banner} frame="catalogBanner" label={t('editor.crop.editFor', { name: t('editor.site.banner.title') })} onEdited={(asset) => setDraft((d) => setCatalogBanner(d, asset))} />
            )}
            {banner && (
              <Button size="sm" aria-label={`${t('editor.showcase.remove')}: ${t('editor.site.banner.current')}`} onClick={() => setDraft((d) => setCatalogBanner(d, undefined))}>
                {t('editor.showcase.remove')}
              </Button>
            )}
          </div>
          <p className="mt-2 text-ui-small text-ink-muted">{t('editor.site.banner.hint')}</p>
          <p className="mt-1 text-ui-small text-ink-muted">
            {t('editor.crop.hint')} {t('editor.crop.bannerNote')}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-ui-small text-danger">
              {t(`editor.err.${error}` as TranslationKey)}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

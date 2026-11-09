// /admin/editor/site: settings of the whole website. For now the site icon (favicon), ADR-0053.
import { ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SITE_ASSET_MAX_BYTES } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import type { Vars } from '@/i18n/translate'
import { siteAssetUrl } from '@/services'
import { useEditor } from './EditorContext'
import { UploadButton } from './UploadButton'
import { setFavicon } from './siteOps'

export const FAVICON_MIN_PIXELS = 32
const PREVIEW_SIZES = [16, 32, 180] as const

type T = (key: TranslationKey, vars?: Vars) => string

/**
 * A sentence when the picture cannot be a site icon (not readable, not square, under 32 px), else null. Browsers that cannot
 * measure a picture without showing it (no createImageBitmap) skip the check; the file type and size are still held by the upload.
 */
export async function faviconRefusal(file: Pick<File, 'size' | 'type'> & Blob, t: T): Promise<string | null> {
  if (typeof createImageBitmap !== 'function' || file.type !== 'image/png' || file.size > SITE_ASSET_MAX_BYTES.favicon) return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return t('editor.site.favicon.unreadable')
  }
  const { width: w, height: h } = bitmap
  bitmap.close?.()
  if (w !== h) return t('editor.site.favicon.notSquare', { w, h })
  if (w < FAVICON_MIN_PIXELS) return t('editor.site.favicon.tooSmall', { min: FAVICON_MIN_PIXELS })
  return null
}

export default function SiteScreen() {
  const { t } = useI18n()
  const { draft, setDraft, errors } = useEditor()
  const favicon = draft.chrome?.favicon
  const url = favicon ? siteAssetUrl(favicon) : ''
  const sessionOnly = !!favicon && !url
  const error = errors['chrome.favicon'] ? t(`editor.err.${errors['chrome.favicon']}` as TranslationKey) : undefined

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-ui-card font-medium text-ink">{t('editor.menu.site')}</h2>
        <p className="mt-1 max-w-xl text-ui-small text-ink-muted">{t('editor.site.description')}</p>
      </div>

      <section aria-labelledby="site-favicon-heading" className="border border-line bg-surface p-4 sm:p-5">
        <h3 id="site-favicon-heading" className="text-ui-card font-medium text-ink">
          {t('editor.site.favicon.title')}
        </h3>
        <p className="mt-1 max-w-xl text-ui-small text-ink-muted">{t('editor.site.favicon.help')}</p>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="text-ui-small font-medium text-ink">{t('editor.site.favicon.preview')}</p>
            {sessionOnly ? (
              <span className="mt-2 flex min-h-24 flex-col items-center justify-center gap-2 border border-line bg-subtle px-4 text-center text-ui-small text-ink-muted">
                <ImageIcon className="size-5" aria-hidden />
                {t('editor.showcase.sessionOnly')}
              </span>
            ) : url ? (
              <ul className="mt-2 flex flex-wrap items-end gap-6 border border-line bg-subtle p-4">
                {PREVIEW_SIZES.map((n) => (
                  <li key={n} className="flex flex-col items-center gap-2">
                    <img src={url} alt={`${t('editor.site.favicon.current')}, ${t('editor.site.favicon.size', { n })}`} width={n} height={n} className="block bg-chalk" style={{ width: n, height: n }} />
                    <span className="text-ui-small text-ink-muted">{t('editor.site.favicon.size', { n })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 border border-dashed border-line-strong bg-subtle px-4 py-3 text-ui-body text-ink-muted">{t('editor.site.favicon.builtin')}</p>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-start gap-2">
              <UploadButton
                kind="favicon"
                label={t(favicon ? 'editor.site.favicon.replace' : 'editor.site.favicon.upload')}
                precheck={(file) => faviconRefusal(file, t)}
                onUploaded={(asset) => setDraft((d) => setFavicon(d, asset))}
              />
              {favicon && (
                <Button size="sm" aria-label={`${t('editor.showcase.remove')}: ${t('editor.site.favicon.current')}`} onClick={() => setDraft((d) => setFavicon(d, undefined))}>
                  {t('editor.showcase.remove')}
                </Button>
              )}
            </div>
            <p className="mt-2 text-ui-small text-ink-muted">{t('editor.site.favicon.hint', { min: FAVICON_MIN_PIXELS })}</p>
            {error && (
              <p role="alert" className="mt-2 text-ui-small text-danger">
                {error}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

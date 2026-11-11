import { Crop, Upload, X } from 'lucide-react'
import { useId, useState } from 'react'
import { ImageCropDialog } from '@/components/image/ImageCropDialog'
import type { BusinessBanner, ImageCrop } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { IMAGE_RULES, demoSized, validateImageFile } from '@/lib/files'
import { formatFileSize } from '@/lib/format'
import { editedFile } from '@/lib/imageCrop'
import { imageFrame } from '@/lib/imageFrames'
import { isDemoMode, service } from '@/services'
import { Button } from './Button'
import { SmartImage } from './SmartImage'

/**
 * A company's own catalogue banner (ADR-0065), next to its logo in the company form. Choose a picture, move and zoom it in the
 * crop dialog (2:1), and both the untouched original and the edited copy are uploaded; "Edit picture" reopens the original with
 * the crop it had. "Remove" goes back to the platform's default banner. A banner needs the company's folder in storage, so a
 * company that does not exist yet (`businessId` missing) is told to save first.
 */
export function BannerUpload({ value, onChange, businessId }: { value?: BusinessBanner; onChange: (banner: BusinessBanner | undefined) => void; businessId?: string }) {
  const { t } = useI18n()
  const id = useId()
  const shape = imageFrame('catalogBanner')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** The file chosen and waiting in the crop dialog. */
  const [pending, setPending] = useState<File | null>(null)
  /** Edit picture is open on the current banner's original. */
  const [editing, setEditing] = useState(false)

  if (!businessId) return <p className="text-ui-small text-ink-muted">{t('ui.banner.saveFirst')}</p>

  const onFile = async (file: File) => {
    const check = validateImageFile(file, IMAGE_RULES, t)
    if (!check.ok) return setError(check.message)
    setError(null)
    if (isDemoMode) {
      // Demo pictures are kept as small data URLs: resize first, so the crop is measured on the very file that is kept.
      setBusy(true)
      const small = await demoSized(file, t)
      setBusy(false)
      if (!small.ok) return setError(small.message)
      return setPending(small.file)
    }
    setPending(file)
  }

  /** Uploads the untouched original and the edited copy of a newly chosen picture, then hands both over. Nothing is kept if either fails. */
  const saveNew = async (file: File, result: { blob: Blob; crop: ImageCrop }) => {
    setBusy(true)
    try {
      const original = await service.uploadAsset({ kind: 'bannerOriginal', file, businessId })
      if (!original.ok) return setError(errorText(original.error, t))
      const copy = await service.uploadAsset({ kind: 'banner', file: editedFile(result.blob, file.name), businessId })
      if (!copy.ok) return setError(errorText(copy.error, t))
      setError(null)
      onChange({ url: copy.data.url, originalUrl: original.data.url, crop: result.crop })
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  /** Uploads a new edited copy from the original; the original stays, the replaced copy is cleaned up when the company is saved. */
  const saveEdit = async (banner: BusinessBanner, result: { blob: Blob; crop: ImageCrop }) => {
    setBusy(true)
    try {
      const copy = await service.uploadAsset({ kind: 'banner', file: editedFile(result.blob, 'banner'), businessId })
      if (!copy.ok) return setError(errorText(copy.error, t))
      setError(null)
      // A banner from before the crop dialog is its own original: from now on it is the original of the new copy.
      onChange({ url: copy.data.url, originalUrl: banner.originalUrl ?? banner.url, crop: result.crop })
    } finally {
      setBusy(false)
      setEditing(false)
    }
  }

  return (
    <div data-testid="banner-upload">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] sm:items-start">
        <SmartImage
          src={value?.url}
          alt={value ? t('ui.banner.alt') : ''}
          fallbackLabel={t('ui.banner.none')}
          className={`${shape.aspectClass} w-full rounded-xl border border-line ${shape.fitClass}`}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <label htmlFor={id} className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-subtle focus-within:outline-2 focus-within:outline-accent">
              <Upload className="size-4" aria-hidden />
              {busy ? t('ui.banner.uploading') : value ? t('ui.banner.replace') : t('ui.banner.upload')}
              <input
                id={id}
                type="file"
                disabled={busy}
                accept={IMAGE_RULES.accept.join(',')}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void onFile(f)
                  e.target.value = ''
                }}
              />
            </label>
            {value && (
              <Button size="sm" aria-label={t('ui.banner.editFor')} disabled={busy} icon={<Crop className="size-4" aria-hidden />} onClick={() => setEditing(true)}>
                {t('ui.banner.edit')}
              </Button>
            )}
            {value && (
              <Button size="sm" variant="ghost" aria-label={t('ui.banner.removeFor')} disabled={busy} icon={<X className="size-4" aria-hidden />} onClick={() => onChange(undefined)}>
                {t('ui.banner.remove')}
              </Button>
            )}
          </div>
          {!value && <p className="mt-2 text-xs text-ink-muted">{t('ui.banner.none')}</p>}
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">{t('ui.banner.help', { size: formatFileSize(IMAGE_RULES.maxBytes) })} {t('ui.banner.cropHelp')}</p>
      <p className="mt-1 text-xs text-ink-muted">{t('ui.banner.trimNote')}</p>
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
      {pending && (
        <ImageCropDialog
          key={`${pending.name}-${pending.size}-${pending.lastModified}`}
          file={pending}
          aspect={shape.aspect}
          title={t('ui.banner.cropTitle')}
          onCancel={() => setPending(null)}
          onSave={(result) => saveNew(pending, result)}
        />
      )}
      {editing && value && (
        <ImageCropDialog
          key={value.originalUrl ?? value.url}
          src={value.originalUrl ?? value.url}
          aspect={shape.aspect}
          {...(value.crop ? { initialCrop: value.crop } : {})}
          title={t('ui.banner.cropTitle')}
          onCancel={() => setEditing(false)}
          onSave={(result) => saveEdit(value, result)}
        />
      )}
    </div>
  )
}

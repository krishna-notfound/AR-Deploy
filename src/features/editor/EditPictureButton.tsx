import { Crop } from 'lucide-react'
import { useState } from 'react'
import { ImageCropDialog } from '@/components/image/ImageCropDialog'
import { Button } from '@/components/ui/Button'
import type { SiteAsset } from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { editedFile } from '@/lib/imageCrop'
import { type ImageFrameKey, imageFrame } from '@/lib/imageFrames'
import { content, siteAssetUrl } from '@/services'

/**
 * "Edit picture" for an uploaded Website Editor picture (ADR-0063): opens the crop dialog on the untouched original with the
 * crop it had (for a picture from before the dialog, on the file itself), then uploads a NEW edited copy and hands back
 * `{ path: the new copy, originalPath, crop }`. The old copy and the original stay in storage.
 */
export function EditPictureButton({
  image,
  frame,
  label,
  onEdited,
}: {
  image: SiteAsset
  frame: ImageFrameKey
  /** The accessible name, e.g. "Edit picture: Main photograph". */
  label: string
  onEdited: (asset: SiteAsset) => void
}) {
  const { t } = useI18n()
  const [src, setSrc] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Where the picture is edited from: its original, or (an older picture) the file shown. */
  const original = image.originalPath ?? image.path

  const open = () => {
    const url = siteAssetUrl({ path: original })
    if (!url) return setError(t('editor.crop.cannotOpen'))
    setError(null)
    setSrc(url)
  }

  const save = async (result: { blob: Blob; crop: { x: number; y: number; width: number; height: number } }) => {
    setBusy(true)
    try {
      const copy = await content.uploadSiteAsset(editedFile(result.blob, original.split('/').pop() ?? 'picture'), 'image')
      if (!copy.ok) return setError(copy.error.message)
      onEdited({ path: copy.data.path, originalPath: original, crop: result.crop })
    } finally {
      setBusy(false)
      setSrc(null)
    }
  }

  return (
    <>
      <Button size="sm" aria-label={label} disabled={busy} icon={<Crop className="size-4" aria-hidden />} onClick={open}>
        {t('editor.crop.edit')}
      </Button>
      {error && (
        <p role="alert" className="mt-2 basis-full text-ui-small text-danger">
          {error}
        </p>
      )}
      {src && (
        <ImageCropDialog
          key={original}
          src={src}
          aspect={imageFrame(frame).aspect}
          {...(image.crop ? { initialCrop: image.crop } : {})}
          title={t('editor.crop.title')}
          onCancel={() => setSrc(null)}
          onSave={save}
        />
      )}
    </>
  )
}

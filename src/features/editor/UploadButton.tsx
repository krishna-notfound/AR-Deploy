import { Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { ImageCropDialog } from '@/components/image/ImageCropDialog'
import { Button } from '@/components/ui/Button'
import { SITE_ASSET_MAX_BYTES, type SiteAsset, type SiteAssetKind } from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { formatMb } from '@/lib/files'
import { editedFile } from '@/lib/imageCrop'
import { type ImageFrameKey, imageFrame } from '@/lib/imageFrames'
import { content, siteAssetProblem } from '@/services'

const ACCEPT: Record<SiteAssetKind, string> = { image: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', glb: '.glb,model/gltf-binary', usdz: '.usdz', favicon: 'image/png,.png' }

/**
 * One upload button with its own "Uploading..." and error state. `precheck` may refuse the file before it is sent (a sentence
 * for the person, or null to go on).
 *
 * With a `frame` (a picture of the page, src/lib/imageFrames.ts) the chosen file opens the crop dialog first (ADR-0063): the
 * untouched original and the edited WebP copy are both uploaded, and `onUploaded` gets the copy as `path` with the
 * `originalPath` and the `crop`. Without a frame (3D files, the favicon) the file is uploaded as it is.
 */
export function UploadButton({
  kind,
  label,
  onUploaded,
  precheck,
  frame,
}: {
  kind: SiteAssetKind
  label: string
  onUploaded: (asset: SiteAsset) => void
  precheck?: (file: File) => Promise<string | null>
  frame?: ImageFrameKey
}) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The picture chosen and waiting in the crop dialog. */
  const [pending, setPending] = useState<File | null>(null)
  const cropped = !!frame && kind === 'image'

  const pick = async (file: File | undefined) => {
    if (input.current) input.current.value = ''
    if (!file) return
    setError(null)
    // The type and size are checked here first, so the reason is said in the person's language (the service checks again).
    const problem = siteAssetProblem(file, kind)
    if (problem) {
      const rule = t(`editor.upload.rule.${kind}`, { max: formatMb(SITE_ASSET_MAX_BYTES[kind]) })
      setError(problem === 'type' ? rule : t(problem === 'size' ? 'editor.upload.tooLarge' : 'editor.upload.empty', { name: file.name, size: formatMb(file.size), rule }))
      return
    }
    setBusy(true)
    const refusal = precheck ? await precheck(file) : null
    if (refusal) {
      setBusy(false)
      setError(refusal)
      return
    }
    if (cropped) {
      setBusy(false)
      setPending(file)
      return
    }
    const r = await content.uploadSiteAsset(file, kind)
    setBusy(false)
    if (r.ok) onUploaded(r.data)
    else setError(r.error.message)
  }

  /** Uploads the original and the edited copy, then hands both over. Nothing is kept when either upload fails. */
  const save = async (file: File, result: { blob: Blob; crop: { x: number; y: number; width: number; height: number } }) => {
    setBusy(true)
    try {
      const original = await content.uploadSiteAsset(file, 'image')
      if (!original.ok) return setError(original.error.message)
      const copy = await content.uploadSiteAsset(editedFile(result.blob, file.name), 'image')
      if (!copy.ok) return setError(copy.error.message)
      onUploaded({ path: copy.data.path, originalPath: original.data.path, crop: result.crop })
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <div>
      <input ref={input} type="file" accept={ACCEPT[kind]} className="sr-only" tabIndex={-1} aria-label={label} data-testid={`upload-${kind}`} onChange={(e) => void pick(e.target.files?.[0])} />
      <Button size="sm" icon={<Upload className="size-4" aria-hidden />} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? t('editor.showcase.uploading') : label}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-ui-small text-danger">
          {error}
        </p>
      )}
      {pending && frame && (
        <ImageCropDialog
          key={`${pending.name}-${pending.size}-${pending.lastModified}`}
          file={pending}
          aspect={imageFrame(frame).aspect}
          title={t('editor.crop.title')}
          onCancel={() => setPending(null)}
          onSave={(result) => save(pending, result)}
        />
      )}
    </div>
  )
}

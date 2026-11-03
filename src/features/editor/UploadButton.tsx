import { Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { SiteAsset, SiteAssetKind } from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { content } from '@/services'

const ACCEPT: Record<SiteAssetKind, string> = { image: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', glb: '.glb,model/gltf-binary', usdz: '.usdz' }

/** One upload button with its own "Uploading..." and error state. */
export function UploadButton({ kind, label, onUploaded }: { kind: SiteAssetKind; label: string; onUploaded: (asset: SiteAsset) => void }) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pick = async (file: File | undefined) => {
    if (input.current) input.current.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    const r = await content.uploadSiteAsset(file, kind)
    setBusy(false)
    if (r.ok) onUploaded(r.data)
    else setError(r.error.message)
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
    </div>
  )
}

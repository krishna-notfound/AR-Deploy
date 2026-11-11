// A stand-in for the crop dialog in component tests: the real one needs a laid-out browser (its own tests: components/image).
// Use it with: vi.mock('@/components/image/ImageCropDialog', async () => import('@/test/cropDialogStub')).
// It shows what it was given (data-* attributes) and its Save sends a small edited copy with the fixed CROP below.
import type { ReactElement } from 'react'

export const CROP = { x: 10, y: 20, width: 800, height: 1000 }

interface Props {
  file?: File
  src?: string
  aspect: number
  initialCrop?: unknown
  title: string
  output?: { maxSide?: number; quality?: number }
  onSave: (r: { blob: Blob; crop: typeof CROP; whole: boolean }) => void | Promise<void>
  onCancel: () => void
}

export function ImageCropDialog(p: Props): ReactElement {
  return (
    <div
      role="dialog"
      aria-label={p.title}
      data-file={p.file?.name ?? ''}
      data-src={p.src ?? ''}
      data-aspect={p.aspect}
      data-initial={JSON.stringify(p.initialCrop ?? null)}
      data-output={JSON.stringify(p.output ?? null)}
    >
      <button type="button" onClick={() => void p.onSave({ blob: new Blob(['edited'], { type: 'image/webp' }), crop: CROP, whole: false })}>
        Save crop
      </button>
      <button type="button" onClick={p.onCancel}>
        Cancel crop
      </button>
    </div>
  )
}

import type { ModelAsset } from '@/domain/types'
import { MB, isStaleSessionAsset } from '@/lib/files'
import { formatFileSize } from '@/lib/format'
import type { ScaleCheck } from '@/lib/scale'

/** Above this a GLB is slow to open over mobile data (it is downloaded again when AR starts). */
export const LARGE_MODEL_BYTES = 15 * MB

export type ReadinessLevel = 'ready' | 'warning' | 'missing'
export interface ReadinessItem {
  key: 'viewer' | 'android' | 'ios' | 'scale' | 'size'
  level: ReadinessLevel
  label: string
  detail: string
}

/** What a product's customers will get on each platform. Admin-only, English (dashboards are English-only). */
export function arReadiness({
  glb,
  usdz,
  preview,
  scale,
}: {
  glb?: ModelAsset
  usdz?: ModelAsset
  preview: 'loading' | 'loaded' | 'error'
  scale: ScaleCheck
}): ReadinessItem[] {
  const hasGlb = usable(glb)
  const hasUsdz = usable(usdz)
  const glbLevel: ReadinessLevel = !hasGlb || preview === 'error' ? 'missing' : preview === 'loaded' ? 'ready' : 'warning'
  const glbProblem = !hasGlb ? 'Add a GLB model.' : preview === 'error' ? 'The GLB does not load. Check the file or its URL.' : 'Checking the model…'

  const items: ReadinessItem[] = [
    { key: 'viewer', level: glbLevel, label: '3D viewer', detail: glbLevel === 'ready' ? 'Works on every device.' : glbProblem },
    {
      key: 'android',
      level: glbLevel,
      label: 'Android AR',
      detail: glbLevel === 'ready' ? 'Uses the GLB: in-browser AR on ARCore phones, otherwise Scene Viewer.' : glbProblem,
    },
    {
      key: 'ios',
      level: hasUsdz ? 'ready' : hasGlb ? 'warning' : 'missing',
      label: 'iPhone and iPad AR',
      detail:
        hasUsdz
          ? 'Uses the USDZ in AR Quick Look.'
          : hasGlb
            ? 'No USDZ: the phone converts the GLB itself, which is slower and not guaranteed. Upload a USDZ.'
            : 'Add a GLB, and a USDZ for iPhone.',
    },
    {
      key: 'scale',
      level: scale.status === 'verified' ? 'ready' : 'warning',
      label: 'True size',
      detail:
        scale.status === 'verified'
          ? 'The model matches the entered dimensions. AR shows “True size”.'
          : scale.status === 'mismatch'
            ? 'The model does not match the entered dimensions. AR shows “Size not verified”.'
            : 'Not checked yet: needs a loaded model and width, height and depth.',
    },
  ]
  if (hasGlb && glb?.sizeBytes && glb.sizeBytes > LARGE_MODEL_BYTES)
    items.push({ key: 'size', level: 'warning', label: 'File size', detail: `${formatFileSize(glb.sizeBytes)}: slow to open on mobile data. Aim for under ${formatFileSize(LARGE_MODEL_BYTES)}.` })
  return items
}

const usable = (a?: ModelAsset): a is ModelAsset => !!a && a.status !== 'invalid' && a.status !== 'missing' && !isStaleSessionAsset(a)

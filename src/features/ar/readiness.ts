import type { ModelAsset } from '@/domain/types'
import { MB, isStaleSessionAsset } from '@/lib/files'
import { formatFileSize } from '@/lib/format'
import type { ScaleCheck } from '@/lib/scale'

/** Google Scene Viewer recommends GLBs of 10 MB or less (larger files are slow and may fail validation above 15 MB). */
export const LARGE_MODEL_BYTES = 10 * MB

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
      detail: glbLevel === 'ready' ? 'Uses the GLB. Opens on Android phones that support Google AR (ARCore); other phones keep the 3D view.' : glbProblem,
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
          ? `The model matches the entered dimensions. AR shows “True size”.${hasUsdz ? ' Checked on the GLB: the iPhone (USDZ) file is not measured, so it must be exported at the same size.' : ''}`
          : scale.status === 'mismatch'
            ? 'The model does not match the entered dimensions. AR shows “Size not verified”.'
            : 'Not checked yet: needs a loaded model and width, height and depth.',
    },
  ]
  if (hasGlb && glb?.sizeBytes && glb.sizeBytes > LARGE_MODEL_BYTES)
    items.push({ key: 'size', level: 'warning', label: 'File size', detail: `${formatFileSize(glb.sizeBytes)}: slow on mobile data. Google recommends ${formatFileSize(LARGE_MODEL_BYTES)} or less for Android AR.` })
  return items
}

const usable = (a?: ModelAsset): a is ModelAsset => !!a && a.status !== 'invalid' && a.status !== 'missing' && !isStaleSessionAsset(a)

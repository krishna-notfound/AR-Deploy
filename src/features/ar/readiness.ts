import type { ModelAsset, ProductVariant } from '@/domain/types'
import { MB, isStaleSessionAsset, sceneViewerUnsupported } from '@/lib/files'
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

/** Message for a GLB that requires glTF extensions Scene Viewer (Android AR) does not support. */
export function sceneViewerWarning(unsupported: string[]): string {
  const names = [...new Set(unsupported.map((e) => EXTENSION_NAMES[e] ?? e))].join(' and ')
  return `This model uses ${names} compression, which Android AR (Google ARCore) cannot open, so Android customers see it in 3D only. For AR on Android, upload a lighter model without this compression: textures up to 2048 px, about 100,000 triangles or fewer, and a file under ${formatFileSize(LARGE_MODEL_BYTES)}.`
}

/** Plain names for the glTF extensions Scene Viewer cannot open (owner 2026-10-26: no raw extension names). */
const EXTENSION_NAMES: Record<string, string> = {
  KHR_draco_mesh_compression: 'Draco',
  KHR_texture_basisu: 'KTX2',
  EXT_meshopt_compression: 'meshopt',
  KHR_mesh_quantization: 'quantization',
  EXT_texture_webp: 'WebP texture',
  EXT_texture_avif: 'AVIF texture',
}

/** What a product's customers will get on each platform. Admin-only, English (dashboards are English-only). */
export function arReadiness({
  glb,
  usdz,
  preview,
  scale,
  requiredExtensions,
}: {
  glb?: ModelAsset
  usdz?: ModelAsset
  preview: 'loading' | 'loaded' | 'error'
  scale: ScaleCheck
  /** Read from the loaded model; falls back to the value stored with the GLB. */
  requiredExtensions?: string[]
}): ReadinessItem[] {
  const hasGlb = usable(glb)
  const hasUsdz = usable(usdz)
  const glbLevel: ReadinessLevel = !hasGlb || preview === 'error' ? 'missing' : preview === 'loaded' ? 'ready' : 'warning'
  const glbProblem = !hasGlb ? 'Add a GLB model.' : preview === 'error' ? 'The GLB does not load. Check the file or its URL.' : 'Checking the model…'
  const unsupported = hasGlb ? sceneViewerUnsupported(requiredExtensions ?? glb?.requiredExtensions) : []

  // The public page mounts the viewer, and so AR, only for a GLB that loads: a USDZ alone never reaches Quick Look.
  const ios: Pick<ReadinessItem, 'level' | 'detail'> = !hasGlb
    ? { level: 'missing', detail: hasUsdz ? 'Add the GLB too: the page needs it to show 3D and AR, so the USDZ is not used on its own.' : 'Add a GLB, and a USDZ for iPhone.' }
    : glbLevel !== 'ready'
      ? { level: glbLevel, detail: glbProblem }
      : hasUsdz
        ? { level: 'ready', detail: 'Uses the USDZ in AR Quick Look.' }
        : { level: 'warning', detail: 'No USDZ: the phone converts the GLB itself, which is slower and not guaranteed. Upload a USDZ.' }

  const items: ReadinessItem[] = [
    { key: 'viewer', level: glbLevel, label: '3D viewer', detail: glbLevel === 'ready' ? 'Works on every device.' : glbProblem },
    {
      key: 'android',
      level: glbLevel === 'ready' && unsupported.length ? 'warning' : glbLevel,
      label: 'Android AR',
      detail:
        glbLevel !== 'ready'
          ? glbProblem
          : unsupported.length
            ? sceneViewerWarning(unsupported)
            : 'Uses the GLB. Opens on Android phones that support Google AR (ARCore); other phones may open it in 3D only.',
    },
    { key: 'ios', label: 'iPhone and iPad AR', ...ios },
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

export interface VariantMediaSummary {
  /** Variants with a usable GLB of their own. */
  withModel: number
  total: number
  /** One line per variant for the editor: what customers see when they pick it. */
  lines: { id: string; name: string; level: ReadinessLevel; detail: string }[]
}

/**
 * Per-variant summary without loading every model (each variant's own preview runs the load and scale check).
 * Never a publish blocker: a variant without its own files shows the product's photos and model.
 */
export function variantMediaSummary(variants: ProductVariant[]): VariantMediaSummary {
  const lines = variants.map((v) => {
    const glb = usable(v.models?.glb)
    const usdz = usable(v.models?.usdz)
    const photos = v.images?.length ?? 0
    const unsupported = glb ? sceneViewerUnsupported(v.models?.glb?.requiredExtensions) : []
    const parts = [photos ? `${photos} own photo${photos === 1 ? '' : 's'}` : 'product photos']
    let level: ReadinessLevel = 'ready'
    if (glb) parts.push(usdz ? 'own GLB and USDZ' : 'own GLB (no USDZ: iPhone converts the GLB)')
    else parts.push(usdz ? 'USDZ without a GLB is not used: product 3D model shown' : 'product 3D model shown, with a note that this finish may look different')
    if (glb && !usdz) level = 'warning'
    if (!glb && usdz) level = 'warning'
    if (unsupported.length) {
      level = 'warning'
      parts.push(`Android AR not offered: requires ${unsupported.join(', ')}`)
    }
    if (!glb && !usdz) level = 'missing'
    return { id: v.id, name: v.name.en || 'Unnamed option', level, detail: parts.join(' · ') }
  })
  return { withModel: variants.filter((v) => usable(v.models?.glb)).length, total: variants.length, lines }
}

const usable = (a?: ModelAsset): a is ModelAsset => !!a && a.status !== 'invalid' && a.status !== 'missing' && !isStaleSessionAsset(a)

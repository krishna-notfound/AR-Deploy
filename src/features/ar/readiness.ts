import type { ModelAsset, ProductVariant } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { type TFn, tEn } from '@/i18n/translate'
import { MB, isStaleSessionAsset, sceneViewerUnsupported } from '@/lib/files'
import { formatFileSize } from '@/lib/format'
import type { ScaleCheck } from '@/lib/scale'

/** Google Scene Viewer recommends GLBs of 10 MB or less (larger files are slow and may fail validation above 15 MB). */
export const LARGE_MODEL_BYTES = 10 * MB

export type ReadinessLevel = 'ready' | 'warning' | 'missing'
export interface ReadinessItem {
  key: 'viewer' | 'android' | 'ios' | 'scale' | 'size' | 'usdzSize'
  level: ReadinessLevel
  label: string
  detail: string
}

/** Message for a GLB that requires glTF extensions Scene Viewer (Android AR) does not support. */
export function sceneViewerWarning(unsupported: string[], t: TFn = tEn): string {
  return t('products.ar.sceneViewerWarning', { names: extensionNames(unsupported, t), size: formatFileSize(LARGE_MODEL_BYTES) })
}

/** "Draco and KTX2": the plain names of the extensions, each once (an unknown extension keeps its own name). */
function extensionNames(unsupported: string[], t: TFn): string {
  return [...new Set(unsupported.map((e) => (EXTENSION_NAMES[e] ? t(EXTENSION_NAMES[e]) : e)))].join(` ${t('products.ar.and')} `)
}

/** Plain names for the glTF extensions Scene Viewer cannot open (owner 2026-10-26: no raw extension names). */
const EXTENSION_NAMES: Record<string, TranslationKey> = {
  KHR_draco_mesh_compression: 'products.ar.ext.draco',
  KHR_texture_basisu: 'products.ar.ext.ktx2',
  EXT_meshopt_compression: 'products.ar.ext.meshopt',
  KHR_mesh_quantization: 'products.ar.ext.quantization',
  EXT_texture_webp: 'products.ar.ext.webp',
  EXT_texture_avif: 'products.ar.ext.avif',
}

/** What a product's customers will get on each platform, worded with `t` (English by default). */
export function arReadiness({
  glb,
  usdz,
  preview,
  scale,
  requiredExtensions,
  t = tEn,
}: {
  glb?: ModelAsset
  usdz?: ModelAsset
  preview: 'loading' | 'loaded' | 'error'
  scale: ScaleCheck
  /** Read from the loaded model; falls back to the value stored with the GLB. */
  requiredExtensions?: string[]
  t?: TFn
}): ReadinessItem[] {
  const hasGlb = usable(glb)
  const hasUsdz = usable(usdz)
  const glbLevel: ReadinessLevel = !hasGlb || preview === 'error' ? 'missing' : preview === 'loaded' ? 'ready' : 'warning'
  const glbProblem = !hasGlb ? t('products.ar.addGlb') : preview === 'error' ? t('products.ar.glbError') : t('products.ar.checking')
  const unsupported = hasGlb ? sceneViewerUnsupported(requiredExtensions ?? glb?.requiredExtensions) : []

  // The public page mounts the viewer, and so AR, only for a GLB that loads: a USDZ alone never reaches Quick Look.
  const ios: Pick<ReadinessItem, 'level' | 'detail'> = !hasGlb
    ? { level: 'missing', detail: hasUsdz ? t('products.ar.iosNeedsGlb') : t('products.ar.iosNeedsBoth') }
    : glbLevel !== 'ready'
      ? { level: glbLevel, detail: glbProblem }
      : hasUsdz
        ? { level: 'ready', detail: t('products.ar.iosOk') }
        : { level: 'warning', detail: t('products.ar.iosNoUsdz') }

  const items: ReadinessItem[] = [
    { key: 'viewer', level: glbLevel, label: t('products.ar.viewer'), detail: glbLevel === 'ready' ? t('products.ar.viewerOk') : glbProblem },
    {
      key: 'android',
      level: glbLevel === 'ready' && unsupported.length ? 'warning' : glbLevel,
      label: t('products.ar.android'),
      detail:
        glbLevel !== 'ready'
          ? glbProblem
          : unsupported.length
            ? sceneViewerWarning(unsupported, t)
            : t('products.ar.androidOk'),
    },
    { key: 'ios', label: t('products.ar.ios'), ...ios },
    {
      key: 'scale',
      level: scale.status === 'verified' ? 'ready' : 'warning',
      label: t('products.ar.scale'),
      detail:
        scale.status === 'verified'
          ? `${t('products.ar.scaleOk')}${hasUsdz ? ` ${t('products.ar.scaleOkUsdz')}` : ''}`
          : scale.status === 'mismatch'
            ? t('products.ar.scaleMismatch')
            : t('products.ar.scaleUnknown'),
    },
  ]
  if (hasUsdz && usdz?.sizeBytes && usdz.sizeBytes > LARGE_MODEL_BYTES)
    items.push({
      key: 'usdzSize',
      level: 'warning',
      label: t('products.ar.usdzSize'),
      detail: t('products.ar.usdzSizeDetail', { size: formatFileSize(usdz.sizeBytes), limit: formatFileSize(LARGE_MODEL_BYTES) }),
    })
  if (hasGlb && glb?.sizeBytes && glb.sizeBytes > LARGE_MODEL_BYTES)
    items.push({ key: 'size', level: 'warning', label: t('products.ar.size'), detail: t('products.ar.sizeDetail', { size: formatFileSize(glb.sizeBytes), limit: formatFileSize(LARGE_MODEL_BYTES) }) })
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
export function variantMediaSummary(variants: ProductVariant[], t: TFn = tEn): VariantMediaSummary {
  const lines = variants.map((v) => {
    const glb = usable(v.models?.glb)
    const usdz = usable(v.models?.usdz)
    const photos = v.images?.length ?? 0
    const unsupported = glb ? sceneViewerUnsupported(v.models?.glb?.requiredExtensions) : []
    const parts = [photos ? t(photos === 1 ? 'products.ar.variant.ownPhotos.one' : 'products.ar.variant.ownPhotos.other', { n: photos }) : t('products.ar.variant.productPhotos')]
    let level: ReadinessLevel = 'ready'
    if (glb) parts.push(usdz ? t('products.ar.variant.glbUsdz') : t('products.ar.variant.glbOnly'))
    else parts.push(usdz ? t('products.ar.variant.usdzOnly') : t('products.ar.variant.productModel'))
    if (glb && !usdz) level = 'warning'
    if (!glb && usdz) level = 'warning'
    if (unsupported.length) {
      level = 'warning'
      parts.push(t('products.ar.variant.noAndroid', { names: unsupported.map((e) => (EXTENSION_NAMES[e] ? t(EXTENSION_NAMES[e]) : e)).join(', ') }))
    }
    if (!glb && !usdz) level = 'missing'
    return { id: v.id, name: v.name.en || t('products.ar.variant.unnamed'), level, detail: parts.join(' · ') }
  })
  return { withModel: variants.filter((v) => usable(v.models?.glb)).length, total: variants.length, lines }
}

const usable = (a?: ModelAsset): a is ModelAsset => !!a && a.status !== 'invalid' && a.status !== 'missing' && !isStaleSessionAsset(a)

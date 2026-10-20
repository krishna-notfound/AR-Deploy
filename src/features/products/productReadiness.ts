import { arReadiness } from '@/features/ar/readiness'
import type { Product } from '@/domain/types'

/**
 * One-word AR readiness for product lists (DUX-05), derived from the editor's `arReadiness()` so the list and
 * the editor agree. It only reads the stored model files: whether the GLB loads and whether the size is verified
 * are checked in the editor, so this never claims "True size".
 * - ready:        GLB + USDZ (Android Scene Viewer and iPhone Quick Look each get their own file)
 * - android-only: GLB without USDZ (iPhone AR depends on the phone converting the GLB: not guaranteed)
 * - android-blocked: the GLB needs a glTF extension Scene Viewer cannot open (e.g. WebP textures), so Android gets 3D only
 * - photos-only:  no usable GLB (no 3D view, no AR)
 */
export type ProductArReadiness = 'ready' | 'android-only' | 'android-blocked' | 'photos-only'

export const AR_READINESS_LABEL: Record<ProductArReadiness, string> = {
  ready: 'AR ready',
  'android-only': 'Android only',
  'android-blocked': 'Android AR blocked',
  'photos-only': 'Photos only',
}

export const AR_READINESS_HINT: Record<ProductArReadiness, string> = {
  ready: 'Has a 3D model (GLB) and an iPhone AR file (USDZ).',
  'android-only': 'Has a 3D model but no iPhone AR file (USDZ): iPhone AR is not guaranteed.',
  'android-blocked': 'The 3D model uses a feature Google Scene Viewer cannot open (for example WebP textures), so Android customers get 3D without AR. Re-export the model without it.',
  'photos-only': 'No 3D model: customers see photos only, without 3D or AR.',
}

export function productArReadiness(p: Pick<Product, 'models'>): ProductArReadiness {
  // The list cannot load each model, so the GLB is taken as loading; the editor does the real check.
  const items = arReadiness({ glb: p.models.glb, usdz: p.models.usdz, preview: 'loaded', scale: { status: 'unknown' } })
  const viewer = items.find((i) => i.key === 'viewer')?.level
  const ios = items.find((i) => i.key === 'ios')?.level
  const android = items.find((i) => i.key === 'android')?.level
  if (viewer !== 'ready') return 'photos-only'
  if (android !== 'ready') return 'android-blocked'
  return ios === 'ready' ? 'ready' : 'android-only'
}

/** Whether a product has a usable 3D model (so AR attempts can exist at all). */
export const hasArModel = (p: Pick<Product, 'models'>) => productArReadiness(p) !== 'photos-only'

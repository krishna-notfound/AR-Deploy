import { arReadiness } from '@/features/ar/readiness'
import type { Product, ProductModels, ProductVariant } from '@/domain/types'
import { type TranslationKey, en } from '@/i18n/dictionaries/en'

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

/** Translate with `t(AR_READINESS_LABEL_KEY[r])` and `t(AR_READINESS_HINT_KEY[r])`. */
export const AR_READINESS_LABEL_KEY: Record<ProductArReadiness, TranslationKey> = {
  ready: 'products.readiness.ready',
  'android-only': 'products.readiness.androidOnly',
  'android-blocked': 'products.readiness.androidBlocked',
  'photos-only': 'products.readiness.photosOnly',
}

export const AR_READINESS_HINT_KEY: Record<ProductArReadiness, TranslationKey> = {
  ready: 'products.readiness.ready.hint',
  'android-only': 'products.readiness.androidOnly.hint',
  'android-blocked': 'products.readiness.androidBlocked.hint',
  'photos-only': 'products.readiness.photosOnly.hint',
}

/** English text, kept for callers that have no `t` (tests, files not yet translated). */
export const AR_READINESS_LABEL: Record<ProductArReadiness, string> = {
  ready: en[AR_READINESS_LABEL_KEY.ready],
  'android-only': en[AR_READINESS_LABEL_KEY['android-only']],
  'android-blocked': en[AR_READINESS_LABEL_KEY['android-blocked']],
  'photos-only': en[AR_READINESS_LABEL_KEY['photos-only']],
}

export const AR_READINESS_HINT: Record<ProductArReadiness, string> = {
  ready: en[AR_READINESS_HINT_KEY.ready],
  'android-only': en[AR_READINESS_HINT_KEY['android-only']],
  'android-blocked': en[AR_READINESS_HINT_KEY['android-blocked']],
  'photos-only': en[AR_READINESS_HINT_KEY['photos-only']],
}

const RANK: ProductArReadiness[] = ['ready', 'android-only', 'android-blocked', 'photos-only']

/**
 * The best readiness over the product's own files and each variant's: a product whose models live only on its
 * finishes still has 3D and AR on its page, so it is never listed as photos only.
 */
export function productArReadiness(p: Pick<Product, 'models'> & { variants?: ProductVariant[] }): ProductArReadiness {
  const sets = [p.models, ...(p.variants ?? []).map((v) => v.models).filter((m): m is ProductModels => !!m)]
  return sets.map(modelsReadiness).sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))[0] ?? 'photos-only'
}

function modelsReadiness(models: ProductModels): ProductArReadiness {
  // The list cannot load each model, so the GLB is taken as loading; the editor does the real check.
  const items = arReadiness({ glb: models.glb, usdz: models.usdz, preview: 'loaded', scale: { status: 'unknown' } })
  const viewer = items.find((i) => i.key === 'viewer')?.level
  const ios = items.find((i) => i.key === 'ios')?.level
  const android = items.find((i) => i.key === 'android')?.level
  if (viewer !== 'ready') return 'photos-only'
  if (android !== 'ready') return 'android-blocked'
  return ios === 'ready' ? 'ready' : 'android-only'
}

/** Whether a product has a usable 3D model (so AR attempts can exist at all). */
export const hasArModel = (p: Pick<Product, 'models'> & { variants?: ProductVariant[] }) => productArReadiness(p) !== 'photos-only'

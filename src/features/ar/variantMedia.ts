import type { ModelAsset, Product, ProductImage, ProductModels, ProductVariant } from '@/domain/types'
import { isStaleSessionAsset } from '@/lib/files'

/** A model file the page can hand to the viewer (a blob: URL from an earlier page load cannot). */
export const usableModel = (a?: ModelAsset): ModelAsset | undefined => (a && !isStaleSessionAsset(a) ? a : undefined)

export function usableModels(models: ProductModels | undefined): ProductModels {
  return { glb: usableModel(models?.glb), usdz: usableModel(models?.usdz) }
}

export interface VariantMedia {
  /** Gallery photos for the stage: the variant's own when it has any, otherwise the product's. */
  gallery: ProductImage[]
  /** The GLB/USDZ pair the 3D view and AR use. Always from one source, never a variant GLB with the base USDZ. */
  models: ProductModels
  /** The 3D view and AR show this variant's own file. */
  ownModel: boolean
  /** A variant is selected that has no model of its own, and the product's model is shown instead. */
  fallback: boolean
}

/**
 * What the product page shows for the selected variant. A variant GLB brings only its own USDZ (or none, so iPhone
 * generates one from that GLB): pairing it with the product's USDZ would open another finish in Quick Look.
 */
export function variantMedia(product: Pick<Product, 'images' | 'models'>, variant?: ProductVariant): VariantMedia {
  const ownGallery = (variant?.images ?? []).filter((i) => i.url)
  const gallery = ownGallery.length ? ownGallery : product.images.filter((i) => i.kind === 'gallery')
  const own = usableModels(variant?.models)
  if (own.glb) return { gallery, models: own, ownModel: true, fallback: false }
  const base = usableModels(product.models)
  return { gallery, models: base, ownModel: false, fallback: !!variant && !!base.glb }
}

/** The selected variant from a `?variant=` value; the first variant when it is missing or unknown. */
export function pickVariant(variants: ProductVariant[], id: string | null | undefined): ProductVariant | undefined {
  return variants.find((v) => v.id === id) ?? variants[0]
}

/** Whether any finish of the product (the product itself or one of its variants) has a GLB the page can show. */
export function hasAny3d(product: Pick<Product, 'models'> & { variants?: ProductVariant[] }): boolean {
  return !!usableModel(product.models.glb) || (product.variants ?? []).some((v) => !!usableModel(v.models?.glb))
}

/**
 * The file the phone's own AR viewer opens (Scene Viewer `file=`, the Quick Look href): the stable public copy when
 * the product has one (published, Supabase mode: ar-models), else the URL the 3D view uses (demo sample URLs are
 * public already; a signed URL is the last resort). The public copy is used directly, not through the site's `/ar/`
 * proxy: Vercel compresses proxied files and drops Content-Length, so the viewer's progress froze and slow downloads
 * timed out (AR audit 2026-10-26).
 */
export const arLaunchUrl = (a: ModelAsset): string => a.publicUrl || a.url

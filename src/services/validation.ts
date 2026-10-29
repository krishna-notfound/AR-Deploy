import type { Business, Product } from '@/domain/types'
import { type FieldMessage, msg } from '@/i18n/fieldMessage'
import { isHttpUrl } from '@/lib/files'
import { PRODUCT_SLUG_MAX, isValidSlug } from '@/lib/slug'
import { RESERVED_SUBDOMAINS } from '@/tenant/resolveTenant'
import type { BusinessInput, ProductInput } from './catalogService'

/** Field errors as translatable messages (key + values): forms render them with t(); no English text comes from here. */
export type FieldErrors = Record<string, FieldMessage>

export const MAX_VARIANTS = 50
export const MAX_VARIANT_IMAGES = 20

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Longest value (after trimming) each business field accepts; the form's maxLength uses the same numbers. */
export const BUSINESS_LIMITS = { name: 80, slug: 63, description: 1000, email: 320, phone: 50, address: 500 } as const

/** A slug that another record already uses is a CONFLICT, every other field problem a VALIDATION error. */
export const isSlugTaken = (e: FieldMessage | undefined) => e?.key === 'common.validation.business.slugTaken' || e?.key === 'common.validation.product.slugTaken'

const tooLong =(n: number) => msg('common.validation.tooLong', { n })

export function validateBusiness(data: BusinessInput, others: Business[]): FieldErrors {
  const e: FieldErrors = {}
  const name = data.name.trim()
  if (!name) e.name = msg('common.validation.business.nameRequired')
  else if (name.length > BUSINESS_LIMITS.name) e.name = tooLong(BUSINESS_LIMITS.name)
  if (!data.slug) e.slug = msg('common.validation.business.slugRequired')
  else if (data.slug.length > BUSINESS_LIMITS.slug) e.slug = tooLong(BUSINESS_LIMITS.slug)
  else if (!isValidSlug(data.slug)) e.slug = msg('common.validation.slugFormat')
  else if (RESERVED_SUBDOMAINS.has(data.slug)) e.slug = msg('common.validation.business.slugReserved')
  else if (others.some((b) => b.slug === data.slug)) e.slug = msg('common.validation.business.slugTaken')
  if ((data.description ?? '').trim().length > BUSINESS_LIMITS.description) e.description = tooLong(BUSINESS_LIMITS.description)
  if ((data.contact.email ?? '').trim().length > BUSINESS_LIMITS.email) e['contact.email'] = tooLong(BUSINESS_LIMITS.email)
  else if (data.contact.email && !EMAIL.test(data.contact.email)) e['contact.email'] = msg('common.validation.emailInvalid')
  if ((data.contact.phone ?? '').trim().length > BUSINESS_LIMITS.phone) e['contact.phone'] = tooLong(BUSINESS_LIMITS.phone)
  if ((data.contact.address ?? '').trim().length > BUSINESS_LIMITS.address) e['contact.address'] = tooLong(BUSINESS_LIMITS.address)
  if (data.contact.website && !isHttpUrl(data.contact.website)) e['contact.website'] = msg('common.validation.urlInvalid')
  if (!/^#[0-9a-fA-F]{6}$/.test(data.branding.accentColor)) e['branding.accentColor'] = msg('common.validation.colourInvalid')
  return e
}

export function validateProductDraft(data: ProductInput, siblings: Product[]): FieldErrors {
  const e: FieldErrors = {}
  if (!data.businessId) e.businessId = msg('common.validation.product.businessRequired')
  if (!data.name.en.trim()) e['name.en'] = msg('common.validation.product.nameRequired')
  if (!data.slug) e.slug = msg('common.validation.product.slugRequired')
  else if (data.slug.length > PRODUCT_SLUG_MAX) e.slug = tooLong(PRODUCT_SLUG_MAX)
  else if (!isValidSlug(data.slug)) e.slug = msg('common.validation.slugFormat')
  else if (siblings.some((p) => p.slug === data.slug)) e.slug = msg('common.validation.product.slugTaken')
  if (!Number.isFinite(data.price) || data.price < 0) e.price = msg('common.validation.priceInvalid')
  for (const k of ['width', 'height', 'depth'] as const) {
    const v = data.dimensions[k]
    if (!Number.isFinite(v) || v < 0) e[`dimensions.${k}`] = msg('common.validation.numberPositive')
  }
  if (data.cta.url && !isHttpUrl(data.cta.url)) e['cta.url'] = msg('common.validation.urlInvalid')
  // R-W4-13: a link with no text would render as an empty, invisible button on the product page.
  if (data.cta.url && !data.cta.label.en.trim()) e['cta.label'] = msg('common.validation.product.ctaLabelRequired')
  if (data.weight && (!Number.isFinite(data.weight.value) || data.weight.value < 0)) e.weight = msg('common.validation.product.weightInvalid')
  if (data.variants.some((v) => v.priceDelta !== undefined && !(Number.isInteger(v.priceDelta) && v.priceDelta >= 0))) e.variants = msg('common.validation.product.priceDeltaInvalid')
  // Same caps as save_product (20261020143507_variant_media).
  else if (data.variants.length > MAX_VARIANTS) e.variants = msg('common.validation.product.variantsMax', { n: MAX_VARIANTS })
  else if (data.variants.some((v) => (v.images?.length ?? 0) > MAX_VARIANT_IMAGES)) e.variants = msg('common.validation.product.variantImagesMax', { n: MAX_VARIANT_IMAGES })
  return e
}

/** Rules a product must satisfy before it can be published (design/04 invariants). */
export function validateForPublish(p: Product): FieldErrors {
  const e: FieldErrors = {}
  if (!p.name.en.trim()) e['name.en'] = msg('common.validation.publish.nameRequired')
  if (!(p.price > 0)) e.price = msg('common.validation.publish.priceRequired')
  if (!p.images.some((i) => i.kind === 'gallery')) e.images = msg('common.validation.publish.imageRequired')
  for (const k of ['width', 'height', 'depth'] as const) {
    if (!(p.dimensions[k] > 0)) e[`dimensions.${k}`] = msg('common.validation.publish.dimensionsRequired')
  }
  return e
}

export function normalizeImages(images: Product['images']): Product['images'] {
  const gallery = images.filter((i) => i.kind === 'gallery')
  const primaryIdx = gallery.findIndex((i) => i.isPrimary)
  return images.map((img) => {
    if (img.kind !== 'gallery') return { ...img, isPrimary: false }
    const gi = gallery.indexOf(img)
    return { ...img, isPrimary: primaryIdx === -1 ? gi === 0 : gi === primaryIdx }
  })
}

/** Variant photos are gallery photos: exactly one primary when there are any. */
export function normalizeVariants(variants: Product['variants']): Product['variants'] {
  return variants.map((v) => (v.images ? { ...v, images: normalizeImages(v.images.map((i) => ({ ...i, kind: 'gallery' as const }))) } : v))
}

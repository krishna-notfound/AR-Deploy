import type { Business, Product } from '@/domain/types'
import { isHttpUrl } from '@/lib/files'
import { isValidSlug } from '@/lib/slug'
import { RESERVED_SUBDOMAINS } from '@/tenant/resolveTenant'
import type { BusinessInput, ProductInput } from './catalogService'

export type FieldErrors = Record<string, string>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateBusiness(data: BusinessInput, others: Business[]): FieldErrors {
  const e: FieldErrors = {}
  const name = data.name.trim()
  if (!name) e.name = 'Business name is required.'
  else if (name.length > 80) e.name = 'Use 80 characters or fewer.'
  if (!data.slug) e.slug = 'Catalog address is required.'
  else if (!isValidSlug(data.slug)) e.slug = 'Use lowercase letters, numbers and single hyphens only.'
  else if (RESERVED_SUBDOMAINS.has(data.slug)) e.slug = 'This catalog address is reserved by the platform. Choose another.'
  else if (others.some((b) => b.slug === data.slug)) e.slug = 'This catalog address is already used by another business.'
  if (data.contact.email && !EMAIL.test(data.contact.email)) e['contact.email'] = 'Enter a valid email address.'
  if (data.contact.website && !isHttpUrl(data.contact.website)) e['contact.website'] = 'Enter a full URL starting with https://'
  if (!/^#[0-9a-fA-F]{6}$/.test(data.branding.accentColor)) e['branding.accentColor'] = 'Use a hex colour such as #7A5C45.'
  return e
}

export function validateProductDraft(data: ProductInput, siblings: Product[]): FieldErrors {
  const e: FieldErrors = {}
  if (!data.businessId) e.businessId = 'Choose the business this product belongs to.'
  if (!data.name.en.trim()) e['name.en'] = 'Product name (English) is required.'
  if (!data.slug) e.slug = 'Product URL slug is required.'
  else if (!isValidSlug(data.slug)) e.slug = 'Use lowercase letters, numbers and single hyphens only.'
  else if (siblings.some((p) => p.slug === data.slug)) e.slug = 'Another product in this catalog already uses this slug.'
  if (!Number.isFinite(data.price) || data.price < 0) e.price = 'Enter a valid price.'
  for (const k of ['width', 'height', 'depth'] as const) {
    const v = data.dimensions[k]
    if (!Number.isFinite(v) || v < 0) e[`dimensions.${k}`] = 'Enter a positive number.'
  }
  if (data.cta.url && !isHttpUrl(data.cta.url)) e['cta.url'] = 'Enter a full URL starting with https://'
  if (data.weight && (!Number.isFinite(data.weight.value) || data.weight.value < 0)) e.weight = 'Enter a positive weight.'
  return e
}

/** Rules a product must satisfy before it can be published (design/04 invariants). */
export function validateForPublish(p: Product): FieldErrors {
  const e: FieldErrors = {}
  if (!p.name.en.trim()) e['name.en'] = 'Add an English product name before publishing.'
  if (!(p.price > 0)) e.price = 'Set a price greater than zero before publishing.'
  if (!p.images.some((i) => i.kind === 'gallery')) e.images = 'Add at least one product image before publishing.'
  for (const k of ['width', 'height', 'depth'] as const) {
    if (!(p.dimensions[k] > 0)) e[`dimensions.${k}`] = 'Dimensions must be greater than zero to publish.'
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

import type { Business, Product } from '@/domain/types'
import { minorToInput, parseMoneyInput } from '@/lib/format'
import type { ProductInput } from '@/services/catalogService'

/** Editor form state: ProductInput plus raw text inputs for numbers. */
export interface EditorForm {
  input: ProductInput
  priceText: string
  dims: { width: string; height: string; depth: string }
  weightText: string
  slugTouched: boolean
}

export function emptyForm(business?: Business): EditorForm {
  return {
    input: {
      businessId: business?.id ?? '',
      slug: '',
      name: { en: '' },
      shortDescription: { en: '' },
      description: { en: '' },
      category: 'sofa',
      price: 0,
      currency: business?.defaultCurrency ?? 'EUR',
      images: [],
      models: {},
      dimensions: { width: 0, height: 0, depth: 0, unit: 'cm' },
      material: { en: '' },
      weight: undefined,
      variants: [],
      cta: { label: { en: 'Contact seller', pt: 'Contactar vendedor' }, url: undefined },
    },
    priceText: '',
    dims: { width: '', height: '', depth: '' },
    weightText: '',
    slugTouched: false,
  }
}

export function formFromProduct(p: Product): EditorForm {
  const { id: _id, createdAt: _c, updatedAt: _u, publishedAt: _p, status: _s, ...input } = p
  void [_id, _c, _u, _p, _s]
  const n = (v: number) => (v ? String(v) : '')
  return {
    input,
    priceText: p.price ? minorToInput(p.price) : '',
    dims: { width: n(p.dimensions.width), height: n(p.dimensions.height), depth: n(p.dimensions.depth) },
    weightText: p.weight ? String(p.weight.value) : '',
    slugTouched: true,
  }
}

const num = (s: string) => {
  const v = parseFloat(s.replace(',', '.'))
  return Number.isFinite(v) ? v : NaN
}

/**
 * Converts the entered dimensions between units (one decimal, as saved). Text that is not a number is left as typed.
 * `before` holds the values from before the previous conversion: converting straight back restores them exactly
 * instead of compounding the rounding (83 cm → 32.7 in → 83 cm, not 83.1 cm; AR-10).
 */
export function convertDims(dims: EditorForm['dims'], from: 'cm' | 'in', to: 'cm' | 'in', before?: { unit: 'cm' | 'in'; dims: EditorForm['dims'] }): EditorForm['dims'] {
  if (from === to) return dims
  if (before && before.unit === to && JSON.stringify(convertDims(before.dims, before.unit, from)) === JSON.stringify(dims)) return before.dims
  const factor = to === 'in' ? 1 / 2.54 : 2.54
  const conv = (s: string) => {
    const v = num(s.trim())
    return s.trim() === '' || !Number.isFinite(v) ? s : String(Math.round(v * factor * 10) / 10)
  }
  return { width: conv(dims.width), height: conv(dims.height), depth: conv(dims.depth) }
}

/** Converts raw text fields to typed values. Returns client-side field errors. */
export function toInput(form: EditorForm): { input: ProductInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const price = form.priceText.trim() === '' ? 0 : parseMoneyInput(form.priceText)
  if (price === null) errors.price = 'Enter a price such as 1299.00'
  const dims = { width: 0, height: 0, depth: 0 }
  for (const k of ['width', 'height', 'depth'] as const) {
    const raw = form.dims[k].trim()
    if (raw === '') continue
    const v = num(raw)
    if (!Number.isFinite(v) || v < 0) errors[`dimensions.${k}`] = 'Enter a positive number.'
    else dims[k] = Math.round(v * 10) / 10
  }
  let weight: ProductInput['weight'] = undefined
  if (form.weightText.trim()) {
    const v = num(form.weightText)
    if (!Number.isFinite(v) || v <= 0) errors.weight = 'Enter a positive weight or leave it empty.'
    else weight = { value: v, unit: form.input.weight?.unit ?? 'kg' }
  }
  const cleanVariants = form.input.variants
    .filter((v) => v.name.en.trim())
    .map((v) => ({ ...v, name: { en: v.name.en.trim(), ...(v.name.pt?.trim() ? { pt: v.name.pt.trim() } : {}) } }))
  // An unnamed option is dropped on save, so one with anything entered (including its own files) must be named.
  if (form.input.variants.some((v) => !v.name.en.trim() && (v.name.pt || v.sku || v.images?.length || v.models?.glb || v.models?.usdz))) errors.variants = 'Every option needs an English name.'
  return {
    input: {
      ...form.input,
      name: { ...form.input.name, en: form.input.name.en.trim() },
      price: price ?? 0,
      dimensions: { ...dims, unit: form.input.dimensions.unit },
      weight,
      variants: cleanVariants,
      cta: { ...form.input.cta, url: form.input.cta.url?.trim() || undefined },
    },
    errors,
  }
}

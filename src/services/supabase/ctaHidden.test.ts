// Client feedback 2026-11-05, piece 1: products.cta_hidden <-> Product.cta.hidden in the Supabase mappings.
import { describe, expect, it } from 'vitest'
import type { ProductInput } from '../catalogService'
import { type ProductRow, toProduct, toSaveProductArgs } from './supabaseCatalogService'

const input: ProductInput = {
  businessId: 'b1',
  slug: 'chair',
  name: { en: 'Chair' },
  shortDescription: { en: '' },
  description: { en: '' },
  category: 'chair',
  price: 12000,
  currency: 'EUR',
  images: [],
  models: {},
  dimensions: { width: 83, height: 69, depth: 57, unit: 'cm' },
  material: { en: '' },
  variants: [],
  cta: { label: { en: 'Visit' }, url: 'https://shop.example/x' },
}

const row: ProductRow = {
  id: 'p1',
  business_id: 'b1',
  slug: 'chair',
  name: { en: 'Chair' },
  short_description: { en: '' },
  description: { en: '' },
  material: { en: '' },
  cta_label: { en: 'Visit' },
  cta_url: 'https://shop.example/x',
  cta_hidden: false,
  category: 'chair',
  price: 12000,
  currency: 'EUR',
  status: 'draft',
  width: 83,
  height: 69,
  depth: 57,
  dimension_unit: 'cm',
  weight_value: null,
  weight_unit: null,
  published_at: null,
  created_at: '2026-10-20T00:00:00Z',
  updated_at: '2026-10-20T00:00:00Z',
  product_images: [],
  product_models: [],
  product_variants: [],
}

describe('cta_hidden mappings', () => {
  it('save_product gets cta_hidden: true only when the product hides its button', () => {
    expect(toSaveProductArgs(null, input).p_product).toMatchObject({ cta_hidden: false })
    expect(toSaveProductArgs(null, { ...input, cta: { ...input.cta, hidden: true } }).p_product).toMatchObject({ cta_hidden: true, cta_url: 'https://shop.example/x' })
  })

  it('a row maps to cta.hidden only when true (missing = shown), keeping the label and link', () => {
    const shown = toProduct(row, new Map())
    expect(shown.cta).toEqual({ label: { en: 'Visit' }, url: 'https://shop.example/x' })
    expect(Object.hasOwn(shown.cta, 'hidden')).toBe(false)
    expect(toProduct({ ...row, cta_hidden: true }, new Map()).cta).toEqual({ label: { en: 'Visit' }, url: 'https://shop.example/x', hidden: true })
  })
})

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseCatalogService } from './supabaseCatalogService'

// ADR-0068: addProductVariant saves the stored product through save_product with one more variant, leaving its 3D files alone.
const UUID1 = '11111111-1111-4111-8111-111111111111'
const UUID2 = '22222222-2222-4222-8222-222222222222'
const variantRow = (id: string, en: string, models: unknown[] = []) => ({ id, product_id: 'p1', name: { en }, color_hex: null, sku: null, price_delta: null, sort_order: 0, product_variant_images: [], product_variant_models: models })
const productRow = (variants: ReturnType<typeof variantRow>[]) => ({
  id: 'p1', business_id: 'b1', slug: 'c', name: { en: 'C' }, short_description: { en: '' }, description: { en: '' }, material: { en: '' },
  cta_label: { en: '' }, cta_url: null, category: 'chair', price: 1, currency: 'EUR', status: 'published', width: 1, height: 1, depth: 1,
  dimension_unit: 'cm', weight_value: null, weight_unit: null, published_at: null, created_at: 'x', updated_at: 'x', models_changed_at: '2026-11-01T00:00:00Z',
  product_images: [], product_models: [], product_variants: variants,
})

function fake(o: { before: ReturnType<typeof variantRow>[]; after: ReturnType<typeof variantRow>[]; saveError?: { message: string; code: string } }, calls: { fn: string; args: Record<string, unknown> }[]) {
  let saved = false
  const builder = () => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'returns', 'order', 'range']) b[m] = () => b
    const result = () => ({ data: productRow(saved ? o.after : o.before), error: null })
    b.single = () => Promise.resolve(result())
    b.maybeSingle = () => Promise.resolve(result())
    b.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(f)
    return b
  }
  return {
    from: builder,
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      if (o.saveError) return Promise.resolve({ data: null, error: o.saveError })
      saved = true
      return Promise.resolve({ data: 'p1', error: null })
    },
    storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }), getPublicUrl: (p: string) => ({ data: { publicUrl: p } }) }) },
  } as unknown as SupabaseClient
}

describe('supabase addProductVariant (ADR-0068)', () => {
  it('sends the stored variants plus the new one (no id, so save_product inserts it), keep_models, and returns the new id', async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = []
    const svc = createSupabaseCatalogService(fake({ before: [variantRow(UUID1, 'Oak')], after: [variantRow(UUID1, 'Oak'), variantRow(UUID2, 'Walnut')] }, calls))
    const res = await svc.addProductVariant('p1', { name: { en: ' Walnut ' }, colorHex: '#5A3E2B' })
    if (!res.ok) throw new Error(res.error.message)
    expect(res.data.variantId).toBe(UUID2)
    expect(res.data.product.variants.map((v) => v.id)).toEqual([UUID1, UUID2])
    const save = calls.find((c) => c.fn === 'save_product')!
    expect(save.args.p_product).toMatchObject({ id: 'p1', keep_models: true, slug: 'c' })
    const sent = save.args.p_variants as { id: string; name: unknown; color_hex: string | null }[]
    expect(sent).toHaveLength(2)
    expect(sent[0]).toMatchObject({ id: UUID1, name: { en: 'Oak' } })
    expect(sent[1]).toMatchObject({ name: { en: 'Walnut' }, color_hex: '#5A3E2B' })
    expect(sent[1]!.id).not.toMatch(/^[0-9a-f]{8}-/)
  })

  it('validates before any write', async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = []
    const svc = createSupabaseCatalogService(fake({ before: [], after: [] }, calls))
    expect(await svc.addProductVariant('p1', { name: { en: '' } })).toMatchObject({ ok: false, error: { code: 'VALIDATION', fieldErrors: { variantName: { key: 'common.validation.product.variantNameRequired' } } } })
    expect(calls.filter((c) => c.fn === 'save_product')).toEqual([])
  })

  it('a refused save is returned as an error', async () => {
    const svc = createSupabaseCatalogService(fake({ before: [], after: [], saveError: { message: 'Product not found or access denied', code: '42501' } }, []))
    const res = await svc.addProductVariant('p1', { name: { en: 'Walnut' } })
    expect(res.ok).toBe(false)
  })
})

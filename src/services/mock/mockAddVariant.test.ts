// ADR-0068: the demo addProductVariant adds one variant to the stored product, then a request can target it.
import { beforeEach, describe, expect, it } from 'vitest'
import type { Product } from '@/domain/types'
import { MAX_VARIANTS } from '../validation'
import { mockCatalogService as svc } from './mockCatalogService'
import { DEMO_REQUEST_TARGET_SLUG } from './seed'
import { store } from './store'

const asOwner = (businessId: string) => localStorage.setItem('arfurn:account', JSON.stringify({ role: 'business_admin', businessId }))
const photos = () => [1, 2].map((i) => new File(['x'], `p${i}.jpg`, { type: 'image/jpeg' }))

let target: Product
beforeEach(async () => {
  localStorage.clear()
  await svc.resetDemoData()
  target = store.get().products.find((p) => p.slug === DEMO_REQUEST_TARGET_SLUG)!
  asOwner(target.businessId)
})

describe('demo addProductVariant (ADR-0068)', () => {
  it('appends the variant with a trimmed name and its swatch, keeps the others and the product, and returns its id', async () => {
    const res = await svc.addProductVariant(target.id, { name: { en: ' Walnut ', pt: 'Nogueira' }, colorHex: '#5a3e2b' })
    if (!res.ok) throw new Error(res.error.message)
    const stored = store.get().products.find((p) => p.id === target.id)!
    expect(stored.variants.slice(0, -1)).toEqual(target.variants)
    const added = stored.variants.at(-1)!
    expect(added).toMatchObject({ id: res.data.variantId, name: { en: 'Walnut', pt: 'Nogueira' }, colorHex: '#5a3e2b' })
    expect(res.data.product.variants.at(-1)).toEqual(added)
    expect({ ...stored, variants: [], updatedAt: '' }).toEqual({ ...target, variants: [], updatedAt: '' })
  })

  it('without a swatch the variant has no colour', async () => {
    const res = await svc.addProductVariant(target.id, { name: { en: 'Matt lacquer' } })
    if (!res.ok) throw new Error(res.error.message)
    expect(Object.hasOwn(res.data.product.variants.at(-1)!, 'colorHex')).toBe(false)
  })

  it('a request for the new variant is accepted while the product has an open request', async () => {
    expect((await svc.requestModel({ businessId: target.businessId, productId: target.id, photos: photos() })).ok).toBe(true)
    const again = await svc.requestModel({ businessId: target.businessId, productId: target.id, photos: photos() })
    expect(again.ok ? 'ok' : again.error.reason).toBe('model_request_open')
    const added = await svc.addProductVariant(target.id, { name: { en: 'Walnut' } })
    if (!added.ok) throw new Error(added.error.message)
    const res = await svc.requestModel({ businessId: target.businessId, productId: target.id, variantId: added.data.variantId, photos: photos() })
    expect(res.ok && res.data.variantId).toBe(added.data.variantId)
  })

  it('refuses an empty name, a bad swatch, a product at the cap and an unknown product, changing nothing', async () => {
    const before = JSON.stringify(store.get().products)
    expect(await svc.addProductVariant(target.id, { name: { en: '  ' } })).toMatchObject({ ok: false, error: { code: 'VALIDATION', fieldErrors: { variantName: { key: 'common.validation.product.variantNameRequired' } } } })
    expect(await svc.addProductVariant(target.id, { name: { en: 'Walnut' }, colorHex: 'brown' })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(await svc.addProductVariant('prd_missing', { name: { en: 'Walnut' } })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(JSON.stringify(store.get().products)).toBe(before)
    store.update((d) => {
      d.products = d.products.map((p) => (p.id === target.id ? { ...p, variants: Array.from({ length: MAX_VARIANTS }, (_, i) => ({ id: `var_${i}`, name: { en: `V${i}` } })) } : p))
    })
    expect(await svc.addProductVariant(target.id, { name: { en: 'Walnut' } })).toMatchObject({ ok: false, error: { code: 'VALIDATION', fieldErrors: { variants: { key: 'common.validation.product.variantsMax' } } } })
  })
})

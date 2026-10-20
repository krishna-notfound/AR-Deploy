import { describe, expect, it } from 'vitest'
import type { ModelAsset, Product, ProductImage, ProductVariant } from '@/domain/types'
import { pickVariant, variantMedia } from './variantMedia'

const asset = (format: 'glb' | 'usdz', url: string): ModelAsset => ({ format, url, fileName: url, status: 'valid' })
const image = (id: string): ProductImage => ({ id, url: `https://img.test/${id}.jpg`, isPrimary: true, kind: 'gallery' })
const product: Pick<Product, 'images' | 'models'> = {
  images: [image('base'), { ...image('room'), isPrimary: false, kind: 'additional' }],
  models: { glb: asset('glb', 'base.glb'), usdz: asset('usdz', 'base.usdz') },
}
const own: ProductVariant = { id: 'v1', name: { en: 'Damask' }, images: [image('damask')], models: { glb: asset('glb', 'damask.glb') } }
const plain: ProductVariant = { id: 'v2', name: { en: 'Mango' } }

describe('variantMedia', () => {
  it('uses the variant photos and GLB, and never pairs that GLB with the product USDZ', () => {
    const m = variantMedia(product, own)
    expect(m.gallery.map((i) => i.id)).toEqual(['damask'])
    expect(m.models.glb?.url).toBe('damask.glb')
    expect(m.models.usdz).toBeUndefined()
    expect(m).toMatchObject({ ownModel: true, fallback: false })
  })

  it('pairs a variant GLB with the variant USDZ', () => {
    const m = variantMedia(product, { ...own, models: { glb: asset('glb', 'damask.glb'), usdz: asset('usdz', 'damask.usdz') } })
    expect([m.models.glb?.url, m.models.usdz?.url]).toEqual(['damask.glb', 'damask.usdz'])
  })

  it('falls back to the product gallery and model pair, and says so', () => {
    const m = variantMedia(product, plain)
    expect(m.gallery.map((i) => i.id)).toEqual(['base'])
    expect([m.models.glb?.url, m.models.usdz?.url]).toEqual(['base.glb', 'base.usdz'])
    expect(m).toMatchObject({ ownModel: false, fallback: true })
  })

  it('a variant USDZ without its GLB is not used (the product pair is shown)', () => {
    const m = variantMedia(product, { ...plain, models: { usdz: asset('usdz', 'lonely.usdz') } })
    expect(m.models.usdz?.url).toBe('base.usdz')
    expect(m.fallback).toBe(true)
  })

  it('no fallback note without a variant or without any model', () => {
    expect(variantMedia(product).fallback).toBe(false)
    expect(variantMedia({ images: product.images, models: {} }, plain).fallback).toBe(false)
  })
})

describe('pickVariant (?variant= deep link)', () => {
  it('opens the linked variant, or the first one for a missing or unknown id', () => {
    expect(pickVariant([own, plain], 'v2')?.id).toBe('v2')
    expect(pickVariant([own, plain], 'nope')?.id).toBe('v1')
    expect(pickVariant([own, plain], null)?.id).toBe('v1')
    expect(pickVariant([], 'v1')).toBeUndefined()
  })
})

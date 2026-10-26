import { describe, expect, it } from 'vitest'
import type { ModelAsset, Product } from '@/domain/types'
import { convertDims, emptyForm, toInput, withFreshModelUrls } from './formModel'

describe('convertDims (AR-10)', () => {
  it('converts back to the exact values entered instead of compounding the rounding', () => {
    const cm = { width: '83', height: '69', depth: '57' }
    const inches = convertDims(cm, 'cm', 'in')
    expect(inches).toEqual({ width: '32.7', height: '27.2', depth: '22.4' })
    expect(convertDims(inches, 'in', 'cm')).toEqual({ width: '83.1', height: '69.1', depth: '56.9' }) // the old drift
    expect(convertDims(inches, 'in', 'cm', { unit: 'cm', dims: cm })).toEqual(cm)
  })

  it('converts normally once the numbers were edited after the last conversion', () => {
    const edited = { width: '40', height: '27.2', depth: '22.4' }
    expect(convertDims(edited, 'in', 'cm', { unit: 'cm', dims: { width: '83', height: '69', depth: '57' } }).width).toBe('101.6')
  })
})

describe('toInput: options with their own files', () => {
  it('asks for a name instead of silently dropping an unnamed option that has photos or models', () => {
    const form = emptyForm()
    form.input.variants = [{ id: 'v', name: { en: '' }, images: [{ id: 'i', url: 'data:x', isPrimary: true, kind: 'gallery' }] }]
    expect(toInput(form).errors.variants).toBe('Every option needs an English name.')
  })
})

describe('withFreshModelUrls: re-signed 3D file URLs', () => {
  const asset = (path: string, url: string): ModelAsset => ({ format: 'glb', url, fileName: 'm.glb', status: url ? 'valid' : 'invalid', storagePath: path })

  it('takes the fresh URL for the same stored file and keeps unsaved replacements and every other field', () => {
    const form = emptyForm()
    form.input.name = { en: 'Typed name' }
    form.input.models = { glb: asset('b1/m.glb', 'https://old/m.glb'), usdz: asset('b1/new.usdz', 'https://old/new.usdz') }
    form.input.variants = [{ id: 'v1', name: { en: 'Oak' }, models: { glb: asset('b1/v.glb', '') } }]
    const stored = {
      models: { glb: asset('b1/m.glb', 'https://fresh/m.glb'), usdz: asset('b1/stored.usdz', 'https://fresh/stored.usdz') },
      variants: [{ id: 'v1', name: { en: 'Oak' }, models: { glb: asset('b1/v.glb', 'https://fresh/v.glb') } }],
    } as unknown as Product
    const next = withFreshModelUrls(form, stored)
    expect(next.input.name).toEqual({ en: 'Typed name' })
    expect(next.input.models.glb).toMatchObject({ url: 'https://fresh/m.glb', status: 'valid' })
    expect(next.input.models.usdz).toMatchObject({ url: 'https://old/new.usdz', storagePath: 'b1/new.usdz' })
    expect(next.input.variants[0]?.models?.glb).toMatchObject({ url: 'https://fresh/v.glb', status: 'valid' })
  })
})

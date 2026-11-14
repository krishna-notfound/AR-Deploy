import { describe, expect, it } from 'vitest'
import type { ModelAsset, Product } from '@/domain/types'
import { convertDims, emptyForm, toInput, withAddedVariant, withFreshModelUrls } from './formModel'

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

describe('withAddedVariant (ADR-0068)', () => {
  it('appends a variant stored from the request form once, keeping every unsaved field and option', () => {
    const form = emptyForm()
    form.input.name = { en: 'Typed, not saved' }
    form.input.variants = [{ id: 'var_unsaved', name: { en: 'Draft option' } }]
    const walnut = { id: 'v-walnut', name: { en: 'Walnut' }, colorHex: '#5a3e2b' }
    const next = withAddedVariant(form, walnut)
    expect(next.input.name.en).toBe('Typed, not saved')
    expect(next.input.variants).toEqual([{ id: 'var_unsaved', name: { en: 'Draft option' } }, walnut])
    expect(withAddedVariant(next, walnut)).toBe(next)
  })
})
describe('toInput: numbers (QA FV-04, FV-05)', () => {
  const withDims = (width: string, weightText = '') => {
    const form = emptyForm()
    form.dims = { width, height: '10', depth: '10' }
    form.weightText = weightText
    return toInput(form)
  }

  it('refuses text that only starts like a number instead of saving a different value', () => {
    expect(withDims('12abc').errors['dimensions.width']).toBe('Enter a positive number.')
    expect(withDims('1.2.3').errors['dimensions.width']).toBe('Enter a positive number.')
    expect(withDims('1e3').errors['dimensions.width']).toBe('Enter a positive number.')
    expect(withDims('10', '5kg').errors.weight).toBe('Enter a positive weight or leave it empty.')
    expect(withDims('10', '2..5').errors.weight).toBe('Enter a positive weight or leave it empty.')
  })

  it('still reads plain numbers, with a comma or a point', () => {
    expect(withDims('83,5').input.dimensions.width).toBe(83.5)
    expect(withDims('83.5', '12,5').input.weight?.value).toBe(12.5)
    expect(withDims('.5').input.dimensions.width).toBe(0.5)
    expect(withDims('83.5').errors).toEqual({})
  })

  it('names the limit for a price, a size and a weight that are too large', () => {
    const form = emptyForm()
    form.priceText = '99999999999'
    form.dims = { width: '1000000', height: '10', depth: '10' }
    form.weightText = '99999999'
    const { errors } = toInput(form)
    expect(errors.price).toBe('This amount is too high. Enter an amount below 21 million.')
    expect(errors['dimensions.width']).toBe('This number is too large. Enter a value below 1 million.')
    expect(errors.weight).toBe('This number is too large. Enter a value below 1 million.')
  })

  it('names the limit for a price difference that is too large', () => {
    const form = emptyForm()
    form.input.variants = [{ id: 'v', name: { en: 'Oak' }, priceDelta: 3_000_000_000 }]
    expect(toInput(form).errors.variants).toBe('This amount is too high. Enter an amount below 21 million.')
  })
})
import { describe, expect, it } from 'vitest'
import { convertDims, emptyForm, toInput } from './formModel'

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

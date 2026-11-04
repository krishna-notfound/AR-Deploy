import { describe, expect, it } from 'vitest'
import { checkScale, modelSizeSuggestion } from './scale'

// "Use the model's size" (owner 2026-11-04): the entered dimensions are wrong, the model is right; one tap fixes the form.
describe('modelSizeSuggestion', () => {
  const entered = { width: 100, height: 100, depth: 100, unit: 'cm' as const }

  it('offers the model size in the form unit when the entered dimensions are off', () => {
    const scale = checkScale({ x: 0.87, y: 0.762, z: 1.003 }, entered)
    expect(scale.status).toBe('mismatch')
    expect(modelSizeSuggestion(scale, 'cm')).toEqual({ width: '87', height: '76', depth: '100.5' })
  })

  it('rounds to half a centimetre and to a quarter inch', () => {
    const scale = checkScale({ x: 0.8874, y: 0.6893, z: 0.9801 }, entered)
    expect(modelSizeSuggestion(scale, 'cm')).toEqual({ width: '88.5', height: '69', depth: '98' })
    expect(modelSizeSuggestion(scale, 'in')).toEqual({ width: '35', height: '27.25', depth: '38.5' })
  })

  it('checks as verified once applied', () => {
    const scale = checkScale({ x: 0.8874, y: 0.6893, z: 0.9801 }, entered)
    const s = modelSizeSuggestion(scale, 'cm')!
    expect(checkScale({ x: 0.8874, y: 0.6893, z: 0.9801 }, { width: +s.width, height: +s.height, depth: +s.depth, unit: 'cm' }).status).toBe('verified')
  })

  it('is not offered when the model file itself is in millimetres (the dresser: about 800 m tall in AR)', () => {
    const scale = checkScale({ x: 602.5, y: 798.5, z: 1799.6 }, { width: 60, height: 80, depth: 180, unit: 'cm' })
    expect(scale.status === 'mismatch' && scale.reason).toBe('model-units')
    expect(modelSizeSuggestion(scale, 'cm')).toBeNull()
  })

  it('is not offered for a model under 1 cm or over 10 m on a side, nor when the scale is verified or unknown', () => {
    expect(modelSizeSuggestion(checkScale({ x: 12, y: 0.8, z: 0.9 }, entered), 'cm')).toBeNull()
    expect(modelSizeSuggestion(checkScale({ x: 0.005, y: 0.8, z: 0.9 }, entered), 'cm')).toBeNull()
    expect(modelSizeSuggestion(checkScale({ x: 1, y: 1, z: 1 }, entered), 'cm')).toBeNull()
    expect(modelSizeSuggestion(checkScale(null, entered), 'cm')).toBeNull()
  })
})

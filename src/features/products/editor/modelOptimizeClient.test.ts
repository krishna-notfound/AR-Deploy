import { describe, expect, it } from 'vitest'
import { isOptimizationOn, optimizedNote } from './modelOptimizeClient'

describe('model optimization switch (owner 2026-10-26, ADR-0038)', () => {
  it('is on unless VITE_MODEL_OPTIMIZATION is "off"', () => {
    expect(isOptimizationOn(undefined)).toBe(true)
    expect(isOptimizationOn('')).toBe(true)
    expect(isOptimizationOn('on')).toBe(true)
    expect(isOptimizationOn('off')).toBe(false)
  })
})

describe('optimizedNote', () => {
  const MB = 1024 * 1024
  it('names the triangle reduction when the model was simplified', () => {
    const note = optimizedNote({ originalBytes: 16.7 * MB, outputBytes: 3.2 * MB, trianglesBefore: 440_384, trianglesAfter: 99_812 })
    expect(note).toContain('16.7 MB → 3.2 MB')
    expect(note).toContain('440,384 → 99,812 triangles')
    expect(note).toContain('true size unchanged')
  })
  it('says only textures and cleanup when the triangle count did not change', () => {
    const note = optimizedNote({ originalBytes: 16.7 * MB, outputBytes: 13.7 * MB, trianglesBefore: 50_000, trianglesAfter: 50_000 })
    expect(note).not.toContain('triangles')
    expect(note).toContain('textures above 2048 px reduced')
  })
})

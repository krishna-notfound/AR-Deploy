import { describe, expect, it } from 'vitest'
import { scaleProposal } from './scale'

// ADR-0058: a model authored in other units is offered a "Fix the scale" step at upload.
describe('scaleProposal', () => {
  it('a dresser modelled in millimetres (602 x 1800 x 798 "metres") suggests x0.001, with or without dimensions', () => {
    const measured = { x: 602, y: 1800, z: 798 }
    expect(scaleProposal(measured)).toEqual({ kind: 'too-large', suggested: { factor: 0.001, label: 'mm' }, reason: 'over-10m' })
    expect(scaleProposal(measured, { width: 60, height: 180, depth: 80, unit: 'cm' })).toEqual({ kind: 'units', suggested: { factor: 0.001, label: 'mm' }, reason: 'dimensions-match' })
  })

  it('a sofa modelled in centimetres suggests x0.01', () => {
    expect(scaleProposal({ x: 200, y: 85, z: 90 })).toEqual({ kind: 'too-large', suggested: { factor: 0.01, label: 'cm' }, reason: 'over-10m' })
    expect(scaleProposal({ x: 200, y: 85, z: 90 }, { width: 200, height: 85, depth: 90, unit: 'cm' })?.suggested).toEqual({ factor: 0.01, label: 'cm' })
  })

  it('a chair modelled in inches is recognised from the entered dimensions (x0.0254)', () => {
    const p = scaleProposal({ x: 20, y: 36, z: 22 }, { width: 50.8, height: 91.44, depth: 55.88, unit: 'cm' })
    expect(p).toEqual({ kind: 'units', suggested: { factor: 0.0254, label: 'in' }, reason: 'dimensions-match' })
  })

  it('a small piece in centimetres is caught by its dimensions even though no side is over 10', () => {
    const p = scaleProposal({ x: 8, y: 8, z: 5 }, { width: 8, height: 8, depth: 5, unit: 'cm' })
    expect(p).toMatchObject({ kind: 'units', suggested: { factor: 0.01, label: 'cm' } })
  })

  it('a chair already in metres gets no proposal', () => {
    expect(scaleProposal({ x: 0.5, y: 0.9, z: 0.5 })).toBeNull()
    expect(scaleProposal({ x: 0.5, y: 0.9, z: 0.5 }, { width: 50, height: 90, depth: 50, unit: 'cm' })).toBeNull()
    expect(scaleProposal({ x: 10, y: 0.5, z: 0.5 })).toBeNull() // exactly 10 m is still allowed
  })

  it('a tiny model (under 1 cm everywhere) suggests a power-of-ten factor; a thin rug does not', () => {
    expect(scaleProposal({ x: 0.004, y: 0.006, z: 0.009 })).toEqual({ kind: 'too-small', suggested: { factor: 100, label: 'custom' }, reason: 'under-1cm' })
    expect(scaleProposal({ x: 2, y: 0.005, z: 3 })).toBeNull()
  })

  it('a size no unit explains still gets a custom factor that lands the longest side near a metre', () => {
    const p = scaleProposal({ x: 50_000, y: 20_000, z: 20_000 })
    expect(p?.kind).toBe('too-large')
    expect(p?.suggested.label).toBe('custom')
    expect(50_000 * p!.suggested.factor).toBeGreaterThanOrEqual(0.3)
    expect(50_000 * p!.suggested.factor).toBeLessThanOrEqual(3)
  })

  it('ignores an empty or invalid measurement', () => {
    expect(scaleProposal({ x: 0, y: 0, z: 0 })).toBeNull()
    expect(scaleProposal({ x: Number.NaN, y: 1, z: 1 })).toBeNull()
  })
})

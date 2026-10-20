import { describe, expect, it } from 'vitest'
import type { ModelAsset } from '@/domain/types'
import { MB } from '@/lib/files'
import { arReadiness, variantMediaSummary } from './readiness'

const glb: ModelAsset = { format: 'glb', url: 'https://x.test/a.glb', fileName: 'a.glb', sizeBytes: 2 * MB, status: 'valid' }
const usdz: ModelAsset = { format: 'usdz', url: 'https://x.test/a.usdz', fileName: 'a.usdz', status: 'valid' }
const verified = { status: 'verified', measured: { x: 1, y: 1, z: 1 }, expected: { x: 1, y: 1, z: 1 } } as const
const levels = (items: ReturnType<typeof arReadiness>) => Object.fromEntries(items.map((i) => [i.key, i.level]))

describe('arReadiness', () => {
  it('is fully ready with a loaded GLB, a USDZ and verified scale', () => {
    expect(levels(arReadiness({ glb, usdz, preview: 'loaded', scale: verified }))).toEqual({ viewer: 'ready', android: 'ready', ios: 'ready', scale: 'ready' })
  })

  it('without a GLB nothing is AR ready', () => {
    const r = levels(arReadiness({ preview: 'loading', scale: { status: 'unknown' } }))
    expect(r.viewer).toBe('missing')
    expect(r.android).toBe('missing')
    expect(r.ios).toBe('missing')
  })

  it('a GLB that fails to load blocks the viewer and Android AR', () => {
    const r = levels(arReadiness({ glb, preview: 'error', scale: { status: 'unknown' } }))
    expect(r.viewer).toBe('missing')
    expect(r.android).toBe('missing')
  })

  it('iOS without a USDZ is a warning (generated on the device, not guaranteed)', () => {
    const r = arReadiness({ glb, preview: 'loaded', scale: verified })
    expect(r.find((i) => i.key === 'ios')).toMatchObject({ level: 'warning' })
  })

  it('a scale mismatch is a warning, never ready', () => {
    const r = levels(arReadiness({ glb, usdz, preview: 'loaded', scale: { status: 'mismatch', measured: { x: 2, y: 1, z: 1 }, expected: { x: 1, y: 1, z: 1 }, maxDeviation: 1 } }))
    expect(r.scale).toBe('warning')
  })

  it('warns about a large GLB', () => {
    const r = arReadiness({ glb: { ...glb, sizeBytes: 25 * MB }, usdz, preview: 'loaded', scale: verified })
    expect(r.find((i) => i.key === 'size')).toMatchObject({ level: 'warning' })
  })

  it('treats a session-only upload that is gone after reload as missing', () => {
    const stale: ModelAsset = { ...glb, url: 'blob:http://localhost/gone', status: 'session-only' }
    expect(levels(arReadiness({ glb: stale, preview: 'loaded', scale: verified })).viewer).toBe('missing')
  })

  it('treats an invalid or missing file as no model', () => {
    for (const status of ['invalid', 'missing'] as const)
      expect(levels(arReadiness({ glb: { ...glb, status }, usdz: { ...usdz, status }, preview: 'loaded', scale: verified }))).toMatchObject({ viewer: 'missing', ios: 'missing' })
  })

  it('a USDZ without a GLB is not iPhone AR ready: the page shows 3D and AR only with a GLB (AR-06)', () => {
    const ios = arReadiness({ usdz, preview: 'loading', scale: { status: 'unknown' } }).find((i) => i.key === 'ios')
    expect(ios).toMatchObject({ level: 'missing' })
    expect(ios?.detail).toMatch(/Add the GLB too/)
  })

  it('iPhone AR is not ready while the GLB fails to load, even with a USDZ', () => {
    expect(levels(arReadiness({ glb, usdz, preview: 'error', scale: { status: 'unknown' } })).ios).toBe('missing')
  })

  it('Android AR is a warning for a GLB that requires an extension Scene Viewer cannot open (AR-01/02)', () => {
    const stored = arReadiness({ glb: { ...glb, requiredExtensions: ['KHR_texture_transform', 'EXT_texture_webp'] }, usdz, preview: 'loaded', scale: verified })
    expect(stored.find((i) => i.key === 'android')).toMatchObject({ level: 'warning', detail: expect.stringContaining('EXT_texture_webp') })
    // Read from the loaded file when nothing was stored (linked or older models).
    const detected = arReadiness({ glb, usdz, preview: 'loaded', scale: verified, requiredExtensions: ['KHR_draco_mesh_compression'] })
    expect(levels(detected).android).toBe('warning')
    expect(levels(arReadiness({ glb: { ...glb, requiredExtensions: ['KHR_texture_transform'] }, usdz, preview: 'loaded', scale: verified })).android).toBe('ready')
  })
})

describe('variantMediaSummary', () => {
  it('counts options with their own model and explains what each one shows', () => {
    const s = variantMediaSummary([
      { id: 'a', name: { en: 'Mango' }, models: { glb, usdz } },
      { id: 'b', name: { en: 'Damask' }, images: [{ id: 'i', url: 'x', isPrimary: true, kind: 'gallery' }], models: { glb: { ...glb, requiredExtensions: ['EXT_texture_webp'] } } },
      { id: 'c', name: { en: 'Plain' } },
    ])
    expect(s.withModel).toBe(2)
    expect(s.total).toBe(3)
    expect(s.lines.map((l) => l.level)).toEqual(['ready', 'warning', 'missing'])
    expect(s.lines[1]!.detail).toMatch(/1 own photo .*Android AR not offered/)
    expect(s.lines[2]!.detail).toMatch(/product photos .*product 3D model shown/)
  })
})

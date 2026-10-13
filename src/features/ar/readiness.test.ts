import { describe, expect, it } from 'vitest'
import type { ModelAsset } from '@/domain/types'
import { MB } from '@/lib/files'
import { arReadiness } from './readiness'

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
})

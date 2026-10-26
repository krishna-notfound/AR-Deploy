import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelAsset } from '@/domain/types'
import { service } from '@/services'
import { ModelSection } from './ModelSection'

const viewer = vi.hoisted(() => ({ outcome: 'load' as 'load' | 'error' }))

// The real viewer needs WebGL: this one reports a model of 0.5 × 0.9 × 0.5 m as soon as it mounts (or fails to load).
vi.mock('@/components/three/ModelViewer', () => ({
  MODEL_STALL_TIMEOUT_MS: 45_000,
  ModelViewer: ({ onLoad, onError }: { onLoad?: (i: { dimensions: { x: number; y: number; z: number }; requiredExtensions?: string[] }) => void; onError?: () => void }) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, like a real load
    useEffect(() => (viewer.outcome === 'error' ? onError?.() : onLoad?.({ dimensions: { x: 0.5, y: 0.9, z: 0.5 } })), [])
    return <div data-testid="viewer" />
  },
}))

const glb: ModelAsset = { format: 'glb', url: 'https://signed/m.glb', fileName: 'chair.glb', sizeBytes: 2048, status: 'valid', storagePath: 'b1/m.glb' }
const dimensions = { width: 50, height: 90, depth: 50, unit: 'cm' as const }

/** The smallest archive the USDZ upload check accepts: a stored model.usda first, then the end-of-archive record. */
const tinyUsdz = vi.hoisted(() => () => {
  const name = new TextEncoder().encode('model.usda')
  const data = new TextEncoder().encode('#usda 1.0')
  const out = new Uint8Array(30 + name.length + data.length + 22)
  const v = new DataView(out.buffer)
  v.setUint32(0, 0x04034b50, true)
  v.setUint16(4, 20, true)
  v.setUint16(26, name.length, true)
  out.set(name, 30)
  out.set(data, 30 + name.length)
  v.setUint32(30 + name.length + data.length, 0x06054b50, true)
  return out
})
const usdzBuild = vi.hoisted(() => ({ fn: vi.fn(async (_glb: ArrayBuffer) => tinyUsdz()) }))
vi.mock('./usdzFromGlb', () => ({
  buildUsdzFromGlb: (glb: ArrayBuffer) => usdzBuild.fn(glb),
  usdzNameFor: (n: string) => n.replace(/\.glb$/i, '') + '-from-glb.usdz',
}))

describe('USDZ section: Build from GLB (owner 2026-10-27, ADR-0039)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('with a GLB and no USDZ, builds the iPhone file from the GLB and uploads it like a picked USDZ', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([9, 9])))
    vi.spyOn(service, 'uploadAsset').mockImplementation(async () => ({ ok: true, data: { url: 'https://signed/u.usdz', storagePath: 'b1/u.usdz', status: 'valid' } }) as never)
    const onChange = vi.fn()
    render(<ModelSection models={{ glb }} onChange={onChange} dimensions={dimensions} name="Chair" businessId="b1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Build from GLB' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('usdz', expect.objectContaining({ format: 'usdz', fileName: 'chair-from-glb.usdz', storagePath: 'b1/u.usdz' })))
    expect(globalThis.fetch).toHaveBeenCalledWith(glb.url)
    expect(usdzBuild.fn).toHaveBeenCalledTimes(1)
    const upload = vi.mocked(service.uploadAsset).mock.calls[0]![0]
    expect(upload).toMatchObject({ kind: 'usdz', businessId: 'b1' })
    expect(upload.file.name).toBe('chair-from-glb.usdz')
  })

  it('offers no build without a GLB, or when a USDZ is already there', () => {
    const usdz: ModelAsset = { format: 'usdz', url: 'https://signed/u.usdz', fileName: 'u.usdz', status: 'valid' }
    const { rerender } = render(<ModelSection models={{}} onChange={() => {}} dimensions={dimensions} name="Chair" businessId="b1" />)
    expect(screen.queryByRole('button', { name: 'Build from GLB' })).toBeNull()
    rerender(<ModelSection models={{ glb, usdz }} onChange={() => {}} dimensions={dimensions} name="Chair" businessId="b1" />)
    expect(screen.queryByRole('button', { name: 'Build from GLB' })).toBeNull()
  })

  it('a build that fails says so and keeps the upload controls', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([9, 9])))
    usdzBuild.fn.mockRejectedValueOnce(new Error('bad glb'))
    render(<ModelSection models={{ glb }} onChange={() => {}} dimensions={dimensions} name="Chair" businessId="b1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Build from GLB' }))
    expect(await screen.findByText(/could not build the iPhone file from this GLB/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Upload \.usdz file/)).toBeEnabled()
  })
})

describe('S4 Task 6: ModelSection in a request', () => {
  it('context request hides the URL input and shows the scale check', async () => {
    render(<ModelSection context="request" models={{ glb }} onChange={() => {}} dimensions={dimensions} name="Chair" businessId="b1" />)
    expect(screen.queryByRole('textbox', { name: /model URL/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Link' })).toBeNull()
    expect(screen.getByText(/Files stay with the request, not the product, until you deliver it\./)).toBeInTheDocument()
    expect(screen.getByLabelText(/Replace \.glb file/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Upload \.usdz file/)).toBeInTheDocument()
    expect(await screen.findByText(/Scale verified: the model matches the entered dimensions/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'AR readiness' })).toBeInTheDocument()
  })

  it('the product context still offers the URL input', () => {
    render(<ModelSection models={{}} onChange={() => {}} dimensions={dimensions} name="Chair" businessId="b1" />)
    expect(screen.getAllByRole('textbox', { name: /model URL/i })).toHaveLength(2)
  })
})

describe('3D preview: unavailable files and load failures', () => {
  afterEach(() => {
    viewer.outcome = 'load'
  })

  it('a stored file without a URL (signing failed) shows the unavailable state, not the viewer', () => {
    render(<ModelSection models={{ glb: { ...glb, url: '', status: 'invalid' } }} onChange={() => {}} dimensions={dimensions} name="Chair" businessId="b1" />)
    expect(screen.getByText('This model file is unavailable. Upload it again.')).toBeInTheDocument()
    expect(screen.queryByTestId('viewer')).toBeNull()
    expect(screen.getByLabelText(/Replace \.glb file/)).toBeEnabled()
  })

  it('an invalid file is unavailable even with a URL', () => {
    render(<ModelSection models={{ glb: { ...glb, status: 'invalid' } }} onChange={() => {}} dimensions={dimensions} name="Chair" businessId="b1" />)
    expect(screen.getByText('This model file is unavailable. Upload it again.')).toBeInTheDocument()
    expect(screen.queryByTestId('viewer')).toBeNull()
  })

  it('a load failure explains honestly (no CORS blame) and Try again fetches fresh URLs', async () => {
    viewer.outcome = 'error'
    const onRefreshUrls = vi.fn()
    render(<ModelSection models={{ glb }} onChange={() => {}} dimensions={dimensions} name="Chair" businessId="b1" onRefreshUrls={onRefreshUrls} />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The 3D preview could not load')
    expect(alert).toHaveTextContent('The file may still be fine. Try again; if it keeps failing, upload the file again.')
    expect(alert.textContent).not.toMatch(/CORS|cross-origin/i)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRefreshUrls).toHaveBeenCalledTimes(1)
  })
})

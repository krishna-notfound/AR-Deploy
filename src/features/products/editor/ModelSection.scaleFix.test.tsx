import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductModels } from '@/domain/types'
import { service } from '@/services'
import { ModelSection } from './ModelSection'
import { boxGlb } from './scaledGlb.testutil'

// The real viewer needs WebGL, and workers do not exist in jsdom: the optimizer calls run in-process on the real functions.
vi.mock('@/components/three/ModelViewer', () => ({ MODEL_STALL_TIMEOUT_MS: 45_000, ModelViewer: () => <div data-testid="viewer" /> }))
vi.mock('./modelOptimizeClient', async (importOriginal) => {
  const real = await importOriginal<typeof import('./modelOptimizeClient')>()
  const { applyUniformScale, measureGlb } = await import('./modelOptimize')
  const bytes = async (f: File) => new Uint8Array(await f.arrayBuffer())
  return {
    ...real,
    optimizeModel: async (file: File) => ({ file, optimized: false, originalBytes: file.size, outputBytes: file.size, reason: 'Kept the original: it is already compact.' }),
    measureModel: async (file: File) => measureGlb(await bytes(file)),
    scaleModel: async (file: File, factor: number) => new File([(await applyUniformScale(await bytes(file), factor)) as BlobPart], file.name, { type: file.type }),
  }
})

const dimensions = { width: 60, height: 180, depth: 80, unit: 'cm' as const }
let uploaded: File | undefined

beforeEach(() => {
  uploaded = undefined
  vi.spyOn(service, 'uploadAsset').mockImplementation((async ({ file }: { file: File }) => {
    uploaded = file
    return { ok: true, data: { url: 'https://signed/m.glb', storagePath: 'b1/m.glb', status: 'valid' } }
  }) as never)
})
afterEach(() => vi.restoreAllMocks())

/** Keeps the uploaded model in state, as the editor does, so the note under the slot shows. */
function Harness({ onChange, dims }: { onChange: (format: string, asset: unknown) => void; dims: typeof dimensions }) {
  const [models, setModels] = useState<ProductModels>({})
  return (
    <ModelSection
      models={models}
      onChange={(format, asset) => {
        onChange(format, asset)
        setModels((m) => ({ ...m, [format]: asset }))
      }}
      dimensions={dims}
      name="Dresser"
      businessId="b1"
    />
  )
}

async function pick(file: File, dims = dimensions) {
  const onChange = vi.fn()
  render(<Harness onChange={onChange} dims={dims} />)
  fireEvent.change(screen.getByLabelText(/Upload \.glb file/), { target: { files: [file] } })
  return onChange
}

/** The size of a scaled upload, read back with a plain reader. */
async function uploadedHeight(): Promise<number> {
  const { measureGlb } = await import('./modelOptimize')
  return (await measureGlb(new Uint8Array(await uploaded!.arrayBuffer())))!.y
}

describe('Fix the scale at upload (ADR-0058)', () => {
  it('shows the panel for a dresser modelled in millimetres, before anything is uploaded', async () => {
    await pick(await boxGlb(602, 1800, 798))
    const panel = await screen.findByRole('region', { name: 'Fix the scale' })
    expect(panel).toHaveTextContent('This model measures 602 × 1,800 × 798 m (1,800 m tall). It looks like it was made in millimetres.')
    expect(panel).toHaveTextContent('Your entered dimensions: 60 × 180 × 80 cm.')
    expect(within(panel).getByRole('radio', { name: /Convert from millimetres/ })).toBeChecked()
    expect(panel).toHaveTextContent('Becomes 0.602 × 1.8 × 0.798 m')
    expect(panel).toHaveTextContent('Matches your dimensions')
    expect(panel).toHaveTextContent('Becomes 6.02 × 18 × 7.98 m') // centimetres: still wrong, and it says so
    expect(panel).toHaveTextContent('Still outside 1 cm to 10 m')
    expect(service.uploadAsset).not.toHaveBeenCalled()
  })

  it('"Apply and upload" uploads the file scaled by the chosen factor and says so in the note', async () => {
    const onChange = await pick(await boxGlb(602, 1800, 798))
    await screen.findByRole('region', { name: 'Fix the scale' })
    fireEvent.click(screen.getByRole('button', { name: 'Apply and upload' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('glb', expect.objectContaining({ format: 'glb', storagePath: 'b1/m.glb' })))
    expect(await uploadedHeight()).toBeCloseTo(1.8, 6)
    expect(screen.queryByRole('region', { name: 'Fix the scale' })).toBeNull()
    expect(await screen.findByText(/Scale fixed: multiplied by 0\.001, now 0\.602 × 1\.8 × 0\.798 m\./)).toBeInTheDocument()
  })

  it('a custom factor is applied as typed, and an invalid one cannot be applied', async () => {
    await pick(await boxGlb(602, 1800, 798))
    await screen.findByRole('region', { name: 'Fix the scale' })
    fireEvent.click(screen.getByRole('radio', { name: /Custom factor/ }))
    const input = screen.getByLabelText('Scale factor')
    fireEvent.change(input, { target: { value: '0' } })
    expect(screen.getByRole('button', { name: 'Apply and upload' })).toBeDisabled()
    fireEvent.change(input, { target: { value: '0,01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply and upload' }))
    await waitFor(() => expect(uploaded).toBeDefined())
    expect(await uploadedHeight()).toBeCloseTo(18, 6)
  })

  it('"Upload without changes" and the Keep as is choice upload the original file untouched', async () => {
    const file = await boxGlb(602, 1800, 798)
    const onChange = await pick(file)
    await screen.findByRole('region', { name: 'Fix the scale' })
    fireEvent.click(screen.getByRole('button', { name: 'Upload without changes' }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(uploaded).toBe(file)
    expect(await screen.findByText(/Scale left as is: the model measures 602 × 1,800 × 798 m\./)).toBeInTheDocument()
  })

  it('Keep as is, then Apply and upload, also uploads the original', async () => {
    const file = await boxGlb(602, 1800, 798)
    await pick(file)
    await screen.findByRole('region', { name: 'Fix the scale' })
    fireEvent.click(screen.getByRole('radio', { name: /Keep as is/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply and upload' }))
    await waitFor(() => expect(uploaded).toBe(file))
  })

  it('Cancel uploads nothing and closes the panel', async () => {
    await pick(await boxGlb(602, 1800, 798))
    await screen.findByRole('region', { name: 'Fix the scale' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('region', { name: 'Fix the scale' })).toBeNull()
    expect(service.uploadAsset).not.toHaveBeenCalled()
  })

  it('a normal model in metres uploads straight away, with no panel', async () => {
    const file = await boxGlb(0.6, 1.8, 0.8)
    const onChange = await pick(file, dimensions)
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Fix the scale' })).toBeNull()
    expect(uploaded).toBe(file)
  })
})

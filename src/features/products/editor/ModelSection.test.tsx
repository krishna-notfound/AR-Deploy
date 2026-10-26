import { render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ModelAsset } from '@/domain/types'
import { ModelSection } from './ModelSection'

// The real viewer needs WebGL: this one reports a model of 0.5 × 0.9 × 0.5 m as soon as it mounts.
vi.mock('@/components/three/ModelViewer', () => ({
  MODEL_STALL_TIMEOUT_MS: 45_000,
  ModelViewer: ({ onLoad }: { onLoad?: (i: { dimensions: { x: number; y: number; z: number }; requiredExtensions?: string[] }) => void }) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, like a real load
    useEffect(() => onLoad?.({ dimensions: { x: 0.5, y: 0.9, z: 0.5 } }), [])
    return <div data-testid="viewer" />
  },
}))

const glb: ModelAsset = { format: 'glb', url: 'https://signed/m.glb', fileName: 'chair.glb', sizeBytes: 2048, status: 'valid', storagePath: 'b1/m.glb' }
const dimensions = { width: 50, height: 90, depth: 50, unit: 'cm' as const }

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

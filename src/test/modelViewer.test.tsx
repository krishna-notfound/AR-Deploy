import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModelViewer } from '@/components/three/ModelViewer'

// The real web component needs WebGL; the wrapper's event wiring is what is under test here.
vi.mock('@google/model-viewer', () => ({}))

describe('ModelViewer', () => {
  it('keeps reporting events after the model URL changes (refreshed signed URL)', async () => {
    const onLoad = vi.fn()
    const onArStatus = vi.fn()
    const { container, rerender } = render(<ModelViewer src="https://x.test/a.glb?token=1" alt="Chair" onLoad={onLoad} onArStatus={onArStatus} />)
    await waitFor(() => expect(container.querySelector('model-viewer')).not.toBeNull())

    rerender(<ModelViewer src="https://x.test/a.glb?token=2" alt="Chair" onLoad={onLoad} onArStatus={onArStatus} />)
    const el = container.querySelector('model-viewer')!
    expect(el.getAttribute('src')).toBe('https://x.test/a.glb?token=2')
    el.dispatchEvent(new Event('load'))
    el.dispatchEvent(new CustomEvent('ar-status', { detail: { status: 'failed' } }))
    expect(onLoad).toHaveBeenCalledOnce()
    expect(onArStatus).toHaveBeenCalledWith('failed')
  })

  it('offers native AR viewers only: Scene Viewer and Quick Look, at fixed scale', async () => {
    const { container } = render(<ModelViewer src="https://x.test/a.glb" iosSrc="https://x.test/a.usdz" alt="Chair" ar />)
    await waitFor(() => expect(container.querySelector('model-viewer')).not.toBeNull())
    const el = container.querySelector('model-viewer')!
    expect(el.getAttribute('ar-modes')).toBe('webxr scene-viewer quick-look')
    expect(el.getAttribute('ar-scale')).toBe('fixed')
    expect(el.getAttribute('ios-src')).toBe('https://x.test/a.usdz')
  })
})

import { describe, expect, it } from 'vitest'
import { loadModelViewer } from '@/components/three/ModelViewer'

describe('loadModelViewer', () => {
  // AR audit 2026-10-26: a rejected import() was kept, so after one failed chunk download (e.g. during a deploy)
  // "Try again" failed forever until a full page reload.
  it('tries the download again after a failed attempt', async () => {
    await expect(loadModelViewer(() => Promise.reject(new Error('chunk 404')))).rejects.toThrow('chunk 404')
    await expect(loadModelViewer(() => Promise.resolve('ok'))).resolves.toBe('ok')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

// jsdom has no WebGL: stand-ins for the two three.js classes that need a GL context.
vi.mock('three', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three')>()),
  WebGLRenderer: class {
    xr = { enabled: false, setReferenceSpaceType() {}, setSession: async () => {}, getReferenceSpace: () => ({}) }
    toneMapping = 0
    setAnimationLoop() {}
    render() {}
    dispose() {}
  },
  PMREMGenerator: class {
    fromScene = () => ({ texture: { dispose() {} } })
    dispose() {}
  },
}))

function fakeSession(overrides: Partial<Record<string, unknown>> = {}) {
  const listeners: Record<string, (() => void)[]> = {}
  const session = {
    end: vi.fn(async () => listeners.end?.forEach((l) => l())),
    addEventListener: (type: string, l: () => void) => (listeners[type] ??= []).push(l),
    removeEventListener: (type: string, l: () => void) => (listeners[type] = (listeners[type] ?? []).filter((x) => x !== l)),
    requestReferenceSpace: async () => ({}),
    requestHitTestSource: async () => undefined, // hit-test unavailable
    fire: (type: string) => listeners[type]?.forEach((l) => l()),
    ...overrides,
  }
  Object.defineProperty(navigator, 'xr', { configurable: true, value: { requestSession: async () => session } })
  return session
}

const opts = () => ({ glbUrl: 'https://x.test/m.glb', overlayRoot: document.createElement('div'), onState: vi.fn(), onEnd: vi.fn() })

describe('startArSession setup', () => {
  afterEach(() => vi.restoreAllMocks())

  it('ends the camera session when setup fails, instead of leaving it running', async () => {
    const session = fakeSession()
    const { startArSession } = await import('./webxrSession')
    await expect(startArSession(opts())).rejects.toMatchObject({ name: 'NotSupportedError' })
    expect(session.end).toHaveBeenCalledTimes(1)
  })

  it('reports a cancel (session closed while starting) as AbortError, not as a failure', async () => {
    const session = fakeSession()
    session.requestReferenceSpace = async () => {
      session.fire('end') // user pressed back during the camera prompt
      return {}
    }
    const { startArSession } = await import('./webxrSession')
    await expect(startArSession(opts())).rejects.toMatchObject({ name: 'AbortError' })
    expect(session.end).not.toHaveBeenCalled()
  })
})

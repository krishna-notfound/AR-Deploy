import { afterEach, describe, expect, it, vi } from 'vitest'
import { keyToBytes, pushApisAvailable, readPushState, subscriptionInput, syncPushSubscription } from './pushClient'

const KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYevOq8'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('pushClient', () => {
  it('turns the base64url VAPID key into its 65 bytes', () => {
    const bytes = keyToBytes(KEY)
    expect(bytes.length).toBe(65)
    expect(bytes[0]).toBe(4)
  })

  it('reads the endpoint and both keys of a subscription as base64url, or null without a key', () => {
    const k = (n: number) => new Uint8Array([251, 255, n]).buffer
    const sub = { endpoint: 'https://push.example/x', getKey: (name: string) => (name === 'p256dh' ? k(1) : k(2)) } as unknown as PushSubscription
    expect(subscriptionInput(sub)).toMatchObject({ endpoint: 'https://push.example/x', p256dh: '-_8B', auth: '-_8C' })
    expect(subscriptionInput({ endpoint: 'https://push.example/x', getKey: () => null } as unknown as PushSubscription)).toBeNull()
  })

  it('asks for nothing and registers nothing when only reading the state or syncing without permission', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', KEY)
    const register = vi.fn()
    const request = vi.fn()
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', Object.assign(function () {}, { permission: 'default', requestPermission: request }))
    Object.defineProperty(navigator, 'serviceWorker', { value: { register, getRegistration: vi.fn(async () => undefined) }, configurable: true })
    expect(pushApisAvailable()).toBe(true)
    expect(await readPushState()).toEqual({ state: 'off' })
    const save = vi.fn()
    await syncPushSubscription(save)
    expect(register).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('a granted device that is already subscribed re-saves its subscription when syncing', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', KEY)
    const sub = { endpoint: 'https://push.example/dev', getKey: () => new Uint8Array([1, 2, 3]).buffer }
    const reg = { pushManager: { getSubscription: vi.fn(async () => sub) } }
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', Object.assign(function () {}, { permission: 'granted' }))
    Object.defineProperty(navigator, 'serviceWorker', { value: { register: vi.fn(async () => reg), getRegistration: vi.fn(async () => reg) }, configurable: true })
    const save = vi.fn(async () => true)
    await syncPushSubscription(save)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push.example/dev', p256dh: 'AQID', auth: 'AQID' }))
    expect(await readPushState()).toEqual({ state: 'on', endpoint: 'https://push.example/dev' })
  })
})

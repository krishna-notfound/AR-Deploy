import { describe, expect, it } from 'vitest'
import { unavailableAccount, unavailableService } from './index'

describe('unavailable services (half-configured backend)', () => {
  it('are not thenables, so awaiting or returning them from an async function does not hang', async () => {
    expect((unavailableService('x') as unknown as { then?: unknown }).then).toBeUndefined()
    expect((unavailableAccount('x') as unknown as { then?: unknown }).then).toBeUndefined()
    const s = await Promise.resolve(unavailableService('x'))
    const a = await Promise.resolve(unavailableAccount('x'))
    expect(typeof s.getBusinesses).toBe('function')
    expect(typeof a.getProfile).toBe('function')
  })

  it('every account call fails with the configuration problem', async () => {
    const r = await unavailableAccount('VITE_SUPABASE_URL is missing.').getSecurityState()
    expect(r).toEqual({ ok: false, error: { code: 'CONFIG', message: 'VITE_SUPABASE_URL is missing.' } })
  })
})

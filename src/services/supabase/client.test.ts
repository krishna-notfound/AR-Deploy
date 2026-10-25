import { describe, expect, it, vi } from 'vitest'

const createClient = vi.fn((..._args: unknown[]) => ({ auth: {} }))
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args: unknown[]) => createClient(...args) }))

const { createPasswordCheckClient, getSupabaseClient } = await import('./client')

describe('Supabase clients', () => {
  const config = { mode: 'supabase' as const, url: 'https://x.supabase.co', publishableKey: 'sb_publishable_x' }

  it('builds a new non-persisting password-check client per call, separate from the main client', () => {
    const main = getSupabaseClient(config)
    const a = createPasswordCheckClient(config)
    const b = createPasswordCheckClient(config)
    expect(a).not.toBe(b)
    expect(a).not.toBe(main)
    expect(createClient).toHaveBeenLastCalledWith(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sanctus-password-check' },
    })
  })

  it('refuses outside Supabase mode', () => {
    expect(() => createPasswordCheckClient({ mode: 'demo' })).toThrow()
  })
})

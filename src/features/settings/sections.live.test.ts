import { describe, expect, it, vi } from 'vitest'

// The live (Supabase) build has no General section: its demo tools and sample credits are demo-only (owner 2026-10-26).
vi.mock('@/services', async (orig) => ({ ...(await orig<typeof import('@/services')>()), isDemoMode: false }))

describe('settings sections on the live site', () => {
  it('the Owner sees no General (demo tools and sample credits) section; Security policy stays', async () => {
    const { SECTIONS } = await import('./sections')
    const owner = { scope: 'admin', can: () => true } as unknown as Parameters<(typeof SECTIONS)[number]['visible']>[0]
    const visible = SECTIONS.filter((s) => s.visible(owner)).map((s) => s.id)
    expect(visible).not.toContain('platform')
    expect(visible).toContain('security-policy')
  })
})

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseCatalogService } from './supabaseCatalogService'

/**
 * supabase-js where every write affects no rows (what RLS does to a change the caller may not make) and every read
 * finds the row (`readable`) or not. Enough for the zero-row branches of the business and product writes.
 */
function stub(readable: boolean) {
  const builder = (mode: 'write' | 'read') => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'update', 'delete']) q[m] = () => q
    q.maybeSingle = async () => ({ data: mode === 'read' && readable ? { id: 'x' } : null, error: null })
    q.then = (resolve: (v: unknown) => void) => resolve({ data: mode === 'read' && readable ? [{ id: 'x' }] : [], error: null })
    return q
  }
  return {
    from: () => ({
      select: () => builder('read'),
      update: () => builder('write'),
      delete: () => builder('write'),
    }),
    storage: { from: () => ({ remove: async () => ({ error: null }), list: async () => ({ data: [], error: null }) }) },
    rpc: async () => ({ data: null, error: null }),
  } as unknown as SupabaseClient
}

describe('a change refused by the database reads as "no permission" (review I4)', () => {
  it('says forbidden when the row exists but nothing changed', async () => {
    const r = await createSupabaseCatalogService(stub(true)).setBusinessStatus('b1', 'inactive')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatchObject({ code: 'PERMISSION', reason: 'forbidden', message: "You don't have permission to do this." })
  })

  it('still says not found when the row really is gone', async () => {
    const r = await createSupabaseCatalogService(stub(false)).setBusinessStatus('b1', 'inactive')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND')
  })

  it('applies to removing a business owner too', async () => {
    const r = await createSupabaseCatalogService(stub(true)).removeBusinessMember('b1', 'u1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.reason).toBe('forbidden')
  })
})

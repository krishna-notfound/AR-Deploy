import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseCatalogService } from './supabaseCatalogService'

/** supabase-js for getAuditEvents: records the filters applied to the audit_events query; no rows. */
function stub() {
  const calls: [string, ...unknown[]][] = []
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'ilike', 'order', 'range', 'returns']) {
    q[m] = (...args: unknown[]) => {
      calls.push([m, ...args])
      return q
    }
  }
  q.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 })
  const sb = { from: () => q, rpc: async () => ({ data: [], error: null }) } as unknown as SupabaseClient
  return { sb, neq: () => calls.filter((c) => c[0] === 'neq') }
}

describe('getAuditEvents and sign-ins (R-W1-4)', () => {
  it('leaves account_signed_in out unless includeSignIns is true', async () => {
    for (const includeSignIns of [undefined, false]) {
      const { sb, neq } = stub()
      expect((await createSupabaseCatalogService(sb).getAuditEvents({ includeSignIns })).ok).toBe(true)
      expect(neq()).toEqual([['neq', 'event_type', 'account_signed_in']])
    }
    const { sb, neq } = stub()
    expect((await createSupabaseCatalogService(sb).getAuditEvents({ includeSignIns: true })).ok).toBe(true)
    expect(neq()).toEqual([])
  })
})

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createSupabaseCatalogService } from './supabaseCatalogService'

const APP = '22222222-2222-4222-8222-222222222222'

/** supabase-js whose review-application call succeeds and whose business_applications re-read answers `reread`. */
function stub(reread: { data: unknown; error: { code: string; message: string } | null }) {
  const invoke = vi.fn(async () => ({ data: { ok: true, status: 'rejected', email: { status: 'accepted' } }, error: null }))
  const sb = {
    from: () => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) q[m] = () => q
      q.maybeSingle = async () => reread
      return q
    },
    rpc: vi.fn(async () => ({ data: { role: 'admin', permissions: [] }, error: null })),
    functions: { invoke },
  } as unknown as SupabaseClient
  return { sb, invoke }
}

describe('reviewApplication (final review)', () => {
  it('an applied decision whose re-read fails is still a success, with the status and the decision email outcome', async () => {
    const { sb, invoke } = stub({ data: null, error: { code: '08006', message: 'connection lost' } })
    const r = await createSupabaseCatalogService(sb).reviewApplication(APP, 'reject', 'Too small')
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ ok: true, data: { id: APP, status: 'rejected', reloaded: false, decisionEmail: { status: 'accepted' } } })
  })

  it('a missing row on re-read is treated the same way', async () => {
    const { sb } = stub({ data: null, error: null })
    const r = await createSupabaseCatalogService(sb).reviewApplication(APP, 'reject', 'Too small')
    expect(r.ok && r.data).toMatchObject({ id: APP, status: 'rejected', reloaded: false })
  })
})

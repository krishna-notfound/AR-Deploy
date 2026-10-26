// Owner invitations through Supabase (S1.5 Task 17): provision-owner refusals keep their retry time, and the owner
// states come from admin_list_owner_states.
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseCatalogService } from './supabaseCatalogService'

function stub(opts: { fnStatus?: number; fnBody?: unknown; rpc?: { data: unknown; error: unknown } }) {
  return {
    functions: {
      invoke: async () => ({
        data: null,
        error: { context: new Response(JSON.stringify(opts.fnBody ?? {}), { status: opts.fnStatus ?? 500 }) },
      }),
    },
    rpc: async () => opts.rpc ?? { data: [], error: null },
  } as unknown as SupabaseClient
}

describe('owner invitations (Supabase service)', () => {
  it('a 429 from provision-owner keeps the reason and retryAt (too_many_invitations, cooldown)', async () => {
    const retryAt = '2026-10-21T09:30:00.000+00:00'
    const many = await createSupabaseCatalogService(stub({ fnStatus: 429, fnBody: { error: 'too_many_invitations', retryAt } })).resendOwnerInvitation('b1', 'en')
    expect(many.ok === false && many.error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Ten invitations were sent to this owner in the last 24 hours.',
      reason: 'too_many_invitations',
      retryAt,
    })
    const cooled = await createSupabaseCatalogService(stub({ fnStatus: 429, fnBody: { error: 'cooldown', retryAt } })).provisionOwner({ businessId: 'b1', email: 'o@shop.test', language: 'en' })
    expect(cooled.ok === false && cooled.error).toMatchObject({ code: 'RATE_LIMITED', reason: 'cooldown', retryAt })
  })

  it('getOwnerStates maps the rows, and {error:"forbidden"} reads as no permission', async () => {
    const rows = [{ business_id: 'b1', state: 'invite_pending', last_invited_at: '2026-10-20T10:00:00+00:00', email_failed: true }]
    const r = await createSupabaseCatalogService(stub({ rpc: { data: rows, error: null } })).getOwnerStates()
    expect(r.ok && r.data).toEqual([{ businessId: 'b1', state: 'invite_pending', lastInvitedAt: '2026-10-20T10:00:00+00:00', emailFailed: true }])
    const denied = await createSupabaseCatalogService(stub({ rpc: { data: { error: 'forbidden' }, error: null } })).getOwnerStates()
    expect(denied.ok === false && denied.error.code).toBe('PERMISSION')
  })
})

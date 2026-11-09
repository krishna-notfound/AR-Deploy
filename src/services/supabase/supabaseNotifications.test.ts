import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createSupabaseModelRequestsBusiness } from './modelRequestsBusiness'
import { createSupabaseNotifications } from './supabaseNotifications'

type Err = { code?: string; message?: string } | null

/** A chainable stand-in: every method returns the builder, and awaiting it (or maybeSingle/single) gives `result`. */
function table(result: { data?: unknown; error?: Err; count?: number | null }, calls: [string, unknown[]][]) {
  const final = { data: null, error: null, count: null, ...result }
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'update', 'delete', 'upsert', 'eq', 'is', 'order', 'limit']) b[m] = (...a: unknown[]) => (calls.push([m, a]), b)
  b.maybeSingle = async () => final
  b.single = async () => final
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(final).then(res)
  return b
}

function client(opts: { tables?: Record<string, Parameters<typeof table>[0]>; rpc?: { error: Err }; user?: string | null } = {}) {
  const calls: [string, unknown[]][] = []
  const sb = {
    from: vi.fn((name: string) => table(opts.tables?.[name] ?? {}, calls)),
    rpc: vi.fn(async () => opts.rpc ?? { error: null }),
    auth: { getUser: vi.fn(async () => ({ data: { user: opts.user === null ? null : { id: opts.user ?? 'u1' } }, error: null })) },
  } as unknown as SupabaseClient
  return { sb, calls }
}

const ROW = { id: 'n1', kind: 'new_application', title: 'T', body: 'B', link: '/admin/x', read_at: null, created_at: '2026-11-09T10:00:00Z' }

describe('supabase notifications service', () => {
  it('lists the latest notifications with the unread count', async () => {
    const { sb } = client({ tables: { notifications: { data: [ROW], count: 4 } } })
    const r = await createSupabaseNotifications(sb).getNotifications()
    expect(r).toEqual({ ok: true, data: { items: [{ id: 'n1', kind: 'new_application', title: 'T', body: 'B', link: '/admin/x', readAt: null, createdAt: '2026-11-09T10:00:00Z' }], unread: 4 } })
  })

  it('reports a failure and the missing-migration case instead of showing nothing', async () => {
    const failing = client({ tables: { notifications: { error: { code: '500' } } } })
    expect(await createSupabaseNotifications(failing.sb).getNotifications()).toMatchObject({ ok: false, error: { code: 'UNKNOWN' } })
    const missing = client({ tables: { notifications: { error: { code: 'PGRST205' } } } })
    expect(await createSupabaseNotifications(missing.sb).markAllRead()).toMatchObject({ ok: false, error: { reason: 'not_enabled' } })
  })

  it('marks one read only when unread, and all read with an is-null filter (never an unfiltered update)', async () => {
    const { sb, calls } = client()
    const svc = createSupabaseNotifications(sb)
    await svc.markNotificationRead('n1')
    await svc.markAllRead()
    expect(calls.filter(([m]) => m === 'update')).toHaveLength(2)
    expect(calls.filter(([m]) => m === 'is')).toEqual([['is', ['read_at', null]], ['is', ['read_at', null]]])
    expect(calls).toContainEqual(['eq', ['id', 'n1']])
  })

  it('saves a device through register_push_subscription and forgets one by endpoint', async () => {
    const { sb, calls } = client()
    const svc = createSupabaseNotifications(sb)
    expect((await svc.subscribePush({ endpoint: 'https://push.example/a', p256dh: 'k', auth: 'a', userAgent: 'UA' })).ok).toBe(true)
    expect(sb.rpc).toHaveBeenCalledWith('register_push_subscription', { p_endpoint: 'https://push.example/a', p_p256dh: 'k', p_auth: 'a', p_user_agent: 'UA' })
    await svc.unsubscribePush('https://push.example/a')
    expect(calls).toContainEqual(['eq', ['endpoint', 'https://push.example/a']])
    expect(await createSupabaseNotifications(client({ rpc: { error: { code: '42501' } } }).sb).subscribePush({ endpoint: 'https://x', p256dh: 'k', auth: 'a' })).toMatchObject({ ok: false, error: { code: 'PERMISSION' } })
  })

  it('reads prefs (defaults when there is no row) and upserts only the given switches for the signed-in user', async () => {
    expect(await createSupabaseNotifications(client().sb).getNotificationPrefs()).toEqual({
      ok: true,
      data: { newApplication: true, newModelRequest: true, companyUpdates: true, pushEnabled: true, language: null },
    })
    const saved = { new_application: false, new_model_request: true, company_updates: true, push_enabled: true, language: 'pt' }
    const { sb, calls } = client({ tables: { notification_prefs: { data: saved } } })
    const r = await createSupabaseNotifications(sb).setNotificationPrefs({ newApplication: false, language: 'pt' })
    expect(r).toEqual({ ok: true, data: { newApplication: false, newModelRequest: true, companyUpdates: true, pushEnabled: true, language: 'pt' } })
    expect(calls).toContainEqual(['upsert', [{ user_id: 'u1', new_application: false, language: 'pt' }, { onConflict: 'user_id' }]])
    expect(await createSupabaseNotifications(client({ user: null }).sb).setNotificationPrefs({ pushEnabled: false })).toMatchObject({ ok: false, error: { code: 'PERMISSION' } })
  })
})

describe('requestModel tells staff', () => {
  it('invokes notify-model-request once the request is saved, and never because of its own failure', async () => {
    const invoke = vi.fn(async () => ({ data: null, error: null }))
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq']) builder[m] = () => builder
    builder.maybeSingle = async () => ({ data: null, error: null })
    const storage = { from: () => ({ upload: async (p: string) => ({ data: { path: p }, error: null }), remove: async () => ({ data: [], error: null }) }) }
    const sb = { storage, rpc: vi.fn(async () => ({ data: {}, error: null })), from: () => builder, functions: { invoke } } as unknown as SupabaseClient
    const photos = [new File(['x'], 'a.jpg', { type: 'image/jpeg' }), new File(['x'], 'b.jpg', { type: 'image/jpeg' })]
    const r = await createSupabaseModelRequestsBusiness(sb, () => {}).requestModel({ businessId: 'b1', productId: 'p1', photos })
    expect(r.ok).toBe(true)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('notify-model-request', { body: { requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) } })

    invoke.mockRejectedValueOnce(new Error('offline'))
    const again = await createSupabaseModelRequestsBusiness(sb, () => {}).requestModel({ businessId: 'b1', productId: 'p1', photos })
    expect(again.ok).toBe(true)

    const failing = { ...sb, rpc: vi.fn(async () => ({ data: null, error: { code: '23505', message: 'model_request_open' } })) } as unknown as SupabaseClient
    invoke.mockClear()
    expect((await createSupabaseModelRequestsBusiness(failing, () => {}).requestModel({ businessId: 'b1', productId: 'p1', photos })).ok).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })
})

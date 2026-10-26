import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { mapModelRequestError, createSupabaseModelRequestsRead } from './modelRequestsRead'
import { mapDbError } from './supabaseCatalogService'

type Answer = { data: unknown; error: { code?: string; message: string } | null; count?: number | null }

/** supabase-js stand-in: every query builder call is recorded, and awaiting it gives `answer`. */
function fakeClient(answer: Answer, signed: { path: string; signedUrl: string }[] = []) {
  const calls: [string, ...unknown[]][] = []
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order', 'range', 'returns']) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args])
      return builder
    }
  }
  builder.then = (resolve: (a: Answer) => unknown) => resolve(answer)
  const from = vi.fn((table: string) => {
    calls.push(['from', table])
    return builder
  })
  const createSignedUrls = vi.fn(async () => ({ data: signed, error: null }))
  const storage = { from: vi.fn(() => ({ createSignedUrls })) }
  const sb = { from, storage, rpc: vi.fn() } as unknown as SupabaseClient
  return { sb, calls, createSignedUrls }
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  business_id: 'b1',
  product_id: 'p1',
  variant_id: 'v1',
  status: 'requested',
  note: 'Oak legs',
  reason: null,
  requested_by: 'u1',
  handled_by: null,
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-20T10:00:00Z',
  started_at: null,
  delivered_at: null,
  closed_at: null,
  products: { name: { en: 'Chair', pt: 'Cadeira' }, product_images: [{ storage_path: 'b1/x.jpg', is_primary: false }, { storage_path: 'b1/main.jpg', is_primary: true }] },
  businesses: { name: 'Casa' },
  product_variants: { name: { en: 'Oak' } },
  model_request_photos: [{ count: 3 }],
  ...over,
})

describe('S4 Task 2: Supabase model request reads', () => {
  it('getModelRequests orders Open oldest first and other tabs newest first, pages by 50, and maps the embedded product, business and option names', async () => {
    const open = fakeClient({ data: [row()], error: null, count: 1 }, [{ path: 'b1/main.jpg', signedUrl: 'https://signed/main.jpg' }])
    const r = await createSupabaseModelRequestsRead(open.sb, () => {}).getModelRequests({ status: ['requested', 'in_progress'], businessId: 'b1' })
    expect(r).toEqual({
      ok: true,
      data: {
        total: 1,
        items: [
          {
            id: 'r1', businessId: 'b1', productId: 'p1', variantId: 'v1', status: 'requested', note: 'Oak legs', requestedBy: 'u1',
            createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:00:00Z', photoCount: 3,
            productName: { en: 'Chair', pt: 'Cadeira' }, businessName: 'Casa', variantName: { en: 'Oak' }, productPhotoUrl: 'https://signed/main.jpg',
          },
        ],
      },
    })
    expect(open.calls).toContainEqual(['from', 'model_requests'])
    expect(open.calls).toContainEqual(['in', 'status', ['requested', 'in_progress']])
    expect(open.calls).toContainEqual(['eq', 'business_id', 'b1'])
    expect(open.calls).toContainEqual(['order', 'created_at', { ascending: true }])
    expect(open.calls).toContainEqual(['range', 0, 49])
    expect(open.createSignedUrls).toHaveBeenCalledWith(['b1/main.jpg'], expect.any(Number))

    const all = fakeClient({ data: [], error: null, count: 0 })
    await createSupabaseModelRequestsRead(all.sb, () => {}).getModelRequests({ page: 2 })
    expect(all.calls).toContainEqual(['order', 'created_at', { ascending: false }])
    expect(all.calls).toContainEqual(['range', 50, 99])
    const delivered = fakeClient({ data: [], error: null, count: 0 })
    await createSupabaseModelRequestsRead(delivered.sb, () => {}).getModelRequests({ status: ['delivered'] })
    expect(delivered.calls).toContainEqual(['order', 'created_at', { ascending: false }])
  })

  it('mapModelRequestError maps invalid_transition to the S4 copy while mapDbError keeps the application copy', () => {
    const e = { code: '22023', message: 'invalid_transition' }
    expect(mapModelRequestError(e)).toEqual({ ok: false, error: { code: 'CONFLICT', message: 'This request has changed. Reload to see its current status.', reason: 'invalid_transition' } })
    const shared = mapDbError(e)
    expect(shared.ok === false && shared.error.message).not.toBe('This request has changed. Reload to see its current status.')
    expect(mapModelRequestError({ code: '23505', message: 'model_request_open' }, { option: true })).toMatchObject({ ok: false, error: { message: 'This option already has an open 3D model request.' } })
    // The shared map knows the S4 keys that only S4 raises, and falls back to its own rules for the rest.
    expect(mapDbError({ code: '42501', message: 'own_models_not_allowed' })).toMatchObject({ ok: false, error: { code: 'PERMISSION', reason: 'own_models_not_allowed' } })
    expect(mapModelRequestError({ code: '42501', message: 'new row violates row-level security policy' })).toMatchObject({ ok: false, error: { code: 'PERMISSION', reason: 'forbidden' } })
  })

  it('a select error is an error, never sample data', async () => {
    const { sb } = fakeClient({ data: null, error: { code: '42P01', message: 'relation "model_requests" does not exist' } })
    const read = createSupabaseModelRequestsRead(sb, () => {})
    const r = await read.getModelRequests()
    expect(r.ok).toBe(false)
    const s = await read.getProductRequestStates('b1')
    expect(s.ok).toBe(false)
  })

  it('getProductRequestStates gives each product its open request and its latest closed one', async () => {
    const rows = [
      { product_id: 'p1', status: 'in_progress', created_at: '2026-10-22T00:00:00Z', closed_at: null },
      { product_id: 'p1', status: 'rejected', created_at: '2026-10-10T00:00:00Z', closed_at: '2026-10-12T00:00:00Z' },
      { product_id: 'p2', status: 'delivered', created_at: '2026-10-01T00:00:00Z', closed_at: '2026-10-05T00:00:00Z' },
      { product_id: 'p2', status: 'rejected', created_at: '2026-09-01T00:00:00Z', closed_at: '2026-09-02T00:00:00Z' },
    ]
    const { sb } = fakeClient({ data: rows, error: null })
    expect(await createSupabaseModelRequestsRead(sb, () => {}).getProductRequestStates('b1')).toEqual({
      ok: true,
      data: { p1: { open: 'in_progress', latestClosed: 'rejected' }, p2: { latestClosed: 'delivered' } },
    })
  })

  it('final review: setBusinessOwnModels maps business_not_found (P0002) to fixed copy, never the raw key', async () => {
    const { sb } = fakeClient({ data: [], error: null })
    ;(sb.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: { code: 'P0002', message: 'business_not_found' } })
    const r = await createSupabaseModelRequestsRead(sb, () => {}).setBusinessOwnModels('b1', true)
    expect(r).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'Business not found.' } })
  })
})

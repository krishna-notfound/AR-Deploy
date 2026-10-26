import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { ModelAsset } from '@/domain/types'
import { createSupabaseModelRequestsStaff } from './modelRequestsStaff'

const REQ = '00000000-0000-4000-8000-000000000001'

type Invoke = { data: unknown; error: { context?: Response } | null }
type Answer = { data: unknown; error: { code?: string; message: string } | null }

/**
 * supabase-js stand-in: `functions.invoke` answers `invoke`, `rpc` answers `rpc`, storage `remove` answers `removeError`;
 * every query builder answers from `tables` by table name.
 */
function fake(opts: { invoke?: Invoke; rpc?: Answer; removeError?: { message: string } | null; tables?: Record<string, Answer> } = {}) {
  const invoke = vi.fn(async () => opts.invoke ?? { data: { ok: true, status: 'in_progress' }, error: null })
  const rpc = vi.fn(async () => opts.rpc ?? { data: {}, error: null })
  const remove = vi.fn(async () => ({ data: [], error: opts.removeError ?? null }))
  const createSignedUrls = vi.fn(async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}` })), error: null }))
  const buckets: string[] = []
  const storage = {
    from: vi.fn((bucket: string) => {
      buckets.push(bucket)
      return { remove, createSignedUrls }
    }),
  }
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'returns']) builder[m] = () => builder
    const answer = opts.tables?.[table] ?? { data: null, error: null }
    builder.maybeSingle = async () => answer
    builder.then = (resolve: (a: Answer) => unknown) => resolve(answer)
    return builder
  })
  const sb = { functions: { invoke }, rpc, storage, from } as unknown as SupabaseClient
  return { sb, invoke, rpc, remove, createSignedUrls, buckets }
}

/** A non-2xx Edge Function answer as supabase-js reports it (FunctionsHttpError with the Response as context). */
const httpError = (status: number, body: unknown): Invoke => ({ data: null, error: { context: new Response(JSON.stringify(body), { status }) } })

const asset: ModelAsset = { format: 'glb', url: 'https://signed/x.glb', fileName: 'chair.glb', sizeBytes: 2048, status: 'valid', storagePath: 'b1/new.glb', requiredExtensions: ['KHR_draco_mesh_compression'] }

describe('S4 Task 6: Supabase staff model request calls', () => {
  it('deliver calls review-model-request, removes replacedPaths from product-media and passes the email status through', async () => {
    const f = fake({ invoke: { data: { ok: true, status: 'delivered', replacedPaths: ['b1/old.glb', 'b1/old.usdz'], email: { status: 'accepted' } }, error: null } })
    const notify = vi.fn()
    const r = await createSupabaseModelRequestsStaff(f.sb, notify).deliverModelRequest(REQ)
    expect(f.invoke).toHaveBeenCalledWith('review-model-request', { body: { requestId: REQ, action: 'deliver' } })
    expect(f.remove).toHaveBeenCalledWith(['b1/old.glb', 'b1/old.usdz'])
    expect(f.buckets).toContain('product-media')
    expect(r).toEqual({ ok: true, data: { status: 'delivered', email: { status: 'accepted' } } })
    expect(notify).toHaveBeenCalled()
  })

  it('deliver asks sync-ar-models to refresh the public AR copies of the request product (review fix)', async () => {
    const f = fake({ invoke: { data: { ok: true, status: 'delivered', replacedPaths: [], email: { status: 'accepted' } }, error: null }, tables: { model_requests: { data: { product_id: 'p1' }, error: null } } })
    await createSupabaseModelRequestsStaff(f.sb, () => {}).deliverModelRequest(REQ)
    await new Promise((r) => setTimeout(r, 0))
    expect(f.invoke).toHaveBeenCalledWith('sync-ar-models', { body: { productId: 'p1' } })
  })

  it('reject sends the reason and removes stagedPaths; start sends no reason', async () => {
    const f = fake({ invoke: { data: { ok: true, status: 'rejected', stagedPaths: ['b1/s.glb'], email: { status: 'failed', error: 'email_not_configured' } }, error: null } })
    const svc = createSupabaseModelRequestsStaff(f.sb, () => {})
    expect(await svc.rejectModelRequest(REQ, 'Too dark')).toEqual({ ok: true, data: { status: 'rejected', email: { status: 'failed', error: 'email_not_configured' } } })
    expect(f.invoke).toHaveBeenCalledWith('review-model-request', { body: { requestId: REQ, action: 'reject', reason: 'Too dark' } })
    expect(f.remove).toHaveBeenCalledWith(['b1/s.glb'])
    const g = fake({ invoke: { data: { ok: true, status: 'in_progress' }, error: null } })
    expect(await createSupabaseModelRequestsStaff(g.sb, () => {}).startModelRequest(REQ)).toEqual({ ok: true, data: { status: 'in_progress' } })
    expect(g.invoke).toHaveBeenCalledWith('review-model-request', { body: { requestId: REQ, action: 'start' } })
    expect(g.remove).not.toHaveBeenCalled()
  })

  it("a 422 invalid_transition maps to 'This request has changed. Reload to see its current status.'", async () => {
    const f = fake({ invoke: httpError(422, { error: 'invalid_transition' }) })
    const r = await createSupabaseModelRequestsStaff(f.sb, () => {}).deliverModelRequest(REQ)
    expect(r).toMatchObject({ ok: false, error: { code: 'CONFLICT', message: 'This request has changed. Reload to see its current status.' } })
    const g = fake({ invoke: httpError(422, { error: 'reason_required' }) })
    expect(await createSupabaseModelRequestsStaff(g.sb, () => {}).rejectModelRequest(REQ, ' ')).toMatchObject({ ok: false, error: { message: 'Write a reason. It is sent to the business.' } })
    const h = fake({ invoke: httpError(500, { error: 'unknown' }) })
    expect(await createSupabaseModelRequestsStaff(h.sb, () => {}).startModelRequest(REQ)).toMatchObject({ ok: false, error: { code: 'UNKNOWN' } })
    expect(f.remove).not.toHaveBeenCalled()
  })

  it("a failed removal gives cleanup 'partial'", async () => {
    const f = fake({ invoke: { data: { ok: true, status: 'delivered', replacedPaths: ['b1/old.glb'], email: { status: 'skipped' } }, error: null }, removeError: { message: 'denied' } })
    expect(await createSupabaseModelRequestsStaff(f.sb, () => {}).deliverModelRequest(REQ)).toEqual({ ok: true, data: { status: 'delivered', email: { status: 'skipped' }, cleanup: 'partial' } })
  })

  it('stageModelFile calls admin_stage_model_file with the uploaded asset and removes the replaced path', async () => {
    const f = fake({ rpc: { data: { status: 'in_progress', replaced_path: 'b1/old.glb' }, error: null } })
    expect(await createSupabaseModelRequestsStaff(f.sb, () => {}).stageModelFile(REQ, 'glb', asset)).toEqual({ ok: true, data: {} })
    expect(f.rpc).toHaveBeenCalledWith('admin_stage_model_file', {
      p_request: REQ, p_format: 'glb', p_storage_path: 'b1/new.glb', p_file_name: 'chair.glb', p_size_bytes: 2048, p_required_extensions: ['KHR_draco_mesh_compression'],
    })
    expect(f.remove).toHaveBeenCalledWith(['b1/old.glb'])
  })

  it('Review Focus 4: stageModelFile removes the uploaded object when admin_stage_model_file fails', async () => {
    const f = fake({ rpc: { data: null, error: { code: '22023', message: 'invalid_transition' } } })
    const r = await createSupabaseModelRequestsStaff(f.sb, () => {}).stageModelFile(REQ, 'glb', asset)
    expect(r).toMatchObject({ ok: false, error: { message: 'This request has changed. Reload to see its current status.' } })
    expect(f.remove).toHaveBeenCalledWith(['b1/new.glb'])
  })

  it("fix round 1: a failed removal of the replaced or unstaged file gives cleanup 'partial'", async () => {
    const f = fake({ rpc: { data: { status: 'in_progress', replaced_path: 'b1/old.glb' }, error: null }, removeError: { message: 'denied' } })
    expect(await createSupabaseModelRequestsStaff(f.sb, () => {}).stageModelFile(REQ, 'glb', asset)).toEqual({ ok: true, data: { cleanup: 'partial' } })
    const g = fake({ rpc: { data: { path: 'b1/s.usdz' }, error: null }, removeError: { message: 'denied' } })
    expect(await createSupabaseModelRequestsStaff(g.sb, () => {}).unstageModelFile(REQ, 'usdz')).toEqual({ ok: true, data: { cleanup: 'partial' } })
  })

  it('unstageModelFile removes the returned path', async () => {
    const f = fake({ rpc: { data: { path: 'b1/s.usdz' }, error: null } })
    expect(await createSupabaseModelRequestsStaff(f.sb, () => {}).unstageModelFile(REQ, 'usdz')).toEqual({ ok: true, data: {} })
    expect(f.rpc).toHaveBeenCalledWith('admin_unstage_model_file', { p_request: REQ, p_format: 'usdz' })
    expect(f.remove).toHaveBeenCalledWith(['b1/s.usdz'])
  })

  it('getModelRequest signs photos for 1 hour and staged files for 12 hours, and builds history from the audit rows', async () => {
    const f = fake({
      tables: {
        model_requests: {
          data: {
            id: REQ, business_id: 'b1', product_id: 'p1', variant_id: null, status: 'in_progress', note: 'Oak', reason: null, requested_by: 'u1', handled_by: 'u2',
            created_at: '2026-10-20T10:00:00Z', updated_at: '2026-10-21T10:00:00Z', started_at: '2026-10-21T10:00:00Z', delivered_at: null, closed_at: null,
            products: { name: { en: 'Chair' } }, businesses: { name: 'Casa' }, product_variants: null,
            photos: [
              { storage_path: 'b1/r/2.jpg', file_name: 'back.jpg', size_bytes: 2000, sort_order: 1 },
              { storage_path: 'b1/r/1.jpg', file_name: 'front.jpg', size_bytes: 1000, sort_order: 0 },
            ],
            staged: [{ format: 'glb', storage_path: 'b1/s.glb', file_name: 'chair.glb', size_bytes: 5000, required_extensions: null }],
          },
          error: null,
        },
        products: {
          data: {
            id: 'p1', business_id: 'b1', slug: 'chair', name: { en: 'Chair' }, short_description: {}, description: {}, material: { en: 'Oak' }, category: 'chair',
            price: 100, currency: 'EUR', width: 50, height: 90, depth: 50, dimension_unit: 'cm', weight_value: null, weight_unit: null, cta_label: {}, cta_url: null,
            status: 'draft', published_at: null, models_changed_at: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
            product_images: [], product_models: [], product_variants: [],
          },
          error: null,
        },
        audit_events: {
          data: [
            { event_type: 'model_request_created', created_at: '2026-10-20T10:00:00Z', metadata: { request_id: REQ, actor_label: 'Business owner' } },
            { event_type: 'model_request_started', created_at: '2026-10-21T10:00:00Z', metadata: { request_id: REQ, actor_label: 'Team' } },
          ],
          error: null,
        },
      },
    })
    const r = await createSupabaseModelRequestsStaff(f.sb, () => {}).getModelRequest(REQ)
    if (!r.ok) throw new Error(r.error.message)
    expect(f.createSignedUrls).toHaveBeenCalledWith(['b1/r/1.jpg', 'b1/r/2.jpg'], 60 * 60)
    expect(f.createSignedUrls).toHaveBeenCalledWith(['b1/s.glb'], 12 * 60 * 60)
    expect(r.data.photos).toEqual([
      { storagePath: 'b1/r/1.jpg', fileName: 'front.jpg', sizeBytes: 1000, url: 'https://signed/b1/r/1.jpg' },
      { storagePath: 'b1/r/2.jpg', fileName: 'back.jpg', sizeBytes: 2000, url: 'https://signed/b1/r/2.jpg' },
    ])
    expect(r.data.photoCount).toBe(2)
    expect(r.data.staged.glb).toMatchObject({ format: 'glb', url: 'https://signed/b1/s.glb', fileName: 'chair.glb', sizeBytes: 5000, storagePath: 'b1/s.glb', status: 'valid' })
    expect(r.data.product).toMatchObject({ id: 'p1', dimensions: { width: 50, height: 90, depth: 50, unit: 'cm' } })
    expect(r.data.history).toEqual([
      { type: 'model_request_created', at: '2026-10-20T10:00:00Z', actorLabel: 'Business owner' },
      { type: 'model_request_started', at: '2026-10-21T10:00:00Z', actorLabel: 'Team' },
    ])
    expect(r.data.requestedByLabel).toBe('Business owner')
  })

  it('getModelRequest: no row → not found with the S4 copy; a malformed id is not queried', async () => {
    const f = fake({ tables: { model_requests: { data: null, error: null } } })
    expect(await createSupabaseModelRequestsStaff(f.sb, () => {}).getModelRequest(REQ)).toMatchObject({
      ok: false, error: { code: 'NOT_FOUND', message: "This request doesn't exist or was removed with its product." },
    })
    const g = fake()
    expect(await createSupabaseModelRequestsStaff(g.sb, () => {}).getModelRequest('nope')).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(g.sb.from).not.toHaveBeenCalled()
  })
})

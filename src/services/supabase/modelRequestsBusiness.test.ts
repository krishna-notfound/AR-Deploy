import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createSupabaseModelRequestsBusiness } from './modelRequestsBusiness'

type Err = { code?: string; message: string } | null

/** supabase-js stand-in for the business calls: storage upload/remove, rpc, and the read-back select. */
function fakeClient(opts: { rpc?: { data: unknown; error: Err }; uploadError?: (path: string) => Err; removeError?: Err } = {}) {
  const uploads: { bucket: string; path: string; contentType?: string }[] = []
  const removed: { bucket: string; paths: string[] }[] = []
  const storage = {
    from: vi.fn((bucket: string) => ({
      upload: vi.fn(async (path: string, _body: Blob, o?: { contentType?: string }) => {
        uploads.push({ bucket, path, contentType: o?.contentType })
        return { data: { path }, error: opts.uploadError?.(path) ?? null }
      }),
      remove: vi.fn(async (paths: string[]) => {
        removed.push({ bucket, paths })
        return { data: [], error: opts.removeError ?? null }
      }),
    })),
  }
  const rpc = vi.fn(async () => opts.rpc ?? { data: null, error: null })
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'returns']) builder[m] = () => builder
  builder.maybeSingle = async () => ({ data: null, error: null })
  const sb = { storage, rpc, from: vi.fn(() => builder) } as unknown as SupabaseClient
  return { sb, rpc, uploads, removed }
}

const photo = (name: string, type = 'image/jpeg') => new File(['x'], name, { type })
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

describe('S4 Task 4: Supabase requestModel and cancelModelRequest', () => {
  it('requestModel uploads every photo under {business}/{id}/, then calls request_model with the paths', async () => {
    const c = fakeClient({ rpc: { data: { id: 'x', status: 'requested' }, error: null } })
    const progress: [number, string][] = []
    const r = await createSupabaseModelRequestsBusiness(c.sb, () => {}).requestModel(
      { businessId: 'b1', productId: 'p1', variantId: 'v1', note: 'Oak legs', photos: [photo('a.jpg'), photo('b.png', 'image/png'), photo('c.webp', 'image/webp')] },
      (i, s) => progress.push([i, s]),
    )
    expect(r.ok).toBe(true)
    expect(c.uploads).toHaveLength(3)
    const id = c.uploads[0]!.path.split('/')[1]!
    expect(id).toMatch(new RegExp(`^${UUID}$`))
    expect(c.uploads.map((u) => u.bucket)).toEqual(['model-request-photos', 'model-request-photos', 'model-request-photos'])
    expect(c.uploads[0]!.path).toMatch(new RegExp(`^b1/${id}/${UUID}\\.jpg$`))
    expect(c.uploads[1]!.path).toMatch(new RegExp(`^b1/${id}/${UUID}\\.png$`))
    expect(c.uploads[2]!.path).toMatch(new RegExp(`^b1/${id}/${UUID}\\.webp$`))
    expect(progress).toEqual([[0, 'uploading'], [0, 'done'], [1, 'uploading'], [1, 'done'], [2, 'uploading'], [2, 'done']])
    expect(c.rpc).toHaveBeenCalledWith('request_model', {
      p_request_id: id,
      p_product: 'p1',
      p_variant: 'v1',
      p_note: 'Oak legs',
      p_photos: c.uploads.map((u, i) => ({ storage_path: u.path, file_name: ['a.jpg', 'b.png', 'c.webp'][i], size_bytes: 1 })),
    })
    if (r.ok) expect(r.data).toMatchObject({ id, businessId: 'b1', productId: 'p1', variantId: 'v1', status: 'requested', photoCount: 3 })
    expect(c.removed).toEqual([])
  })

  it('when the RPC fails it removes the uploaded photos and returns the mapped copy', async () => {
    const c = fakeClient({ rpc: { data: null, error: { code: '23505', message: 'model_request_open' } } })
    const r = await createSupabaseModelRequestsBusiness(c.sb, () => {}).requestModel({ businessId: 'b1', productId: 'p1', variantId: 'v1', photos: [photo('a.jpg'), photo('b.jpg')] })
    expect(r).toEqual({ ok: false, error: { code: 'CONFLICT', message: 'This option already has an open 3D model request.', reason: 'model_request_open' } })
    expect(c.removed).toEqual([{ bucket: 'model-request-photos', paths: c.uploads.map((u) => u.path) }])
  })

  it('a failed upload removes the photos already uploaded and never calls the RPC', async () => {
    const c = fakeClient({ uploadError: (p) => (c.uploads.length === 3 ? { message: `raw storage text for ${p}` } : null) })
    const r = await createSupabaseModelRequestsBusiness(c.sb, () => {}).requestModel({ businessId: 'b1', productId: 'p1', photos: [photo('a.jpg'), photo('b.jpg'), photo('c.jpg')] })
    expect(r).toMatchObject({ ok: false, error: { message: "A photo didn't finish uploading. Remove it and add it again." } })
    expect(c.rpc).not.toHaveBeenCalled()
    expect(c.removed).toEqual([{ bucket: 'model-request-photos', paths: [c.uploads[0]!.path, c.uploads[1]!.path] }])
  })

  it('a 300-character file name is sent as its first 255 characters', async () => {
    const c = fakeClient({ rpc: { data: { id: 'x', status: 'requested' }, error: null } })
    const long = `${'n'.repeat(296)}.jpg`
    await createSupabaseModelRequestsBusiness(c.sb, () => {}).requestModel({ businessId: 'b1', productId: 'p1', photos: [photo(long), photo('b.jpg')] })
    const sent = (c.rpc.mock.calls[0] as unknown as [string, { p_photos: { file_name: string }[]; p_variant: unknown; p_note: unknown }])[1]
    expect(sent.p_photos[0]!.file_name).toBe(long.slice(0, 255))
    expect(sent.p_variant).toBeNull()
    expect(sent.p_note).toBeNull()
  })

  it('cancelModelRequest removes the returned photo paths; a failed removal gives cleanup partial', async () => {
    const paths = ['b1/r1/a.jpg', 'b1/r1/b.jpg']
    const ok = fakeClient({ rpc: { data: { status: 'cancelled', photo_paths: paths }, error: null } })
    const notify = vi.fn()
    expect(await createSupabaseModelRequestsBusiness(ok.sb, notify).cancelModelRequest('r1')).toEqual({ ok: true, data: { status: 'cancelled' } })
    expect(ok.rpc).toHaveBeenCalledWith('cancel_model_request', { p_request: 'r1' })
    expect(ok.removed).toEqual([{ bucket: 'model-request-photos', paths }])
    expect(notify).toHaveBeenCalled()

    const partial = fakeClient({ rpc: { data: { status: 'cancelled', photo_paths: paths }, error: null }, removeError: { message: 'nope' } })
    expect(await createSupabaseModelRequestsBusiness(partial.sb, () => {}).cancelModelRequest('r1')).toEqual({ ok: true, data: { status: 'cancelled', cleanup: 'partial' } })

    const refused = fakeClient({ rpc: { data: null, error: { code: 'P0001', message: 'model_request_not_cancellable' } } })
    expect(await createSupabaseModelRequestsBusiness(refused.sb, () => {}).cancelModelRequest('r1')).toMatchObject({
      ok: false,
      error: { reason: 'model_request_not_cancellable', message: 'The Sanctus team has started on this model. To stop it, contact the Sanctus team.' },
    })
    expect(refused.removed).toEqual([])
  })
})

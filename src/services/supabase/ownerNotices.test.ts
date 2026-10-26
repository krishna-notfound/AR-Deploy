import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createSupabaseCatalogService } from './supabaseCatalogService'

const BIZ = '11111111-1111-4111-8111-111111111111'
const GONE = '22222222-2222-4222-8222-222222222222'

const businessRow = (status: string) => ({
  id: BIZ, name: 'Casa Lisboa', slug: 'casa', status, description: null, logo_url: null, contact: {}, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-26T00:00:00Z',
})

type Call = [string, ...unknown[]]

/**
 * supabase-js with one answer per table (data, or an error), a my_platform_access answer, and a functions.invoke
 * that the test controls. Records every builder call per table.
 */
function stub(opts: {
  tables?: Record<string, { data?: unknown[] | ((query: Call[]) => unknown[]); error?: { code: string; message: string } }>
  role?: string | null
  invoke?: (name: string, o: unknown) => Promise<unknown>
}) {
  const calls: Record<string, Call[]> = {}
  const invoke = vi.fn(opts.invoke ?? (async () => ({ data: { ok: true, sent: 1, skipped: 0 }, error: null })))
  const rpc = vi.fn(async (fn: string) =>
    fn === 'my_platform_access' ? { data: opts.role === null ? { role: null } : { role: opts.role ?? 'admin', permissions: [] }, error: null } : { data: [], error: null })
  const sb = {
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      const own: Call[] = []
      const answer = () => {
        const t = opts.tables?.[table] ?? {}
        const data = typeof t.data === 'function' ? t.data(own) : (t.data ?? [])
        return { data: t.error ? null : data, error: t.error ?? null, count: data.length }
      }
      for (const m of ['select', 'update', 'eq', 'neq', 'in', 'or', 'ilike', 'order', 'limit', 'range', 'returns'])
        q[m] = (...args: unknown[]) => {
          ;(calls[table] ??= []).push([m, ...args])
          own.push([m, ...args])
          return q
        }
      q.maybeSingle = async () => {
        const a = answer()
        return { ...a, data: Array.isArray(a.data) ? (a.data[0] ?? null) : a.data }
      }
      q.then = (resolve: (v: unknown) => void) => resolve(answer())
      return q
    },
    rpc,
    functions: { invoke },
  } as unknown as SupabaseClient
  return { sb, calls, invoke, rpc }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('owner notices after staff changes (R-W7-2)', () => {
  it('setBusinessStatus succeeds and resolves ok when notify-business-owner rejects', async () => {
    const { sb, invoke } = stub({ tables: { businesses: { data: [businessRow('inactive')] } }, invoke: () => Promise.reject(new Error('function down')) })
    const r = await createSupabaseCatalogService(sb).setBusinessStatus(BIZ, 'inactive')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.status).toBe('inactive')
    await flush()
    expect(invoke).toHaveBeenCalledWith('notify-business-owner', { body: { businessId: BIZ } })
  })

  it('a 403 aal2_required from the function leaves the result ok, and nothing is retried', async () => {
    const refused = { data: null, error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify({ error: 'aal2_required' }), { status: 403 }) } }
    const { sb, invoke } = stub({ tables: { businesses: { data: [businessRow('active')] } }, invoke: async () => refused })
    const r = await createSupabaseCatalogService(sb).setBusinessStatus(BIZ, 'active')
    expect(r.ok).toBe(true)
    await flush()
    await flush()
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('no notice for a business owner (no platform role) or for a move to draft', async () => {
    const owner = stub({ role: null, tables: { businesses: { data: [businessRow('inactive')] } } })
    expect((await createSupabaseCatalogService(owner.sb).setBusinessStatus(BIZ, 'inactive')).ok).toBe(true)
    await flush()
    expect(owner.invoke).not.toHaveBeenCalled()
    const draft = stub({ tables: { businesses: { data: [businessRow('draft')] } } })
    expect((await createSupabaseCatalogService(draft.sb).setBusinessStatus(BIZ, 'draft')).ok).toBe(true)
    await flush()
    expect(draft.invoke).not.toHaveBeenCalled()
  })

  it('a refused status change sends no notice', async () => {
    const { sb, invoke } = stub({ tables: { businesses: { error: { code: '42501', message: 'denied' } } } })
    expect((await createSupabaseCatalogService(sb).setBusinessStatus(BIZ, 'inactive')).ok).toBe(false)
    await flush()
    expect(invoke).not.toHaveBeenCalled()
  })
})

const audit = (id: string, extra: Record<string, unknown>) => ({
  id, created_at: `2026-10-2${id}T10:00:00Z`, event_type: 'business_status_changed', actor_id: null, application_id: null,
  business_id: BIZ, from_status: 'active', to_status: 'inactive', metadata: {}, ...extra,
})

describe('audit entries keep deleted people and businesses (R-W7-1)', () => {
  it('maps actor_label and business_name, and marks a business with a business_deleted row as deleted', async () => {
    const rows = [
      audit('1', { metadata: { actor_label: 'Admin', business_name: 'Casa Lisboa' } }),
      audit('2', { business_id: GONE, metadata: { business_name: 'Gone Co' } }),
      audit('3', { business_id: GONE, event_type: 'business_deleted', metadata: { actor_label: 'Nobody', business_name: 'Gone Co' } }),
    ]
    // The page query returns the rows; the deletion check returns only business_deleted rows.
    const { sb, calls } = stub({
      tables: {
        audit_events: {
          data: (query) =>
            query.some((c) => c[0] === 'eq' && c[1] === 'event_type' && c[2] === 'business_deleted') ? rows.filter((x) => x.event_type === 'business_deleted') : rows,
        },
      },
    })
    const r = await createSupabaseCatalogService(sb).getAuditEvents()
    if (!r.ok) throw new Error(r.error.message)
    expect(r.data.items.map((e) => ({ label: e.actorLabel, name: e.businessName, deleted: e.businessDeleted }))).toEqual([
      { label: 'Admin', name: 'Casa Lisboa', deleted: false },
      { label: undefined, name: 'Gone Co', deleted: true },
      { label: undefined, name: 'Gone Co', deleted: true },
    ])
    // The deletion check reads business_deleted rows for the businesses on the page.
    expect(calls.audit_events).toContainEqual(['eq', 'event_type', 'business_deleted'])
  })
})

describe('getPlatformChanges (R-W7-2)', () => {
  it("reads the business's whitelisted rows by Owner, Admin or Team, newest first, 20 at most", async () => {
    const { sb, calls } = stub({ tables: { audit_events: { data: [audit('1', { metadata: { actor_label: 'Team', business_name: 'Casa Lisboa' } })] } } })
    const r = await createSupabaseCatalogService(sb).getPlatformChanges(BIZ)
    if (!r.ok) throw new Error(r.error.message)
    expect(r.data).toHaveLength(1)
    expect(r.data[0]).toMatchObject({ actorLabel: 'Team', businessName: 'Casa Lisboa' })
    expect(calls.audit_events).toEqual(expect.arrayContaining([
      ['eq', 'business_id', BIZ],
      ['in', 'metadata->>actor_label', ['Owner', 'Admin', 'Team']],
      ['in', 'event_type', ['business_status_changed', 'business_slug_changed', 'product_created', 'product_published', 'product_unpublished', 'product_slug_changed', 'product_deleted', 'account_closure_voided']],
      ['order', 'created_at', { ascending: false }],
      ['limit', 20],
    ]))
  })

  it('reports a read error', async () => {
    const { sb } = stub({ tables: { audit_events: { error: { code: '500', message: 'boom' } } } })
    expect((await createSupabaseCatalogService(sb).getPlatformChanges(BIZ)).ok).toBe(false)
  })
})

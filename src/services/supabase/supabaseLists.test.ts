// The Supabase implementation of the managed lists (ADR-0055) against a fake client: which tables and function it calls, how
// rows map, and how the database's refusals become service errors.
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseLists, mapListsError } from './supabaseLists'

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null }
interface Call {
  table?: string
  op: string
  args?: unknown
  eq?: [string, unknown]
}

/** A client whose every query ends in the next queued reply. Records what was asked. */
function fakeClient(...replies: Reply[]) {
  const calls: Call[] = []
  const next = (): Reply => replies.shift() ?? { data: [], error: null }
  const chain = (call: Call) => {
    const q: Record<string, unknown> = {
      select: (cols?: unknown) => {
        if (call.op === 'select') call.args = cols
        return q
      },
      eq: (col: string, val: unknown) => {
        call.eq = [col, val]
        return q
      },
      single: () => Promise.resolve({ data: ((next().data ?? []) as unknown[])[0] ?? next().data, error: null }),
      then: (resolve: (r: Reply) => void) => resolve(next()),
    }
    return q
  }
  const client = {
    from: (table: string) => ({
      select: (cols: string) => {
        const c: Call = { table, op: 'select', args: cols }
        calls.push(c)
        return chain(c)
      },
      insert: (row: unknown) => {
        const c: Call = { table, op: 'insert', args: row }
        calls.push(c)
        return {
          select: () => ({
            single: () => {
              const r = next()
              return Promise.resolve({ data: r.error ? null : (r.data ?? row), error: r.error ?? null })
            },
          }),
        }
      },
      update: (patch: unknown) => {
        const c: Call = { table, op: 'update', args: patch }
        calls.push(c)
        return chain(c)
      },
    }),
    rpc: (fn: string, args: unknown) => {
      calls.push({ op: `rpc:${fn}`, args })
      return Promise.resolve(next())
    },
  }
  return { sb: client as unknown as SupabaseClient, calls }
}

const catRow = (slug: string, sort: number, over: Record<string, unknown> = {}) => ({ slug, label_en: slug.toUpperCase(), label_pt: `${slug}-pt`, sort, active: true, ...over })

describe('reading', () => {
  it('maps the category rows and sorts them with Other last', async () => {
    const { sb, calls } = fakeClient({ data: [catRow('other', 1000), catRow('chair', 20), catRow('sofa', 10, { active: false })] })
    const r = await createSupabaseLists(sb).getCategories()
    expect(calls[0]).toMatchObject({ table: 'product_categories', op: 'select' })
    expect(r.ok && r.data.map((c) => [c.slug, c.labelEn, c.labelPt, c.active])).toEqual([
      ['sofa', 'SOFA', 'sofa-pt', false],
      ['chair', 'CHAIR', 'chair-pt', true],
      ['other', 'OTHER', 'other-pt', true],
    ])
  })
  it('maps the currencies in display order', async () => {
    const { sb } = fakeClient({ data: [{ code: 'USD', enabled: true, sort: 3 }, { code: 'EUR', enabled: true, sort: 1 }, { code: 'GBP', enabled: false, sort: 101 }] })
    const r = await createSupabaseLists(sb).getCurrencies()
    expect(r.ok && r.data.map((c) => c.code)).toEqual(['EUR', 'USD', 'GBP'])
  })
  it('a failed read is an error, never fake data', async () => {
    const { sb } = fakeClient({ error: { code: 'PGRST301', message: 'jwt expired' } })
    const r = await createSupabaseLists(sb).getCategories()
    expect(r).toMatchObject({ ok: false, error: { code: 'UNKNOWN' } })
  })
  it('a missing table says the feature is not enabled yet', async () => {
    const { sb } = fakeClient({ error: { code: '42P01', message: 'relation does not exist' } })
    expect(await createSupabaseLists(sb).getCurrencies()).toMatchObject({ ok: false, error: { reason: 'not_enabled' } })
  })
})

describe('writing', () => {
  it('adds a category with a free slug and the next sort, ahead of Other', async () => {
    const { sb, calls } = fakeClient({ data: [catRow('sofa', 10), catRow('rugs', 80), catRow('other', 1000)] }, {})
    const r = await createSupabaseLists(sb).saveCategory({ labelEn: 'Rugs', labelPt: 'Tapetes' })
    expect(calls[1]).toMatchObject({ table: 'product_categories', op: 'insert', args: { slug: 'rugs-2', label_en: 'Rugs', label_pt: 'Tapetes', sort: 90, active: true } })
    expect(r.ok && r.data.slug).toBe('rugs-2')
  })
  it('refuses empty names before asking the database', async () => {
    const { sb, calls } = fakeClient()
    const r = await createSupabaseLists(sb).saveCategory({ labelEn: '', labelPt: 'x' })
    expect(r).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(calls).toHaveLength(0)
  })
  it('edits labels and visibility of one slug; Other is never sent as hidden', async () => {
    const { sb, calls } = fakeClient({ data: [catRow('sofa', 10)] }, { data: [catRow('other', 1000)] })
    const lists = createSupabaseLists(sb)
    await lists.saveCategory({ slug: 'sofa', labelEn: 'Couch', labelPt: 'Sofá', active: false })
    expect(calls[0]).toMatchObject({ op: 'update', args: { label_en: 'Couch', label_pt: 'Sofá', active: false }, eq: ['slug', 'sofa'] })
    await lists.saveCategory({ slug: 'other', labelEn: 'Other', labelPt: 'Outro', active: false })
    expect(calls[1]!.args).toEqual({ label_en: 'Other', label_pt: 'Outro' })
  })
  it('an update the database filtered out (no permission) is a refusal, not a success', async () => {
    const { sb } = fakeClient({ data: [] })
    expect(await createSupabaseLists(sb).saveCategory({ slug: 'sofa', labelEn: 'a', labelPt: 'b' })).toMatchObject({ ok: false, error: { code: 'PERMISSION' } })
  })
  it('reorders by writing the position of each slug, leaving Other out', async () => {
    const { sb, calls } = fakeClient({ data: [{ slug: 'chair' }] }, { data: [{ slug: 'sofa' }] })
    const r = await createSupabaseLists(sb).reorderCategories(['chair', 'sofa', 'other'])
    expect(r.ok).toBe(true)
    expect(calls.map((c) => [c.args, c.eq])).toEqual([
      [{ sort: 10 }, ['slug', 'chair']],
      [{ sort: 20 }, ['slug', 'sofa']],
    ])
  })
  it('deleting calls admin_delete_category and returns how many products moved', async () => {
    const { sb, calls } = fakeClient({ data: 4 })
    const r = await createSupabaseLists(sb).deleteCategory('sofa')
    expect(calls[0]).toEqual({ op: 'rpc:admin_delete_category', args: { p_slug: 'sofa' } })
    expect(r).toEqual({ ok: true, data: { moved: 4 } })
  })
  it('switches a currency by code', async () => {
    const { sb, calls } = fakeClient({ data: [{ code: 'GBP', enabled: true, sort: 101 }] })
    const r = await createSupabaseLists(sb).setCurrencyEnabled('GBP', true)
    expect(calls[0]).toMatchObject({ table: 'currencies', op: 'update', args: { enabled: true }, eq: ['code', 'GBP'] })
    expect(r).toEqual({ ok: true, data: { code: 'GBP', enabled: true, sort: 101 } })
  })
})

describe('error mapping', () => {
  it('maps the database refusals to reasons the screens translate', () => {
    expect(mapListsError({ code: '42501', message: 'forbidden' })).toMatchObject({ error: { code: 'PERMISSION', reason: 'forbidden' } })
    expect(mapListsError({ code: '42501', message: 'aal2_required' })).toMatchObject({ error: { code: 'PERMISSION', reason: 'aal2_required' } })
    expect(mapListsError({ code: 'P0001', message: 'category_protected' })).toMatchObject({ error: { reason: 'category_protected' } })
    expect(mapListsError({ code: 'P0001', message: 'category_not_found' })).toMatchObject({ error: { code: 'NOT_FOUND', reason: 'category_not_found' } })
    expect(mapListsError({ code: 'P0001', message: 'last_currency' })).toMatchObject({ error: { reason: 'last_currency' } })
    expect(mapListsError({ code: '23505', message: 'duplicate key' })).toMatchObject({ error: { code: 'CONFLICT', reason: 'category_exists' } })
    expect(mapListsError({ code: 'XX000', message: 'boom' })).toMatchObject({ error: { code: 'UNKNOWN' } })
  })
})

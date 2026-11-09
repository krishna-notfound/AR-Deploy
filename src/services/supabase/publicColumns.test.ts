// ADR-0054: public reads of businesses list their columns (anon cannot select the internal description), the Share switch
// writes share_enabled only, and the database's publish_needs_model reaches the editor as a "models" field message.
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { PUBLIC_BUSINESS_COLUMNS, createSupabaseCatalogService, mapDbError, toBusiness, type BusinessRow } from './supabaseCatalogService'

type Call = [string, ...unknown[]]
type Table = { data?: unknown[]; error?: { code: string; message: string } }

function stub(tables: Record<string, Table>) {
  const calls: Record<string, Call[]> = {}
  const sb = {
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      const result = () => {
        const t = tables[table] ?? {}
        return { data: t.error ? null : (t.data ?? []), error: t.error ?? null }
      }
      for (const m of ['select', 'eq', 'neq', 'in', 'order', 'range', 'returns', 'update'])
        q[m] = (...args: unknown[]) => {
          ;(calls[table] ??= []).push([m, ...args])
          return q
        }
      q.maybeSingle = () => {
        const r = result()
        return Promise.resolve({ data: r.error ? null : ((r.data as unknown[])[0] ?? null), error: r.error })
      }
      q.then = (resolve: (v: unknown) => void) => resolve(result())
      return q
    },
  } as unknown as SupabaseClient
  return { sb, calls }
}

// What the database returns to anon: no description key at all.
const publicRow = (over: Partial<BusinessRow> = {}): BusinessRow => ({
  id: 'b1',
  name: 'Nordhaus',
  slug: 'nordhaus',
  logo_url: null,
  contact_email: null,
  contact_phone: null,
  contact_website: null,
  contact_address: null,
  status: 'active',
  accent_color: '#8A765C',
  default_currency: 'EUR',
  allow_own_models: false,
  share_enabled: true,
  is_house: false,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...over,
})

const selected = (calls: Record<string, Call[]>) => calls.businesses!.filter((c) => c[0] === 'select').map((c) => c[1])

describe('public business reads (ADR-0054)', () => {
  it('the public column list has no description and no star', () => {
    expect(PUBLIC_BUSINESS_COLUMNS).not.toMatch(/description|\*/)
    expect(PUBLIC_BUSINESS_COLUMNS.split(', ')).toEqual(expect.arrayContaining(['id', 'slug', 'status', 'share_enabled', 'is_house']))
  })

  it('getBusinessBySlug asks for the public columns and maps a missing description to empty text', async () => {
    const { sb, calls } = stub({ businesses: { data: [publicRow()] } })
    const r = await createSupabaseCatalogService(sb).getBusinessBySlug('nordhaus')
    if (!r.ok) throw new Error(r.error.message)
    expect(selected(calls)).toEqual([PUBLIC_BUSINESS_COLUMNS])
    expect(r.data.description).toBe('')
    expect(r.data.shareEnabled).toBe(true)
  })

  it('getShowcase and getPublicProduct ask for the public columns too', async () => {
    const house = publicRow({ id: 'house', slug: 'sanctus-showcase', is_house: true })
    const a = stub({ businesses: { data: [house] }, products: { data: [] } })
    expect((await createSupabaseCatalogService(a.sb).getShowcase()).ok).toBe(true)
    expect(selected(a.calls)).toEqual([PUBLIC_BUSINESS_COLUMNS])
    const b = stub({ businesses: { data: [publicRow()] }, products: { data: [] } })
    await createSupabaseCatalogService(b.sb).getPublicProduct('nordhaus', 'chair')
    expect(selected(b.calls)).toEqual([PUBLIC_BUSINESS_COLUMNS])
  })

  it('a dashboard read keeps the description (the signed-in role may select it)', async () => {
    const { sb } = stub({ businesses: { data: [{ ...publicRow(), description: 'Internal note' }] } })
    const r = await createSupabaseCatalogService(sb).getBusinessById('b1')
    expect(r.ok && r.data.description).toBe('Internal note')
  })

  it('share_enabled false reads as shareEnabled false; a row without the column (older database) reads as shown', () => {
    expect(toBusiness(publicRow({ share_enabled: false })).shareEnabled).toBe(false)
    const { share_enabled: _gone, ...old } = publicRow()
    expect(toBusiness(old as BusinessRow).shareEnabled).toBe(true)
  })
})

describe('Share switch and publish rule over Supabase', () => {
  it('setBusinessShareEnabled writes share_enabled alone', async () => {
    const { sb, calls } = stub({ businesses: { data: [{ ...publicRow({ share_enabled: false }), description: '' }] } })
    const r = await createSupabaseCatalogService(sb).setBusinessShareEnabled('b1', false)
    expect(r.ok && r.data.shareEnabled).toBe(false)
    expect(calls.businesses).toContainEqual(['update', { share_enabled: false }])
    expect(calls.businesses).toContainEqual(['eq', 'id', 'b1'])
  })

  it('an owner (admin_only error from the database) gets "forbidden", not a generic failure', async () => {
    const { sb } = stub({ businesses: { error: { code: '42501', message: 'business_field_admin_only' } } })
    const r = await createSupabaseCatalogService(sb).setBusinessShareEnabled('b1', false)
    expect(r).toMatchObject({ ok: false, error: { code: 'PERMISSION' } })
  })

  it('publish_needs_model becomes a field message on "models"', () => {
    const r = mapDbError({ code: '23514', message: 'publish_needs_model' })
    expect(r).toMatchObject({ ok: false, error: { code: 'VALIDATION', fieldErrors: { models: { key: 'common.validation.publish.modelRequired' } } } })
  })
})

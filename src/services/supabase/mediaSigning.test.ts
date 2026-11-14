// QA EF-12: when the batch request for the stored files' download links fails as a whole, loading a product is a load error
// (retryable), not a product whose 3D files are all "invalid" and whose pictures are gone.
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { errorKey } from '@/i18n/errorText'
import { type ProductRow, createSupabaseCatalogService } from './supabaseCatalogService'

const row = {
  id: 'p1',
  business_id: 'b1',
  slug: 'chair',
  name: { en: 'Chair' },
  short_description: { en: '' },
  description: { en: '' },
  material: { en: '' },
  cta_label: { en: '' },
  cta_url: null,
  cta_hidden: false,
  category: 'chair',
  price: 12000,
  currency: 'EUR',
  status: 'published',
  width: 83,
  height: 69,
  depth: 57,
  dimension_unit: 'cm',
  weight_value: null,
  weight_unit: null,
  published_at: null,
  created_at: '2026-10-20T00:00:00Z',
  updated_at: '2026-10-20T00:00:00Z',
  product_images: [{ id: 'i1', url: null, storage_path: 'b1/main.jpg', alt: null, is_primary: true, kind: 'gallery', sort_order: 0 }],
  product_models: [{ format: 'glb', url: null, storage_path: 'b1/main.glb', file_name: 'm.glb', size_bytes: null, required_extensions: null }],
  product_variants: [],
} as unknown as ProductRow

function client(sign: (paths: string[]) => { data: { path: string; signedUrl: string | null }[] | null; error: unknown }) {
  const builder = () => {
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'eq', 'order', 'returns']) b[op] = () => b
    b.maybeSingle = () => Promise.resolve({ data: row, error: null })
    return b
  }
  return { from: builder, storage: { from: () => ({ createSignedUrls: (paths: string[]) => Promise.resolve(sign(paths)) }) } } as unknown as SupabaseClient
}

describe('product media links (EF-12)', () => {
  it('a failed signing request is a retryable load error, with its own message', async () => {
    const res = await createSupabaseCatalogService(client(() => ({ data: null, error: { message: 'Failed to fetch' } }))).getProductById('p1')
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.reason).toBe('media_unavailable')
    expect(errorKey(res.error)).toBe('common.error.reason.media_unavailable')
  })

  it('a file that has no link of its own still loads, marked unavailable', async () => {
    const res = await createSupabaseCatalogService(
      client((paths) => ({ data: paths.map((path) => ({ path, signedUrl: path.endsWith('.glb') ? null : `https://signed.test/${path}` })), error: null })),
    ).getProductById('p1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.images[0]?.url).toBe('https://signed.test/b1/main.jpg')
    expect(res.data.models.glb?.status).toBe('invalid')
  })
})

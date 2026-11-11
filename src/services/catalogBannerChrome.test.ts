// The public chrome read carries the platform's default catalogue banner (ADR-0065): from a document (demo service and the Editor's
// preview) and from the database function's answer (Supabase service); the document keeps its crop and original.
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { emptySiteContent, normalizeSiteContent } from '@/domain/siteContent'
import { chromeOf } from './contentView'
import { createSupabaseContent } from './supabase/supabaseContent'

const banner = { path: 'landing/11111111-1111-4111-8111-111111111111.webp', originalPath: 'landing/22222222-2222-4222-8222-222222222222.jpg', crop: { x: 1, y: 2, width: 600, height: 300 } }
const icon = { path: 'landing/33333333-3333-4333-8333-333333333333.png' }

describe('normalizeSiteContent: chrome.catalogBanner', () => {
  it('keeps the banner with its original and crop next to the favicon, and drops anything else in chrome', () => {
    expect(normalizeSiteContent({ chrome: { catalogBanner: banner, favicon: icon, other: 1 } }).chrome).toEqual({ favicon: icon, catalogBanner: banner })
    expect(normalizeSiteContent({ chrome: { catalogBanner: { path: banner.path } } }).chrome).toEqual({ catalogBanner: { path: banner.path } })
  })
  it('drops a malformed banner or crop', () => {
    expect(normalizeSiteContent({ chrome: { catalogBanner: 'x' } }).chrome).toBeUndefined()
    expect(normalizeSiteContent({ chrome: { catalogBanner: { path: banner.path, originalPath: 5, crop: { x: 'a' } } } }).chrome).toEqual({ catalogBanner: { path: banner.path } })
  })
})

describe('chromeOf: catalogBanner', () => {
  it('returns it only when the document has one, whole', () => {
    expect(chromeOf(emptySiteContent(), 1)).not.toHaveProperty('catalogBanner')
    expect(chromeOf(normalizeSiteContent({ chrome: { catalogBanner: banner } }), 2)).toMatchObject({ version: 2, catalogBanner: banner })
  })
})

describe('supabase getPublishedChrome: catalogBanner', () => {
  const read = async (content: unknown) => {
    const rpc = vi.fn(async () => ({ data: { version: 4, content }, error: null }))
    return createSupabaseContent({ rpc } as unknown as SupabaseClient).getPublishedChrome()
  }
  const base = { footerPages: [], social: {}, landingCollections: [] }

  it('maps it with its original and crop, next to the favicon', async () => {
    const r = await read({ ...base, favicon: icon, catalogBanner: { ...banner, junk: 1 } })
    expect(r).toEqual({ ok: true, data: { version: 4, ...base, favicon: icon, catalogBanner: banner } })
  })

  it('has no banner when the database sends none or something malformed', async () => {
    expect(await read(base)).toEqual({ ok: true, data: { version: 4, ...base } })
    expect(await read({ ...base, catalogBanner: 'x' })).toEqual({ ok: true, data: { version: 4, ...base } })
    expect(await read({ ...base, catalogBanner: [banner] })).toEqual({ ok: true, data: { version: 4, ...base } })
  })
})

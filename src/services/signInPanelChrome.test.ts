// The public chrome read carries the sign-in panel and the catalogue heading (ADR-0067): from a document (demo service and the
// Editor's preview) and from the database function's answer (Supabase service).
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { emptySiteContent, normalizeSiteContent } from '@/domain/siteContent'
import { chromeOf } from './contentView'
import { createSupabaseContent } from './supabase/supabaseContent'

const pic = { path: 'landing/11111111-1111-4111-8111-111111111111.webp', originalPath: 'landing/22222222-2222-4222-8222-222222222222.jpg', crop: { x: 1, y: 2, width: 400, height: 500 } }
const signIn = { texts: { title: { en: 'Made to last', pt: 'Feito para durar' } }, pictures: { login: pic } }
const catalogHeading = { en: 'Our pieces', pt: 'As nossas peças' }

describe('chromeOf: signIn and catalogHeading', () => {
  it('returns them only when the document has them, whole', () => {
    const none = chromeOf(emptySiteContent(), 1)
    expect(none).not.toHaveProperty('signIn')
    expect(none).not.toHaveProperty('catalogHeading')
    expect(chromeOf(normalizeSiteContent({ chrome: { signIn, catalogHeading } }), 2)).toMatchObject({ version: 2, signIn, catalogHeading })
  })
})

describe('supabase getPublishedChrome: signIn and catalogHeading', () => {
  const read = async (content: unknown) => {
    const rpc = vi.fn(async () => ({ data: { version: 4, content }, error: null }))
    return createSupabaseContent({ rpc } as unknown as SupabaseClient).getPublishedChrome()
  }
  const base = { footerPages: [], social: {}, landingCollections: [] }

  it('maps them, dropping what is unknown or malformed', async () => {
    const r = await read({ ...base, signIn: { ...signIn, pictures: { ...signIn.pictures, home: pic }, junk: 1 }, catalogHeading: { ...catalogHeading, fr: 'x' } })
    expect(r).toEqual({ ok: true, data: { version: 4, ...base, signIn, catalogHeading } })
  })

  it('has neither when the database sends none or something malformed', async () => {
    expect(await read(base)).toEqual({ ok: true, data: { version: 4, ...base } })
    expect(await read({ ...base, signIn: 'x', catalogHeading: ['x'] })).toEqual({ ok: true, data: { version: 4, ...base } })
  })
})

// The public chrome read carries the favicon and the landing texts (ADR-0053): from a document (demo service and the Editor's
// preview) and from the database function's answer (Supabase service).
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { emptySiteContent, normalizeSiteContent } from '@/domain/siteContent'
import { chromeOf } from './contentView'
import { createSupabaseContent } from './supabase/supabaseContent'

const icon = { path: 'landing/11111111-1111-4111-8111-111111111111.png' }
const texts = { 'landing.hero.title1': { en: 'Hello', pt: 'Olá' } }

describe('chromeOf', () => {
  it('returns landingTexts and favicon only when the document has them', () => {
    expect(chromeOf(emptySiteContent(), 1)).not.toHaveProperty('favicon')
    expect(chromeOf(emptySiteContent(), 1)).not.toHaveProperty('landingTexts')
    const doc = normalizeSiteContent({ landing: { collections: [], texts }, chrome: { favicon: icon } })
    expect(chromeOf(doc, 2)).toMatchObject({ version: 2, landingTexts: texts, favicon: icon })
    expect(chromeOf(null, 0)).toEqual({ version: 0, footerPages: [], social: {}, landingCollections: [] })
  })
})

describe('supabase getPublishedChrome', () => {
  const read = async (content: unknown) => {
    const rpc = vi.fn(async () => ({ data: { version: 4, content }, error: null }))
    return createSupabaseContent({ rpc } as unknown as SupabaseClient).getPublishedChrome()
  }

  it('maps favicon and landingTexts, dropping anything malformed', async () => {
    const r = await read({ footerPages: [], social: {}, landingCollections: [], favicon: { path: icon.path, junk: 1 }, landingTexts: { ...texts, 'landing.hero.body': 'bad', 'landing.hero.note': { en: '' } } })
    expect(r).toEqual({ ok: true, data: { version: 4, footerPages: [], social: {}, landingCollections: [], landingTexts: texts, favicon: icon } })
  })

  it('has neither key when the database sends neither', async () => {
    const r = await read({ footerPages: [], social: {}, landingCollections: [], favicon: 'x', landingTexts: [] })
    expect(r).toEqual({ ok: true, data: { version: 4, footerPages: [], social: {}, landingCollections: [] } })
  })
})

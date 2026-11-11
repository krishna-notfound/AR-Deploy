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

describe('chromeOf: homepage sections (ADR-0061)', () => {
  const pic = { path: 'landing/22222222-2222-4222-8222-222222222222.webp', alt: { en: 'A table' } }
  const landing = { collections: [], sections: [{ kind: 'builtin', id: 'how', hidden: true }, { kind: 'text', id: 'a', title: { en: 'Hi' } }], qr: { image: pic, imageSide: 'right' }, about: { detail: pic } }

  it('returns the sections, the QR layout and the About pictures only when the document has them', () => {
    expect(chromeOf(emptySiteContent(), 1)).not.toHaveProperty('landingSections')
    expect(chromeOf(emptySiteContent(), 1)).not.toHaveProperty('landingQr')
    expect(chromeOf(emptySiteContent(), 1)).not.toHaveProperty('landingAbout')
    const c = chromeOf(normalizeSiteContent({ landing }), 2)
    expect(c).toMatchObject({ landingSections: landing.sections, landingQr: landing.qr, landingAbout: landing.about })
  })

  it('moves an older hero text override to the QR text', () => {
    const c = chromeOf(normalizeSiteContent({ landing: { collections: [], texts: { 'landing.hero.body': { en: 'Old' } } } }), 1)
    expect(c.landingTexts).toEqual({ 'landing.qr.body': { en: 'Old' } })
  })

  it('the Supabase read maps them and drops anything malformed', async () => {
    const rpc = vi.fn(async () => ({
      data: { version: 3, content: { footerPages: [], social: {}, landingCollections: [], landingSections: [...landing.sections, { kind: 'mystery' }, 'x'], landingQr: landing.qr, landingAbout: { detail: pic, junk: 1 } } },
      error: null,
    }))
    const r = await createSupabaseContent({ rpc } as unknown as SupabaseClient).getPublishedChrome()
    expect(r).toEqual({ ok: true, data: { version: 3, footerPages: [], social: {}, landingCollections: [], landingSections: landing.sections, landingQr: landing.qr, landingAbout: landing.about } })
    const none = vi.fn(async () => ({ data: { version: 3, content: { footerPages: [], social: {}, landingCollections: [], landingSections: 'x', landingQr: [], landingAbout: 5 } }, error: null }))
    expect(await createSupabaseContent({ rpc: none } as unknown as SupabaseClient).getPublishedChrome()).toEqual({ ok: true, data: { version: 3, footerPages: [], social: {}, landingCollections: [] } })
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

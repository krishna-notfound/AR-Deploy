// Site icon and editable landing texts (ADR-0053): the document model, the whitelist and the change summary.
import { describe, expect, it } from 'vitest'
import { enCore } from '@/i18n/dictionaries/en'
import { ptCore } from '@/i18n/dictionaries/pt'
import {
  LANDING_EDITABLE_KEYS,
  LANDING_TEXT_GROUPS,
  LANDING_TEXT_KINDS,
  LANDING_TEXT_LIMITS,
  type SiteContent,
  emptySiteContent,
  isFaviconPath,
  normalizeSiteContent,
  summarizeChanges,
  validateContentShape,
  validateSiteContent,
} from './siteContent'

const PNG = { path: 'landing/0a1b2c3d-1111-4222-8333-444455556666.png' }
const withTexts = (texts: unknown): SiteContent => normalizeSiteContent({ landing: { collections: [], texts } })

describe('the landing text list', () => {
  it('every key is a landing.* dictionary key in both languages, listed once, with a limit of its kind', () => {
    const keys = LANDING_TEXT_GROUPS.flatMap((g) => g.keys.map(([k]) => k))
    expect(new Set(keys).size).toBe(keys.length)
    expect([...LANDING_EDITABLE_KEYS]).toEqual(keys)
    for (const key of keys) {
      expect(key).toMatch(/^landing\./)
      expect(enCore, key).toHaveProperty([key])
      expect(ptCore, key).toHaveProperty([key])
    }
    expect(Object.values(LANDING_TEXT_LIMITS).every((n) => Object.values(LANDING_TEXT_KINDS).includes(n as never))).toBe(true)
  })

  it('does not offer navigation, footer or shared call-to-action texts', () => {
    expect(LANDING_EDITABLE_KEYS.some((k) => k.startsWith('site.') || k.startsWith('nav.'))).toBe(false)
  })

  it('the original wording of every key fits its limit (so "reset" can never produce a refused text)', () => {
    for (const key of LANDING_EDITABLE_KEYS) {
      const max = LANDING_TEXT_LIMITS[key]!
      expect((enCore as Record<string, string>)[key]!.length, key).toBeLessThanOrEqual(max)
      expect((ptCore as Record<string, string>)[key]!.length, key).toBeLessThanOrEqual(max)
    }
  })

  it('landing.hero.body is no longer editable but is still accepted from an older document (ADR-0061)', () => {
    expect(LANDING_EDITABLE_KEYS).not.toContain('landing.hero.body')
    expect(LANDING_TEXT_LIMITS['landing.hero.body']).toBe(600)
    expect(enCore).not.toHaveProperty(['landing.hero.body'])
  })
})

describe('normalize', () => {
  it('keeps texts with at least one language and drops empty entries; no texts means no key', () => {
    const doc = withTexts({ 'landing.hero.title1': { en: 'Hi', pt: '' }, 'landing.hero.body': { en: '', pt: '' }, 'landing.hero.note': 'x', 'landing.biz.body': { pt: 'Olá', other: 'z' } })
    expect(doc.landing.texts).toEqual({ 'landing.hero.title1': { en: 'Hi' }, 'landing.biz.body': { pt: 'Olá' } })
    expect('texts' in withTexts({}).landing).toBe(false)
    expect('texts' in normalizeSiteContent({}).landing).toBe(false)
    expect('chrome' in normalizeSiteContent({}) ).toBe(false)
  })

  it('keeps a favicon reference and drops anything else in chrome', () => {
    expect(normalizeSiteContent({ chrome: { favicon: { path: PNG.path, extra: 1 }, other: 1 } }).chrome).toEqual({ favicon: PNG })
    expect(normalizeSiteContent({ chrome: { favicon: 'x' } }).chrome).toBeUndefined()
    expect(normalizeSiteContent({ chrome: 'x' }).chrome).toBeUndefined()
  })
})

describe('validate', () => {
  it('an untouched document and one with valid texts and a favicon are valid', () => {
    expect(validateSiteContent(emptySiteContent())).toEqual({})
    const doc = withTexts({ 'landing.hero.title1': { en: 'x'.repeat(200), pt: 'Olá' }, 'landing.hero.cta3d': { en: 'x'.repeat(40) } })
    doc.chrome = { favicon: PNG }
    expect(validateSiteContent(doc)).toEqual({})
  })

  it('refuses unknown keys, wrong shapes and texts over the limit of their key', () => {
    const doc = emptySiteContent()
    ;(doc.landing as Record<string, unknown>).texts = {
      'site.apply': { en: 'x' },
      'landing.hero.eyebrow': { en: 'x'.repeat(61), pt: 5 },
      'landing.hero.body': 'text',
      'landing.hero.note': { pt: 'y'.repeat(601) },
    }
    expect(validateSiteContent(doc)).toEqual({
      'landing.texts.site.apply': 'unknown_key',
      'landing.texts.landing.hero.eyebrow.en': 'too_long',
      'landing.texts.landing.hero.eyebrow.pt': 'invalid_value',
      'landing.texts.landing.hero.body': 'invalid_value',
      'landing.texts.landing.hero.note.pt': 'too_long',
    })
  })

  it('accepts only an uploaded PNG as favicon', () => {
    const check = (favicon: unknown) => {
      const doc = emptySiteContent()
      ;(doc as unknown as Record<string, unknown>).chrome = { favicon }
      return validateSiteContent(doc)
    }
    expect(check(PNG)).toEqual({})
    for (const bad of [{ path: 'landing/a.jpg' }, { path: 'landing/a.webp' }, { path: 'landing/a.glb' }, { path: 'https://x.test/a.png' }, { path: 'a.png' }, 'landing/a.png', {}, null])
      expect(check(bad)).toEqual({ 'chrome.favicon': 'invalid_value' })
    expect(isFaviconPath(PNG.path)).toBe(true)
    expect(isFaviconPath('landing/a.jpg')).toBe(false)
  })
})

describe('draft shape', () => {
  it('refuses chrome and landing.texts that are not objects', () => {
    for (const bad of ['x', 5, [], null]) {
      expect(validateContentShape({ schema: 1, chrome: bad })).toEqual({ chrome: 'invalid_value' })
      expect(validateContentShape({ schema: 1, landing: { texts: bad } })).toEqual({ 'landing.texts': 'invalid_value' })
    }
    expect(validateContentShape({ schema: 1, chrome: {}, landing: { texts: {} } })).toEqual({})
  })
})

describe('summarizeChanges', () => {
  it('counts changed texts per key and language, and the favicon once', () => {
    const a = emptySiteContent()
    const b = withTexts({ 'landing.hero.title1': { en: 'Hi', pt: 'Olá' }, 'landing.biz.body': { en: 'x' } })
    b.chrome = { favicon: PNG }
    expect(summarizeChanges(a, b)).toMatchObject({ landingTexts: 3, siteFavicon: 1, total: 4 })
    expect(summarizeChanges(b, b)).toMatchObject({ landingTexts: 0, siteFavicon: 0, total: 0 })
    const c = withTexts({ 'landing.hero.title1': { en: 'Hi' } })
    c.chrome = { favicon: { path: 'landing/other.png' } }
    expect(summarizeChanges(b, c)).toMatchObject({ landingTexts: 2, siteFavicon: 1 })
    expect(summarizeChanges(null, a).total).toBe(0)
  })
})

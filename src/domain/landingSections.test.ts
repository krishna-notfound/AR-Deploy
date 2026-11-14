// Homepage sections, the QR section and the About pictures (ADR-0061): the document model, normalize, validate and the change summary.
import { describe, expect, it } from 'vitest'
import {
  BUILTIN_SECTION_IDS,
  type LandingSection,
  MAX_LANDING_SECTIONS,
  MAX_OWN_SECTIONS,
  type SiteContent,
  defaultLandingSections,
  emptySiteContent,
  isAllowedSectionHref,
  normalizeSiteContent,
  resolveLandingSections,
  summarizeChanges,
  validateContentShape,
  validateSiteContent,
} from './siteContent'

const IMG = { path: 'landing/0a1b2c3d-1111-4222-8333-444455556666.webp', alt: { en: 'A sofa' } }
const doc = (landing: Record<string, unknown>): SiteContent => ({ ...emptySiteContent(), landing: { collections: [], ...landing } }) as SiteContent
const builtins = (): LandingSection[] => BUILTIN_SECTION_IDS.map((id) => ({ kind: 'builtin', id }))
const text = (id: string, over: Record<string, unknown> = {}): LandingSection => ({ kind: 'text', id, title: { en: 'Hello' }, ...over }) as LandingSection
const errorsOf = (sections: unknown) => validateSiteContent(doc({ sections }))

describe('defaults', () => {
  it('nothing saved: the six built-in sections in today\'s order, none hidden, and the QR section under the hero', () => {
    expect(defaultLandingSections().map((s) => s.id)).toEqual(['qr', 'how', 'experience', 'collections', 'about', 'partners'])
    expect(resolveLandingSections(emptySiteContent().landing)).toEqual(defaultLandingSections())
    expect(resolveLandingSections(emptySiteContent().landing).some((s) => s.kind === 'builtin' && s.hidden)).toBe(false)
  })

  it('a saved list is used as it is', () => {
    const saved = [text('intro'), ...builtins().slice(0, 2)]
    expect(resolveLandingSections(doc({ sections: saved }).landing)).toEqual(saved)
  })

  it('an untouched document is valid and has neither sections nor qr nor about', () => {
    const d = normalizeSiteContent({})
    expect(validateSiteContent(d)).toEqual({})
    expect(d.landing).not.toHaveProperty('sections')
    expect(d.landing).not.toHaveProperty('qr')
    expect(d.landing).not.toHaveProperty('about')
  })
})

describe('normalize', () => {
  it('keeps built-in and the three own designs, with hidden and anchor, and drops unknown keys and unknown kinds', () => {
    const d = normalizeSiteContent({
      landing: {
        sections: [
          { kind: 'builtin', id: 'how', hidden: true, junk: 1 },
          { kind: 'text', id: 'intro', anchor: 'welcome', eyebrow: { en: 'E', pt: 'P' }, title: { en: 'T' }, subtitle: { en: 'S' }, body: { en: 'B' }, button: { label: { en: 'Go' }, href: '/apply', x: 1 }, junk: 2 },
          { kind: 'imageText', id: 'story', title: { en: 'T' }, image: { path: IMG.path, alt: { en: 'A', pt: 'B' }, junk: 1 }, imageSide: 'right' },
          { kind: 'banner', id: 'wide', image: { path: IMG.path }, title: { en: 'T' } },
          { kind: 'mystery', id: 'x' },
          'nope',
          null,
        ],
      },
    })
    expect(d.landing.sections).toEqual([
      { kind: 'builtin', id: 'how', hidden: true },
      { kind: 'text', id: 'intro', anchor: 'welcome', eyebrow: { en: 'E', pt: 'P' }, title: { en: 'T' }, subtitle: { en: 'S' }, body: { en: 'B' }, button: { label: { en: 'Go' }, href: '/apply' } },
      { kind: 'imageText', id: 'story', title: { en: 'T' }, image: { path: IMG.path, alt: { en: 'A', pt: 'B' } }, imageSide: 'right' },
      { kind: 'banner', id: 'wide', image: { path: IMG.path, alt: { en: '' } }, title: { en: 'T' } },
    ])
  })

  it('an unknown built-in id is dropped; imageSide defaults to left; hidden false is not stored', () => {
    const d = normalizeSiteContent({ landing: { sections: [{ kind: 'builtin', id: 'nope' }, { kind: 'builtin', id: 'qr', hidden: false }, { kind: 'imageText', id: 'a', title: { en: 'T' }, imageSide: 'weird' }] } })
    expect(d.landing.sections).toEqual([
      { kind: 'builtin', id: 'qr' },
      { kind: 'imageText', id: 'a', title: { en: 'T' }, image: { path: '', alt: { en: '' } }, imageSide: 'left' },
    ])
  })

  it('a non-array sections value is dropped (the default list then applies)', () => {
    expect(normalizeSiteContent({ landing: { sections: 'x' } }).landing).not.toHaveProperty('sections')
  })

  it('qr: image with alt and a side; side defaults to none; junk dropped; nothing set means no key', () => {
    expect(normalizeSiteContent({ landing: { qr: { image: { path: IMG.path, alt: { en: 'Q' }, junk: 1 }, imageSide: 'left', junk: 1 } } }).landing.qr).toEqual({ image: { path: IMG.path, alt: { en: 'Q' } }, imageSide: 'left' })
    expect(normalizeSiteContent({ landing: { qr: { imageSide: 'bogus' } } }).landing.qr).toEqual({ imageSide: 'none' })
    expect(normalizeSiteContent({ landing: { qr: 'x' } }).landing).not.toHaveProperty('qr')
  })

  it('about: image and detail with alt; empty means no key', () => {
    const about = { image: { path: IMG.path, alt: { en: 'I', pt: 'J' } }, detail: { path: 'landing/aaaa.png', alt: { en: 'D' } } }
    expect(normalizeSiteContent({ landing: { about: { ...about, junk: 1 } } }).landing.about).toEqual(about)
    expect(normalizeSiteContent({ landing: { about: {} } }).landing).not.toHaveProperty('about')
    expect(normalizeSiteContent({ landing: { about: { image: 'x' } } }).landing).not.toHaveProperty('about')
  })

  it('a saved landing.hero.body becomes landing.qr.body (per language, never over a QR text that exists) and the hero key is gone', () => {
    const d = normalizeSiteContent({ landing: { texts: { 'landing.hero.body': { en: 'Old EN', pt: 'Velho PT' }, 'landing.hero.title1': { en: 'Hi' } } } })
    expect(d.landing.texts).toEqual({ 'landing.hero.title1': { en: 'Hi' }, 'landing.qr.body': { en: 'Old EN', pt: 'Velho PT' } })
    const both = normalizeSiteContent({ landing: { texts: { 'landing.hero.body': { en: 'Old', pt: 'Velho' }, 'landing.qr.body': { en: 'New' } } } })
    expect(both.landing.texts).toEqual({ 'landing.qr.body': { en: 'New', pt: 'Velho' } })
    expect(normalizeSiteContent({ landing: { texts: { 'landing.hero.body': { en: '' } } } }).landing).not.toHaveProperty('texts')
  })
})

describe('validate sections', () => {
  it('a full valid list of built-ins and the three designs is valid', () => {
    const list: LandingSection[] = [
      ...builtins(),
      text('intro', { eyebrow: { en: 'E' }, subtitle: { en: 'S' }, body: { en: 'B' }, button: { label: { en: 'Go', pt: 'Ir' }, href: 'https://example.com/x' }, anchor: 'welcome' }),
      { kind: 'imageText', id: 'story', title: { en: 'T' }, image: IMG, imageSide: 'left', button: { label: { en: 'Go' }, href: '/apply' } },
      { kind: 'banner', id: 'wide', image: IMG },
    ]
    expect(errorsOf(list)).toEqual({})
  })

  it('built-ins in any order, hidden, each at most once; unknown id refused; duplicates refused', () => {
    expect(errorsOf([{ kind: 'builtin', id: 'about', hidden: true }, { kind: 'builtin', id: 'qr' }])).toEqual({})
    expect(errorsOf([{ kind: 'builtin', id: 'nope' }])).toEqual({ 'landing.sections.0.id': 'invalid_value' })
    expect(errorsOf([{ kind: 'builtin', id: 'qr' }, { kind: 'builtin', id: 'qr' }])).toEqual({ 'landing.sections.1.id': 'duplicate_id' })
  })

  it('ids: required, slug-shaped, at most 60, unique, and not a built-in id', () => {
    expect(errorsOf([text('')])).toEqual({ 'landing.sections.0.id': 'required' })
    expect(errorsOf([text('Not A Slug')])).toEqual({ 'landing.sections.0.id': 'invalid_slug' })
    expect(errorsOf([text('a'.repeat(61))])).toEqual({ 'landing.sections.0.id': 'too_long' })
    expect(errorsOf([text('same'), text('same')])).toEqual({ 'landing.sections.1.id': 'duplicate_id' })
    expect(errorsOf([text('how')])).toEqual({ 'landing.sections.0.id': 'slug_reserved' })
  })

  it('anchors: slug-shaped, unique, and not one of the page\'s own ids', () => {
    expect(errorsOf([text('a', { anchor: 'Bad Anchor' })])).toEqual({ 'landing.sections.0.anchor': 'invalid_slug' })
    expect(errorsOf([text('a', { anchor: 'x' }), text('b', { anchor: 'x' })])).toEqual({ 'landing.sections.1.anchor': 'slug_duplicate' })
    expect(errorsOf([text('a', { anchor: 'sobre' })])).toEqual({ 'landing.sections.0.anchor': 'slug_reserved' })
  })

  it('text limits: eyebrow 60, title 200, subtitle 200, body 1200, button label 40 (every language); the title needs English', () => {
    const at = (field: string, max: number, extra: Record<string, unknown> = {}) => {
      expect(errorsOf([text('a', { [field]: { en: 'x'.repeat(max), pt: 'y'.repeat(max) }, ...extra })])).toEqual({})
      expect(errorsOf([text('a', { [field]: { en: 'x'.repeat(max + 1), pt: 'y'.repeat(max + 1) }, ...extra })])).toEqual({
        [`landing.sections.0.${field}.en`]: 'too_long',
        [`landing.sections.0.${field}.pt`]: 'too_long',
      })
    }
    at('eyebrow', 60)
    at('title', 200)
    at('subtitle', 200)
    at('body', 1200)
    expect(errorsOf([text('a', { button: { label: { en: 'x'.repeat(41), pt: 'y'.repeat(41) }, href: '/' } })])).toEqual({
      'landing.sections.0.button.label.en': 'too_long',
      'landing.sections.0.button.label.pt': 'too_long',
    })
    expect(errorsOf([text('a', { title: { en: '  ' } })])).toEqual({ 'landing.sections.0.title.en': 'required' })
    expect(errorsOf([{ kind: 'imageText', id: 'a', title: { en: '' }, image: IMG, imageSide: 'left' }])).toEqual({ 'landing.sections.0.title.en': 'required' })
    // A banner's title is optional.
    expect(errorsOf([{ kind: 'banner', id: 'a', image: IMG }])).toEqual({})
  })

  it('the button link is a site path or an https URL, at most 300; the label is required with a button', () => {
    for (const ok of ['/', '/apply', '/#sobre', '/catalog/x?y=1', 'https://example.com', 'https://example.com/a?b=c#d']) expect(isAllowedSectionHref(ok), ok).toBe(true)
    for (const bad of ['', 'apply', '//evil.test', 'http://x.test', 'javascript:alert(1)', 'mailto:a@b.c', 'data:text/html,x', '/a b', '/\\evil.test', '/a\\b', 'https://', 'https://a b', ' /a'])
      expect(isAllowedSectionHref(bad), bad).toBe(false)
    expect(isAllowedSectionHref(`/${'a'.repeat(299)}`)).toBe(true)
    expect(isAllowedSectionHref(`/${'a'.repeat(300)}`)).toBe(false)
    expect(errorsOf([text('a', { button: { label: { en: 'Go' }, href: 'javascript:alert(1)' } })])).toEqual({ 'landing.sections.0.button.href': 'invalid_link' })
    expect(errorsOf([text('a', { button: { label: { en: 'Go' }, href: '' } })])).toEqual({ 'landing.sections.0.button.href': 'required' })
    expect(errorsOf([text('a', { button: { label: { en: '' }, href: '/x' } })])).toEqual({ 'landing.sections.0.button.label.en': 'required' })
  })

  it('pictures: an uploaded image path is needed for the picture designs; alt at most 120', () => {
    expect(errorsOf([{ kind: 'banner', id: 'a', image: { path: '', alt: { en: '' } } }])).toEqual({ 'landing.sections.0.image': 'required' })
    for (const bad of ['landing/a.glb', 'https://x.test/a.png', 'a.png', 'landing/A.png'])
      expect(errorsOf([{ kind: 'banner', id: 'a', image: { path: bad, alt: { en: '' } } }])).toEqual({ 'landing.sections.0.image': 'invalid_value' })
    expect(errorsOf([{ kind: 'banner', id: 'a', image: { path: IMG.path, alt: { en: 'x'.repeat(121), pt: 'y'.repeat(121) } } }])).toEqual({
      'landing.sections.0.image.alt.en': 'too_long',
      'landing.sections.0.image.alt.pt': 'too_long',
    })
    expect(errorsOf([{ kind: 'imageText', id: 'a', title: { en: 'T' }, image: IMG, imageSide: 'up' }])).toEqual({ 'landing.sections.0.imageSide': 'invalid_value' })
  })

  it('limits the count: 16 in all, 10 of them own', () => {
    const own = (n: number) => Array.from({ length: n }, (_, i) => text(`own-${i}`))
    expect(errorsOf([...builtins(), ...own(MAX_OWN_SECTIONS)])).toEqual({})
    expect(MAX_LANDING_SECTIONS).toBe(16)
    expect(errorsOf([...builtins(), ...own(MAX_OWN_SECTIONS + 1)])).toEqual({ 'landing.sections': 'too_many' })
    expect(errorsOf(own(MAX_LANDING_SECTIONS + 1))).toMatchObject({ 'landing.sections': 'too_many' })
  })

  it('refuses a hidden flag that is not a boolean', () => {
    expect(errorsOf([{ kind: 'builtin', id: 'qr', hidden: 'yes' }])).toEqual({ 'landing.sections.0.hidden': 'invalid_value' })
  })
})

describe('validate qr and about', () => {
  it('qr: sides left, right or none; a picture must be an uploaded image; alt at most 120', () => {
    expect(validateSiteContent(doc({ qr: { image: IMG, imageSide: 'left' } }))).toEqual({})
    expect(validateSiteContent(doc({ qr: { imageSide: 'none' } }))).toEqual({})
    expect(validateSiteContent(doc({ qr: { imageSide: 'top' } }))).toEqual({ 'landing.qr.imageSide': 'invalid_value' })
    expect(validateSiteContent(doc({ qr: { image: { path: 'landing/a.glb', alt: { en: '' } }, imageSide: 'right' } }))).toEqual({ 'landing.qr.image': 'invalid_value' })
    expect(validateSiteContent(doc({ qr: { image: { path: IMG.path, alt: { en: 'x'.repeat(121) } }, imageSide: 'right' } }))).toEqual({ 'landing.qr.image.alt.en': 'too_long' })
  })

  it('about: both pictures use the hero picture rules', () => {
    expect(validateSiteContent(doc({ about: { image: IMG, detail: IMG } }))).toEqual({})
    expect(validateSiteContent(doc({ about: { image: { path: 'x.png', alt: { en: '' } } } }))).toEqual({ 'landing.about.image': 'invalid_value' })
    expect(validateSiteContent(doc({ about: { detail: { path: IMG.path, alt: { en: '', pt: 'z'.repeat(121) } } } }))).toEqual({ 'landing.about.detail.alt.pt': 'too_long' })
  })

  it('the QR texts are in the editable list with the usual limits', () => {
    const d = doc({ texts: { 'landing.qr.eyebrow': { en: 'x'.repeat(60) }, 'landing.qr.title': { en: 'x'.repeat(200) }, 'landing.qr.body': { en: 'x'.repeat(600) } } })
    expect(validateSiteContent(d)).toEqual({})
    expect(validateSiteContent(doc({ texts: { 'landing.qr.body': { pt: 'x'.repeat(601) } } }))).toEqual({ 'landing.texts.landing.qr.body.pt': 'too_long' })
  })
})

describe('draft shape', () => {
  it('sections must be an array of at most 16; qr and about must be objects', () => {
    expect(validateContentShape({ schema: 1, landing: { sections: 'x' } })).toEqual({ 'landing.sections': 'invalid_value' })
    expect(validateContentShape({ schema: 1, landing: { sections: Array.from({ length: 17 }, () => ({})) } })).toEqual({ 'landing.sections': 'too_many' })
    expect(validateContentShape({ schema: 1, landing: { sections: Array.from({ length: 16 }, () => ({})) } })).toEqual({})
    for (const bad of ['x', 5, [], null]) {
      expect(validateContentShape({ schema: 1, landing: { qr: bad } })).toEqual({ 'landing.qr': 'invalid_value' })
      expect(validateContentShape({ schema: 1, landing: { about: bad } })).toEqual({ 'landing.about': 'invalid_value' })
    }
    expect(validateContentShape({ schema: 1, landing: { qr: {}, about: {}, sections: [] } })).toEqual({})
  })
})

describe('summarizeChanges', () => {
  it('counts section edits, moves, the QR layout and the About pictures; untouched is zero', () => {
    const a = emptySiteContent()
    expect(summarizeChanges(a, a)).toMatchObject({ landingSections: 0 })
    const moved = doc({ sections: [...defaultLandingSections().slice(1), defaultLandingSections()[0]!] })
    expect(summarizeChanges(a, moved).landingSections).toBe(1)
    const added = doc({ sections: [...defaultLandingSections(), text('intro')] })
    expect(summarizeChanges(a, added).landingSections).toBe(1)
    const hid = doc({ sections: defaultLandingSections().map((s) => (s.id === 'how' ? { ...s, hidden: true } : s)) })
    expect(summarizeChanges(a, hid).landingSections).toBe(1)
    const pics = doc({ qr: { image: IMG, imageSide: 'left' }, about: { image: IMG, detail: IMG } })
    expect(summarizeChanges(a, pics).landingSections).toBe(3)
    expect(summarizeChanges(a, pics).total).toBe(3)
  })
})

// Pure edits of the homepage sections, the QR section and the About pictures (ADR-0061).
import { describe, expect, it } from 'vitest'
import { MAX_LANDING_SECTIONS, MAX_OWN_SECTIONS, emptySiteContent, validateSiteContent } from '@/domain/siteContent'
import {
  addSection,
  canAddSection,
  moveSection,
  nextSectionId,
  ownSectionCount,
  removeSection,
  sectionsOf,
  setAboutAlt,
  setAboutImage,
  setQrImage,
  setQrImageAlt,
  setQrSide,
  setSectionAnchor,
  setSectionButton,
  setSectionHidden,
  setSectionImage,
  setSectionImageAlt,
  setSectionImageSide,
  setSectionText,
} from './sectionOps'

const A = { path: 'landing/0a1b2c3d-1111-4222-8333-444455556666.webp' }
const B = { path: 'landing/0a1b2c3d-1111-4222-8333-777788889999.png' }
const ids = (doc = emptySiteContent()) => sectionsOf(doc).map((s) => s.id)

describe('sections: add, move, hide, remove', () => {
  it('starts from the default list; adding makes the list explicit with the new section last, an empty draft of its design', () => {
    const doc = addSection(emptySiteContent(), 'text')
    expect(ids(doc)).toEqual(['qr', 'how', 'experience', 'collections', 'about', 'partners', 'section-1'])
    expect(doc.landing.sections).toHaveLength(7)
    expect(sectionsOf(addSection(doc, 'imageText')).at(-1)).toMatchObject({ kind: 'imageText', id: 'section-2', title: { en: '' }, image: { path: '' }, imageSide: 'left' })
    expect(sectionsOf(addSection(doc, 'banner')).at(-1)).toMatchObject({ kind: 'banner', id: 'section-2', image: { path: '' } })
    expect(nextSectionId(removeSection(doc, 'section-1'))).toBe('section-1')
  })

  it('stops at 10 own sections and at 16 in all; the new section is not valid until it has a title (and a picture)', () => {
    let doc = emptySiteContent()
    for (let i = 0; i < 12; i++) doc = addSection(doc, 'text')
    expect(ownSectionCount(doc)).toBe(MAX_OWN_SECTIONS)
    expect(sectionsOf(doc)).toHaveLength(MAX_LANDING_SECTIONS)
    expect(canAddSection(doc)).toBe(false)
    expect(addSection(doc, 'banner')).toBe(doc)
    expect(validateSiteContent(addSection(emptySiteContent(), 'text'))).toEqual({ 'landing.sections.6.title.en': 'required' })
    expect(Object.keys(validateSiteContent(addSection(emptySiteContent(), 'banner')))).toEqual(['landing.sections.6.image'])
  })

  it('moves one place; the first cannot go up and the last cannot go down; moving back restores the default (the key is dropped)', () => {
    const doc = emptySiteContent()
    expect(moveSection(doc, 'qr', -1)).toBe(doc)
    expect(moveSection(doc, 'partners', 1)).toBe(doc)
    const moved = moveSection(doc, 'how', -1)
    expect(ids(moved).slice(0, 3)).toEqual(['how', 'qr', 'experience'])
    expect(moveSection(moved, 'how', 1)).toEqual(doc)
    expect('sections' in moveSection(moved, 'how', 1).landing).toBe(false)
  })

  it('hides and shows; hidden is not stored as false', () => {
    const hid = setSectionHidden(emptySiteContent(), 'about', true)
    expect(sectionsOf(hid).find((s) => s.id === 'about')).toMatchObject({ hidden: true })
    const shown = setSectionHidden(hid, 'about', false)
    expect(shown).toEqual(emptySiteContent())
  })

  it('removes own sections only; a built-in one can only be hidden', () => {
    const doc = addSection(emptySiteContent(), 'text')
    expect(removeSection(doc, 'qr')).toBe(doc)
    expect(removeSection(doc, 'nope')).toBe(doc)
    expect(removeSection(doc, 'section-1')).toEqual(emptySiteContent())
  })
})

describe('sections: editing an own section', () => {
  const base = () => addSection(emptySiteContent(), 'text')
  const first = (doc = base()) => sectionsOf(doc).at(-1) as unknown as Record<string, any>

  it('sets texts per language; an optional text emptied in both languages is removed, the title stays', () => {
    let doc = setSectionText(base(), 'section-1', 'title', 'en', 'Welcome')
    doc = setSectionText(doc, 'section-1', 'title', 'pt', 'Bem-vindo')
    doc = setSectionText(doc, 'section-1', 'body', 'en', 'Hello')
    expect(first(doc)).toMatchObject({ title: { en: 'Welcome', pt: 'Bem-vindo' }, body: { en: 'Hello' } })
    doc = setSectionText(doc, 'section-1', 'body', 'en', '')
    expect(first(doc)).not.toHaveProperty('body')
    doc = setSectionText(doc, 'section-1', 'title', 'en', '')
    expect(first(doc).title).toEqual({ en: '', pt: 'Bem-vindo' })
    expect(first(setSectionText(doc, 'section-1', 'title', 'pt', ' ')).title).toEqual({ en: '' })
    // Built-in sections have no texts here.
    expect(setSectionText(doc, 'qr', 'title', 'en', 'x')).toEqual(doc)
  })

  it('a banner\'s title is optional and removed when emptied', () => {
    let doc = addSection(emptySiteContent(), 'banner')
    doc = setSectionText(doc, 'section-1', 'title', 'en', 'Big')
    expect(first(doc).title).toEqual({ en: 'Big' })
    expect(first(setSectionText(doc, 'section-1', 'title', 'en', ''))).not.toHaveProperty('title')
  })

  it('sets the button label (EN, PT) and link; with all three empty the button is removed', () => {
    let doc = setSectionButton(base(), 'section-1', 'labelEn', 'Go')
    doc = setSectionButton(doc, 'section-1', 'labelPt', 'Ir')
    doc = setSectionButton(doc, 'section-1', 'href', ' /apply ')
    expect(first(doc).button).toEqual({ label: { en: 'Go', pt: 'Ir' }, href: '/apply' })
    doc = setSectionButton(doc, 'section-1', 'labelPt', '')
    expect(first(doc).button.label).toEqual({ en: 'Go' })
    doc = setSectionButton(setSectionButton(doc, 'section-1', 'labelEn', ''), 'section-1', 'href', '')
    expect(first(doc)).not.toHaveProperty('button')
  })

  it('sets the picture and its alt text per language; the alt survives a replaced picture; a text section has no picture', () => {
    let doc = addSection(emptySiteContent(), 'imageText')
    doc = setSectionImage(doc, 'section-1', A)
    doc = setSectionImageAlt(doc, 'section-1', 'en', 'A sofa')
    doc = setSectionImageAlt(doc, 'section-1', 'pt', 'Um sofá')
    doc = setSectionImage(doc, 'section-1', B)
    expect(first(doc).image).toEqual({ path: B.path, alt: { en: 'A sofa', pt: 'Um sofá' } })
    expect(first(setSectionImage(doc, 'section-1', undefined)).image.path).toBe('')
    expect(first(setSectionImageSide(doc, 'section-1', 'right')).imageSide).toBe('right')
    const text = base()
    expect(setSectionImage(text, 'section-1', A)).toEqual(text)
    expect(setSectionImageSide(text, 'section-1', 'right')).toEqual(text)
  })

  it('sets the anchor; empty removes it', () => {
    const doc = setSectionAnchor(base(), 'section-1', 'welcome')
    expect(first(doc).anchor).toBe('welcome')
    expect(first(setSectionAnchor(doc, 'section-1', ''))).not.toHaveProperty('anchor')
  })
})

describe('QR section', () => {
  it('a picture without a layout goes on the left; the layout can change; removing the picture goes back to centred text and drops the key', () => {
    let doc = setQrImage(emptySiteContent(), A)
    expect(doc.landing.qr).toEqual({ image: { path: A.path, alt: { en: '' } }, imageSide: 'left' })
    doc = setQrSide(doc, 'right')
    doc = setQrImageAlt(doc, 'en', 'A card')
    doc = setQrImage(doc, B)
    expect(doc.landing.qr).toEqual({ image: { path: B.path, alt: { en: 'A card' } }, imageSide: 'right' })
    expect(setQrImage(doc, undefined)).toEqual(emptySiteContent())
    expect(setQrSide(emptySiteContent(), 'none')).toEqual(emptySiteContent())
    expect(setQrImageAlt(emptySiteContent(), 'en', 'x')).toEqual(emptySiteContent())
  })
})

describe('About pictures', () => {
  it('replaces each picture, keeps the alt, resets to the built-in photo; an emptied about is dropped', () => {
    let doc = setAboutImage(emptySiteContent(), 'image', A)
    doc = setAboutAlt(doc, 'image', 'en', 'Table')
    doc = setAboutAlt(doc, 'image', 'pt', 'Mesa')
    doc = setAboutImage(doc, 'detail', B)
    expect(doc.landing.about).toEqual({ image: { path: A.path, alt: { en: 'Table', pt: 'Mesa' } }, detail: { path: B.path, alt: { en: '' } } })
    doc = setAboutImage(doc, 'image', B)
    expect(doc.landing.about!.image).toEqual({ path: B.path, alt: { en: 'Table', pt: 'Mesa' } })
    doc = setAboutImage(setAboutImage(doc, 'image', undefined), 'detail', undefined)
    expect(doc).toEqual(emptySiteContent())
    expect(setAboutAlt(emptySiteContent(), 'detail', 'en', 'x')).toEqual(emptySiteContent())
  })
})

// Pure edits of the homepage sections, the QR section and the About pictures of a SiteContent document (ADR-0061).
// `landing.sections` is dropped whenever it equals the default list, so an untouched page stays identical to the published one.
import {
  BUILTIN_SECTION_IDS,
  type LandingAbout,
  type LandingQr,
  type LandingSection,
  MAX_LANDING_SECTIONS,
  MAX_OWN_SECTIONS,
  type OwnSection,
  type OwnSectionKind,
  type SiteAsset,
  type SiteContent,
  defaultLandingSections,
  resolveLandingSections,
} from '@/domain/siteContent'
import { withLang } from './landingOps'

type Pair = { en: string; pt?: string }
type Lang = 'en' | 'pt'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export const sectionsOf = (doc: SiteContent): LandingSection[] => resolveLandingSections(doc.landing)
export const isOwnSection = (s: LandingSection): s is OwnSection => s.kind !== 'builtin'
export const ownSectionCount = (doc: SiteContent): number => sectionsOf(doc).filter(isOwnSection).length

/** Replaces the list; `landing.sections` is dropped when it is the default one. */
function withSections(doc: SiteContent, list: LandingSection[]): SiteContent {
  const { sections: _old, ...rest } = doc.landing
  return { ...doc, landing: same(list, defaultLandingSections()) ? rest : { ...rest, sections: list } }
}

export const canAddSection = (doc: SiteContent): boolean => {
  const list = sectionsOf(doc)
  return list.length < MAX_LANDING_SECTIONS && list.filter(isOwnSection).length < MAX_OWN_SECTIONS
}

/** `section-1`, `section-2`, ...: the first id no section uses. */
export function nextSectionId(doc: SiteContent): string {
  const taken = new Set<string>(sectionsOf(doc).map((s) => s.id))
  for (let n = 1; ; n++) if (!taken.has(`section-${n}`)) return `section-${n}`
}

/** A new, still empty section of a design: the person fills the title (and picture), and publishing waits until they do. */
export function newSection(design: OwnSectionKind, id: string): OwnSection {
  const image = { path: '', alt: { en: '' } }
  switch (design) {
    case 'text':
      return { kind: 'text', id, title: { en: '' } }
    case 'imageText':
      return { kind: 'imageText', id, title: { en: '' }, image, imageSide: 'left' }
    case 'banner':
      return { kind: 'banner', id, image }
  }
}

/** Adds an empty section of the design at the end; unchanged when the page is full (16 sections, 10 of them own). */
export function addSection(doc: SiteContent, design: OwnSectionKind, id: string = nextSectionId(doc)): SiteContent {
  return canAddSection(doc) ? withSections(doc, [...sectionsOf(doc), newSection(design, id)]) : doc
}

/** Moves a section one place up or down; the first cannot go up and the last cannot go down (the hero is not in the list). */
export function moveSection(doc: SiteContent, id: string, dir: -1 | 1): SiteContent {
  const list = [...sectionsOf(doc)]
  const from = list.findIndex((s) => s.id === id)
  const to = from + dir
  if (from < 0 || to < 0 || to >= list.length) return doc
  ;[list[from], list[to]] = [list[to]!, list[from]!]
  return withSections(doc, list)
}

/** `hidden` is dropped when false, so an untouched section stays identical to the published one. */
export function setSectionHidden(doc: SiteContent, id: string, hidden: boolean): SiteContent {
  return withSections(
    doc,
    sectionsOf(doc).map((s) => {
      if (s.id !== id) return s
      const { hidden: _old, ...rest } = s
      return (hidden ? { ...rest, hidden: true } : rest) as LandingSection
    }),
  )
}

/** Deletes an own section; built-in sections can only be hidden. */
export function removeSection(doc: SiteContent, id: string): SiteContent {
  const target = sectionsOf(doc).find((s) => s.id === id)
  if (!target || !isOwnSection(target)) return doc
  return withSections(doc, sectionsOf(doc).filter((s) => s.id !== id))
}

export function updateOwnSection(doc: SiteContent, id: string, patch: (s: OwnSection) => OwnSection): SiteContent {
  return withSections(doc, sectionsOf(doc).map((s) => (s.id === id && isOwnSection(s) ? patch(s) : s)))
}

type TextField = 'eyebrow' | 'title' | 'subtitle' | 'body'

/** One text of an own section in one language. An optional text with nothing left in either language is removed; the title stays. */
export function setSectionText(doc: SiteContent, id: string, field: TextField, lang: Lang, value: string): SiteContent {
  return updateOwnSection(doc, id, (s) => {
    const current = (s as unknown as Partial<Record<TextField, Pair>>)[field]
    const next = withLang(current, lang, value)
    const { [field]: _old, ...rest } = s as unknown as Record<string, unknown>
    const keep = field === 'title' && s.kind !== 'banner' ? true : !!(next.en.trim() || next.pt?.trim())
    return (keep ? { ...rest, [field]: next } : rest) as unknown as OwnSection
  })
}

/** The button's label (per language) or link. With nothing left in all three, the button is removed. */
export function setSectionButton(doc: SiteContent, id: string, field: 'labelEn' | 'labelPt' | 'href', value: string): SiteContent {
  return updateOwnSection(doc, id, (s) => {
    const { button: old, ...rest } = s
    const label = field === 'href' ? (old?.label ?? { en: '' }) : withLang(old?.label, field === 'labelEn' ? 'en' : 'pt', value)
    const href = field === 'href' ? value.trim() : (old?.href ?? '')
    return (label.en.trim() || label.pt?.trim() || href ? { ...rest, button: { label, href } } : rest) as OwnSection
  })
}

/** What a stored picture keeps of an upload: its path and, when the crop dialog made it, the original and the crop (ADR-0063). A new upload never inherits the old picture's crop. */
export const pictureOf = (asset: SiteAsset): Pick<SiteAsset, 'path' | 'originalPath' | 'crop'> => ({
  path: asset.path,
  ...(asset.originalPath ? { originalPath: asset.originalPath } : {}),
  ...(asset.crop ? { crop: asset.crop } : {}),
})

/** An own section's picture design: the uploaded picture (`undefined` clears the path again), keeping the alt text. */
export function setSectionImage(doc: SiteContent, id: string, asset: SiteAsset | undefined): SiteContent {
  return updateOwnSection(doc, id, (s) => (s.kind === 'text' ? s : { ...s, image: { ...(asset ? pictureOf(asset) : { path: '' }), alt: s.image.alt } }))
}

export function setSectionImageAlt(doc: SiteContent, id: string, lang: Lang, value: string): SiteContent {
  return updateOwnSection(doc, id, (s) => (s.kind === 'text' ? s : { ...s, image: { ...s.image, alt: withLang(s.image.alt, lang, value) } }))
}

export function setSectionImageSide(doc: SiteContent, id: string, side: 'left' | 'right'): SiteContent {
  return updateOwnSection(doc, id, (s) => (s.kind === 'imageText' ? { ...s, imageSide: side } : s))
}

/** The address fragment; empty removes it. */
export function setSectionAnchor(doc: SiteContent, id: string, value: string): SiteContent {
  return updateOwnSection(doc, id, (s) => {
    const { anchor: _old, ...rest } = s
    return (value ? { ...rest, anchor: value } : rest) as OwnSection
  })
}

export const isBuiltinId = (id: string): boolean => (BUILTIN_SECTION_IDS as readonly string[]).includes(id)

// ---- QR section -----------------------------------------------------------------------------------------------------
/** Replaces the QR layout; `landing.qr` is dropped when it is the default (no picture, centred text). */
function withQr(doc: SiteContent, qr: LandingQr): SiteContent {
  const { qr: _old, ...rest } = doc.landing
  return { ...doc, landing: !qr.image && qr.imageSide === 'none' ? rest : { ...rest, qr } }
}
const qrOf = (doc: SiteContent): LandingQr => doc.landing.qr ?? { imageSide: 'none' }

/** The QR picture. Setting one with the layout still "none" puts it on the left; removing it goes back to centred text. */
export function setQrImage(doc: SiteContent, asset: SiteAsset | undefined): SiteContent {
  const { image: old, ...rest } = qrOf(doc)
  if (!asset) return withQr(doc, { ...rest, imageSide: 'none' })
  return withQr(doc, { ...rest, image: { ...pictureOf(asset), alt: old?.alt ?? { en: '' } }, imageSide: rest.imageSide === 'none' ? 'left' : rest.imageSide })
}

export function setQrImageAlt(doc: SiteContent, lang: Lang, value: string): SiteContent {
  const qr = qrOf(doc)
  return qr.image ? withQr(doc, { ...qr, image: { ...qr.image, alt: withLang(qr.image.alt, lang, value) } }) : doc
}

export function setQrSide(doc: SiteContent, side: LandingQr['imageSide']): SiteContent {
  return withQr(doc, { ...qrOf(doc), imageSide: side })
}

// ---- About pictures -------------------------------------------------------------------------------------------------
type AboutPicture = keyof LandingAbout

function withAbout(doc: SiteContent, about: LandingAbout): SiteContent {
  const { about: _old, ...rest } = doc.landing
  return { ...doc, landing: about.image || about.detail || about.third ? { ...rest, about } : rest }
}

/** Replaces one About picture, keeping its alt text; `undefined` goes back to the built-in photo. */
export function setAboutImage(doc: SiteContent, which: AboutPicture, asset: SiteAsset | undefined): SiteContent {
  const about = { ...(doc.landing.about ?? {}) }
  if (asset) about[which] = { ...pictureOf(asset), alt: about[which]?.alt ?? { en: '' } }
  else delete about[which]
  return withAbout(doc, about)
}

export function setAboutAlt(doc: SiteContent, which: AboutPicture, lang: Lang, value: string): SiteContent {
  const about = { ...(doc.landing.about ?? {}) }
  const pic = about[which]
  if (!pic) return doc
  about[which] = { ...pic, alt: withLang(pic.alt, lang, value) }
  return withAbout(doc, about)
}

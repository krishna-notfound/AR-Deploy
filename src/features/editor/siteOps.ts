// Pure edits of the site icon and the landing page texts of a SiteContent document (ADR-0053).
import { LANDING_TEXT_GROUPS, type LandingTextSection, type Lang, type SiteAsset, type SiteContent } from '@/domain/siteContent'

/** The site icon; `undefined` goes back to the built-in icons. `chrome` is dropped when nothing is left in it. */
export function setFavicon(doc: SiteContent, favicon: SiteAsset | undefined): SiteContent {
  const { chrome: _old, ...rest } = doc
  return favicon ? { ...rest, chrome: { ...(doc.chrome ?? {}), favicon } } : rest
}

const withTexts = (doc: SiteContent, texts: NonNullable<SiteContent['landing']['texts']>): SiteContent => {
  const { texts: _old, ...rest } = doc.landing
  return { ...doc, landing: Object.keys(texts).length ? { ...rest, texts } : rest }
}

/** One text in one language. An empty text is the original, so it is removed; a key with nothing left is removed; `landing.texts` is dropped when empty. */
export function setLandingText(doc: SiteContent, key: string, lang: Lang, value: string): SiteContent {
  const texts = { ...(doc.landing.texts ?? {}) }
  const entry = { ...(texts[key] ?? {}) }
  if (value.trim()) entry[lang] = value
  else delete entry[lang]
  if (entry.en !== undefined || entry.pt !== undefined) texts[key] = entry
  else delete texts[key]
  return withTexts(doc, texts)
}

/** Back to the original wording of one text, in both languages. */
export function resetLandingText(doc: SiteContent, key: string): SiteContent {
  if (!doc.landing.texts || !(key in doc.landing.texts)) return doc
  const texts = { ...doc.landing.texts }
  delete texts[key]
  return withTexts(doc, texts)
}

export const sectionKeys = (section: LandingTextSection): string[] => (LANDING_TEXT_GROUPS.find((g) => g.id === section)?.keys ?? []).map(([key]) => key)

/** Back to the original wording of every text of a section. */
export function resetLandingSection(doc: SiteContent, section: LandingTextSection): SiteContent {
  return sectionKeys(section).reduce(resetLandingText, doc)
}

/** How many texts of the given keys are changed (a text counts once, whichever languages are set). */
export function changedTexts(doc: SiteContent, keys: readonly string[]): number {
  const texts = doc.landing.texts ?? {}
  return keys.filter((k) => texts[k] && (texts[k].en || texts[k].pt)).length
}

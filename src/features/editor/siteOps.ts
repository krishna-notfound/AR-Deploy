// Pure edits of the site icon, the default catalogue banner (ADR-0065), the sign-in panel and the catalogue heading (ADR-0067) and the
// landing page texts of a SiteContent document (ADR-0053).
import {
  LANDING_TEXT_GROUPS,
  type LandingTextSection,
  type Lang,
  type SignInPage,
  type SignInPanel,
  type SignInTextKey,
  type SiteAsset,
  type SiteChrome,
  type SiteContent,
  type TextPair,
} from '@/domain/siteContent'

/** Sets or clears keys of `chrome` (`undefined` clears one); `chrome` is dropped when nothing is left in it, so it equals one never set. */
function withChrome(doc: SiteContent, patch: { [K in keyof SiteChrome]?: SiteChrome[K] | undefined }): SiteContent {
  const next: Record<string, unknown> = { ...(doc.chrome ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key]
    else next[key] = value
  }
  const { chrome: _old, ...rest } = doc
  return Object.keys(next).length ? { ...rest, chrome: next as SiteChrome } : rest
}

/** One language of a text pair; a blank text is the built-in one, so it is removed; undefined when no language is left. */
function withLang(pair: TextPair | undefined, lang: Lang, value: string): TextPair | undefined {
  const next: TextPair = { ...(pair ?? {}) }
  if (value.trim()) next[lang] = value
  else delete next[lang]
  return next.en !== undefined || next.pt !== undefined ? next : undefined
}

/** The sign-in panel with one part changed; undefined when nothing is left in it. */
function withSignIn(doc: SiteContent, change: (panel: SignInPanel) => SignInPanel): SignInPanel | undefined {
  const next = change({ ...(doc.chrome?.signIn ?? {}) })
  if (next.texts && !Object.keys(next.texts).length) delete next.texts
  if (next.pictures && !Object.keys(next.pictures).length) delete next.pictures
  return Object.keys(next).length ? next : undefined
}

/** One sign-in panel text in one language (shared by every sign-in page); a blank text goes back to the built-in one. */
export function setSignInText(doc: SiteContent, key: SignInTextKey, lang: Lang, value: string): SiteContent {
  const signIn = withSignIn(doc, (panel) => {
    const texts = { ...(panel.texts ?? {}) }
    const pair = withLang(texts[key], lang, value)
    if (pair) texts[key] = pair
    else delete texts[key]
    return { ...panel, texts }
  })
  return withChrome(doc, { signIn })
}

/** One sign-in page's picture; `undefined` goes back to that page's built-in photograph. */
export function setSignInPicture(doc: SiteContent, page: SignInPage, picture: SiteAsset | undefined): SiteContent {
  const signIn = withSignIn(doc, (panel) => {
    const pictures = { ...(panel.pictures ?? {}) }
    if (picture) pictures[page] = picture
    else delete pictures[page]
    return { ...panel, pictures }
  })
  return withChrome(doc, { signIn })
}

/** The catalogue heading in one language; a blank text goes back to the built-in heading. */
export function setCatalogHeading(doc: SiteContent, lang: Lang, value: string): SiteContent {
  return withChrome(doc, { catalogHeading: withLang(doc.chrome?.catalogHeading, lang, value) })
}

/** The site icon; `undefined` goes back to the built-in icons. */
export function setFavicon(doc: SiteContent, favicon: SiteAsset | undefined): SiteContent {
  return withChrome(doc, { favicon })
}

/** The default catalogue banner; `undefined` goes back to the built-in photograph (ADR-0065). */
export function setCatalogBanner(doc: SiteContent, banner: SiteAsset | undefined): SiteContent {
  return withChrome(doc, { catalogBanner: banner })
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

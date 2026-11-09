// The landing page's editable wording (ADR-0053): which dictionary texts the Website Editor may override, in which section
// they are edited, and how long an override may be. Pure data; the editor shows the groups, the validator holds a draft to the
// limits, and the landing page renders `override ?? dictionary`. The SQL gate (migration `site_content_round2`,
// private.landing_text_limits) repeats this exact list and the limits; a PGlite test compares the two, so change both together.
//
// Left out on purpose: navigation, header and footer texts (shared by every public page, including `site.apply`), the legal text,
// the small control labels (Photo / 3D switch, "Image", "View in your room"), the alt texts of the built-in photographs and the
// labelled sample "Linden" card (its "Illustrative piece" notice must stay honest). The hero picture's own description is edited
// next to the picture (landing.hero.alt).

/** How long an override of this kind may be, in characters. */
export const LANDING_TEXT_KINDS = { eyebrow: 60, button: 40, title: 200, body: 600 } as const
export type LandingTextKind = keyof typeof LANDING_TEXT_KINDS

export type LandingTextSection = 'hero' | 'how' | 'experience' | 'collections' | 'about' | 'partners'

export interface LandingTextGroup {
  id: LandingTextSection
  /** [dictionary key, kind] in page order. */
  keys: readonly (readonly [string, LandingTextKind])[]
}

export const LANDING_TEXT_GROUPS: readonly LandingTextGroup[] = [
  {
    id: 'hero',
    keys: [
      ['landing.title', 'title'],
      ['landing.hero.eyebrow', 'eyebrow'],
      ['landing.hero.title1', 'title'],
      ['landing.hero.title2', 'title'],
      ['landing.hero.body', 'body'],
      ['landing.hero.cta3d', 'button'],
      ['landing.hero.note', 'body'],
    ],
  },
  {
    id: 'how',
    keys: [
      ['landing.how.eyebrow', 'eyebrow'],
      ['landing.how.title1', 'title'],
      ['landing.how.title2', 'title'],
      ['landing.how.s1Title', 'title'],
      ['landing.how.s1Body', 'body'],
      ['landing.how.s2Title', 'title'],
      ['landing.how.s2Body', 'body'],
      ['landing.how.s3Title', 'title'],
      ['landing.how.s3Body', 'body'],
      ['landing.how.s4Title', 'title'],
      ['landing.how.s4Body', 'body'],
    ],
  },
  {
    id: 'experience',
    keys: [
      ['landing.xp.eyebrow', 'eyebrow'],
      ['landing.xp.title', 'title'],
      ['landing.xp.body', 'body'],
      ['landing.xp.f1Title', 'title'],
      ['landing.xp.f1Body', 'body'],
      ['landing.xp.f2Title', 'title'],
      ['landing.xp.f2Body', 'body'],
      ['landing.xp.f3Title', 'title'],
      ['landing.xp.f3Body', 'body'],
      ['landing.xp.cta', 'button'],
    ],
  },
  {
    id: 'collections',
    keys: [
      ['landing.col.eyebrow', 'eyebrow'],
      ['landing.col.title1', 'title'],
      ['landing.col.title2', 'title'],
      ['landing.col.body', 'body'],
      ['landing.col.view', 'button'],
      ['landing.col.sofas', 'title'],
      ['landing.col.sofasBody', 'body'],
      ['landing.col.tables', 'title'],
      ['landing.col.tablesBody', 'body'],
      ['landing.col.armchairs', 'title'],
      ['landing.col.armchairsBody', 'body'],
      ['landing.col.decor', 'title'],
      ['landing.col.decorBody', 'body'],
    ],
  },
  {
    id: 'about',
    keys: [
      ['landing.about.eyebrow', 'eyebrow'],
      ['landing.about.title1', 'title'],
      ['landing.about.title2', 'title'],
      ['landing.about.body', 'body'],
      ['landing.feature.textureCaption', 'title'],
    ],
  },
  {
    id: 'partners',
    keys: [
      ['landing.biz.eyebrow', 'eyebrow'],
      ['landing.biz.title', 'title'],
      ['landing.biz.body', 'body'],
    ],
  },
]

/** Every key the Editor may override, with its limit. */
export const LANDING_TEXT_LIMITS: Readonly<Record<string, number>> = Object.fromEntries(
  LANDING_TEXT_GROUPS.flatMap((g) => g.keys.map(([key, kind]) => [key, LANDING_TEXT_KINDS[kind]] as const)),
)
export const LANDING_EDITABLE_KEYS: readonly string[] = Object.keys(LANDING_TEXT_LIMITS)

/** The overrides of the document: dictionary key to the text per language. An empty text is not stored (= the original). */
export type LandingTexts = Record<string, { en?: string; pt?: string }>

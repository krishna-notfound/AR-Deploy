// The Content Editor document (spec section 6): pages, application form and social links, in one jsonb document with a
// draft and a published copy. Pure TypeScript; the only import is the application form model, which lives in
// supabase/functions/_shared/applyForm.ts (no imports there) so the Edge Function can share it. The SQL gate in
// migration `site_content` repeats the checks that protect the live site; keep the two in step.
import {
  APPLY_BUILTIN_KEYS,
  DEFAULT_APPLY_FORM,
  MAX_APPLY_FIELDS,
  MAX_APPLY_STEPS,
  MAX_CUSTOM_QUESTIONS,
  normalizeApplyForm,
  resolveApplyForm,
  validateApplyForm,
  type ApplyFormConfig,
  type ContentErrorKey,
  type ContentErrors,
  type Lang,
} from '../../supabase/functions/_shared/applyForm.ts'

import { LANDING_TEXT_LIMITS, type LandingTexts } from './landingTexts'
import type { Category } from './types'

export type { ApplyFormConfig, ContentErrorKey, ContentErrors, Lang }
export * from '../../supabase/functions/_shared/applyForm.ts'
export * from './landingTexts'

export const SITE_CONTENT_SCHEMA = 1

export type SocialNetwork = 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'tiktok' | 'pinterest'
/** In the order the footer shows them. */
export const SOCIAL_NETWORKS: readonly SocialNetwork[] = ['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok', 'pinterest']

export interface CustomPage {
  /** crypto.randomUUID(); stable when the slug changes. */
  id: string
  /** Route /pages/:slug. */
  slug: string
  /** 1..80 characters. */
  title: { en: string; pt?: string }
  /** Markdown subset, at most 60,000 characters each. */
  body: { en: string; pt?: string }
  showInFooter: boolean
  /** Footer order, ascending, then title. */
  order: number
}

/** The built-in landing photos a collection card may use (public/images/sanctus/v2). The labels live in features/marketing/landingImages.ts, which is typed by this list. */
export const LANDING_IMAGE_KEYS = [
  'sofa-travertine',
  'dining-table',
  'lounge-chair',
  'lamp-vase',
  'hero-living',
  'armchair-walnut',
  'coffee-table',
  'detail-joinery',
  'interior-villa',
  'ar-phone',
  'model-wireframe',
  'showroom-qr',
] as const
export type LandingImageKey = (typeof LANDING_IMAGE_KEYS)[number]

/** A file the Owner/Admin uploaded in the Website Editor: its object path inside the public storage bucket `site-content`. Resolve it to a URL with `siteAssetUrl` (src/services). */
export interface SiteAsset {
  /** `landing/<name>.<ext>`, matching SITE_ASSET_PATH. */
  path: string
}
/**
 * What an upload is checked as. `favicon` (ADR-0053) is a PNG up to 1 MB stored like any other picture: the same bucket, the same
 * `landing/<name>.png` path rule, so no storage change is needed; `siteAssetKind` never returns it (a .png path is an 'image').
 */
export type SiteAssetKind = 'image' | 'glb' | 'usdz' | 'favicon'
export const SITE_ASSET_BUCKET = 'site-content'
export const SITE_ASSET_PATH = /^landing\/[a-z0-9-]+\.(webp|jpg|jpeg|png|glb|usdz)$/
export const SITE_ASSET_EXTENSIONS: Record<SiteAssetKind, readonly string[]> = { image: ['webp', 'jpg', 'jpeg', 'png'], glb: ['glb'], usdz: ['usdz'], favicon: ['png'] }
/** Upload limits in bytes; the bucket repeats them (migration site_content_assets). The favicon's 1 MB is held by the Editor only. */
export const SITE_ASSET_MAX_BYTES: Record<SiteAssetKind, number> = { image: 5 * 1024 * 1024, glb: 30 * 1024 * 1024, usdz: 40 * 1024 * 1024, favicon: 1024 * 1024 }

export const isSiteAsset = (v: unknown): v is SiteAsset => typeof v === 'object' && v !== null && !Array.isArray(v) && typeof (v as { path?: unknown }).path === 'string'
/** The kind of file an asset path names (by extension), or null when it is not a valid asset path. */
export function siteAssetKind(path: string): SiteAssetKind | null {
  if (!SITE_ASSET_PATH.test(path)) return null
  const ext = path.slice(path.lastIndexOf('.') + 1)
  return (Object.keys(SITE_ASSET_EXTENSIONS) as SiteAssetKind[]).find((k) => SITE_ASSET_EXTENSIONS[k].includes(ext)) ?? null
}
/** Whether the path names a favicon: an uploaded PNG. */
export const isFaviconPath = (path: string): boolean => siteAssetKind(path) === 'image' && path.endsWith('.png')

/** A product named by the public address parts: the business slug and the product slug. */
/** The slug of the platform's own showcase catalogue (ADR-0047). Landing refs to it are the admin's own pieces. */
export const HOUSE_BUSINESS_SLUG = 'sanctus-showcase'

export interface ProductRef {
  businessSlug: string
  productSlug: string
}

/** Where a landing collection card leads. `collection` opens the collection's own page (/collections/<slug>, the default); `product` and `catalog` name the business and product by slug (the public address parts). */
export type LandingCollectionLink =
  | { kind: 'collection' }
  | { kind: 'product'; businessSlug: string; productSlug: string }
  | { kind: 'catalog'; businessSlug: string; category?: Category }
  | { kind: 'apply' }
  | { kind: 'none' }

/** A card of the landing page's Collections section (ADR-0046). */
export interface LandingCollection {
  /** crypto.randomUUID(); stable while the card is edited and moved. */
  id: string
  /** The collection's own page, /collections/<slug>: ^[a-z0-9]+(-[a-z0-9]+)*$, 1..60 characters, unique among the collections. */
  slug: string
  /** 1..60 characters. */
  title: { en: string; pt?: string }
  /** 0..160 characters. */
  text?: { en: string; pt?: string }
  /** A key of LANDING_IMAGE_KEYS (built-in picture), or an uploaded picture (SiteAsset, an image path). */
  image: string | SiteAsset
  link: LandingCollectionLink
  /** The published products the collection's page shows, in this order. 0..24. */
  products: ProductRef[]
  hidden?: boolean
}

export const MAX_COLLECTION_PRODUCTS = 24

/** The landing page's 3D showcase card, run from the Website Editor with the Owner/Admin's own files (owner decision 2026-11-03). */
export interface LandingShowcase {
  /** 0..40 characters. */
  eyebrow?: { en: string; pt?: string }
  /** 1..80 characters. */
  title: { en: string; pt?: string }
  /** 0..400 characters. */
  text?: { en: string; pt?: string }
  /** 0..80 characters, e.g. "220 x 95 x 78 cm". */
  dimensions?: string
  /** 0..120 characters. */
  materials?: { en: string; pt?: string }
  price?: { amount: number; currency: 'EUR' }
  /** An uploaded picture (image path). */
  image?: SiteAsset
  /** An uploaded 3D model: the GLB (Android, web viewer) and optionally the USDZ (iPhone Quick Look). */
  model?: { glb: SiteAsset; usdz?: SiteAsset }
  /** Optional add-on: a business product the card also links to. */
  product?: ProductRef
}
export const MAX_SHOWCASE_EYEBROW = 40
export const MAX_SHOWCASE_TITLE = 80
export const MAX_SHOWCASE_TEXT = 400
export const MAX_SHOWCASE_DIMENSIONS = 80
export const MAX_SHOWCASE_MATERIALS = 120
export const MAX_SHOWCASE_PRICE = 1_000_000

/** The landing hero's own picture and optional 3D model (owner 2026-11-04). Absent: the built-in photo. */
export interface LandingHero {
  image?: SiteAsset
  /** Shown in place of the picture behind a small "3D" switch; 3D only (no AR on the hero). */
  model?: { glb: SiteAsset }
  /** Describes the picture: its alt text and the small caption on it. */
  alt?: { en: string; pt?: string }
}

export const MAX_HERO_ALT = 120

// ---- homepage sections, the QR section and the About pictures (ADR-0061) --------------------------------------------------
type Pair = { en: string; pt?: string }

/** An uploaded picture with its description (alt text; empty = decorative). */
export interface SiteImage extends SiteAsset {
  alt: Pair
}

/** The sections of the landing page the Website Editor can move and hide; the hero is always first and is not in the list. */
export const BUILTIN_SECTION_IDS = ['qr', 'how', 'experience', 'collections', 'about', 'partners'] as const
export type BuiltinSectionId = (typeof BUILTIN_SECTION_IDS)[number]
export const OWN_SECTION_KINDS = ['text', 'imageText', 'banner'] as const
export type OwnSectionKind = (typeof OWN_SECTION_KINDS)[number]

/** An optional button of an own section: the label (EN, PT optional) and where it goes (a site path starting with `/`, or an https URL). */
export interface SectionButton {
  label: Pair
  href: string
}
interface OwnSectionBase {
  /** A slug, unique among all sections. */
  id: string
  hidden?: boolean
  /** The address fragment of the section (`/#anchor`): a slug, unique, never one of the page's own ids. */
  anchor?: string
}
export interface BuiltinSection {
  kind: 'builtin'
  id: BuiltinSectionId
  hidden?: boolean
}
/** A centred text block. */
export interface TextSection extends OwnSectionBase {
  kind: 'text'
  eyebrow?: Pair
  title: Pair
  subtitle?: Pair
  body?: Pair
  button?: SectionButton
}
/** A picture beside a text. */
export interface ImageTextSection extends OwnSectionBase {
  kind: 'imageText'
  eyebrow?: Pair
  title: Pair
  body?: Pair
  image: SiteImage
  imageSide: 'left' | 'right'
  button?: SectionButton
}
/** A full-width picture under a soft dark veil with white text, like the hero. */
export interface BannerSection extends OwnSectionBase {
  kind: 'banner'
  image: SiteImage
  title?: Pair
  body?: Pair
  button?: SectionButton
}
export type OwnSection = TextSection | ImageTextSection | BannerSection
export type LandingSection = BuiltinSection | OwnSection

/** The QR section's picture and layout. `none` (the default) shows centred text. */
export interface LandingQr {
  image?: SiteImage
  imageSide: 'left' | 'right' | 'none'
}
export const QR_SIDES = ['left', 'right', 'none'] as const

/** The two photographs of the About section. Absent: the built-in photos. */
export interface LandingAbout {
  image?: SiteImage
  detail?: SiteImage
}

export const MAX_LANDING_SECTIONS = 16
export const MAX_OWN_SECTIONS = 10
export const MAX_SECTION_EYEBROW = 60
export const MAX_SECTION_TITLE = 200
export const MAX_SECTION_SUBTITLE = 200
export const MAX_SECTION_BODY = 1200
export const MAX_SECTION_BUTTON = 40
export const MAX_SECTION_HREF = 300
export const MAX_IMAGE_ALT = 120
/** Page ids an own section's anchor may not take (the sections' own ids and their headings). Same list in the SQL gate. */
export const RESERVED_SECTION_ANCHORS: readonly string[] = [
  'qr', 'como-funciona', 'experiencia', 'colecoes', 'sobre', 'parcerias',
  'hero-title', 'qr-title', 'how-title', 'xp-title', 'col-title', 'about-title', 'biz-title',
]

/** The sections of a page nothing was saved for: the six built-in ones in today's order (QR under the hero), none hidden. */
export const defaultLandingSections = (): BuiltinSection[] => BUILTIN_SECTION_IDS.map((id) => ({ kind: 'builtin', id }))

/** The list the page shows and the Editor edits: the saved one, else the default. */
export const resolveLandingSections = (landing: Pick<SiteContent['landing'], 'sections'> | undefined): LandingSection[] => landing?.sections ?? defaultLandingSections()

/** A site path (`/…`, not `//host`) or an https URL, without spaces, at most 300 characters. The twin of the pattern in the SQL gate. */
export const isAllowedSectionHref = (href: string): boolean => href.length <= MAX_SECTION_HREF && /^(?:\/(?:[^/\s]\S*)?|https:\/\/\S+)$/.test(href)

export const MAX_LANDING_COLLECTIONS = 8
export const MAX_COLLECTION_TITLE = 60
export const MAX_COLLECTION_TEXT = 160

export interface SiteContent {
  schema: 1
  /** Terms and Privacy. Absent key or absent language = show the built-in text for it. Markdown. */
  builtinPages: { terms?: Partial<Record<Lang, string>>; privacy?: Partial<Record<Lang, string>> }
  /** At most 20. */
  customPages: CustomPage[]
  applyForm: ApplyFormConfig
  /** https URL per network. */
  social: Partial<Record<SocialNetwork, string>>
  /** The landing page's Collections cards. Empty = the page shows its built-in four. At most 8. */
  landing: {
    collections: LandingCollection[]
    /** The piece the landing's "Open a live piece in 3D" opens. Absent: the page chooses one itself. */
    featured?: ProductRef
    /** The admin's piece the hero's "See a live example" opens (ADR-0047). Absent: the 3D card's piece, else the first showcase piece. */
    example?: ProductRef
    /** The 3D showcase card (picture, model, texts, price). Absent: the page shows its built-in card. */
    showcase?: LandingShowcase
    /** The first photo of the landing page and its optional in-place 3D model. Absent: the built-in photo. */
    hero?: LandingHero
    /** Overrides of the landing page's own wording (ADR-0053): dictionary key (LANDING_EDITABLE_KEYS) to the text per language. Absent: the built-in wording. */
    texts?: LandingTexts
    /** The order and visibility of the sections under the hero, plus the Owner/Admin's own sections (ADR-0061). Absent: the default list. */
    sections?: LandingSection[]
    /** The QR section's picture and layout. Absent: centred text. */
    qr?: LandingQr
    /** The About section's two photographs. Absent: the built-in photos. */
    about?: LandingAbout
  }
  /** Site-wide settings (ADR-0053). Absent: the built-in icons. */
  chrome?: SiteChrome
}

/** Site-wide settings of the Website Editor. */
export interface SiteChrome {
  /** The browser-tab icon (a PNG, at most 1 MB, square). Replaces the built-in icon and the apple-touch-icon at run time. */
  favicon?: SiteAsset
}

export const MAX_CUSTOM_PAGES = 20
export const MAX_SLUG_LENGTH = 60
export const MAX_PAGE_TITLE = 80
export const MAX_PAGE_BODY = 60_000
/** Slugs a custom page may not take: they are routes or reserved words of the app. Same list in the SQL gate. */
export const RESERVED_PAGE_SLUGS: readonly string[] = ['admin', 'api', 'apply', 'catalog', 'dashboard', 'demo', 'embed', 'login', 'pages', 'privacy', 'products', 'terms']
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export function emptySiteContent(): SiteContent {
  return { schema: 1, builtinPages: {}, customPages: [], applyForm: clone(DEFAULT_APPLY_FORM), social: {}, landing: { collections: [] } }
}

// ---- normalize -------------------------------------------------------------------------------------------------------
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const langs = (v: unknown): Partial<Record<Lang, string>> => {
  const o = obj(v)
  const r: Partial<Record<Lang, string>> = {}
  if (typeof o.en === 'string') r.en = o.en
  if (typeof o.pt === 'string') r.pt = o.pt
  return r
}
const pair = (v: unknown): { en: string; pt?: string } => {
  const o = obj(v)
  return typeof o.pt === 'string' ? { en: str(o.en), pt: o.pt } : { en: str(o.en) }
}

/** Fills defaults and drops unknown keys; never throws. Does not validate (use validateSiteContent). */
export function normalizeSiteContent(input: unknown): SiteContent {
  const raw = obj(input)
  const out = emptySiteContent()
  const bp = obj(raw.builtinPages)
  for (const k of ['terms', 'privacy'] as const) {
    const t = langs(bp[k])
    if (Object.keys(t).length) out.builtinPages[k] = t
  }
  if (Array.isArray(raw.customPages)) {
    out.customPages = raw.customPages.map((x, i) => {
      const o = obj(x)
      return {
        id: str(o.id),
        slug: str(o.slug),
        title: pair(o.title),
        body: pair(o.body),
        showInFooter: o.showInFooter === true,
        order: typeof o.order === 'number' && Number.isFinite(o.order) ? o.order : i,
      }
    })
  }
  out.applyForm = normalizeApplyForm(raw.applyForm)
  const social = obj(raw.social)
  for (const n of SOCIAL_NETWORKS) if (typeof social[n] === 'string' && social[n]) out.social[n] = social[n]
  const landing = obj(raw.landing)
  if (Array.isArray(landing.collections)) out.landing.collections = landing.collections.map(normalizeCollection)
  if (typeof landing.featured === 'object' && landing.featured !== null && !Array.isArray(landing.featured)) out.landing.featured = productRef(landing.featured)
  if (typeof landing.example === 'object' && landing.example !== null && !Array.isArray(landing.example)) out.landing.example = productRef(landing.example)
  if (typeof landing.showcase === 'object' && landing.showcase !== null && !Array.isArray(landing.showcase)) out.landing.showcase = normalizeShowcase(landing.showcase)
  if (typeof landing.hero === 'object' && landing.hero !== null && !Array.isArray(landing.hero)) out.landing.hero = normalizeHero(landing.hero)
  const texts = normalizeLandingTexts(landing.texts)
  if (texts) out.landing.texts = texts
  if (Array.isArray(landing.sections)) out.landing.sections = landing.sections.flatMap(normalizeSection)
  if (typeof landing.qr === 'object' && landing.qr !== null && !Array.isArray(landing.qr)) out.landing.qr = normalizeQr(landing.qr)
  const about = normalizeAbout(landing.about)
  if (about) out.landing.about = about
  const favicon = asset(obj(raw.chrome).favicon)
  if (favicon) out.chrome = { favicon }
  return out
}

/** Keeps the entries that have text in at least one language; undefined when none are left. Unknown keys are kept (validateSiteContent refuses them). */
function normalizeLandingTexts(v: unknown): LandingTexts | undefined {
  const out: LandingTexts = {}
  for (const [key, value] of Object.entries(obj(v))) {
    const o = obj(value)
    const entry: { en?: string; pt?: string } = {}
    if (typeof o.en === 'string' && o.en) entry.en = o.en
    if (typeof o.pt === 'string' && o.pt) entry.pt = o.pt
    if (entry.en !== undefined || entry.pt !== undefined) out[key] = entry
  }
  // The text under the hero title moved to the QR section (ADR-0061): per language, a QR text that exists wins.
  const legacy = out['landing.hero.body']
  if (legacy) {
    delete out['landing.hero.body']
    out['landing.qr.body'] = { ...legacy, ...out['landing.qr.body'] }
  }
  return Object.keys(out).length ? out : undefined
}

const asset = (v: unknown): SiteAsset | undefined => (isSiteAsset(v) ? { path: v.path } : undefined)
const optPair = (v: unknown): { en: string; pt?: string } | undefined => {
  if (v === undefined) return undefined
  const p = pair(v)
  return p.en || p.pt ? p : undefined
}

/** A picture with its description; the path may be empty (a picture design not uploaded yet). Undefined when there is no path string. */
function siteImage(v: unknown): SiteImage | undefined {
  const o = obj(v)
  return typeof o.path === 'string' ? { path: o.path, alt: pair(o.alt) } : undefined
}

function normalizeButton(v: unknown): SectionButton | undefined {
  if (v === undefined) return undefined
  const o = obj(v)
  const label = pair(o.label)
  const href = str(o.href)
  return label.en || label.pt || href ? { label, href } : undefined
}

/** One entry of landing.sections; nothing for an entry that is not a known design (or an unknown built-in id). */
function normalizeSection(x: unknown): LandingSection[] {
  const o = obj(x)
  const hidden = o.hidden === true
  if (o.kind === 'builtin') {
    return (BUILTIN_SECTION_IDS as readonly unknown[]).includes(o.id) ? [{ kind: 'builtin', id: o.id as BuiltinSectionId, ...(hidden ? { hidden } : {}) }] : []
  }
  const base = { id: str(o.id), ...(hidden ? { hidden } : {}), ...(typeof o.anchor === 'string' && o.anchor ? { anchor: o.anchor } : {}) }
  const optional = (keys: readonly ('eyebrow' | 'subtitle' | 'body')[]) => {
    const r: Partial<Record<'eyebrow' | 'subtitle' | 'body', Pair>> = {}
    for (const k of keys) {
      const p = optPair(o[k])
      if (p) r[k] = p
    }
    return r
  }
  const button = normalizeButton(o.button)
  const withButton = button ? { button } : {}
  const emptyImage: SiteImage = { path: '', alt: { en: '' } }
  if (o.kind === 'text') return [{ kind: 'text', ...base, title: pair(o.title), ...optional(['eyebrow', 'subtitle', 'body']), ...withButton }]
  if (o.kind === 'imageText')
    return [{ kind: 'imageText', ...base, title: pair(o.title), ...optional(['eyebrow', 'body']), image: siteImage(o.image) ?? emptyImage, imageSide: o.imageSide === 'right' ? 'right' : 'left', ...withButton }]
  if (o.kind === 'banner') {
    const title = optPair(o.title)
    return [{ kind: 'banner', ...base, image: siteImage(o.image) ?? emptyImage, ...(title ? { title } : {}), ...optional(['body']), ...withButton }]
  }
  return []
}

function normalizeQr(x: unknown): LandingQr {
  const o = obj(x)
  const image = siteImage(o.image)
  return { ...(image ? { image } : {}), imageSide: (QR_SIDES as readonly unknown[]).includes(o.imageSide) ? (o.imageSide as LandingQr['imageSide']) : 'none' }
}

function normalizeAbout(x: unknown): LandingAbout | undefined {
  const o = obj(x)
  const out: LandingAbout = {}
  const image = siteImage(o.image)
  if (image) out.image = image
  const detail = siteImage(o.detail)
  if (detail) out.detail = detail
  return out.image || out.detail ? out : undefined
}

function normalizeHero(x: unknown): LandingHero {
  const o = obj(x)
  const out: LandingHero = {}
  const image = asset(o.image)
  if (image) out.image = image
  const glb = asset(obj(o.model).glb)
  if (glb) out.model = { glb }
  const alt = optPair(o.alt)
  if (alt) out.alt = alt
  return out
}

function normalizeShowcase(x: unknown): LandingShowcase {
  const o = obj(x)
  const out: LandingShowcase = { title: pair(o.title) }
  const eyebrow = optPair(o.eyebrow)
  if (eyebrow) out.eyebrow = eyebrow
  const text = optPair(o.text)
  if (text) out.text = text
  const materials = optPair(o.materials)
  if (materials) out.materials = materials
  if (typeof o.dimensions === 'string' && o.dimensions) out.dimensions = o.dimensions
  const price = obj(o.price)
  if (typeof price.amount === 'number' && Number.isFinite(price.amount)) out.price = { amount: price.amount, currency: 'EUR' }
  const image = asset(o.image)
  if (image) out.image = image
  const m = obj(o.model)
  const glb = asset(m.glb)
  if (glb) {
    out.model = { glb }
    const usdz = asset(m.usdz)
    if (usdz) out.model.usdz = usdz
  }
  if (typeof o.product === 'object' && o.product !== null && !Array.isArray(o.product)) out.product = productRef(o.product)
  return out
}

function productRef(x: unknown): ProductRef {
  const o = obj(x)
  return { businessSlug: str(o.businessSlug), productSlug: str(o.productSlug) }
}

function normalizeCollection(x: unknown): LandingCollection {
  const o = obj(x)
  const l = obj(o.link)
  let link: LandingCollectionLink = { kind: 'none' }
  if (l.kind === 'product') link = { kind: 'product', businessSlug: str(l.businessSlug), productSlug: str(l.productSlug) }
  else if (l.kind === 'catalog')
    link = typeof l.category === 'string' && l.category ? { kind: 'catalog', businessSlug: str(l.businessSlug), category: l.category as Category } : { kind: 'catalog', businessSlug: str(l.businessSlug) }
  else if (l.kind === 'apply') link = { kind: 'apply' }
  else if (l.kind === 'collection') link = { kind: 'collection' }
  const products = Array.isArray(o.products) ? o.products.map(productRef) : []
  const out: LandingCollection = { id: str(o.id), slug: str(o.slug), title: pair(o.title), image: isSiteAsset(o.image) ? { path: o.image.path } : str(o.image), link, products }
  if (o.text !== undefined) {
    const text = pair(o.text)
    if (text.en || text.pt) out.text = text
  }
  if (o.hidden === true) out.hidden = true
  return out
}

// ---- links in page bodies --------------------------------------------------------------------------------------------
/** `https://`, `mailto:` and site-relative `/...` (not `//host`) only. Everything else, `javascript:` and `data:` included, is refused. */
export function isAllowedLinkHref(href: string): boolean {
  const h = href.trim()
  return /^https:\/\/\S/i.test(h) || /^mailto:\S/i.test(h) || /^\/(?!\/)/.test(h)
}
/** Whether every Markdown link `[text](href)` in `body` is allowed. Raw HTML is never parsed, so only links matter. */
export function hasOnlyAllowedLinks(body: string): boolean {
  for (const m of body.matchAll(/\]\(\s*([^)]*)\)/g)) {
    const href = (m[1] ?? '').trim().split(/\s+/)[0] ?? ''
    if (!isAllowedLinkHref(href)) return false
  }
  return true
}

// ---- social links ----------------------------------------------------------------------------------------------------
const SOCIAL_DOMAINS: Record<SocialNetwork, readonly string[]> = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  linkedin: ['linkedin.com'],
  youtube: ['youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com'],
  pinterest: ['pinterest.com', 'pinterest.pt'],
}
export const MAX_SOCIAL_URL = 300

export type SocialUrlCheck = { ok: true; url: string } | { ok: false; error: 'invalid_url' | 'insecure_url' | 'wrong_host' | 'too_long' }

/**
 * Input is trimmed; a missing scheme gets `https://`; an explicit `http://` is refused; no spaces, no user info, no
 * port, 300 characters or fewer; the host must be the network's domain or a subdomain of it.
 */
export function checkSocialUrl(network: SocialNetwork, input: string): SocialUrlCheck {
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'invalid_url' }
  if (/\s/.test(raw)) return { ok: false, error: 'invalid_url' }
  if (raw.length > MAX_SOCIAL_URL) return { ok: false, error: 'too_long' }
  let url = raw
  if (/^http:\/\//i.test(raw)) return { ok: false, error: 'insecure_url' }
  if (/^https:\/\//i.test(raw)) url = raw
  else if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return { ok: false, error: 'invalid_url' }
  else url = `https://${raw}`
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return { ok: false, error: 'invalid_url' }
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return { ok: false, error: 'invalid_url' }
  const host = u.hostname.toLowerCase()
  const domains = SOCIAL_DOMAINS[network] ?? []
  if (!domains.some((d) => host === d || host.endsWith(`.${d}`))) return { ok: false, error: 'wrong_host' }
  return { ok: true, url }
}
export const isAllowedSocialUrl = (network: SocialNetwork, input: string): boolean => checkSocialUrl(network, input).ok
/** The value to store: trimmed, with `https://`. Null when not allowed. */
export const normalizeSocialUrl = (network: SocialNetwork, input: string): string | null => {
  const c = checkSocialUrl(network, input)
  return c.ok ? c.url : null
}

// ---- shape (what every save is held to) ------------------------------------------------------------------------------
export const MAX_CONTENT_BYTES = 524_288

/**
 * The twin of private.check_site_content_shape: an object, schema 1, at most 512 KB, and the array caps. This, not
 * validateSiteContent, is what a draft save must pass (a draft may be incomplete); publishing needs validateSiteContent.
 * Paths: `document`, `schema`, `customPages`, `applyForm`, `applyForm.steps|customQuestions|fields`.
 */
export function validateContentShape(doc: unknown): ContentErrors {
  const e: ContentErrors = {}
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return { document: 'invalid_value' }
  const d = doc as Record<string, unknown>
  if (d.schema !== SITE_CONTENT_SCHEMA) return { schema: 'invalid_value' }
  if (new TextEncoder().encode(JSON.stringify(doc)).length > MAX_CONTENT_BYTES) return { document: 'too_long' }
  if ('customPages' in d) {
    if (!Array.isArray(d.customPages)) return { customPages: 'invalid_value' }
    if (d.customPages.length > MAX_CUSTOM_PAGES) return { customPages: 'too_many' }
  }
  if ('applyForm' in d) {
    const f = d.applyForm
    if (typeof f !== 'object' || f === null || Array.isArray(f)) return { applyForm: 'invalid_value' }
    const af = f as Record<string, unknown>
    if (Array.isArray(af.steps) && af.steps.length > MAX_APPLY_STEPS) e['applyForm.steps'] = 'too_many'
    else if (Array.isArray(af.customQuestions) && af.customQuestions.length > MAX_CUSTOM_QUESTIONS) e['applyForm.customQuestions'] = 'too_many'
    else if (Array.isArray(af.fields) && af.fields.length > MAX_APPLY_FIELDS) e['applyForm.fields'] = 'too_many'
  }
  if ('landing' in d) {
    const l = d.landing
    if (typeof l !== 'object' || l === null || Array.isArray(l)) return { landing: 'invalid_value' }
    const c = (l as Record<string, unknown>).collections
    if (c !== undefined) {
      if (!Array.isArray(c)) return { 'landing.collections': 'invalid_value' }
      if (c.length > MAX_LANDING_COLLECTIONS) return { 'landing.collections': 'too_many' }
    }
    const sc = (l as Record<string, unknown>).showcase
    if (sc !== undefined && (typeof sc !== 'object' || sc === null || Array.isArray(sc))) return { 'landing.showcase': 'invalid_value' }
    const hero = (l as Record<string, unknown>).hero
    if (hero !== undefined && (typeof hero !== 'object' || hero === null || Array.isArray(hero))) return { 'landing.hero': 'invalid_value' }
    const texts = (l as Record<string, unknown>).texts
    if (texts !== undefined && (typeof texts !== 'object' || texts === null || Array.isArray(texts))) return { 'landing.texts': 'invalid_value' }
    const sections = (l as Record<string, unknown>).sections
    if (sections !== undefined) {
      if (!Array.isArray(sections)) return { 'landing.sections': 'invalid_value' }
      if (sections.length > MAX_LANDING_SECTIONS) return { 'landing.sections': 'too_many' }
    }
    for (const k of ['qr', 'about'] as const) {
      const v = (l as Record<string, unknown>)[k]
      if (v !== undefined && (typeof v !== 'object' || v === null || Array.isArray(v))) return { [`landing.${k}`]: 'invalid_value' }
    }
  }
  if ('chrome' in d) {
    const c = d.chrome
    if (typeof c !== 'object' || c === null || Array.isArray(c)) return { chrome: 'invalid_value' }
  }
  return e
}

// ---- validate--------------------------------------------------------------------------------------------------------
/**
 * Validates the whole document (the editor runs it on every change; publish is disabled while it returns anything).
 * Keys are document paths: `schema`, `builtinPages.terms.pt`, `customPages` (count), `customPages.<i>.slug|title.en|
 * title.pt|body.en|body.pt|id|order`, `applyForm.<path from validateApplyForm>`, `social.<network>`. Values are
 * ContentErrorKey. The first problem per path wins; an empty object means valid.
 */
export function validateSiteContent(doc: SiteContent): ContentErrors {
  const e: ContentErrors = {}
  const put = (path: string, key: ContentErrorKey) => {
    if (!(path in e)) e[path] = key
  }
  if (doc.schema !== SITE_CONTENT_SCHEMA) put('schema', 'invalid_value')

  for (const k of ['terms', 'privacy'] as const) {
    for (const lang of ['en', 'pt'] as const) {
      const body = doc.builtinPages?.[k]?.[lang]
      if (body === undefined) continue
      const p = `builtinPages.${k}.${lang}`
      if (body.length > MAX_PAGE_BODY) put(p, 'too_long')
      else if (!hasOnlyAllowedLinks(body)) put(p, 'invalid_link')
    }
  }

  const pages = doc.customPages ?? []
  if (pages.length > MAX_CUSTOM_PAGES) put('customPages', 'too_many')
  const slugs = new Set<string>()
  const ids = new Set<string>()
  pages.forEach((pg, i) => {
    const p = `customPages.${i}`
    if (!pg.id) put(`${p}.id`, 'required')
    else if (ids.has(pg.id)) put(`${p}.id`, 'duplicate_id')
    ids.add(pg.id)
    if (!pg.slug) put(`${p}.slug`, 'required')
    else if (pg.slug.length > MAX_SLUG_LENGTH) put(`${p}.slug`, 'too_long')
    else if (!SLUG.test(pg.slug)) put(`${p}.slug`, 'invalid_slug')
    else if (RESERVED_PAGE_SLUGS.includes(pg.slug)) put(`${p}.slug`, 'slug_reserved')
    else if (slugs.has(pg.slug)) put(`${p}.slug`, 'slug_duplicate')
    slugs.add(pg.slug)
    if (!(pg.title?.en ?? '').trim()) put(`${p}.title.en`, 'required')
    if ((pg.title?.en ?? '').length > MAX_PAGE_TITLE) put(`${p}.title.en`, 'too_long')
    if ((pg.title?.pt ?? '').length > MAX_PAGE_TITLE) put(`${p}.title.pt`, 'too_long')
    for (const lang of ['en', 'pt'] as const) {
      const body = pg.body?.[lang]
      if (body === undefined) continue
      if (body.length > MAX_PAGE_BODY) put(`${p}.body.${lang}`, 'too_long')
      else if (!hasOnlyAllowedLinks(body)) put(`${p}.body.${lang}`, 'invalid_link')
    }
    if (typeof pg.order !== 'number' || !Number.isFinite(pg.order)) put(`${p}.order`, 'invalid_value')
  })

  for (const [path, key] of Object.entries(validateApplyForm(doc.applyForm ?? DEFAULT_APPLY_FORM))) put(`applyForm.${path}`, key)

  for (const [net, value] of Object.entries(doc.social ?? {})) {
    if (value === undefined || value === '') continue
    const p = `social.${net}`
    if (!(SOCIAL_NETWORKS as readonly string[]).includes(net)) put(p, 'unknown_key')
    else if (!/^https:\/\//.test(value)) put(p, 'invalid_url')
    else {
      const c = checkSocialUrl(net as SocialNetwork, value)
      if (!c.ok) put(p, c.error === 'too_long' ? 'too_long' : c.error)
    }
  }
  validateLandingCollections(doc.landing?.collections ?? [], put)
  if (doc.landing?.featured) validateRef(doc.landing.featured, 'landing.featured', put)
  if (doc.landing?.example) validateRef(doc.landing.example, 'landing.example', put)
  if (doc.landing?.showcase) validateShowcase(doc.landing.showcase, put)
  if (doc.landing?.hero) validateHero(doc.landing.hero, put)
  if (doc.landing?.texts) validateLandingTexts(doc.landing.texts, put)
  if (doc.landing?.sections !== undefined) validateSections(doc.landing.sections, put)
  if (doc.landing?.qr !== undefined) validateQr(doc.landing.qr, put)
  if (doc.landing?.about !== undefined) validateAbout(doc.landing.about, put)
  if (doc.chrome?.favicon !== undefined) {
    const f = doc.chrome.favicon
    if (!isSiteAsset(f) || !isFaviconPath(f.path)) put('chrome.favicon', 'invalid_value')
  }
  return e
}

/** landing.texts: only keys of LANDING_EDITABLE_KEYS, each language a string within the key's limit. Paths: `landing.texts.<key>[.en|.pt]`. */
function validateLandingTexts(texts: LandingTexts, put: (path: string, key: ContentErrorKey) => void): void {
  for (const [key, entry] of Object.entries(texts)) {
    const p = `landing.texts.${key}`
    const max = Object.hasOwn(LANDING_TEXT_LIMITS, key) ? LANDING_TEXT_LIMITS[key]! : undefined
    if (max === undefined) {
      put(p, 'unknown_key')
      continue
    }
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      put(p, 'invalid_value')
      continue
    }
    for (const l of ['en', 'pt'] as const) {
      const v = entry[l]
      if (v === undefined) continue
      if (typeof v !== 'string') put(`${p}.${l}`, 'invalid_value')
      else if (v.length > max) put(`${p}.${l}`, 'too_long')
    }
  }
}

type Put = (path: string, key: ContentErrorKey) => void
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A text pair: `en`/`pt`, strings within `max`; with `requireEn` the English must have text. Paths: `<path>`, `<path>.en|pt`. */
function checkPair(v: unknown, path: string, max: number, requireEn: boolean, put: Put): void {
  if (v === undefined) {
    if (requireEn) put(`${path}.en`, 'required')
    return
  }
  if (!isRecord(v)) return put(path, 'invalid_value')
  if (requireEn && (typeof v.en !== 'string' || !v.en.trim())) put(`${path}.en`, 'required')
  for (const l of ['en', 'pt'] as const) {
    const t = v[l]
    if (t === undefined) continue
    if (typeof t !== 'string') put(`${path}.${l}`, 'invalid_value')
    else if (t.length > max) put(`${path}.${l}`, 'too_long')
  }
}

/** An uploaded picture with its description: an image path of the site-content bucket, alt texts of at most 120 characters. */
function checkImage(img: unknown, path: string, required: boolean, put: Put): void {
  if (img === undefined) {
    if (required) put(path, 'required')
    return
  }
  if (!isRecord(img)) return put(path, 'invalid_value')
  if (img.path === '') put(path, 'required')
  else if (typeof img.path !== 'string' || siteAssetKind(img.path) !== 'image') put(path, 'invalid_value')
  checkPair(img.alt, `${path}.alt`, MAX_IMAGE_ALT, false, put)
}

function checkButton(b: unknown, path: string, put: Put): void {
  if (b === undefined) return
  if (!isRecord(b)) return put(path, 'invalid_value')
  checkPair(b.label, `${path}.label`, MAX_SECTION_BUTTON, true, put)
  if (typeof b.href !== 'string') put(`${path}.href`, b.href === undefined ? 'required' : 'invalid_value')
  else if (b.href === '') put(`${path}.href`, 'required')
  else if (b.href.length > MAX_SECTION_HREF) put(`${path}.href`, 'too_long')
  else if (!isAllowedSectionHref(b.href)) put(`${path}.href`, 'invalid_link')
}

/** landing.sections: the order list. Paths: `landing.sections` (count) and `landing.sections.<i>.<field>`. */
function validateSections(list: LandingSection[], put: Put): void {
  if (!Array.isArray(list)) return put('landing.sections', 'invalid_value')
  const own = list.filter((s) => s?.kind !== 'builtin').length
  if (list.length > MAX_LANDING_SECTIONS || own > MAX_OWN_SECTIONS) put('landing.sections', 'too_many')
  const ids = new Set<string>()
  const anchors = new Set<string>()
  list.forEach((raw, i) => {
    const p = `landing.sections.${i}`
    if (!isRecord(raw)) return put(p, 'invalid_value')
    const s = raw as Record<string, unknown>
    if (s.hidden !== undefined && typeof s.hidden !== 'boolean') put(`${p}.hidden`, 'invalid_value')
    const id = typeof s.id === 'string' ? s.id : ''
    if (s.kind === 'builtin') {
      if (!(BUILTIN_SECTION_IDS as readonly string[]).includes(id)) put(`${p}.id`, 'invalid_value')
      else if (ids.has(id)) put(`${p}.id`, 'duplicate_id')
      ids.add(id)
      return
    }
    if (s.kind !== 'text' && s.kind !== 'imageText' && s.kind !== 'banner') return put(`${p}.kind`, 'invalid_value')
    if (!id) put(`${p}.id`, 'required')
    else if (id.length > MAX_SLUG_LENGTH) put(`${p}.id`, 'too_long')
    else if (!SLUG.test(id)) put(`${p}.id`, 'invalid_slug')
    else if ((BUILTIN_SECTION_IDS as readonly string[]).includes(id)) put(`${p}.id`, 'slug_reserved')
    else if (ids.has(id)) put(`${p}.id`, 'duplicate_id')
    ids.add(id)
    if (s.anchor !== undefined) {
      const a = s.anchor
      if (typeof a !== 'string' || !a) put(`${p}.anchor`, 'invalid_value')
      else if (a.length > MAX_SLUG_LENGTH) put(`${p}.anchor`, 'too_long')
      else if (!SLUG.test(a)) put(`${p}.anchor`, 'invalid_slug')
      else if (RESERVED_SECTION_ANCHORS.includes(a)) put(`${p}.anchor`, 'slug_reserved')
      else if (anchors.has(a)) put(`${p}.anchor`, 'slug_duplicate')
      if (typeof a === 'string') anchors.add(a)
    }
    const titled = s.kind !== 'banner'
    if (s.kind !== 'banner') checkPair(s.eyebrow, `${p}.eyebrow`, MAX_SECTION_EYEBROW, false, put)
    checkPair(s.title, `${p}.title`, MAX_SECTION_TITLE, titled, put)
    if (s.kind === 'text') checkPair(s.subtitle, `${p}.subtitle`, MAX_SECTION_SUBTITLE, false, put)
    checkPair(s.body, `${p}.body`, MAX_SECTION_BODY, false, put)
    if (s.kind !== 'text') checkImage(s.image, `${p}.image`, true, put)
    if (s.kind === 'imageText' && s.imageSide !== 'left' && s.imageSide !== 'right') put(`${p}.imageSide`, 'invalid_value')
    checkButton(s.button, `${p}.button`, put)
  })
}

function validateQr(qr: LandingQr, put: Put): void {
  if (!isRecord(qr)) return put('landing.qr', 'invalid_value')
  if (qr.imageSide !== undefined && !(QR_SIDES as readonly unknown[]).includes(qr.imageSide)) put('landing.qr.imageSide', 'invalid_value')
  checkImage(qr.image, 'landing.qr.image', false, put)
}

function validateAbout(about: LandingAbout, put: Put): void {
  if (!isRecord(about)) return put('landing.about', 'invalid_value')
  checkImage(about.image, 'landing.about.image', false, put)
  checkImage(about.detail, 'landing.about.detail', false, put)
}

function validateRef(ref: ProductRef, path: string, put: (path: string, key: ContentErrorKey) => void): void {
  for (const f of ['businessSlug', 'productSlug'] as const) {
    const v = ref?.[f]
    if (!v) put(`${path}.${f}`, 'required')
    else if (v.length > MAX_SLUG_LENGTH || !SLUG.test(v)) put(`${path}.${f}`, 'invalid_slug')
  }
}

function validateAsset(a: SiteAsset | undefined, kind: SiteAssetKind, path: string, put: (path: string, key: ContentErrorKey) => void): void {
  if (!a) return put(path, 'required')
  if (siteAssetKind(typeof a.path === 'string' ? a.path : '') !== kind) put(path, 'invalid_value')
}

function validateHero(h: LandingHero, put: (path: string, key: ContentErrorKey) => void): void {
  const p = 'landing.hero'
  if (h.image !== undefined) validateAsset(h.image, 'image', `${p}.image`, put)
  if (h.model !== undefined) validateAsset(h.model.glb, 'glb', `${p}.model.glb`, put)
  for (const l of ['en', 'pt'] as const) {
    const v = h.alt?.[l]
    if (v !== undefined && (typeof v !== 'string' || v.length > MAX_HERO_ALT)) put(`${p}.alt.${l}`, typeof v === 'string' ? 'too_long' : 'invalid_value')
  }
}

function validateShowcase(sc: LandingShowcase, put: (path: string, key: ContentErrorKey) => void): void {
  const p = 'landing.showcase'
  if (typeof sc.title?.en !== 'string' || !sc.title.en.trim()) put(`${p}.title.en`, 'required')
  const caps: [keyof Pick<LandingShowcase, 'eyebrow' | 'title' | 'text' | 'materials'>, number][] = [['eyebrow', MAX_SHOWCASE_EYEBROW], ['title', MAX_SHOWCASE_TITLE], ['text', MAX_SHOWCASE_TEXT], ['materials', MAX_SHOWCASE_MATERIALS]]
  for (const [k, max] of caps)
    for (const l of ['en', 'pt'] as const) {
      const v = sc[k]?.[l]
      if (v !== undefined && (typeof v !== 'string' || v.length > max)) put(`${p}.${k}.${l}`, typeof v === 'string' ? 'too_long' : 'invalid_value')
    }
  if (sc.dimensions !== undefined && (typeof sc.dimensions !== 'string' || sc.dimensions.length > MAX_SHOWCASE_DIMENSIONS)) put(`${p}.dimensions`, typeof sc.dimensions === 'string' ? 'too_long' : 'invalid_value')
  if (sc.price !== undefined) {
    const { amount, currency } = sc.price
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_SHOWCASE_PRICE) put(`${p}.price.amount`, 'invalid_value')
    if (currency !== 'EUR') put(`${p}.price.currency`, 'invalid_value')
  }
  if (sc.image !== undefined) validateAsset(sc.image, 'image', `${p}.image`, put)
  if (sc.model !== undefined) {
    validateAsset(sc.model.glb, 'glb', `${p}.model.glb`, put)
    if (sc.model.usdz !== undefined) validateAsset(sc.model.usdz, 'usdz', `${p}.model.usdz`, put)
  }
  if (sc.product !== undefined) validateRef(sc.product, `${p}.product`, put)
}

function validateLandingCollections(list: LandingCollection[], put: (path: string, key: ContentErrorKey) => void): void {
  if (list.length > MAX_LANDING_COLLECTIONS) put('landing.collections', 'too_many')
  const ids = new Set<string>()
  const slugs = new Set<string>()
  list.forEach((c, i) => {
    const p = `landing.collections.${i}`
    if (!c.id) put(`${p}.id`, 'required')
    else if (ids.has(c.id)) put(`${p}.id`, 'duplicate_id')
    ids.add(c.id)
    if (!c.slug) put(`${p}.slug`, 'required')
    else if (c.slug.length > MAX_SLUG_LENGTH) put(`${p}.slug`, 'too_long')
    else if (!SLUG.test(c.slug)) put(`${p}.slug`, 'invalid_slug')
    else if (slugs.has(c.slug)) put(`${p}.slug`, 'slug_duplicate')
    slugs.add(c.slug)
    const products = c.products ?? []
    if (products.length > MAX_COLLECTION_PRODUCTS) put(`${p}.products`, 'too_many')
    products.forEach((ref, j) => validateRef(ref, `${p}.products.${j}`, put))
    if (!(c.title?.en ?? '').trim()) put(`${p}.title.en`, 'required')
    if ((c.title?.en ?? '').length > MAX_COLLECTION_TITLE) put(`${p}.title.en`, 'too_long')
    if ((c.title?.pt ?? '').length > MAX_COLLECTION_TITLE) put(`${p}.title.pt`, 'too_long')
    if ((c.text?.en ?? '').length > MAX_COLLECTION_TEXT) put(`${p}.text.en`, 'too_long')
    if ((c.text?.pt ?? '').length > MAX_COLLECTION_TEXT) put(`${p}.text.pt`, 'too_long')
    if (isSiteAsset(c.image)) validateAsset(c.image, 'image', `${p}.image`, put)
    else if (!(LANDING_IMAGE_KEYS as readonly string[]).includes(c.image)) put(`${p}.image`, c.image ? 'invalid_value' : 'required')
    const link = c.link
    if (link?.kind === 'product') {
      for (const f of ['businessSlug', 'productSlug'] as const) {
        const v = link[f]
        if (!v) put(`${p}.link.${f}`, 'required')
        else if (v.length > MAX_SLUG_LENGTH || !SLUG.test(v)) put(`${p}.link.${f}`, 'invalid_slug')
      }
    } else if (link?.kind === 'catalog') {
      if (!link.businessSlug) put(`${p}.link.businessSlug`, 'required')
      else if (link.businessSlug.length > MAX_SLUG_LENGTH || !SLUG.test(link.businessSlug)) put(`${p}.link.businessSlug`, 'invalid_slug')
      // Any slug-shaped value: the category list is managed in the admin console (ADR-0055), so a custom category is a valid target.
      if (link.category !== undefined && (typeof link.category !== 'string' || !SLUG.test(link.category))) put(`${p}.link.category`, 'invalid_value')
    } else if (link?.kind !== 'apply' && link?.kind !== 'none' && link?.kind !== 'collection') put(`${p}.link`, 'invalid_value')
  })
}

// ---- change summary --------------------------------------------------------------------------------------------------
export interface ChangeSummary {
  /** Terms/Privacy bodies changed (per language) plus custom pages added, removed or edited (title, slug, body). */
  pages: number
  /** Custom pages whose "show in footer" or order changed, or that were added or removed while shown in the footer. */
  footer: number
  /** Application texts changed (per key and language). */
  applicationTexts: number
  /** Steps added, removed, renamed or reordered, plus built-in fields moved to another step or reordered inside one. */
  applicationSteps: number
  /** Built-in fields whose hidden or required flag changed, plus choice fields whose hidden options changed. */
  applicationFields: number
  /** Custom questions added, removed or edited. */
  questions: number
  /** Social links added, removed or changed. */
  social: number
  /** Landing collection cards added, removed, edited, hidden or shown, plus one when their order changed. */
  landingCollections: number
  /** The landing 3D showcase card: 1 when it was added, edited or removed. */
  landingShowcase: number
  /** Landing page texts overridden, changed or reset (per key and language). */
  landingTexts: number
  /** Homepage sections added, removed, edited, hidden, shown or moved, plus the QR section layout and each About picture changed (ADR-0061). */
  landingSections: number
  /** The site icon (favicon): 1 when it was set, replaced or removed. */
  siteFavicon: number
  total: number
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** What a publish would change, in counts by group (for the confirm dialog). `before` null = nothing published yet. */
export function summarizeChanges(before: SiteContent | null, after: SiteContent): ChangeSummary {
  const a = before ?? emptySiteContent()
  const b = after
  let pages = 0
  let footer = 0

  for (const k of ['terms', 'privacy'] as const)
    for (const l of ['en', 'pt'] as const) if ((a.builtinPages[k]?.[l] ?? '') !== (b.builtinPages[k]?.[l] ?? '')) pages++
  const pa = new Map(a.customPages.map((p) => [p.id, p]))
  const pb = new Map(b.customPages.map((p) => [p.id, p]))
  for (const [id, p] of pb) {
    const old = pa.get(id)
    if (!old) {
      pages++
      if (p.showInFooter) footer++
    } else {
      if (!same({ s: old.slug, t: old.title, b: old.body }, { s: p.slug, t: p.title, b: p.body })) pages++
      if (old.showInFooter !== p.showInFooter || old.order !== p.order) footer++
    }
  }
  for (const [id, p] of pa)
    if (!pb.has(id)) {
      pages++
      if (p.showInFooter) footer++
    }

  // Application texts.
  let applicationTexts = 0
  for (const key of new Set([...Object.keys(a.applyForm.texts), ...Object.keys(b.applyForm.texts)]))
    for (const l of ['en', 'pt'] as const) if ((a.applyForm.texts[key]?.[l] ?? '') !== (b.applyForm.texts[key]?.[l] ?? '')) applicationTexts++

  // Steps and placement.
  let applicationSteps = 0
  const sa = a.applyForm.steps
  const sb = b.applyForm.steps
  const ida = new Set(sa.map((s) => s.id))
  const idb = new Set(sb.map((s) => s.id))
  applicationSteps += sb.filter((s) => !ida.has(s.id)).length + sa.filter((s) => !idb.has(s.id)).length
  for (const s of sb) {
    const old = sa.find((x) => x.id === s.id)
    if (old && !same({ t: old.title ?? null, h: old.hint ?? null }, { t: s.title ?? null, h: s.hint ?? null })) applicationSteps++
  }
  if (!same(sa.filter((s) => idb.has(s.id)).map((s) => s.id), sb.filter((s) => ida.has(s.id)).map((s) => s.id))) applicationSteps++

  const ra = resolveApplyForm(a.applyForm, { includeHidden: true })
  const rb = resolveApplyForm(b.applyForm, { includeHidden: true })
  const stepOf = (r: typeof ra) => new Map(r.flatMap((s) => s.fields.map((f) => [f.key, s.id] as const)))
  const fa = stepOf(ra)
  const fb = stepOf(rb)
  const builtin = new Set<string>(APPLY_BUILTIN_KEYS)
  for (const k of builtin) if (fa.get(k as never) !== fb.get(k as never)) applicationSteps++
  for (const s of rb) {
    const olderOrder = (ra.find((x) => x.id === s.id)?.fields ?? []).map((f) => f.key).filter((k) => builtin.has(k) && fb.get(k) === s.id && fa.get(k) === s.id)
    const newerOrder = s.fields.map((f) => f.key).filter((k) => builtin.has(k) && fa.get(k) === s.id)
    if (!same(olderOrder, newerOrder)) applicationSteps++
  }

  // Hidden or optional fields, hidden options.
  let applicationFields = 0
  const flags = (r: typeof ra) => new Map(r.flatMap((s) => s.fields.map((f) => [f.key, `${f.hidden}/${f.required}`] as const)))
  const ga = flags(ra)
  const gb = flags(rb)
  for (const k of builtin) if (ga.get(k as never) !== gb.get(k as never)) applicationFields++
  for (const k of ['category', 'productCount', 'photoReadiness', 'modelReadiness'] as const)
    if (!same([...(a.applyForm.hiddenOptions[k] ?? [])].sort(), [...(b.applyForm.hiddenOptions[k] ?? [])].sort())) applicationFields++

  // Questions (the placement of a question belongs to the question).
  let questions = 0
  const qa = new Map(a.applyForm.customQuestions.map((q) => [q.id, q]))
  const qb = new Map(b.applyForm.customQuestions.map((q) => [q.id, q]))
  const qMeta = (r: typeof ra) => new Map(r.flatMap((s) => s.fields.filter((f) => f.question).map((f) => [f.question!.id, `${s.id}/${f.required}`] as const)))
  const ma = qMeta(ra)
  const mb = qMeta(rb)
  for (const [id, q] of qb) {
    const old = qa.get(id)
    if (!old || !same(old, q) || ma.get(id) !== mb.get(id)) questions++
  }
  for (const id of qa.keys()) if (!qb.has(id)) questions++

  // Social links.
  let social = 0
  for (const n of SOCIAL_NETWORKS) if ((a.social[n] ?? '') !== (b.social[n] ?? '')) social++

  // Landing collections: per card by id, then the order of the cards both sides share.
  let landingCollections = 0
  const ca = new Map((a.landing?.collections ?? []).map((c) => [c.id, c]))
  const cb = new Map((b.landing?.collections ?? []).map((c) => [c.id, c]))
  for (const [id, c] of cb) if (!ca.has(id) || !same(ca.get(id), c)) landingCollections++
  for (const id of ca.keys()) if (!cb.has(id)) landingCollections++
  if (!same([...ca.keys()].filter((id) => cb.has(id)), [...cb.keys()].filter((id) => ca.has(id)))) landingCollections++

  if (!same(a.landing?.featured, b.landing?.featured)) landingCollections++
  if (!same(a.landing?.example, b.landing?.example)) landingCollections++
  if (!same(a.landing?.hero, b.landing?.hero)) landingCollections++

  const landingShowcase = same(a.landing?.showcase, b.landing?.showcase) ? 0 : 1

  let landingTexts = 0
  const ta = a.landing?.texts ?? {}
  const tb = b.landing?.texts ?? {}
  for (const key of new Set([...Object.keys(ta), ...Object.keys(tb)]))
    for (const l of ['en', 'pt'] as const) if ((ta[key]?.[l] ?? '') !== (tb[key]?.[l] ?? '')) landingTexts++

  // Homepage sections: per section by id, then the order of the sections both sides share; the QR layout and each About picture count once.
  let landingSections = 0
  const la = resolveLandingSections(a.landing)
  const lb = resolveLandingSections(b.landing)
  const secA = new Map(la.map((s) => [s.id, s]))
  const secB = new Map(lb.map((s) => [s.id, s]))
  for (const [id, s] of secB) if (!secA.has(id) || !same(secA.get(id), s)) landingSections++
  for (const id of secA.keys()) if (!secB.has(id)) landingSections++
  if (!same([...secA.keys()].filter((id) => secB.has(id)), [...secB.keys()].filter((id) => secA.has(id)))) landingSections++
  if (!same(a.landing?.qr, b.landing?.qr)) landingSections++
  if (!same(a.landing?.about?.image, b.landing?.about?.image)) landingSections++
  if (!same(a.landing?.about?.detail, b.landing?.about?.detail)) landingSections++

  const siteFavicon = same(a.chrome?.favicon, b.chrome?.favicon) ? 0 : 1

  return {
    pages,
    footer,
    applicationTexts,
    applicationSteps,
    applicationFields,
    questions,
    social,
    landingCollections,
    landingShowcase,
    landingTexts,
    landingSections,
    siteFavicon,
    total: pages + footer + applicationTexts + applicationSteps + applicationFields + questions + social + landingCollections + landingShowcase + landingTexts + landingSections + siteFavicon,
  }
}

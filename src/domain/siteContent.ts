// The Content Editor document (spec section 6): pages, application form and social links, in one jsonb document with a
// draft and a published copy. Pure TypeScript; the only import is the application form model, which lives in
// supabase/functions/_shared/applyForm.ts (no imports there) so the Edge Function can share it. The SQL gate in
// migration `site_content` repeats the checks that protect the live site; keep the two in step.
import {
  APPLY_BUILTIN_KEYS,
  DEFAULT_APPLY_FORM,
  normalizeApplyForm,
  resolveApplyForm,
  validateApplyForm,
  type ApplyFormConfig,
  type ContentErrorKey,
  type ContentErrors,
  type Lang,
} from '../../supabase/functions/_shared/applyForm.ts'

export type { ApplyFormConfig, ContentErrorKey, ContentErrors, Lang }
export * from '../../supabase/functions/_shared/applyForm.ts'

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

export interface SiteContent {
  schema: 1
  /** Terms and Privacy. Absent key or absent language = show the built-in text for it. Markdown. */
  builtinPages: { terms?: Partial<Record<Lang, string>>; privacy?: Partial<Record<Lang, string>> }
  /** At most 20. */
  customPages: CustomPage[]
  applyForm: ApplyFormConfig
  /** https URL per network. */
  social: Partial<Record<SocialNetwork, string>>
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
  return { schema: 1, builtinPages: {}, customPages: [], applyForm: clone(DEFAULT_APPLY_FORM), social: {} }
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
    if (Array.isArray(af.steps) && af.steps.length > 8) e['applyForm.steps'] = 'too_many'
    else if (Array.isArray(af.customQuestions) && af.customQuestions.length > 10) e['applyForm.customQuestions'] = 'too_many'
    else if (Array.isArray(af.fields) && af.fields.length > 40) e['applyForm.fields'] = 'too_many'
  }
  return e
}

// ---- validate --------------------------------------------------------------------------------------------------------
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
  return e
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

  return { pages, footer, applicationTexts, applicationSteps, applicationFields, questions, social, total: pages + footer + applicationTexts + applicationSteps + applicationFields + questions + social }
}

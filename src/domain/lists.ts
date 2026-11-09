// Rules for the admin-managed lists (ADR-0055): product categories and currencies. Pure functions, shared by the demo service,
// the Supabase service, the hooks and the screens. The built-in items are the migration's seed and the loading fallback.
import { BUILTIN_CATEGORIES, BUILTIN_CURRENCIES, type CategoryItem, type CurrencyItem, type Lang, OTHER_CATEGORY } from './types'

export const CATEGORY_LABEL_MAX = 60
export const CATEGORY_SLUG_MAX = 40

/** The seed of `product_categories` (label_en / label_pt are singular and used everywhere). Sort steps of 10; Other is last. */
export const BUILTIN_CATEGORY_ITEMS: readonly CategoryItem[] = [
  { slug: 'sofa', labelEn: 'Sofa', labelPt: 'Sofá', sort: 10, active: true },
  { slug: 'chair', labelEn: 'Chair', labelPt: 'Cadeira', sort: 20, active: true },
  { slug: 'table', labelEn: 'Table', labelPt: 'Mesa', sort: 30, active: true },
  { slug: 'bed', labelEn: 'Bed', labelPt: 'Cama', sort: 40, active: true },
  { slug: 'storage', labelEn: 'Storage', labelPt: 'Arrumação', sort: 50, active: true },
  { slug: 'lighting', labelEn: 'Lighting', labelPt: 'Iluminação', sort: 60, active: true },
  { slug: 'decor', labelEn: 'Decor', labelPt: 'Decoração', sort: 70, active: true },
  { slug: OTHER_CATEGORY, labelEn: 'Other', labelPt: 'Outro', sort: 1000, active: true },
]

/** The seed of `currencies`: three on, the rest of the ISO list off (the full list is only in the database). */
export const BUILTIN_CURRENCY_ITEMS: readonly CurrencyItem[] = BUILTIN_CURRENCIES.map((code, i) => ({ code, enabled: true, sort: i + 1 }))

/** A few more ISO codes the demo offers to switch on, so the Currencies screen has something to search. */
export const DEMO_EXTRA_CURRENCIES = ['AED', 'AOA', 'AUD', 'CAD', 'CHF', 'CNY', 'CVE', 'CZK', 'DKK', 'GBP', 'HKD', 'INR', 'JPY', 'MXN', 'MZN', 'NOK', 'NZD', 'PLN', 'SAR', 'SEK', 'SGD', 'TRY', 'ZAR'] as const

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const isCategorySlug = (v: string): boolean => v.length > 0 && v.length <= CATEGORY_SLUG_MAX && SLUG.test(v)
export const isCurrencyCode = (v: string): boolean => /^[A-Z]{3}$/.test(v)

/** Display order: by sort, Other always last, ties by slug. Does not change the input. */
export function sortCategories<T extends { slug: string; sort: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Number(a.slug === OTHER_CATEGORY) - Number(b.slug === OTHER_CATEGORY) || a.sort - b.sort || a.slug.localeCompare(b.slug))
}

/** Currencies in display order. */
export const sortCurrencies = (items: readonly CurrencyItem[]): CurrencyItem[] => [...items].sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code))

/** The label of a category in `lang` (Portuguese falls back to English); undefined when the slug is not in the list. */
export function categoryLabelOf(items: readonly CategoryItem[], slug: string, lang: Lang): string | undefined {
  const item = items.find((c) => c.slug === slug)
  if (!item) return undefined
  return (lang === 'pt' ? item.labelPt.trim() || item.labelEn : item.labelEn).trim() || slug
}

/** "garden-lamp" becomes "Garden lamp": the last resort for a slug that is neither listed nor built in. */
export function humanizeSlug(slug: string): string {
  const s = slug.replace(/[-_]+/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : slug
}

/** A slug from an English label: ascii lower case, words joined by hyphens, at most 40 characters; "" when nothing is left. */
export function slugFromLabel(label: string): string {
  const base = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CATEGORY_SLUG_MAX)
    .replace(/-+$/g, '')
  return base
}

/** `base` if free, else base-2, base-3, … (kept within the slug length). */
export function uniqueSlug(base: string, taken: ReadonlySet<string> | readonly string[]): string {
  const set = taken instanceof Set ? taken : new Set(taken)
  const start = base || 'category'
  if (!set.has(start)) return start
  for (let n = 2; ; n++) {
    const suffix = `-${n}`
    const candidate = `${start.slice(0, CATEGORY_SLUG_MAX - suffix.length)}${suffix}`
    if (!set.has(candidate)) return candidate
  }
}

export type CategoryLabelProblem = 'labelEnRequired' | 'labelPtRequired' | 'labelTooLong'

/** Problems with the two labels of a category (both languages are required, at most 60 characters each). */
export function categoryLabelProblems(labelEn: string, labelPt: string): { labelEn?: CategoryLabelProblem; labelPt?: CategoryLabelProblem } {
  const out: { labelEn?: CategoryLabelProblem; labelPt?: CategoryLabelProblem } = {}
  if (!labelEn.trim()) out.labelEn = 'labelEnRequired'
  else if (labelEn.trim().length > CATEGORY_LABEL_MAX) out.labelEn = 'labelTooLong'
  if (!labelPt.trim()) out.labelPt = 'labelPtRequired'
  else if (labelPt.trim().length > CATEGORY_LABEL_MAX) out.labelPt = 'labelTooLong'
  return out
}

const fold = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

/** Older plural spellings the CSV import always accepted ("sofas", "lights"). */
const PLURALS: Record<string, string> = { sofas: 'sofa', chairs: 'chair', tables: 'table', beds: 'bed', lights: 'lighting' }

/**
 * A category typed as its slug ("sofa"), its English or Portuguese label ("Sofa", "Sofá"), a plural ("Sofas") or an old
 * spelling; compared without case or accents. Matches active and hidden categories alike (a hidden one is still a real one).
 * undefined when nothing matches.
 */
export function matchCategory(items: readonly CategoryItem[], value: string): string | undefined {
  const v = fold(value)
  if (!v) return undefined
  const bySlug = items.find((c) => c.slug === v)
  if (bySlug) return bySlug.slug
  const byLabel = items.find((c) => fold(c.labelEn) === v || fold(c.labelPt) === v || fold(c.labelEn) + 's' === v || fold(c.labelPt) + 's' === v)
  if (byLabel) return byLabel.slug
  const plural = PLURALS[v]
  if (plural && items.some((c) => c.slug === plural)) return plural
  return undefined
}

/** Active categories only, in display order: what pickers offer. `keep` (a product's current value) stays offered even if hidden. */
export function offeredCategories(items: readonly CategoryItem[], keep?: string): CategoryItem[] {
  return sortCategories(items.filter((c) => c.active || c.slug === keep))
}

/** Enabled currencies in display order; `keep` (a row's current currency) stays offered even if switched off. */
export function offeredCurrencies(items: readonly CurrencyItem[], keep?: string): string[] {
  const codes = sortCurrencies(items.filter((c) => c.enabled || c.code === keep)).map((c) => c.code)
  return keep && !codes.includes(keep) ? [...codes, keep] : codes
}

export const BUILTIN_SLUGS: readonly string[] = [...BUILTIN_CATEGORIES, OTHER_CATEGORY]

// Bulk product import (ADR-0051): CSV text → typed rows → product drafts. Pure functions, no service calls.
import { BUILTIN_CATEGORY_ITEMS, BUILTIN_CURRENCY_ITEMS, matchCategory, offeredCurrencies } from '@/domain/lists'
import { type Category, type CategoryItem, type Currency, type CurrencyItem, type LengthUnit, type LocalizedText, OTHER_CATEGORY } from '@/domain/types'
import { type FieldMessage, msg } from '@/i18n/fieldMessage'
import { parseCsv, toCsv } from '@/lib/csv'
import { parseMoneyInput } from '@/lib/format'
import { PRODUCT_SLUG_MAX, slugify, uniqueSlug } from '@/lib/slug'
import type { ProductInput } from '@/services/catalogService'
import { validateProductDraft } from '@/services/validation'

/** The most rows one import creates. */
export const MAX_IMPORT_ROWS = 200

/** One product to create. Everything but the name and the category is optional. */
export interface ImportRow {
  name: { en: string; pt?: string }
  /** The slug the typed value matched in the managed list; kept as typed (lower case) when it matched none, so it can be reported. */
  category: string
  /** True when the typed category matched none (the row then has an error and would fall back to Other, never to a real category). */
  categoryUnknown?: true
  /** Minor units (cents), as `Product.price`. */
  price?: number
  /** The business's default currency when empty. */
  currency?: Currency
  dimensions?: { width?: number; height?: number; depth?: number; unit: LengthUnit }
  short?: { en: string; pt?: string }
  description?: { en: string; pt?: string }
  material?: { en: string; pt?: string }
  cta?: { label?: string; url?: string }
}

/** The columns of the template, in order. Header names are matched without case; unknown columns are ignored. */
export const IMPORT_COLUMNS = [
  'name_en',
  'name_pt',
  'category',
  'price',
  'currency',
  'width',
  'height',
  'depth',
  'unit',
  'short_en',
  'short_pt',
  'description_en',
  'description_pt',
  'material_en',
  'material_pt',
  'cta_label_en',
  'cta_url',
] as const

const REQUIRED_COLUMNS = ['name_en', 'category'] as const

const EXAMPLE_ROW = [
  'Oslo three-seat sofa',
  'Sofá de três lugares Oslo',
  'sofa',
  '1299.00',
  'EUR',
  '210',
  '85',
  '95',
  'cm',
  'Soft linen sofa with oak legs.',
  'Sofá em linho macio com pés em carvalho.',
  'A three-seat sofa with removable covers.',
  'Um sofá de três lugares com capas amovíveis.',
  'Linen, oak',
  'Linho, carvalho',
  'Contact seller',
  'https://example.com/oslo-sofa',
]

/** The downloadable template: the header row and one example row. */
export function templateCsv(): string {
  return toCsv([[...IMPORT_COLUMNS], EXAMPLE_ROW])
}

export interface RowProblem {
  /** Position in `rows` (0-based). */
  index: number
  errors: FieldMessage[]
}

export interface ParsedImport {
  rows: ImportRow[]
  /** Problems found while reading each row (missing name, unknown category, a number that is not a number…). */
  problems: RowProblem[]
  /** The file as a whole cannot be used (no rows, a required column missing, too many rows): `rows` is empty then. */
  fileProblem?: FieldMessage
}

export interface ImportDefaults {
  /** Used when a row has dimensions but no unit. Default 'cm'. */
  unit?: LengthUnit
  /** The managed category list (ADR-0055); the built-in seven and Other when omitted. Only visible categories can be used. */
  categories?: readonly CategoryItem[]
  /** The managed currency list; EUR, BRL and USD when omitted. Only enabled currencies can be used. */
  currencies?: readonly CurrencyItem[]
}

const columnKey = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_')

/** "1299,50" or "1299.50" → 129950; null when it is not a price. */
const price = (s: string) => parseMoneyInput(s)

/** "85,5" → 85.5; NaN when it is not a number. One decimal, as the editor saves it. */
function length(s: string): number {
  const v = Number(s.trim().replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : Number.NaN
}

/**
 * A category typed as its slug ("sofa"), its English or Portuguese name ("Sofa", "Sofá"), a plural ("Sofas") or an old spelling,
 * matched against the visible categories of the managed list (ADR-0055); undefined when it is none of them.
 */
export function categoryFrom(value: string, categories: readonly CategoryItem[] = BUILTIN_CATEGORY_ITEMS): Category | undefined {
  return matchCategory(categories.filter((c) => c.active), value)
}

const loc = (en: string, pt: string): { en: string; pt?: string } | undefined => (en || pt ? { en, ...(pt ? { pt } : {}) } : undefined)

/**
 * CSV text → rows and their problems. Comma or semicolon files, quoted fields, a BOM; numbers may use a comma decimal.
 * A row with a problem is still returned (so the preview can show it); `prepareImport` marks it as not ready.
 */
export function rowsFromCsv(text: string, defaults: ImportDefaults = {}): ParsedImport {
  const categories = defaults.categories ?? BUILTIN_CATEGORY_ITEMS
  const offeredCodes = offeredCurrencies(defaults.currencies ?? BUILTIN_CURRENCY_ITEMS)
  const table = parseCsv(text)
  const header = table[0]
  if (!header) return { rows: [], problems: [], fileProblem: msg('products.import.file.noRows') }

  const at = new Map<string, number>()
  header.forEach((h, i) => {
    const k = columnKey(h)
    if (k && !at.has(k)) at.set(k, i)
  })
  const missing = REQUIRED_COLUMNS.filter((c) => !at.has(c))
  if (missing.length) return { rows: [], problems: [], fileProblem: msg('products.import.file.missingColumns', { columns: missing.join(', ') }) }

  const body = table.slice(1)
  if (body.length === 0) return { rows: [], problems: [], fileProblem: msg('products.import.file.noRows') }
  if (body.length > MAX_IMPORT_ROWS) return { rows: [], problems: [], fileProblem: msg('products.import.file.tooMany', { n: body.length, max: MAX_IMPORT_ROWS }) }

  const rows: ImportRow[] = []
  const problems: RowProblem[] = []

  body.forEach((cells, index) => {
    const get = (col: (typeof IMPORT_COLUMNS)[number]) => {
      const i = at.get(col)
      return i === undefined ? '' : (cells[i] ?? '').trim()
    }
    const errors: FieldMessage[] = []
    const row: ImportRow = { name: { en: get('name_en'), ...(get('name_pt') ? { pt: get('name_pt') } : {}) }, category: get('category').toLowerCase() }

    if (!row.name.en) errors.push(msg('common.validation.product.nameRequired'))
    const category = categoryFrom(row.category, categories)
    if (!row.category) {
      errors.push(msg('products.import.problem.categoryRequired'))
      row.categoryUnknown = true
    } else if (!category) {
      errors.push(msg('products.import.problem.categoryUnknown', { value: row.category, list: categories.filter((c) => c.active).map((c) => c.slug).join(', ') }))
      row.categoryUnknown = true
    } else row.category = category

    if (get('price')) {
      const p = price(get('price'))
      if (p === null) errors.push(msg('products.form.priceFormat'))
      else row.price = p
    }
    if (get('currency')) {
      const c = get('currency').toUpperCase()
      if (offeredCodes.includes(c)) row.currency = c
      else errors.push(msg('products.import.problem.currencyUnknown', { value: get('currency'), list: offeredCodes.join(', ') }))
    }

    let unit: LengthUnit = defaults.unit ?? 'cm'
    if (get('unit')) {
      const u = get('unit').toLowerCase()
      if (u === 'cm' || u === 'in') unit = u
      else errors.push(msg('products.import.problem.unitUnknown', { value: get('unit') }))
    }
    const dims: NonNullable<ImportRow['dimensions']> = { unit }
    for (const k of ['width', 'height', 'depth'] as const) {
      if (!get(k)) continue
      const v = length(get(k))
      if (Number.isNaN(v)) errors.push(msg('products.import.problem.numberInvalid', { column: k }))
      else dims[k] = v
    }
    if (dims.width !== undefined || dims.height !== undefined || dims.depth !== undefined) row.dimensions = dims

    const short = loc(get('short_en'), get('short_pt'))
    if (short) row.short = short
    const description = loc(get('description_en'), get('description_pt'))
    if (description) row.description = description
    const material = loc(get('material_en'), get('material_pt'))
    if (material) row.material = material
    if (get('cta_label_en') || get('cta_url')) row.cta = { ...(get('cta_label_en') ? { label: get('cta_label_en') } : {}), ...(get('cta_url') ? { url: get('cta_url') } : {}) }

    rows.push(row)
    if (errors.length) problems.push({ index, errors })
  })

  return { rows, problems }
}

const text = (v: { en: string; pt?: string } | undefined): LocalizedText => (v ? { en: v.en, ...(v.pt ? { pt: v.pt } : {}) } : { en: '' })

/** What a row becomes: a draft with no photos and no 3D files. `slug` is chosen by `prepareImport`. */
export function toProductInput(row: ImportRow, businessId: string, defaultCurrency: Currency, slug: string): ProductInput {
  const unit = row.dimensions?.unit ?? 'cm'
  return {
    businessId,
    slug,
    name: text(row.name),
    shortDescription: text(row.short),
    description: text(row.description),
    // rowsFromCsv resolved the category against the list. An unknown one never reaches the service (the row has errors), and
    // would land in Other, the catch-all, never in a real category.
    category: row.categoryUnknown || !row.category ? OTHER_CATEGORY : row.category,
    price: row.price ?? 0,
    currency: row.currency ?? defaultCurrency,
    images: [],
    models: {},
    dimensions: { width: row.dimensions?.width ?? 0, height: row.dimensions?.height ?? 0, depth: row.dimensions?.depth ?? 0, unit },
    material: text(row.material),
    weight: undefined,
    variants: [],
    // The editor's default button when the file gives none.
    cta: { label: row.cta?.label ? { en: row.cta.label } : { en: 'Contact seller', pt: 'Contactar vendedor' }, url: row.cta?.url || undefined },
  }
}

export interface PreparedRow {
  index: number
  row: ImportRow
  input: ProductInput
  /** Empty when the row can be created. */
  errors: FieldMessage[]
}

export interface ImportContext {
  businessId: string
  defaultCurrency: Currency
  /** Slugs the business already uses. */
  existingSlugs: Iterable<string>
}

const sameMessage = (a: FieldMessage, b: FieldMessage) => a.key === b.key && JSON.stringify(a.vars) === JSON.stringify(b.vars)

/**
 * Rows → drafts ready for `service.createProduct`, each with its errors: the problems found while reading plus the product
 * editor's own draft rules (`validateProductDraft`). Slugs come from the English name and stay unique inside the business
 * and inside the file.
 */
export function prepareImport(rows: readonly ImportRow[], problems: readonly RowProblem[], ctx: ImportContext): PreparedRow[] {
  const taken = new Set(ctx.existingSlugs)
  return rows.map((row, index) => {
    const slug = uniqueSlug(slugify(row.name.en), taken, PRODUCT_SLUG_MAX)
    taken.add(slug)
    const input = toProductInput(row, ctx.businessId, ctx.defaultCurrency, slug)
    const errors = [...(problems.find((p) => p.index === index)?.errors ?? [])]
    for (const m of Object.values(validateProductDraft(input, []))) {
      if (!errors.some((e) => sameMessage(e, m))) errors.push(m)
    }
    return { index, row, input, errors }
  })
}

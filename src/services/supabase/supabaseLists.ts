// Supabase implementation of the managed lists (ADR-0055, migration managed_lists): reads are plain selects on
// product_categories and currencies (everyone may read), changes are table writes guarded by RLS (content.manage + 2FA),
// and deleting a category is the rpc admin_delete_category, which moves its products to Other first. Errors are mapped
// from the refusals; nothing here falls back to demo data.
import type { SupabaseClient } from '@supabase/supabase-js'
import { slugFromLabel, sortCategories, sortCurrencies, uniqueSlug } from '@/domain/lists'
import { type CategoryItem, type CurrencyItem, OTHER_CATEGORY } from '@/domain/types'
import { type Result, fail, ok } from '../catalogService'
import { type CategoryInput, type ListsService, categoryFieldErrors } from '../listsService'

type DbError = { code?: string; message?: string; details?: string | null } | null

/** PostgREST and Postgres codes that mean the migration is not applied yet (table or function missing). */
const MISSING = new Set(['PGRST202', 'PGRST205', '42P01', '42883'])
const UNKNOWN_MESSAGE = 'The request could not be completed. Try again in a moment.'

export function mapListsError<T = never>(error: DbError): Result<T> {
  const code = error?.code ?? ''
  const message = error?.message ?? ''
  if (MISSING.has(code)) return { ok: false, error: { code: 'UNKNOWN', message: "The managed lists aren't enabled on this database yet.", reason: 'not_enabled' } }
  if (code === '42501') {
    const reason = message === 'aal2_required' ? 'aal2_required' : 'forbidden'
    return { ok: false, error: { code: 'PERMISSION', message: reason === 'aal2_required' ? 'Confirm your sign-in with two-factor authentication to change these lists.' : 'You do not have permission to change these lists.', reason } }
  }
  if (message === 'category_protected') return { ok: false, error: { code: 'VALIDATION', message: 'The Other category cannot be deleted or hidden.', reason: 'category_protected' } }
  if (message === 'category_not_found') return { ok: false, error: { code: 'NOT_FOUND', message: 'That category no longer exists.', reason: 'category_not_found' } }
  if (message === 'last_currency') return { ok: false, error: { code: 'VALIDATION', message: 'At least one currency must stay on.', reason: 'last_currency' } }
  if (code === '23505') return { ok: false, error: { code: 'CONFLICT', message: 'That category already exists.', reason: 'category_exists' } }
  if (code === '23514') return fail('VALIDATION', 'The value is not allowed.')
  return fail('UNKNOWN', UNKNOWN_MESSAGE)
}

interface CategoryRow {
  slug: string
  label_en: string
  label_pt: string
  sort: number
  active: boolean
}
interface CurrencyRow {
  code: string
  enabled: boolean
  sort: number
}
const toCategory = (r: CategoryRow): CategoryItem => ({ slug: r.slug, labelEn: r.label_en, labelPt: r.label_pt, sort: r.sort, active: r.active })
const toCurrency = (r: CurrencyRow): CurrencyItem => ({ code: r.code, enabled: r.enabled, sort: r.sort })
const CATEGORY_COLUMNS = 'slug,label_en,label_pt,sort,active'
const CURRENCY_COLUMNS = 'code,enabled,sort'

export function createSupabaseLists(sb: SupabaseClient): ListsService {
  /** A thrown network error is an UNKNOWN failure, never a crash. */
  async function guard<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
    try {
      return await fn()
    } catch {
      return fail('UNKNOWN', UNKNOWN_MESSAGE)
    }
  }

  const readCategories = async (): Promise<Result<CategoryItem[]>> => {
    const { data, error } = await sb.from('product_categories').select(CATEGORY_COLUMNS)
    if (error) return mapListsError<CategoryItem[]>(error as DbError)
    return ok(sortCategories(((data ?? []) as CategoryRow[]).map(toCategory)))
  }

  return {
    getCategories: () => guard(readCategories),

    saveCategory: (input: CategoryInput) =>
      guard(async () => {
        const labelEn = input.labelEn.trim()
        const labelPt = input.labelPt.trim()
        const problems = categoryFieldErrors(labelEn, labelPt)
        if (problems) return fail('VALIDATION', 'The labels have problems.', problems)
        if (input.slug === undefined) {
          const current = await readCategories()
          if (!current.ok) return current
          const slug = uniqueSlug(slugFromLabel(labelEn), current.data.map((c) => c.slug))
          const sort = Math.max(0, ...current.data.filter((c) => c.slug !== OTHER_CATEGORY).map((c) => c.sort)) + 10
          const { data, error } = await sb.from('product_categories').insert({ slug, label_en: labelEn, label_pt: labelPt, sort, active: input.active ?? true }).select(CATEGORY_COLUMNS).single()
          return error ? mapListsError<CategoryItem>(error as DbError) : ok(toCategory(data as CategoryRow))
        }
        const patch: Record<string, unknown> = { label_en: labelEn, label_pt: labelPt }
        if (input.active !== undefined && input.slug !== OTHER_CATEGORY) patch.active = input.active
        // An update that RLS filters out returns no row: say so instead of pretending it worked.
        const { data, error } = await sb.from('product_categories').update(patch).eq('slug', input.slug).select(CATEGORY_COLUMNS)
        if (error) return mapListsError<CategoryItem>(error as DbError)
        const row = (data as CategoryRow[] | null)?.[0]
        return row ? ok(toCategory(row)) : { ok: false as const, error: { code: 'PERMISSION' as const, message: 'You do not have permission to change these lists.', reason: 'forbidden' } }
      }),

    reorderCategories: (slugs) =>
      guard(async () => {
        const rows = slugs.filter((s) => s !== OTHER_CATEGORY)
        const results = await Promise.all(rows.map((slug, i) => sb.from('product_categories').update({ sort: (i + 1) * 10 }).eq('slug', slug).select('slug')))
        const failed = results.find((r) => r.error)
        if (failed) return mapListsError<void>(failed.error as DbError)
        if (results.some((r) => !r.data || r.data.length === 0)) return { ok: false as const, error: { code: 'PERMISSION' as const, message: 'You do not have permission to change these lists.', reason: 'forbidden' } }
        return ok(undefined)
      }),

    deleteCategory: (slug) =>
      guard(async () => {
        const { data, error } = await sb.rpc('admin_delete_category', { p_slug: slug })
        if (error) return mapListsError<{ moved: number }>(error as DbError)
        return ok({ moved: typeof data === 'number' ? data : 0 })
      }),

    getCurrencies: () =>
      guard(async () => {
        const { data, error } = await sb.from('currencies').select(CURRENCY_COLUMNS)
        if (error) return mapListsError<CurrencyItem[]>(error as DbError)
        return ok(sortCurrencies(((data ?? []) as CurrencyRow[]).map(toCurrency)))
      }),

    setCurrencyEnabled: (code, enabled) =>
      guard(async () => {
        const { data, error } = await sb.from('currencies').update({ enabled }).eq('code', code).select(CURRENCY_COLUMNS)
        if (error) return mapListsError<CurrencyItem>(error as DbError)
        const row = (data as CurrencyRow[] | null)?.[0]
        return row ? ok(toCurrency(row)) : { ok: false as const, error: { code: 'PERMISSION' as const, message: 'You do not have permission to change these lists.', reason: 'forbidden' } }
      }),

    subscribe: () => () => {},
  }
}

// The admin-managed lists (ADR-0055): product categories and currencies. Everyone reads them (the public catalogue, the
// editors and the import all need the labels); changing them needs content.manage and 2FA (Supabase RLS and the
// admin_delete_category function; the demo checks the same permission). The UI imports `lists` from '@/services'.
import { CATEGORY_LABEL_MAX, categoryLabelProblems } from '@/domain/lists'
import type { CategoryItem, CurrencyItem } from '@/domain/types'
import { type FieldError, msg } from '@/i18n/fieldMessage'
import type { Result } from './catalogService'

export interface CategoryInput {
  /** Absent: a new category (the slug is made from the English label and kept for good). */
  slug?: string
  labelEn: string
  labelPt: string
  /** New categories are visible unless said otherwise. */
  active?: boolean
}

/** The labels' problems as translatable field errors (keys labelEn / labelPt), or undefined when both are fine. */
export function categoryFieldErrors(labelEn: string, labelPt: string): Record<string, FieldError> | undefined {
  const p = categoryLabelProblems(labelEn, labelPt)
  const out: Record<string, FieldError> = {}
  // The texts live in the common dictionary: this file is imported by public pages through '@/services', which may not name dashboard-only keys.
  const text = (problem: string, required: 'common.validation.categoryNameEnRequired' | 'common.validation.categoryNamePtRequired') =>
    problem === 'labelTooLong' ? msg('common.validation.tooLong', { n: CATEGORY_LABEL_MAX }) : msg(required)
  if (p.labelEn) out.labelEn = text(p.labelEn, 'common.validation.categoryNameEnRequired')
  if (p.labelPt) out.labelPt = text(p.labelPt, 'common.validation.categoryNamePtRequired')
  return Object.keys(out).length ? out : undefined
}

export interface ListsService {
  /** Every category, hidden ones too, in display order (Other last). */
  getCategories(): Promise<Result<CategoryItem[]>>
  /** Adds (no slug) or edits (labels, visibility). Other cannot be hidden. VALIDATION with fieldErrors labelEn / labelPt. */
  saveCategory(input: CategoryInput): Promise<Result<CategoryItem>>
  /** The given slugs, in this order, are the new order (Other stays last). */
  reorderCategories(slugs: string[]): Promise<Result<void>>
  /** Moves the category's products to Other, then removes it. Other is refused (reason category_protected). Returns how many products moved. */
  deleteCategory(slug: string): Promise<Result<{ moved: number }>>
  /** Every currency, enabled or not, in display order. */
  getCurrencies(): Promise<Result<CurrencyItem[]>>
  /** Switching a currency off keeps it on the rows that use it. The last enabled one cannot be switched off (reason last_currency). */
  setCurrencyEnabled(code: string, enabled: boolean): Promise<Result<CurrencyItem>>
  /** Demo only: the store changed (so the cached lists refresh). Supabase: no-op. */
  subscribe(listener: () => void): () => void
}

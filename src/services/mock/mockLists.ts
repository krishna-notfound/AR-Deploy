// Demo implementation of the managed category and currency lists (ADR-0055): the same rules as the database (Other is
// permanent, deleting a category moves its products to Other, the last currency stays on, only content.manage changes
// anything) over the demo store, so demo mode works with no env vars and "Reset demo data" restores the seed.
import {
  BUILTIN_CATEGORY_ITEMS,
  BUILTIN_CURRENCY_ITEMS,
  DEMO_EXTRA_CURRENCIES,
  slugFromLabel,
  sortCategories,
  sortCurrencies,
  uniqueSlug,
} from '@/domain/lists'
import { type CategoryItem, type CurrencyItem, OTHER_CATEGORY } from '@/domain/types'
import { type Result, fail, ok } from '../catalogService'
import { type CategoryInput, type ListsService, categoryFieldErrors } from '../listsService'
import type { Db } from './db'
import { mockActor } from './mockModelRequestShared'
import { store } from './store'

const LATENCY_MS = import.meta.env.MODE === 'test' ? 0 : 120
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const delay = () => (LATENCY_MS ? new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS)) : Promise.resolve())
async function run<T>(fn: () => Result<T>): Promise<Result<T>> {
  await delay()
  return fn()
}

/** The seed lists: the seven categories and Other; EUR, BRL and USD on and a sample of other ISO codes off. */
function seed(): { categories: CategoryItem[]; currencies: CurrencyItem[] } {
  return {
    categories: clone([...BUILTIN_CATEGORY_ITEMS]),
    currencies: [...clone([...BUILTIN_CURRENCY_ITEMS]), ...DEMO_EXTRA_CURRENCIES.map((code, i) => ({ code, enabled: false, sort: 100 + i }))],
  }
}
const peek = () => store.get().lists ?? seed()
const slice = (db: Db) => (db.lists ??= seed())

const forbidden = <T>(): Result<T> => ({ ok: false, error: { code: 'PERMISSION', message: 'You do not have permission to change these lists.', reason: 'forbidden' } })
const canEdit = (): boolean => {
  const a = mockActor()
  return a.kind === 'staff' && a.can('content.manage')
}

export const mockListsService: ListsService = {
  getCategories: () => run(() => ok(sortCategories(clone(peek().categories)))),

  saveCategory: (input: CategoryInput) =>
    run<CategoryItem>(() => {
      if (!canEdit()) return forbidden()
      const labelEn = input.labelEn.trim()
      const labelPt = input.labelPt.trim()
      const problems = categoryFieldErrors(labelEn, labelPt)
      if (problems) return fail('VALIDATION', 'The labels have problems.', problems)
      const current = peek().categories
      let saved: CategoryItem | undefined
      if (input.slug === undefined) {
        const slug = uniqueSlug(slugFromLabel(labelEn), current.map((c) => c.slug))
        const sort = Math.max(0, ...current.filter((c) => c.slug !== OTHER_CATEGORY).map((c) => c.sort)) + 10
        saved = { slug, labelEn, labelPt, sort, active: input.active ?? true }
        store.update((db) => void slice(db).categories.push(saved!))
      } else {
        const existing = current.find((c) => c.slug === input.slug)
        if (!existing) return fail('NOT_FOUND', 'That category no longer exists.')
        const active = input.slug === OTHER_CATEGORY ? true : (input.active ?? existing.active)
        saved = { ...existing, labelEn, labelPt, active }
        store.update((db) => {
          const list = slice(db).categories
          list[list.findIndex((c) => c.slug === input.slug)] = saved!
        })
      }
      return ok(clone(saved))
    }),

  reorderCategories: (slugs) =>
    run<void>(() => {
      if (!canEdit()) return forbidden()
      store.update((db) => {
        const list = slice(db).categories
        slugs.filter((s) => s !== OTHER_CATEGORY).forEach((slug, i) => {
          const c = list.find((x) => x.slug === slug)
          if (c) c.sort = (i + 1) * 10
        })
      })
      return ok(undefined)
    }),

  deleteCategory: (slug) =>
    run<{ moved: number }>(() => {
      if (!canEdit()) return forbidden()
      if (slug === OTHER_CATEGORY) return { ok: false, error: { code: 'VALIDATION', message: 'The Other category cannot be deleted.', reason: 'category_protected' } }
      if (!peek().categories.some((c) => c.slug === slug)) return { ok: false, error: { code: 'NOT_FOUND', message: 'That category no longer exists.', reason: 'category_not_found' } }
      let moved = 0
      store.update((db) => {
        for (const p of db.products) {
          if (p.category === slug) {
            p.category = OTHER_CATEGORY
            moved++
          }
        }
        const lists = slice(db)
        lists.categories = lists.categories.filter((c) => c.slug !== slug)
      })
      return ok({ moved })
    }),

  getCurrencies: () => run(() => ok(sortCurrencies(clone(peek().currencies)))),

  setCurrencyEnabled: (code, enabled) =>
    run<CurrencyItem>(() => {
      if (!canEdit()) return forbidden()
      const list = peek().currencies
      const existing = list.find((c) => c.code === code)
      if (!existing) return fail('NOT_FOUND', 'That currency is not in the list.')
      if (!enabled && existing.enabled && !list.some((c) => c.enabled && c.code !== code)) {
        return { ok: false, error: { code: 'VALIDATION', message: 'At least one currency must stay on.', reason: 'last_currency' } }
      }
      const saved = { ...existing, enabled }
      store.update((db) => {
        const l = slice(db).currencies
        l[l.findIndex((c) => c.code === code)] = saved
      })
      return ok(clone(saved))
    }),

  subscribe: (listener) => store.subscribe(listener),
}

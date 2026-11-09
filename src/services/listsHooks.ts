// Hooks for the admin-managed lists (ADR-0055). One shared cache serves every component on the page, so a catalogue of fifty
// product cards asks the service once, not fifty times. It loads when the first component that needs it mounts, loads again
// the next time one mounts after all were gone (so a page opened later sees later changes), and while loading or after a
// failed read the built-in lists stand in (the seven categories and EUR, BRL and USD), so a picker is never empty.
//
//   useCategories()     { categories, active, loaded, error, reload }
//   useCategoryLabel()  (slug) => the name in the person's language
//   useCurrencies()     { currencies, loaded, error, reload, offered(keep?) }
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { BUILTIN_CATEGORY_ITEMS, BUILTIN_CURRENCY_ITEMS, BUILTIN_SLUGS, categoryLabelOf, humanizeSlug, offeredCategories, offeredCurrencies } from '@/domain/lists'
import type { CategoryItem, CurrencyItem } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import type { ServiceError } from './catalogService'
import { lists } from './index'

interface Snapshot {
  categories: CategoryItem[] | null
  currencies: CurrencyItem[] | null
  error: ServiceError | null
}

let snapshot: Snapshot = { categories: null, currencies: null, error: null }
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null
let stopWatching: (() => void) | null = null

function publish(next: Snapshot) {
  snapshot = next
  listeners.forEach((l) => l())
}

/** Reads both lists again (after a change, or when asked). Calls overlapping an unfinished read share it. */
export function reloadLists(): Promise<void> {
  if (inflight) return inflight
  inflight = Promise.all([lists.getCategories(), lists.getCurrencies()])
    .then(([c, cur]) => {
      const error = !c.ok ? c.error : !cur.ok ? cur.error : null
      publish({ categories: c.ok ? c.data : snapshot.categories, currencies: cur.ok ? cur.data : snapshot.currencies, error })
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    void reloadLists()
    stopWatching = lists.subscribe(() => void reloadLists())
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stopWatching?.()
      stopWatching = null
    }
  }
}
const getSnapshot = () => snapshot

/** Forgets what was loaded (tests; and when the signed-in person changes nothing needs it). */
export function resetListsCache() {
  snapshot = { categories: null, currencies: null, error: null }
}

export function useCategories() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const all = s.categories ?? (BUILTIN_CATEGORY_ITEMS as CategoryItem[])
  const active = useMemo(() => all.filter((c) => c.active), [all])
  return {
    /** Every category, hidden ones too, in display order; the built-ins until the list has loaded. */
    categories: all,
    /** The visible ones (what filters offer). */
    active,
    /** What a picker offers: the visible ones, plus `keep` (a product's current category) even if hidden. */
    offered: useCallback((keep?: string) => offeredCategories(all, keep), [all]),
    loaded: s.categories !== null,
    error: s.error,
    reload: reloadLists,
  }
}

/** The name of a category in the current language: from the list when loaded, else the dictionary for a built-in, else the slug made readable. */
export function useCategoryLabel(): (slug: string) => string {
  const { t, lang } = useI18n()
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const loaded = s.categories
  return useCallback(
    (slug: string) => {
      const fromList = loaded ? categoryLabelOf(loaded, slug, lang) : undefined
      if (fromList) return fromList
      if (BUILTIN_SLUGS.includes(slug)) return t(`category.${slug}` as 'category.sofa')
      return humanizeSlug(slug)
    },
    [loaded, lang, t],
  )
}

export function useCurrencies() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const all = s.currencies ?? (BUILTIN_CURRENCY_ITEMS as CurrencyItem[])
  return {
    /** Every currency, enabled or not, in display order; EUR, BRL and USD until the list has loaded. */
    currencies: all,
    /** The codes a picker offers: the enabled ones, plus `keep` (the row's current currency) even if switched off. */
    offered: useCallback((keep?: string) => offeredCurrencies(all, keep), [all]),
    loaded: s.currencies !== null,
    error: s.error,
    reload: reloadLists,
  }
}

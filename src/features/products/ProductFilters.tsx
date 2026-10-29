import { useRef } from 'react'
import { useSearchParams } from 'react-router'
import { Select } from '@/components/ui/Form'
import { cn } from '@/lib/cn'
import { SearchInput } from '@/components/ui/SearchInput'
import { type Business, CATEGORIES, type Category, type Product, type ProductStatus } from '@/domain/types'
import type { ProductRequestState } from '@/domain/modelRequests'
import { useI18n } from '@/i18n/LanguageProvider'
import { type ProductArReadiness, productArReadiness } from './productReadiness'

const AR_FILTERS: readonly ProductArReadiness[] = ['ready', 'android-only', 'android-blocked', 'photos-only']

export interface ProductFilterState {
  q: string
  business: string
  status: '' | ProductStatus
  category: '' | Category
  /** 3D / AR readiness (DUX-05). */
  ar: '' | ProductArReadiness
  /** Only products with an open 3D model request (R-S4-9; the business list only). */
  model: '' | 'open'
  page: number
}

/** Every filter off (page is reset by any update). */
export const CLEARED_PRODUCT_FILTERS = { q: '', business: '', status: '', category: '', ar: '', model: '' } as const satisfies Partial<ProductFilterState>

export const hasProductFilters = (f: ProductFilterState) => !!(f.q || f.business || f.status || f.category || f.ar || f.model)

function readFilters(params: URLSearchParams): ProductFilterState {
  const status = params.get('status')
  const category = params.get('category')
  const ar = params.get('ar')
  return {
    q: params.get('q') ?? '',
    business: params.get('business') ?? '',
    status: status === 'draft' || status === 'published' ? status : '',
    category: CATEGORIES.includes(category as Category) ? (category as Category) : '',
    ar: AR_FILTERS.includes(ar as ProductArReadiness) ? (ar as ProductArReadiness) : '',
    model: params.get('model') === 'open' ? 'open' : '',
    page: Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1),
  }
}

/** Filters live in the URL so views can be linked and survive reloads. */
export function useProductFilterParams() {
  const [params, setParams] = useSearchParams()
  // Updates build on the newest params, including ones written earlier in the same tick: React Router hands
  // both direct and functional updates the params of the last render, so two quick updates (the debounced
  // search write and a filter change) used to overwrite each other.
  // Navigation commits asynchronously, so a render may still show the old URL after we wrote a new one:
  // resync only when the URL itself changed (back/forward, links), never from a stale render.
  const latest = useRef(params)
  const seen = useRef(params.toString())
  if (params.toString() !== seen.current) {
    seen.current = params.toString()
    latest.current = params
  }
  const update = (patch: Partial<ProductFilterState>) => {
    const next = new URLSearchParams(latest.current)
    const merged = { ...readFilters(latest.current), ...patch, page: patch.page ?? 1 }
    for (const [k, v] of Object.entries(merged)) {
      if (v === '' || (k === 'page' && v === 1)) next.delete(k)
      else next.set(k, String(v))
    }
    latest.current = next
    setParams(next, { replace: true })
  }
  return [readFilters(params), update] as const
}

/** `states`: each product's request state, needed only for the `model` filter. */
export function applyProductFilters(products: Product[], f: ProductFilterState, states?: Record<string, ProductRequestState>): Product[] {
  const term = f.q.trim().toLowerCase()
  return products.filter(
    (p) =>
      (!f.business || p.businessId === f.business) &&
      (!f.status || p.status === f.status) &&
      (!f.category || p.category === f.category) &&
      (!f.ar || productArReadiness(p) === f.ar) &&
      (!f.model || !!states?.[p.id]?.open) &&
      (!term || p.name.en.toLowerCase().includes(term) || (p.name.pt ?? '').toLowerCase().includes(term) || p.slug.includes(term)),
  )
}

/** A filter control with its name visible above it (BRIEF: label 14/500, 8px gap). */
function FilterField({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-2', className)}>
      <span className="text-[length:var(--text-ui-body)] leading-5 font-medium text-ink">{label}</span>
      {children}
    </label>
  )
}

export function ProductFilterBar({
  state,
  update,
  businesses,
  requestFilter,
}: {
  state: ProductFilterState
  update: (p: Partial<ProductFilterState>) => void
  businesses?: Business[]
  /** Offer the '3D requests: open' filter (the business list, where request states are read). */
  requestFilter?: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-4 border-b border-line p-4 sm:flex-row sm:flex-wrap sm:items-end sm:p-6">
      <FilterField label={t('common.search')} className="sm:w-[260px]">
        <SearchInput value={state.q} onChange={(q) => update({ q })} label={t('products.filters.searchLabel')} placeholder={t('products.filters.searchPlaceholder')} className="w-full" />
      </FilterField>
      {businesses && (
        <FilterField label={t('products.table.business')} className="sm:w-[190px]">
          <Select aria-label={t('products.filters.byBusiness')} value={state.business} onChange={(e) => update({ business: e.target.value })}>
            <option value="">{t('products.filters.allBusinesses')}</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </FilterField>
      )}
      <div className="grid grid-cols-2 gap-4 sm:contents">
      <FilterField label={t('common.status')} className="sm:w-[150px]">
        <Select aria-label={t('products.filters.byStatus')} value={state.status} onChange={(e) => update({ status: e.target.value as ProductFilterState['status'] })}>
          <option value="">{t('products.filters.allStatuses')}</option>
          <option value="published">{t('products.status.published')}</option>
          <option value="draft">{t('products.status.draft')}</option>
        </Select>
      </FilterField>
      <FilterField label={t('products.filters.category')} className="sm:w-[170px]">
        <Select aria-label={t('products.filters.byCategory')} value={state.category} onChange={(e) => update({ category: e.target.value as ProductFilterState['category'] })}>
          <option value="">{t('products.filters.allCategories')}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`products.category.${c}`)}
            </option>
          ))}
        </Select>
      </FilterField>
      <FilterField label={t('products.filters.ar')} className="sm:w-[180px]">
        <Select aria-label={t('products.filters.byAr')} value={state.ar} onChange={(e) => update({ ar: e.target.value as ProductFilterState['ar'] })}>
          <option value="">{t('products.filters.allAr')}</option>
          <option value="ready">{t('products.readiness.ready')}</option>
          <option value="android-only">{t('products.filters.needsUsdz')}</option>
          <option value="android-blocked">{t('products.readiness.androidBlocked')}</option>
          <option value="photos-only">{t('products.filters.noModel')}</option>
        </Select>
      </FilterField>
      {requestFilter && (
        <FilterField label={t('products.filters.requests')} className="sm:w-[180px]">
          <Select aria-label={t('products.filters.byRequests')} value={state.model} onChange={(e) => update({ model: e.target.value as ProductFilterState['model'] })}>
            <option value="">{t('products.filters.allProducts')}</option>
            <option value="open">{t('products.filters.requestsOpen')}</option>
          </Select>
        </FilterField>
      )}
      </div>
      {hasProductFilters(state) && (
        <button type="button" onClick={() => update(CLEARED_PRODUCT_FILTERS)} className="min-h-10 text-[length:var(--text-ui-small)] font-medium text-accent-ink hover:underline sm:ml-1">
          {t('business.products.clearFilters')}
        </button>
      )}
    </div>
  )
}

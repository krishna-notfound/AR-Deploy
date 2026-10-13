import { useRef } from 'react'
import { useSearchParams } from 'react-router'
import { Select } from '@/components/ui/Form'
import { SearchInput } from '@/components/ui/SearchInput'
import { type Business, CATEGORIES, type Category, type Product, type ProductStatus } from '@/domain/types'

export interface ProductFilterState {
  q: string
  business: string
  status: '' | ProductStatus
  category: '' | Category
  page: number
}

function readFilters(params: URLSearchParams): ProductFilterState {
  const status = params.get('status')
  const category = params.get('category')
  return {
    q: params.get('q') ?? '',
    business: params.get('business') ?? '',
    status: status === 'draft' || status === 'published' ? status : '',
    category: CATEGORIES.includes(category as Category) ? (category as Category) : '',
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

export function applyProductFilters(products: Product[], f: ProductFilterState): Product[] {
  const term = f.q.trim().toLowerCase()
  return products.filter(
    (p) =>
      (!f.business || p.businessId === f.business) &&
      (!f.status || p.status === f.status) &&
      (!f.category || p.category === f.category) &&
      (!term || p.name.en.toLowerCase().includes(term) || (p.name.pt ?? '').toLowerCase().includes(term) || p.slug.includes(term)),
  )
}

export function ProductFilterBar({
  state,
  update,
  businesses,
}: {
  state: ProductFilterState
  update: (p: Partial<ProductFilterState>) => void
  businesses?: Business[]
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row sm:flex-wrap sm:items-center">
      <SearchInput value={state.q} onChange={(q) => update({ q })} label="Search products by name" placeholder="Search by product name" className="sm:w-72" />
      {businesses && (
        <Select aria-label="Filter by business" value={state.business} onChange={(e) => update({ business: e.target.value })} className="sm:w-52">
          <option value="">All businesses</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      )}
      <Select aria-label="Filter by status" value={state.status} onChange={(e) => update({ status: e.target.value as ProductFilterState['status'] })} className="sm:w-40">
        <option value="">All statuses</option>
        <option value="published">Published</option>
        <option value="draft">Draft</option>
      </Select>
      <Select aria-label="Filter by category" value={state.category} onChange={(e) => update({ category: e.target.value as ProductFilterState['category'] })} className="sm:w-40">
        <option value="">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c} className="capitalize">
            {c[0]?.toUpperCase()}
            {c.slice(1)}
          </option>
        ))}
      </Select>
      {(state.q || state.business || state.status || state.category) && (
        <button type="button" onClick={() => update({ q: '', business: '', status: '', category: '' })} className="text-[13px] font-medium text-accent-ink hover:underline sm:ml-1">
          Clear filters
        </button>
      )}
    </div>
  )
}

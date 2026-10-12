import { useMemo } from 'react'
import type { Business, ProductAnalytics } from '@/domain/types'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'

/** Businesses as a list and an id → business map. */
export function useBusinesses() {
  const q = useServiceQuery(() => service.getBusinesses(), [])
  const map = useMemo(() => new Map<string, Business>((q.data ?? []).map((b) => [b.id, b])), [q.data])
  const sorted = useMemo(() => [...(q.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [q.data])
  return { query: q, list: sorted, map }
}

/** Per-product analytics for tables (scoped when businessId is given). */
export function useProductStats(businessId?: string) {
  const q = useServiceQuery(() => (businessId ? service.getBusinessAnalytics(businessId) : service.getAnalytics()), [businessId])
  const map = useMemo(() => new Map<string, ProductAnalytics>((q.data?.byProduct ?? []).map((p) => [p.productId, p])), [q.data])
  return { query: q, map }
}

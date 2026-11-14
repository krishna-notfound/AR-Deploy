import { useMemo } from 'react'
import type { Business, ProductAnalytics } from '@/domain/types'
import { usePreferences } from '@/lib/preferences'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'

/** Businesses as a list and an id → business map. */
export function useBusinesses() {
  const q = useServiceQuery(() => service.getBusinesses(), [])
  const map = useMemo(() => new Map<string, Business>((q.data ?? []).map((b) => [b.id, b])), [q.data])
  const sorted = useMemo(() => [...(q.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [q.data])
  return { query: q, list: sorted, map }
}

/**
 * Per-product analytics for tables (scoped when businessId is given). The 30 days are the person's own local days
 * (their saved time zone), the same window as the Overview and Analytics pages: another zone puts the window's edges
 * on other days, and the same product showed different view counts on different pages (QA #3).
 * When the read fails `map` is empty and `query.status` is 'error': a page shows <StatsNotice query={stats.query} /> so
 * the table's 0s are not taken for real counts.
 */
export function useProductStats(businessId?: string) {
  const timeZone = usePreferences()?.timezone
  const q = useServiceQuery(
    () => (businessId ? service.getBusinessAnalytics(businessId, { timeZone }) : service.getAnalytics({ timeZone })),
    [businessId, timeZone],
  )
  const map = useMemo(() => new Map<string, ProductAnalytics>((q.data?.byProduct ?? []).map((p) => [p.productId, p])), [q.data])
  return { query: q, map }
}

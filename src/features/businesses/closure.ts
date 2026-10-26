import type { ClosureRequest, ID } from '@/domain/types'

/**
 * Open closure requests by business (R-W1-3). A staff closure has no business and is left out. A business has one
 * owner, so one request; should there be more, the earliest is kept.
 */
export function closureByBusiness(list: ClosureRequest[]): Map<ID, ClosureRequest> {
  const byBusiness = new Map<ID, ClosureRequest>()
  for (const r of list) {
    if (!r.businessId) continue
    const seen = byBusiness.get(r.businessId)
    if (!seen || r.requestedAt < seen.requestedAt) byBusiness.set(r.businessId, r)
  }
  return byBusiness
}

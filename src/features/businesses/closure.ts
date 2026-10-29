import type { BusinessStatus, ClosureRequest, ID } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'

/** The owner's closure line by the business's real status (R-W3-6): "Closure requested on {date} · " + this. */
export const OWNER_CLOSURE_LINE: Record<BusinessStatus, string> = {
  inactive: 'Your catalog is offline.',
  draft: 'Your catalog is not public yet.',
  active: 'Your catalog is still live.',
}

/** Translation keys of the same lines; screens render `t(OWNER_CLOSURE_KEY[status])`. The constant above stays for tests and callers not yet moved. */
export const OWNER_CLOSURE_KEY: Record<BusinessStatus, TranslationKey> = {
  inactive: 'admin.businesses.closure.inactive',
  draft: 'admin.businesses.closure.draft',
  active: 'admin.businesses.closure.active',
}

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

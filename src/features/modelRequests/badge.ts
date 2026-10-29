// The request badge in the business product list (S4 R-S4-9).
import type { ProductRequestState } from '@/domain/modelRequests'
import { type TranslationKey, en } from '@/i18n/dictionaries/en'

export type ModelRequestBadge = 'requested' | 'in_progress' | 'rejected'

/** Translate with `t(MODEL_REQUEST_BADGE_KEY[badge])`. */
export const MODEL_REQUEST_BADGE_KEY: Record<ModelRequestBadge, TranslationKey> = {
  requested: 'business.modelRequests.badge.requested',
  in_progress: 'business.modelRequests.badge.inProgress',
  rejected: 'business.modelRequests.badge.rejected',
}

/** English labels, kept for callers that have no `t`. */
export const MODEL_REQUEST_BADGE_LABEL: Record<ModelRequestBadge, string> = {
  requested: en[MODEL_REQUEST_BADGE_KEY.requested],
  in_progress: en[MODEL_REQUEST_BADGE_KEY.in_progress],
  rejected: en[MODEL_REQUEST_BADGE_KEY.rejected],
}

/** Open state wins (in_progress over requested); 'rejected' only when the latest closed request was declined and the product is photos-only. */
export function modelRequestBadge(state: ProductRequestState | undefined, photosOnly: boolean): ModelRequestBadge | null {
  if (!state) return null
  if (state.open) return state.open
  if (state.latestClosed === 'rejected' && photosOnly) return 'rejected'
  return null
}

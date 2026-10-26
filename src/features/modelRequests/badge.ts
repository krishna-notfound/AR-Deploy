// The request badge in the business product list (S4 R-S4-9).
import type { ProductRequestState } from '@/domain/modelRequests'

export type ModelRequestBadge = 'requested' | 'in_progress' | 'rejected'

export const MODEL_REQUEST_BADGE_LABEL: Record<ModelRequestBadge, string> = {
  requested: '3D requested',
  in_progress: '3D in progress',
  rejected: '3D declined',
}

/** Open state wins (in_progress over requested); 'rejected' only when the latest closed request was declined and the product is photos-only. */
export function modelRequestBadge(state: ProductRequestState | undefined, photosOnly: boolean): ModelRequestBadge | null {
  if (!state) return null
  if (state.open) return state.open
  if (state.latestClosed === 'rejected' && photosOnly) return 'rejected'
  return null
}

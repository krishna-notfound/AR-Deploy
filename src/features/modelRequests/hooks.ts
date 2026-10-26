// Data hooks for 3D model requests (S4). Components read requests only through these and `service`.
import type { ModelRequestQuery } from '@/domain/modelRequests'
import type { ID } from '@/domain/types'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'

export function useModelRequests(query: ModelRequestQuery = {}) {
  const key = JSON.stringify(query)
  return useServiceQuery(() => service.getModelRequests(query), [key])
}

/** Each product's open request and latest closed one, for the product list badges (R-S4-9). */
export function useProductRequestStates(businessId: ID | undefined) {
  return useServiceQuery(() => (businessId ? service.getProductRequestStates(businessId) : Promise.resolve({ ok: true as const, data: {} })), [businessId])
}

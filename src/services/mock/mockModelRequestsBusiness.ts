// Demo business-side 3D model request calls (S4 R-S4-6, R-S4-8). Placeholder until S4 Task 4 builds them.
import { type CatalogService, fail } from '../catalogService'
import type { MockModelRequestDeps } from './mockModelRequestShared'

type BusinessMethods = Pick<CatalogService, 'requestModel' | 'cancelModelRequest'>

export function createMockModelRequestsBusiness(_deps: MockModelRequestDeps): BusinessMethods {
  return {
    requestModel: async () => fail('UNSUPPORTED', 'Not available yet.'),
    cancelModelRequest: async () => fail('UNSUPPORTED', 'Not available yet.'),
  }
}

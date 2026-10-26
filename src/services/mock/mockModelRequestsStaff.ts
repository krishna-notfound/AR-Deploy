// Demo staff-side 3D model request calls (S4 R-S4-11 to R-S4-14). Placeholder until S4 Task 6 builds them.
import { type CatalogService, fail } from '../catalogService'
import type { MockModelRequestDeps } from './mockModelRequestShared'

type StaffMethods = Pick<CatalogService, 'getModelRequest' | 'startModelRequest' | 'stageModelFile' | 'unstageModelFile' | 'deliverModelRequest' | 'rejectModelRequest'>

export function createMockModelRequestsStaff(_deps: MockModelRequestDeps): StaffMethods {
  return {
    getModelRequest: async () => fail('UNSUPPORTED', 'Not available yet.'),
    startModelRequest: async () => fail('UNSUPPORTED', 'Not available yet.'),
    stageModelFile: async () => fail('UNSUPPORTED', 'Not available yet.'),
    unstageModelFile: async () => fail('UNSUPPORTED', 'Not available yet.'),
    deliverModelRequest: async () => fail('UNSUPPORTED', 'Not available yet.'),
    rejectModelRequest: async () => fail('UNSUPPORTED', 'Not available yet.'),
  }
}

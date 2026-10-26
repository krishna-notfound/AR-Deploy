// Supabase business-side 3D model request calls (S4 R-S4-6, R-S4-8). Placeholder until S4 Task 4 builds them.
import type { SupabaseClient } from '@supabase/supabase-js'
import { type CatalogService, fail } from '../catalogService'

type BusinessMethods = Pick<CatalogService, 'requestModel' | 'cancelModelRequest'>

export function createSupabaseModelRequestsBusiness(_sb: SupabaseClient, _notify: () => void): BusinessMethods {
  return {
    requestModel: async () => fail('UNSUPPORTED', 'Not available yet.'),
    cancelModelRequest: async () => fail('UNSUPPORTED', 'Not available yet.'),
  }
}

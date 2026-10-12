// Backend swap point (design/05, design/19). Components import `service` from here and never a concrete implementation.
import { backend } from './backend'
import { type CatalogService, fail } from './catalogService'
import { mockCatalogService } from './mock/mockCatalogService'
import { type AuthService, createSupabaseAuthService } from './supabase/auth'
import { getSupabaseClient } from './supabase/client'
import { createSupabaseCatalogService } from './supabase/supabaseCatalogService'

/** Every call fails with the configuration problem, so a half-configured app never shows fake data. */
export function unavailableService(problem: string): CatalogService {
  return new Proxy({} as CatalogService, {
    get: (_, key) => (key === 'subscribe' ? () => () => {} : async () => fail('CONFIG', problem)),
  })
}

export function selectService(config = backend): CatalogService {
  if (config.mode === 'demo') return mockCatalogService
  if (config.mode === 'supabase') return createSupabaseCatalogService(getSupabaseClient(config))
  return unavailableService(config.problem)
}

// Compared as a literal so Vite folds it at build time: demo builds don't ship supabase-js.
const SUPABASE_BUILD = import.meta.env.VITE_DATA_MODE === 'supabase'

export const service: CatalogService = SUPABASE_BUILD
  ? selectService()
  : backend.mode === 'demo'
    ? mockCatalogService
    : unavailableService(backend.mode === 'misconfigured' ? backend.problem : 'Unknown backend configuration.')

/** Real authentication; null in demo mode, where the mock account picker is used instead. */
export const auth: AuthService | null = SUPABASE_BUILD && backend.mode === 'supabase' ? createSupabaseAuthService(getSupabaseClient(backend)) : null

export { backend, isDemoMode } from './backend'
export type { AuthService, SignedInAccount } from './supabase/auth'
export type { CatalogService, Result, ServiceError, BusinessInput, ProductInput, ProductQuery } from './catalogService'

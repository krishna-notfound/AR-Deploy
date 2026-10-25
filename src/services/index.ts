// Backend swap point (design/05, design/19). Components import `service` from here and never a concrete implementation.
import type { AccountService } from './accountService'
import { backend } from './backend'
import { type CatalogService, fail } from './catalogService'
import { mockAccountService } from './mock/mockAccount'
import { mockCatalogService } from './mock/mockCatalogService'
import { type AuthService, createSupabaseAuthService } from './supabase/auth'
import { getSupabaseClient } from './supabase/client'
import { createSupabaseAccount } from './supabase/supabaseAccount'
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

/** Every account call fails with the configuration problem (never demo data in a half-configured Supabase build). */
function unavailableAccount(problem: string): AccountService {
  return new Proxy({} as AccountService, { get: () => async () => fail('CONFIG', problem) })
}

/** Account settings, security and 2FA (S1). Demo: an in-memory test harness labelled Demo in the UI. */
export const account: AccountService = SUPABASE_BUILD
  ? backend.mode === 'supabase'
    ? createSupabaseAccount(getSupabaseClient(backend))
    : unavailableAccount(backend.mode === 'misconfigured' ? backend.problem : 'Unknown backend configuration.')
  : backend.mode === 'demo'
    ? mockAccountService
    : unavailableAccount(backend.mode === 'misconfigured' ? backend.problem : 'Unknown backend configuration.')

export { backend, isDemoMode } from './backend'
export type { AccountService, ProfilePatch } from './accountService'
export { ACCOUNT_ERRORS, AVATAR_MAX_BYTES, DISPLAY_NAME_MAX, PASSWORD_MAX, PASSWORD_MIN } from './accountService'
export type { ActionPurpose, ClosureRequest, DateFormatPref, PlatformSettings, Profile, SecurityEvent, SecurityState, SettingsSection, TotpEnrollment } from '@/domain/types'
export type { AuthError, AuthResult, AuthService, SignedInAccount } from './supabase/auth'
export type { CatalogService, Result, ServiceError, BusinessInput, ProductInput, ProductQuery } from './catalogService'

// Demo-mode helpers the UI needs (failure injection, sample-data credits, store notices), re-exported here so
// components never import services/mock/* directly.
export { FAIL_RATE_KEY } from './mock/mockCatalogService'
export { MODEL_CREDITS, PHOTO_CREDIT } from './mock/credits'
export { store as demoStore } from './mock/store'
export { DEMO_CODE } from './mock/mockAccount'

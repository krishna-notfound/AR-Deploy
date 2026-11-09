// The admin-managed product categories and currencies service (ADR-0055), chosen like the others in index.ts. It lives in its own
// module, and the hooks import it from here, so the many pages that read category names do not depend on the whole `@/services`
// barrel (tests that replace the barrel with a few functions keep working). '@/services' re-exports `lists` from here.
import { fail } from './catalogService'
import { backend } from './backend'
import type { ListsService } from './listsService'
import { mockListsService } from './mock/mockLists'
import { getSupabaseClient } from './supabase/client'
import { createSupabaseLists } from './supabase/supabaseLists'

// Compared as a literal so Vite folds it at build time: demo builds don't ship supabase-js.
const SUPABASE_BUILD = import.meta.env.VITE_DATA_MODE === 'supabase'

/** Every lists call fails with the configuration problem (never demo data in a half-configured Supabase build). */
export function unavailableLists(problem: string): ListsService {
  return new Proxy({} as ListsService, { get: (_, key) => (key === 'then' ? undefined : key === 'subscribe' ? () => () => {} : async () => fail('CONFIG', problem)) })
}

export const lists: ListsService = SUPABASE_BUILD
  ? backend.mode === 'supabase'
    ? createSupabaseLists(getSupabaseClient(backend))
    : unavailableLists(backend.mode === 'misconfigured' ? backend.problem : 'Unknown backend configuration.')
  : backend.mode === 'demo'
    ? mockListsService
    : unavailableLists(backend.mode === 'misconfigured' ? backend.problem : 'Unknown backend configuration.')

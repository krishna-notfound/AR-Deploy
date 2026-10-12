import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import type { BackendConfig } from '../backend'

let client: SupabaseClient | null = null

/** The one Supabase client for the app. Only call this in Supabase mode. */
export function getSupabaseClient(config: BackendConfig): SupabaseClient {
  if (config.mode !== 'supabase') throw new Error('Supabase is not enabled (VITE_DATA_MODE is not "supabase").')
  client ??= createClient(config.url, config.publishableKey)
  return client
}

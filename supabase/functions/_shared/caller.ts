// The caller's own database client for the 2FA gate (R-W1-1): the anon key plus the caller's access token, so the
// gated SQL helpers (caller_mfa_satisfied, platform_can, is_platform_admin, is_platform_member) see the caller's
// auth.uid() and aal. Deno only: imported by index.ts files, never by a handler.
// The Node type-check of supabase/functions (_shared/*.ts and the handlers) can't resolve Deno's npm: specifier; Deno can.
// @ts-ignore: resolved by Deno at deploy time
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import type { CallerRpc } from './gate.ts'

export function callerRpc(url: string, anonKey: string, token: string): CallerRpc {
  const caller = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  return async (fn, args) => {
    const { data, error } = await caller.rpc(fn, args)
    // The function name and Postgres code only: no token, and no message that could quote arguments.
    if (error) throw new Error(`${fn} failed: ${error.code ?? 'unknown'}`)
    return data as unknown
  }
}

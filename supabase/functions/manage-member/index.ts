// Supabase Edge Function: change a member's role, deactivate, reactivate or revoke an invitation (ADR-0029).
// JWT verification stays on (supabase/config.toml). The SQL functions run with the caller's own token, so the
// database checks the Owner; the service role is used only to sign a deactivated member out.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { CORS_HEADERS, serviceKeyFrom } from '../_shared/http.ts'
import { handleManageMember } from './handler.ts'

const env = (n: string) => Deno.env.get(n)
const url = env('SUPABASE_URL') ?? ''
const admin = createClient(url, serviceKeyFrom(env), { auth: { persistSession: false, autoRefreshToken: false } })

Deno.serve((req) =>
  handleManageMember(req, {
    async userIdFromToken(token) {
      const { data, error } = await admin.auth.getUser(token)
      return error ? null : (data.user?.id ?? null)
    },
    async rpcAsCaller(token, fn, args) {
      const caller = createClient(url, env('SUPABASE_ANON_KEY') ?? '', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const { data, error } = await caller.rpc(fn, args)
      if (error) throw new Error(`${fn} failed: ${error.message}`)
      return data as { ok: true } | { error: string }
    },
    async signOutUser(userId) {
      // Ends every session of that user (refresh tokens revoked; access tokens expire within the JWT lifetime,
      // and RLS already refuses a deactivated member on every request). auth.admin.signOut needs the user's own JWT.
      const { error } = await admin.rpc('service_end_sessions', { p_user: userId })
      if (error) throw new Error(`sign-out failed: ${error.message}`)
    },
  }).catch((e) => {
    console.error(`manage-member: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }),
)

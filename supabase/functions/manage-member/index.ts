// Supabase Edge Function: change a member's role, deactivate, reactivate, remove or revoke an invitation (ADR-0029).
// JWT verification stays on (supabase/config.toml). The SQL functions run with the caller's own token, so the
// database checks the Owner; the service role is used only to sign a deactivated member out and to delete a removed
// member's unused login.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { callerRpc } from '../_shared/caller.ts'
import { gateCaller } from '../_shared/gate.ts'
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
    // 2FA first, then the platform Owner (R-W1-1, spec §10.3); the SQL functions check the Owner again.
    gate: (token) => gateCaller(callerRpc(url, env('SUPABASE_ANON_KEY') ?? '', token), 'owner'),
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
    async deleteLoginIfUnused(userId) {
      // A removed member's login stays when it still owns a business or is the Owner's (S1.5 R-W6-1).
      const [biz, owner] = await Promise.all([
        admin.from('business_members').select('user_id').eq('user_id', userId).limit(1),
        admin.from('platform_admins').select('user_id').eq('user_id', userId).limit(1),
      ])
      if (biz.error || owner.error) throw new Error('login lookup failed')
      if (biz.data.length || owner.data.length) return false
      const ended = await admin.rpc('service_end_sessions', { p_user: userId })
      if (ended.error) throw new Error(`sign-out failed: ${ended.error.message}`)
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) throw new Error(`delete login failed: ${error.message}`)
      return true
    },
  }).catch((e) => {
    console.error(`manage-member: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }),
)

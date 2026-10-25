// Supabase Edge Function: the /join page's backend (ADR-0030). JWT verification is off (supabase/config.toml):
// inspect and create are public (the link secret is the credential), and accept checks the caller's JWT itself.
// Uses the service role for the service_* functions and to create the login.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { CORS_HEADERS, serviceKeyFrom } from '../_shared/http.ts'
import { type AcceptCode, type Inspection, handleAcceptMemberInvite } from './handler.ts'

const env = (n: string) => Deno.env.get(n)
const admin = createClient(env('SUPABASE_URL') ?? '', serviceKeyFrom(env), { auth: { persistSession: false, autoRefreshToken: false } })

// Per-instance limit: 20 requests per IP per 5 minutes. The 256-bit secret already makes guessing infeasible; this
// only slows down noise, so an in-memory window (reset when the instance restarts) is enough.
const WINDOW_MS = 5 * 60_000
const LIMIT = 20
const hits = new Map<string, { start: number; n: number }>()

Deno.serve((req) =>
  handleAcceptMemberInvite(req, {
    async allow(ip) {
      const now = Date.now()
      const h = hits.get(ip)
      if (!h || now - h.start > WINDOW_MS) {
        if (hits.size > 10_000) hits.clear()
        hits.set(ip, { start: now, n: 1 })
        return true
      }
      h.n += 1
      return h.n <= LIMIT
    },
    async inspect(tokenHash) {
      const { data, error } = await admin.rpc('service_inspect_invite', { p_token_hash: tokenHash })
      if (error) throw new Error(`inspect failed: ${error.code ?? 'unknown'}`)
      return data as Inspection
    },
    async createUser({ email, password, fullName }) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: fullName } })
      if (!error && data.user) return { ok: true, userId: data.user.id }
      const code = (error as { code?: string } | null)?.code ?? ''
      if (code === 'email_exists' || /already (been )?registered/i.test(error?.message ?? '')) return { ok: false, error: 'exists', message: 'exists' }
      if (code === 'weak_password' || /password/i.test(error?.message ?? '')) return { ok: false, error: 'weak_password', message: (error?.message ?? 'Choose a stronger password.').slice(0, 200) }
      throw new Error(`create user failed: ${code || 'unknown'}`)
    },
    async accept(tokenHash, userId, fullName) {
      const { data, error } = await admin.rpc('service_accept_invite', { p_token_hash: tokenHash, p_user: userId, p_full_name: fullName ?? null })
      if (error) throw new Error(`accept failed: ${error.code ?? 'unknown'}`)
      return data as AcceptCode
    },
    async userFromToken(token) {
      if (!token) return null
      const { data, error } = await admin.auth.getUser(token)
      return error || !data.user ? null : { id: data.user.id }
    },
  }).catch((e) => {
    console.error(`accept-member-invite: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }),
)

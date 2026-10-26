// Supabase Edge Function: platform team invitations (ADR-0029, ADR-0030). JWT verification stays on
// (supabase/config.toml); the handler re-checks the Owner through the 2FA gate (R-W1-1, caller_mfa_satisfied() then
// is_platform_admin() with the caller's own token), and admin_invite_member runs with that token so the database checks again. The service role is used only for the service_* functions and the email log.
// Secrets: RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL, EMAIL_TEST_RECIPIENTS (design/23-email.md).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { callerRpc } from '../_shared/caller.ts'
import { logRow, readEmailConfig } from '../_shared/email.ts'
import { gateCaller } from '../_shared/gate.ts'
import { CORS_HEADERS, serviceKeyFrom } from '../_shared/http.ts'
import { handleInviteMember } from './handler.ts'

const env = (n: string) => Deno.env.get(n)
const url = env('SUPABASE_URL') ?? ''
const admin = createClient(url, serviceKeyFrom(env), { auth: { persistSession: false, autoRefreshToken: false } })
const asCaller = (token: string) =>
  createClient(url, env('SUPABASE_ANON_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

Deno.serve((req) =>
  handleInviteMember(req, {
    config: readEmailConfig(env),
    fetch,
    async userIdFromToken(token) {
      const { data, error } = await admin.auth.getUser(token)
      return error ? null : (data.user?.id ?? null)
    },
    gate: (token) => gateCaller(callerRpc(url, env('SUPABASE_ANON_KEY') ?? '', token), 'owner'),
    async inviteMember(token, email, role) {
      const { data, error } = await asCaller(token).rpc('admin_invite_member', { p_email: email, p_role: role })
      if (error) throw new Error(`invite failed: ${error.message}`)
      return data as { ok: true; memberId: string } | { error: string }
    },
    async getMember(id) {
      const { data, error } = await admin.from('platform_members').select('id, email, role, status').eq('id', id).maybeSingle()
      if (error) throw new Error(`member lookup failed: ${error.message}`)
      return data
    },
    async createInvite(memberId, tokenHash, expiresAt, actorId) {
      const { data, error } = await admin.rpc('service_create_member_invite', {
        p_member: memberId, p_token_hash: tokenHash, p_expires_at: expiresAt, p_actor: actorId,
      })
      // The message could quote the hash; log only the code.
      if (error) throw new Error(`invite insert failed: ${error.code ?? 'unknown'}`)
      return data as { ok: true; inviteId: string } | { error: string }
    },
    async recordEmail(inviteId, ok, detail) {
      const { error } = await admin.rpc('service_record_invite_email', { p_invite: inviteId, p_ok: ok, p_detail: detail })
      if (error) throw new Error(`email record failed: ${error.message}`)
    },
    async inviterName(userId) {
      const { data } = await admin.auth.admin.getUserById(userId)
      const meta = (data.user?.user_metadata ?? {}) as { display_name?: unknown }
      return typeof meta.display_name === 'string' && meta.display_name.trim() ? meta.display_name.trim() : null
    },
    async logDenied(actorId, action) {
      await admin.rpc('service_log_access_denied', { p_actor: actorId, p_action: action })
    },
    async log(e) {
      const { data, error } = await admin.from('email_log').insert(logRow(e)).select('id').single()
      if (error) throw new Error(`email_log insert failed: ${error.message}`)
      return data.id as string
    },
  }).catch((e) => {
    console.error(`invite-member: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }),
)

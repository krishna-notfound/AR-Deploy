// Supabase Edge Function: owner invitations (ADR-0024). JWT verification stays on (supabase/config.toml) and the
// handler re-checks the caller (Owner, or a member with owners.manage). Uses the service role for auth.admin.generateLink and the service_* functions.
// Secrets: RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL, EMAIL_TEST_RECIPIENTS (design/23-email.md).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { logRow, readEmailConfig } from '../_shared/email.ts'
import { CORS_HEADERS, serviceKeyFrom } from '../_shared/http.ts'
import { handleProvisionOwner } from './handler.ts'

const env = (n: string) => Deno.env.get(n)
const admin = createClient(env('SUPABASE_URL') ?? '', serviceKeyFrom(env), { auth: { persistSession: false, autoRefreshToken: false } })

Deno.serve((req) =>
  handleProvisionOwner(req, {
    config: readEmailConfig(env),
    fetch,
    async userIdFromToken(token) {
      const { data, error } = await admin.auth.getUser(token)
      return error ? null : (data.user?.id ?? null)
    },
    async isPlatformAdmin(userId) {
      // Owners, and active Admin/Team members whose role has owners.manage (ADR-0029).
      const { data, error } = await admin.rpc('service_user_can', { p_user: userId, p_permission: 'owners.manage' })
      return !error && data === true
    },
    async isPlatformStaff(userId) {
      const [owner, member] = await Promise.all([
        admin.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
        admin.from('platform_members').select('id').eq('user_id', userId).maybeSingle(),
      ])
      if (owner.error) throw new Error(`staff lookup failed: ${owner.error.message}`)
      // Before the team-roles migration the table does not exist (42P01): only Owners are staff then.
      if (member.error && member.error.code !== '42P01' && member.error.code !== 'PGRST205') throw new Error(`staff lookup failed: ${member.error.message}`)
      return !!owner.data || !!member.data
    },
    async getBusiness(id) {
      const { data, error } = await admin.from('businesses').select('id, name').eq('id', id).maybeSingle()
      if (error) throw new Error(`business lookup failed: ${error.message}`)
      return data
    },
    async getOwner(businessId) {
      const m = await admin.from('business_members').select('user_id, accepted_at').eq('business_id', businessId).maybeSingle()
      if (m.error) throw new Error(`owner lookup failed: ${m.error.message}`)
      if (!m.data) return null
      const u = await admin.auth.admin.getUserById(m.data.user_id)
      if (u.error) throw new Error(`owner lookup failed: ${u.error.message}`)
      return { userId: m.data.user_id, email: u.data.user.email ?? '', acceptedAt: m.data.accepted_at }
    },
    async accountByEmail(email) {
      const { data, error } = await admin.rpc('service_user_id_by_email', { p_email: email })
      if (error) throw new Error(`user lookup failed: ${error.message}`)
      const id = (data as string | null) ?? null
      if (!id) return null
      const u = await admin.auth.admin.getUserById(id)
      if (u.error) throw new Error(`user lookup failed: ${u.error.message}`)
      const m = await admin.from('business_members').select('id', { count: 'exact', head: true }).eq('user_id', id)
      if (m.error) throw new Error(`membership lookup failed: ${m.error.message}`)
      return { id, invited: !!u.data.user.invited_at, ownsBusiness: (m.count ?? 0) > 0 }
    },
    async generateCode(type, email) {
      // Only the one-time code is used (ADR-0027); the action link Supabase also returns is discarded.
      const { data, error } = await admin.auth.admin.generateLink({ type, email })
      if (error || !data.properties?.email_otp || !data.user) return { ok: false, error: error?.message ?? 'no_code' }
      return { ok: true, code: data.properties.email_otp, userId: data.user.id }
    },
    async linkOwner(businessId, userId, actorId, applicationId) {
      const { data, error } = await admin.rpc('service_link_owner', { p_business_id: businessId, p_user_id: userId, p_actor: actorId, p_application_id: applicationId })
      if (error?.message.includes('business_has_owner')) return 'business_has_owner'
      if (error) throw new Error(`link failed: ${error.message}`)
      return data as 'linked' | 'already_linked'
    },
    async invitationAttempts(businessId) {
      const { data, count, error } = await admin
        .from('email_log')
        .select('created_at', { count: 'exact' })
        .eq('workflow', `invite:${businessId}`)
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) throw new Error(`attempt lookup failed: ${error.message}`)
      return { count: count ?? 0, lastAt: data?.[0]?.created_at ?? null }
    },
    async audit(e) {
      const { error } = await admin.from('audit_events').insert({
        event_type: e.eventType,
        actor_id: e.actorId,
        business_id: e.businessId,
        application_id: e.applicationId ?? null,
        metadata: e.metadata ?? {},
      })
      if (error) throw new Error(`audit insert failed: ${error.message}`)
    },
    async log(e) {
      const { data, error } = await admin.from('email_log').insert(logRow(e)).select('id').single()
      if (error) throw new Error(`email_log insert failed: ${error.message}`)
      return data.id as string
    },
  }).catch((e) => {
    console.error(`provision-owner: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }),
)

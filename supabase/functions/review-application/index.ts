// Supabase Edge Function: application review (R-W2-1). JWT verification stays on (supabase/config.toml) and the handler
// re-checks the caller through the 2FA gate (R-W1-1). admin_review_application runs with the caller's own token, so
// the gated per-action permission stays in SQL; the service role only reads the applicant and writes email_log.
// Secrets: RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL, EMAIL_TEST_RECIPIENTS (design/23-email.md).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { callerRpc } from '../_shared/caller.ts'
import { logRow, readEmailConfig } from '../_shared/email.ts'
import { gateCaller } from '../_shared/gate.ts'
import { CORS_HEADERS, serviceKeyFrom } from '../_shared/http.ts'
import { handleReviewApplication } from './handler.ts'

const env = (n: string) => Deno.env.get(n)
const url = env('SUPABASE_URL') ?? ''
const anonKey = env('SUPABASE_ANON_KEY') ?? ''
const admin = createClient(url, serviceKeyFrom(env), { auth: { persistSession: false, autoRefreshToken: false } })

/** admin_review_application's refusals, by the message it raises; everything else is a 500. */
const KNOWN = new Set(['reason_required', 'invalid_transition', 'reopen_not_allowed', 'application_not_found'])

Deno.serve((req) =>
  handleReviewApplication(req, {
    config: readEmailConfig(env),
    fetch,
    async userIdFromToken(token) {
      const { data, error } = await admin.auth.getUser(token)
      return error ? null : (data.user?.id ?? null)
    },
    gate: (token) => gateCaller(callerRpc(url, anonKey, token), 'staff'),
    async reviewAsCaller(token, applicationId, action, reason) {
      const caller = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const { data, error } = await caller.rpc('admin_review_application', { p_application_id: applicationId, p_action: action, p_reason: reason })
      if (error) {
        if (KNOWN.has(error.message)) return { error: error.message }
        // platform_admin_only (42501): the gated permission check for this action said no.
        if (error.code === '42501') return { error: 'forbidden' }
        throw new Error(`admin_review_application failed: ${error.code ?? 'unknown'}`)
      }
      const row = data as { status: string; business_id: string | null }
      return row.business_id ? { ok: true, status: row.status, businessId: row.business_id } : { ok: true, status: row.status }
    },
    async getApplicant(applicationId) {
      const { data, error } = await admin
        .from('business_applications')
        .select('business_name, applicant_email, language, status')
        .eq('id', applicationId)
        .maybeSingle()
      if (error) throw new Error(`application lookup failed: ${error.code ?? 'unknown'}`)
      if (!data) return null
      return { businessName: data.business_name, email: data.applicant_email, language: data.language === 'pt' ? 'pt' : 'en', status: data.status }
    },
    async log(e) {
      const { data, error } = await admin.from('email_log').insert(logRow(e)).select('id').single()
      if (error) throw new Error(`email_log insert failed: ${error.code ?? 'unknown'}`)
      return data.id as string
    },
  }).catch((e) => {
    console.error(`review-application: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }),
)

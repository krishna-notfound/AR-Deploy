// Supabase Edge Function: 3D model request handling (S4 R-S4-15). JWT verification stays on (supabase/config.toml) and
// the handler re-checks the caller through the 2FA gate (R-W1-1, permission models.manage). The admin_*_model_request
// functions run with the caller's own token, so the audit actor and the database checks stay the caller's; the service
// role only reads the request, the owner and email_log, and writes email_log.
// Secrets: RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL, EMAIL_TEST_RECIPIENTS (design/23-email.md).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { callerRpc } from '../_shared/caller.ts'
import { logRow, readEmailConfig } from '../_shared/email.ts'
import { gateCaller } from '../_shared/gate.ts'
import { CORS_HEADERS, serviceKeyFrom } from '../_shared/http.ts'
import { ownerRecipient } from '../_shared/owner.ts'
import { handleReviewModelRequest } from './handler.ts'

const env = (n: string) => Deno.env.get(n)
const url = env('SUPABASE_URL') ?? ''
const anonKey = env('SUPABASE_ANON_KEY') ?? ''
const admin = createClient(url, serviceKeyFrom(env), { auth: { persistSession: false, autoRefreshToken: false } })

/** The admin_*_model_request refusals, by the message they raise; everything else is a 500. */
const KNOWN = new Set(['reason_required', 'invalid_transition', 'model_request_needs_glb', 'model_request_not_found', 'aal2_required', 'forbidden'])

type Name = { en?: unknown; pt?: unknown }
const localized = (v: unknown): { en: string; pt?: string } => {
  const n = (v ?? {}) as Name
  return { en: typeof n.en === 'string' ? n.en : '', ...(typeof n.pt === 'string' && n.pt ? { pt: n.pt } : {}) }
}
const first = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

Deno.serve((req) =>
  handleReviewModelRequest(req, {
    config: readEmailConfig(env),
    fetch,
    async userIdFromToken(token) {
      const { data, error } = await admin.auth.getUser(token)
      return error ? null : (data.user?.id ?? null)
    },
    gate: (token) => gateCaller(callerRpc(url, anonKey, token), { permission: 'models.manage' }),
    async actAsCaller(token, requestId, action, reason) {
      const caller = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const call =
        action === 'start'
          ? caller.rpc('admin_start_model_request', { p_request: requestId })
          : action === 'deliver'
            ? caller.rpc('admin_deliver_model_request', { p_request: requestId })
            : caller.rpc('admin_reject_model_request', { p_request: requestId, p_reason: reason })
      const { data, error } = await call
      if (error) {
        if (KNOWN.has(error.message)) return { error: error.message }
        // 42501 without a known key: the gated permission check said no.
        if (error.code === '42501') return { error: 'forbidden' }
        throw new Error(`admin_${action}_model_request failed: ${error.code ?? 'unknown'}`)
      }
      const row = data as { status: string; replaced_paths?: string[]; staged_paths?: string[]; product_status?: string }
      return {
        ok: true,
        status: row.status,
        ...(row.replaced_paths ? { replacedPaths: row.replaced_paths } : {}),
        ...(row.staged_paths ? { stagedPaths: row.staged_paths } : {}),
        ...(row.product_status ? { productStatus: row.product_status } : {}),
      }
    },
    async currentStatus(requestId) {
      const { data, error } = await admin.from('model_requests').select('status').eq('id', requestId).maybeSingle()
      if (error) throw new Error(`request lookup failed: ${error.code ?? 'unknown'}`)
      return data?.status ?? null
    },
    async emailContext(requestId) {
      const { data, error } = await admin
        .from('model_requests')
        .select('business_id, reason, products(name, status), product_variants(name)')
        .eq('id', requestId)
        .maybeSingle()
      if (error) throw new Error(`request lookup failed: ${error.code ?? 'unknown'}`)
      if (!data) return null
      const product = first(data.products as { name: unknown; status: string } | { name: unknown; status: string }[] | null)
      const option = first(data.product_variants as { name: unknown } | { name: unknown }[] | null)
      const owner = await ownerRecipient(admin, data.business_id)
      return {
        businessId: data.business_id,
        recipient: owner ? { email: owner.email, language: owner.language } : null,
        productName: localized(product?.name),
        ...(option ? { optionName: localized(option.name) } : {}),
        productStatus: product?.status ?? 'draft',
        ...(data.reason ? { reason: data.reason } : {}),
      }
    },
    async alreadySent(workflow) {
      const { count, error } = await admin.from('email_log').select('id', { count: 'exact', head: true }).eq('workflow', workflow)
      if (error) throw new Error(`email_log lookup failed: ${error.code ?? 'unknown'}`)
      return (count ?? 0) > 0
    },
    async log(e) {
      const { data, error } = await admin.from('email_log').insert(logRow(e)).select('id').single()
      if (error) throw new Error(`email_log insert failed: ${error.code ?? 'unknown'}`)
      return data.id as string
    },
  }).catch((e) => {
    console.error(`review-model-request: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }),
)

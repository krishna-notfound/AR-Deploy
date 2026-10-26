// Supabase Edge Function: owner notices for platform-team changes (R-W7-2). JWT verification stays on
// (supabase/config.toml) and the handler re-checks the caller through the 2FA gate (R-W1-1), staff only. The service
// role reads the caller's audit rows, the owner's address and language, and writes email_log.
// Secrets: RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL, EMAIL_TEST_RECIPIENTS (design/23-email.md).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { callerRpc } from '../_shared/caller.ts'
import { logRow, readEmailConfig } from '../_shared/email.ts'
import { gateCaller } from '../_shared/gate.ts'
import { CORS_HEADERS, serviceKeyFrom } from '../_shared/http.ts'
import { ownerRecipient } from '../_shared/owner.ts'
import { STAFF_LABELS, handleNotifyBusinessOwner } from './handler.ts'

const env = (n: string) => Deno.env.get(n)
const url = env('SUPABASE_URL') ?? ''
const anonKey = env('SUPABASE_ANON_KEY') ?? ''
const admin = createClient(url, serviceKeyFrom(env), { auth: { persistSession: false, autoRefreshToken: false } })

type AuditRow = { id: string; event_type: string; to_status: string | null; metadata: Record<string, unknown> | null }

Deno.serve((req) =>
  handleNotifyBusinessOwner(req, {
    config: readEmailConfig(env),
    fetch,
    async userIdFromToken(token) {
      const { data, error } = await admin.auth.getUser(token)
      return error ? null : (data.user?.id ?? null)
    },
    gate: (token) => gateCaller(callerRpc(url, anonKey, token), 'staff'),
    async recentRows(businessId, actorId, sinceIso) {
      const { data, error } = await admin
        .from('audit_events')
        .select('id, event_type, to_status, metadata')
        .eq('business_id', businessId)
        .eq('actor_id', actorId)
        .gte('created_at', sinceIso)
        .or('event_type.in.(product_unpublished,product_deleted),and(event_type.eq.business_status_changed,to_status.in.(active,inactive))')
        .in('metadata->>actor_label', [...STAFF_LABELS])
        .order('created_at', { ascending: true })
        .limit(50)
      if (error) throw new Error(`audit lookup failed: ${error.code ?? 'unknown'}`)
      return ((data ?? []) as AuditRow[]).map((r) => ({ id: r.id, eventType: r.event_type, metadata: { ...(r.metadata ?? {}), to_status: r.to_status } }))
    },
    recipient: (businessId) => ownerRecipient(admin, businessId),
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
    console.error(`notify-business-owner: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }),
)

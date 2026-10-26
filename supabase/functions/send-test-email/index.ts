// Supabase Edge Function: admin-only email test (design/23-email.md). JWT verification stays on
// (supabase/config.toml), and the handler re-checks the caller through the 2FA gate (R-W1-1): caller_mfa_satisfied()
// then is_platform_admin(), with the caller's own token.
// Secrets (set with `npx supabase secrets set`, never in VITE_ variables): RESEND_API_KEY, EMAIL_FROM,
// APP_BASE_URL, EMAIL_TEST_RECIPIENTS, ADMIN_NOTIFICATION_EMAIL.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { callerRpc } from '../_shared/caller.ts'
import { readEmailConfig } from '../_shared/email.ts'
import { gateCaller } from '../_shared/gate.ts'
import { CORS_HEADERS } from '../_shared/http.ts'
import { handleTestEmail } from './handler.ts'

function serviceKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (keys) return (JSON.parse(keys) as Record<string, string>)['default'] ?? ''
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

const url = Deno.env.get('SUPABASE_URL') ?? ''
const admin = createClient(url, serviceKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
})

Deno.serve((req) =>
  handleTestEmail(req, {
    config: readEmailConfig((n) => Deno.env.get(n)),
    fetch,
    async userIdFromToken(token) {
      const { data, error } = await admin.auth.getUser(token)
      return error ? null : (data.user?.id ?? null)
    },
    gate: (token) => gateCaller(callerRpc(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', token), 'owner'),
    async log(e) {
      const { data, error } = await admin
        .from('email_log')
        .insert({
          kind: e.kind,
          recipient: e.recipient,
          subject: e.subject,
          status: e.status,
          provider_message_id: e.providerMessageId ?? null,
          error: e.error ?? null,
          business_id: e.businessId ?? null,
          triggered_by: e.triggeredBy ?? null,
        })
        .select('id')
        .single()
      if (error) throw new Error(`email_log insert failed: ${error.message}`)
      return data.id as string
    },
    async updateStatus(providerMessageId, status) {
      const { error } = await admin.from('email_log').update({ status, updated_at: new Date().toISOString() }).eq('provider_message_id', providerMessageId)
      if (error) throw new Error(`email_log update failed: ${error.message}`)
    },
  }).catch((e) => {
    // A gate RPC or database failure: 500 unknown, as in the other functions (no token or secret in the log line).
    console.error(`send-test-email: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }),
)

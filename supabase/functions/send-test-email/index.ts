// Supabase Edge Function: admin-only email test (design/23-email.md). JWT verification stays on
// (supabase/config.toml), and the handler re-checks that the caller is a platform admin.
// Secrets (set with `npx supabase secrets set`, never in VITE_ variables): RESEND_API_KEY, EMAIL_FROM,
// APP_BASE_URL, EMAIL_TEST_RECIPIENTS, ADMIN_NOTIFICATION_EMAIL.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { readEmailConfig } from '../_shared/email.ts'
import { handleTestEmail } from './handler.ts'

function serviceKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (keys) return (JSON.parse(keys) as Record<string, string>)['default'] ?? ''
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey(), {
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
    async isPlatformAdmin(userId) {
      const { data, error } = await admin.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle()
      return !error && !!data
    },
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
  }),
)

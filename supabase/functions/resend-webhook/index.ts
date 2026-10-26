// Supabase Edge Function: Resend delivery events (design/23-email.md). verify_jwt is off because Resend cannot send
// a Supabase JWT; the svix signature (secret RESEND_WEBHOOK_SECRET) is the authentication instead.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { serviceKeyFrom } from '../_shared/http.ts'
import { handleResendWebhook } from './handler.ts'

const env = (n: string) => Deno.env.get(n)
const admin = createClient(env('SUPABASE_URL') ?? '', serviceKeyFrom(env), { auth: { persistSession: false, autoRefreshToken: false } })

Deno.serve((req) =>
  handleResendWebhook(req, {
    secret: env('RESEND_WEBHOOK_SECRET') ?? '',
    async record(svixId, providerMessageId, eventType, reason) {
      const { data, error } = await admin.rpc('service_record_email_event', { p_svix_id: svixId, p_provider_message_id: providerMessageId, p_event_type: eventType, p_error: reason ?? null })
      if (error) throw new Error(`record failed: ${error.message}`)
      return data === true
    },
  }).catch((e) => {
    // 500 makes Resend retry later, which is what we want for a transient database error.
    console.error(`resend-webhook: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }),
)

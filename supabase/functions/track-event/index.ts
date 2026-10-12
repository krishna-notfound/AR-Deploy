// Supabase Edge Function: records a public product view / AR activation through the
// rate-limited public.record_event_limited() (migration 20261012200810_analytics_rate_limit).
// Deployed with verify_jwt = false (supabase/config.toml): the endpoint is public by design and
// browsers send the publishable key, which is not a JWT. Protection = validation + rate limit.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { handleTrackEvent, type RecordResult } from './handler.ts'

// Secret key stays inside the function runtime; it is never sent to browsers.
function serviceKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (keys) return (JSON.parse(keys) as Record<string, string>)['default'] ?? ''
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ANALYTICS_SALT is an optional override (set it to rotate visitor hashes independently). Without it,
// the salt is derived from the server-only secret key, which never leaves this runtime.
const salt = Deno.env.get('ANALYTICS_SALT') || (serviceKey() ? `derived-from-secret-key:${serviceKey()}` : '')

Deno.serve((req) =>
  handleTrackEvent(req, {
    salt,
    async record({ visitorKey, productId, businessId, eventType }) {
      const { data, error } = await supabase.rpc('record_event_limited', {
        p_visitor_key: visitorKey,
        p_product_id: productId,
        p_business_id: businessId,
        p_event_type: eventType,
      })
      if (error) throw new Error(error.message)
      return data as RecordResult
    },
  }),
)

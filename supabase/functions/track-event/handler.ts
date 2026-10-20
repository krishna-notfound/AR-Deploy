// Request handling for the track-event Edge Function. Web-standard APIs only (no Deno globals),
// so it runs under Deno in production and under Vitest in tests.

export type RecordResult = 'recorded' | 'rate_limited' | 'invalid'

export interface TrackEventDeps {
  /** Calls public.record_event_limited with the service role. Throws on transport/DB errors. */
  record(args: { visitorKey: string; productId: string; businessId: string; eventType: string }): Promise<RecordResult>
  /** Secret mixed into the visitor hash (Edge Function secret ANALYTICS_SALT). */
  salt: string
  now?: () => Date
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EVENT_TYPES = new Set(['view', 'ar_activation', 'model_interaction'])
const MAX_BODY_BYTES = 1024

// Public endpoint (catalog subdomains and the apex both call it); no cookies or credentials involved.
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Max-Age': '86400',
}

const reply = (status: number, body?: Record<string, string>) =>
  new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: body ? { ...CORS_HEADERS, 'Content-Type': 'application/json' } : CORS_HEADERS,
  })

/** First address in X-Forwarded-For (set by the Supabase edge), else 'unknown'. Never stored. */
export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

/**
 * The part of an address that identifies one connection: IPv4 as is, IPv6 by its /64 prefix. A single home or
 * phone connection owns a whole /64, so hashing full IPv6 addresses would give one visitor unlimited keys (OWN-04).
 */
export function visitorNetwork(ip: string): string {
  if (!ip.includes(':')) return ip
  const [head = '', tail = ''] = ip.toLowerCase().split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups = ip.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`
}

/** SHA-256 hex of network|utc-date|salt. Changes daily; the raw IP cannot be recovered without the salt. */
export async function visitorKey(ip: string, salt: string, now: Date): Promise<string> {
  const data = new TextEncoder().encode(`${visitorNetwork(ip)}|${now.toISOString().slice(0, 10)}|${salt}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function handleTrackEvent(req: Request, deps: TrackEventDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  if (!deps.salt) return reply(500, { error: 'not_configured' })

  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) return reply(413, { error: 'too_large' })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return reply(400, { error: 'invalid_json' })
  }
  const { productId, businessId, type } = (body ?? {}) as Record<string, unknown>
  if (typeof productId !== 'string' || !UUID.test(productId) || typeof businessId !== 'string' || !UUID.test(businessId) || typeof type !== 'string' || !EVENT_TYPES.has(type)) {
    return reply(400, { error: 'invalid_event' })
  }

  const key = await visitorKey(clientIp(req), deps.salt, (deps.now ?? (() => new Date()))())
  let result: RecordResult
  try {
    result = await deps.record({ visitorKey: key, productId, businessId, eventType: type })
  } catch {
    return reply(500, { error: 'record_failed' })
  }
  if (result === 'recorded') return reply(204)
  if (result === 'rate_limited') return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Retry-After': '60' } })
  return reply(422, { error: 'not_recordable' })
}

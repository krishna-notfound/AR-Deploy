// Small request/response helpers shared by the Edge Functions. Web-standard APIs only (runs under Deno and Vitest).

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

export const reply = (status: number, body?: Record<string, unknown>) =>
  new Response(body ? JSON.stringify(body) : null, { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })

export const bearerToken = (req: Request) => req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? ''

/** First address in X-Forwarded-For (set by the Supabase edge), else 'unknown'. Never stored. */
export const clientIp = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Parses a JSON object body of at most maxBytes; null when too large, not JSON, or not an object. */
export async function readJsonObject(req: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
  const raw = await req.text()
  if (new TextEncoder().encode(raw).length > maxBytes) return null
  try {
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Service-role key inside an Edge Function (new secret-key format first, legacy JWT second). Deno only. */
export function serviceKeyFrom(env: (name: string) => string | undefined): string {
  const keys = env('SUPABASE_SECRET_KEYS')
  if (keys) {
    try {
      const k = (JSON.parse(keys) as Record<string, string>)['default']
      if (k) return k
    } catch {
      // fall through to the legacy key
    }
  }
  return env('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

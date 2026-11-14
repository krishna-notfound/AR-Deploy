// Small request/response helpers shared by the Edge Functions. Web-standard APIs only (runs under Deno and Vitest).

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

export const reply = (status: number, body?: Record<string, unknown>) =>
  new Response(body ? JSON.stringify(body) : null, { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })

export const bearerToken = (req: Request) => req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? ''

/**
 * The caller's address, else 'unknown'. Order: cf-connecting-ip (set by Cloudflare in front of the Supabase edge, which
 * replaces any value a client sends), x-real-ip, then the first X-Forwarded-For entry. The first X-Forwarded-For entry is
 * client-controlled (a caller can send any value and a proxy appends to it), so it is only the last resort: it keeps the
 * limiter working if the platform headers are ever absent, but it is then a hint, never proof. Which of these headers the
 * live edge really sets is unverified from here (docs/qa/2026-11-14-edge-functions.md). The application limiters
 * (submit-application, application-upload) hash it with a salt; account-security stores it with account events.
 */
export const clientIp = (req: Request) =>
  req.headers.get('cf-connecting-ip')?.trim() ||
  req.headers.get('x-real-ip')?.trim() ||
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  'unknown'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Reads the body as text, at most maxBytes; null when it is larger. A declared Content-Length over the limit is refused
 * before anything is read, and the stream is cancelled as soon as the bytes read pass the limit, so an oversized body is
 * never held in memory whole.
 */
async function readLimitedText(req: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) return null
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const all = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder().decode(all)
}

/** Parses a JSON object body of at most maxBytes; null when too large, not JSON, or not an object. */
export async function readJsonObject(req: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
  const raw = await readLimitedText(req, maxBytes)
  if (raw === null) return null
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

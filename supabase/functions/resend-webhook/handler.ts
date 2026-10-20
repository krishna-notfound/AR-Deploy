// Request handling for the resend-webhook Edge Function (design/23-email.md). Resend signs every delivery with
// svix headers; unsigned, stale or tampered requests are refused. Each svix-id is processed once
// (service_record_email_event), so redeliveries are harmless, and an email_log status only ever moves forward.
import { readJsonObject, reply } from '../_shared/http.ts'

export const TOLERANCE_SECONDS = 300

export interface WebhookDeps {
  /** RESEND_WEBHOOK_SECRET, "whsec_<base64>". */
  secret: string
  now?: () => Date
  /** Returns false when this svix id was already processed. */
  record(svixId: string, providerMessageId: string, eventType: string): Promise<boolean>
}

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const toBase64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)))

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** svix scheme: base64(HMAC-SHA256(secret, "{id}.{timestamp}.{body}")), header "v1,<sig> v1,<sig2>". */
export async function signPayload(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', fromBase64(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toBase64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)))
}

export async function verifySignature(secret: string, headers: Headers, body: string, now: Date): Promise<boolean> {
  const id = headers.get('svix-id') ?? ''
  const ts = headers.get('svix-timestamp') ?? ''
  const sigs = headers.get('svix-signature') ?? ''
  if (!id || !/^\d{1,12}$/.test(ts) || !sigs) return false
  if (Math.abs(now.getTime() / 1000 - Number(ts)) > TOLERANCE_SECONDS) return false
  let expected: string
  try {
    expected = await signPayload(secret, id, ts, body)
  } catch {
    return false
  }
  return sigs.split(' ').some((part) => {
    const [version, sig] = part.split(',')
    return version === 'v1' && !!sig && timingSafeEqual(sig, expected)
  })
}

export async function handleResendWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  if (!deps.secret) return reply(503, { error: 'not_configured' })
  const raw = await req.clone().text()
  if (raw.length > 64_000) return reply(413, { error: 'too_large' })
  if (!(await verifySignature(deps.secret, req.headers, raw, (deps.now ?? (() => new Date()))()))) return reply(401, { error: 'invalid_signature' })

  const body = await readJsonObject(req, 64_000)
  const type = typeof body?.type === 'string' ? body.type : ''
  const data = body?.data as { email_id?: unknown } | undefined
  const messageId = typeof data?.email_id === 'string' ? data.email_id : ''
  // Signed but not an email event we track (e.g. contact events): acknowledge so Resend stops retrying.
  if (!type.startsWith('email.') || !/^[\w-]{8,100}$/.test(messageId)) return reply(200, { processed: false, reason: 'ignored' })
  const fresh = await deps.record(req.headers.get('svix-id')!, messageId, type.slice(0, 60))
  return reply(200, { processed: fresh, ...(fresh ? {} : { reason: 'duplicate' }) })
}

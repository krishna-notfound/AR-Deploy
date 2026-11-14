// Email preferences (ADR-0078): which emails a person can switch off, the signed unsubscribe link and the gate every
// optional email passes before it is sent. Web-standard APIs only (crypto.subtle), so it runs in Edge Functions and under Vitest.
// Security codes and notices, invitations, applicant emails, closure requests and test emails are never optional.

/** The optional email types. Each one is a boolean column on public.notification_prefs (default true). */
export type EmailPrefType = 'new_application' | 'new_model_request' | 'company_updates' | 'model_request_updates' | 'business_notices'

export const EMAIL_PREF_TYPES: readonly EmailPrefType[] = ['new_application', 'new_model_request', 'company_updates', 'model_request_updates', 'business_notices']

/** The notification_prefs column behind each type. */
export const EMAIL_PREF_COLUMN: Record<EmailPrefType, string> = {
  new_application: 'email_new_application',
  new_model_request: 'email_new_model_request',
  company_updates: 'email_company_updates',
  model_request_updates: 'email_model_request_updates',
  business_notices: 'email_business_notices',
}

export const isEmailPrefType = (v: unknown): v is EmailPrefType => typeof v === 'string' && (EMAIL_PREF_TYPES as readonly string[]).includes(v)

/** Staff types are managed in the platform console settings; business owner types in the dashboard settings. */
export const emailPrefScope = (type: EmailPrefType): 'admin' | 'business' => (type === 'model_request_updates' || type === 'business_notices' ? 'business' : 'admin')

/**
 * Whether `userId` still wants this email type. A person with no notification_prefs row has everything on. Throws when the
 * read fails (the caller decides; an optional email is then not sent and the failure is logged, never guessed).
 */
export type EmailPrefReader = (userId: string, type: EmailPrefType) => Promise<boolean>

/** The gate in front of every optional email: no reader (tests, old callers) or a missing row means "send". */
export async function emailWanted(reader: EmailPrefReader | undefined, userId: string | null | undefined, type: EmailPrefType): Promise<boolean> {
  if (!reader || !userId) return true
  return reader(userId, type)
}

// ---------------------------------------------------------------------------
// The unsubscribe token: v1.<payload>.<signature>, base64url. payload = user id, type and the day it was issued;
// signature = HMAC-SHA256 over the payload with the EMAIL_UNSUBSCRIBE_SECRET Edge Function secret.
// ---------------------------------------------------------------------------

/** A link in an email stays valid for one year. */
export const UNSUBSCRIBE_TOKEN_DAYS = 365
const DAY_MS = 86_400_000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
const hmacKey = (secret: string, usage: 'sign' | 'verify') =>
  crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])

/** The day number (UTC) a date falls on. */
const dayOf = (d: Date) => Math.floor(d.getTime() / DAY_MS)

export async function signUnsubscribeToken(secret: string, userId: string, type: EmailPrefType, now: Date): Promise<string> {
  if (!secret) throw new Error('unsubscribe secret missing')
  const payload = b64url(new TextEncoder().encode(`${userId}|${type}|${dayOf(now)}`))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), new TextEncoder().encode(`v1.${payload}`))
  return `v1.${payload}.${b64url(new Uint8Array(sig))}`
}

export type TokenCheck = { ok: true; userId: string; type: EmailPrefType } | { ok: false; reason: 'invalid_token' | 'expired_token' }

/** Verifies the signature (constant time, through crypto.subtle.verify), the shape and the one-year validity. Never throws. */
export async function verifyUnsubscribeToken(secret: string, token: string, now: Date): Promise<TokenCheck> {
  try {
    if (!secret || typeof token !== 'string' || token.length > 300) return { ok: false, reason: 'invalid_token' }
    const parts = token.split('.')
    if (parts.length !== 3 || parts[0] !== 'v1') return { ok: false, reason: 'invalid_token' }
    const [, payload, sig] = parts as [string, string, string]
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), fromB64url(sig), new TextEncoder().encode(`v1.${payload}`))
    if (!valid) return { ok: false, reason: 'invalid_token' }
    const [userId, type, issued] = new TextDecoder().decode(fromB64url(payload)).split('|')
    if (!userId || !UUID_RE.test(userId) || !isEmailPrefType(type) || !/^\d{1,7}$/.test(issued ?? '')) return { ok: false, reason: 'invalid_token' }
    const age = dayOf(now) - Number(issued)
    if (age > UNSUBSCRIBE_TOKEN_DAYS) return { ok: false, reason: 'expired_token' }
    // A token dated in the future is not one we issued (clock skew of a day is tolerated).
    if (age < -1) return { ok: false, reason: 'invalid_token' }
    return { ok: true, userId, type }
  } catch {
    return { ok: false, reason: 'invalid_token' }
  }
}

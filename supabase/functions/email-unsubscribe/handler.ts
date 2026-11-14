// Request handling for the public email-unsubscribe Edge Function (ADR-0078).
//   POST ?t=<token>            → the mail provider's one-click request (List-Unsubscribe-Post: List-Unsubscribe=One-Click)
//   POST { t: <token> }        → the "Unsubscribe" button on /email/unsubscribe
//   → 200 { ok: true, type }  |  400 { error: invalid_token | expired_token }  |  429 { error: rate_limited }  |  500 { error }
// GET changes nothing (405): link scanners open every link in an email. The token is an HMAC over the person, the email
// type and the issue date (emailPrefs.ts); it can only switch that one type off, and switching it off twice is fine.
// Every attempt counts against a per-caller hourly limit under a salted daily hash of the address (like submit-application).
import { type EmailPrefType, verifyUnsubscribeToken } from '../_shared/emailPrefs.ts'
import { clientIp, readJsonObject, reply, sha256Hex } from '../_shared/http.ts'

/** Attempts per caller and hour; a person unsubscribing from every type needs five. */
export const UNSUBSCRIBES_PER_HOUR = 20

export interface UnsubscribeDeps {
  /** EMAIL_UNSUBSCRIBE_SECRET. */
  secret: string
  /** Secret mixed into the caller hash so raw addresses cannot be recovered from it. */
  salt: string
  now?: () => Date
  /** service_application_attempt: true when the attempt is allowed (and recorded). */
  allowAttempt(hashes: string[]): Promise<boolean>
  /** Sets the person's email_<type> column to false; creates their preferences row when there is none. */
  setPref(userId: string, type: EmailPrefType): Promise<void>
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10)

async function callerHashes(ip: string, salt: string, now: Date): Promise<string[]> {
  const hash = (day: string) => sha256Hex(`unsubscribe|${day}|${ip}|${salt}`)
  const today = utcDay(now)
  const hourAgo = utcDay(new Date(now.getTime() - 3600_000))
  return hourAgo === today ? [await hash(today)] : [await hash(today), await hash(hourAgo)]
}

/** The token from the query string, else from a JSON body. The one-click body (form text) carries no token. */
async function tokenOf(req: Request): Promise<string> {
  const fromQuery = new URL(req.url).searchParams.get('t')
  if (fromQuery) return fromQuery
  if (!(req.headers.get('content-type') ?? '').includes('json')) return ''
  const body = await readJsonObject(req, 1_000)
  return body && typeof body.t === 'string' ? body.t : ''
}

export async function handleEmailUnsubscribe(req: Request, deps: UnsubscribeDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  if (!deps.secret || !deps.salt) return reply(500, { error: 'not_configured' })
  const now = (deps.now ?? (() => new Date()))()
  try {
    if (!(await deps.allowAttempt(await callerHashes(clientIp(req), deps.salt, now)))) return reply(429, { error: 'rate_limited' })
    const checked = await verifyUnsubscribeToken(deps.secret, await tokenOf(req), now)
    if (!checked.ok) return reply(400, { error: checked.reason })
    await deps.setPref(checked.userId, checked.type)
    return reply(200, { ok: true, type: checked.type })
  } catch (e) {
    // Fixed codes only: database text can quote ids and addresses.
    console.error(`email-unsubscribe: ${String(e).replace(/[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+/g, '[email]').slice(0, 200)}`)
    return reply(500, { error: 'unknown' })
  }
}

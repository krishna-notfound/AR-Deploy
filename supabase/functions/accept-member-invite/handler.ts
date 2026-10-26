// Request handling for the accept-member-invite Edge Function (ADR-0030). Public: the link secret is the credential.
//   POST { action: "inspect", token }                      → what the invitation is for; uses nothing up
//   POST { action: "create", token, fullName, password }   → creates the login (email confirmed) and accepts, once;
//                                                            the password has 12 to 72 characters (R-W1-7)
//   POST { action: "accept", token } + the caller's JWT    → accepts for an existing login with the same email
// Only the SHA-256 of the secret is sent to the database. Opening the link (inspect) never consumes it, so mail
// scanners that open links cannot use an invitation up.
import { bearerToken, clientIp, readJsonObject, reply } from '../_shared/http.ts'
import { STAFF_PASSWORD_MAX, STAFF_PASSWORD_MIN, hashSecret, looksLikeSecret } from '../_shared/team.ts'

export type Inspection = { state: 'valid' | 'expired' | 'revoked' | 'used' | 'invalid'; email?: string; role?: string; invitedBy?: string; expiresAt?: string; userExists?: boolean }
export type AcceptCode = 'ok' | 'invite_invalid' | 'invite_expired' | 'invite_revoked' | 'invite_used' | 'email_mismatch' | 'business_owner'

export interface AcceptDeps {
  inspect(tokenHash: string): Promise<Inspection>
  createUser(u: { email: string; password: string; fullName: string }): Promise<{ ok: true; userId: string } | { ok: false; error: 'exists' | 'weak_password'; message: string }>
  accept(tokenHash: string, userId: string, fullName?: string): Promise<AcceptCode>
  userFromToken(token: string): Promise<{ id: string } | null>
  /** Per-IP limit (20 per 5 minutes); false when exceeded. */
  allow(ip: string): Promise<boolean>
}

const STATE_ERROR: Record<string, [number, string]> = {
  expired: [410, 'invite_expired'], revoked: [410, 'invite_revoked'], used: [410, 'invite_used'], invalid: [404, 'invite_invalid'],
}
const ACCEPT_ERROR: Record<Exclude<AcceptCode, 'ok'>, number> = {
  invite_invalid: 404, invite_expired: 410, invite_revoked: 410, invite_used: 410, email_mismatch: 403, business_owner: 409,
}

export async function handleAcceptMemberInvite(req: Request, deps: AcceptDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  if (!(await deps.allow(clientIp(req)))) return reply(429, { error: 'rate_limited' })

  const body = await readJsonObject(req, 2_000)
  const action = body?.action
  if (!body || (action !== 'inspect' && action !== 'create' && action !== 'accept')) return reply(400, { error: 'invalid_request' })
  if (!looksLikeSecret(body.token)) return action === 'inspect' ? reply(200, { state: 'invalid' }) : reply(404, { error: 'invite_invalid' })
  const hash = await hashSecret(body.token)

  if (action === 'inspect') {
    const i = await deps.inspect(hash)
    if (i.state !== 'valid') return reply(200, { state: i.state })
    return reply(200, { state: 'valid', email: i.email, role: i.role, invitedBy: i.invitedBy, expiresAt: i.expiresAt, accountExists: !!i.userExists })
  }

  if (action === 'accept') {
    const user = await deps.userFromToken(bearerToken(req))
    if (!user) return reply(401, { error: 'not_signed_in' })
    const code = await deps.accept(hash, user.id)
    return code === 'ok' ? reply(200, { ok: true }) : reply(ACCEPT_ERROR[code], { error: code })
  }

  // create
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim().slice(0, 120) : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!fullName || password.length < STAFF_PASSWORD_MIN || password.length > STAFF_PASSWORD_MAX) return reply(422, { error: 'invalid_request' })
  const i = await deps.inspect(hash)
  if (i.state !== 'valid' || !i.email) {
    const [status, error] = STATE_ERROR[i.state] ?? [404, 'invite_invalid']
    return reply(status, { error })
  }
  if (i.userExists) return reply(409, { error: 'account_exists' })
  const created = await deps.createUser({ email: i.email, password, fullName })
  if (!created.ok) {
    return created.error === 'exists' ? reply(409, { error: 'account_exists' }) : reply(422, { error: 'weak_password', message: created.message })
  }
  const code = await deps.accept(hash, created.userId, fullName)
  return code === 'ok' ? reply(200, { ok: true, email: i.email }) : reply(ACCEPT_ERROR[code], { error: code })
}

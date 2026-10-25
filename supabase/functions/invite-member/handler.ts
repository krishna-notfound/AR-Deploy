// Request handling for the invite-member Edge Function (ADR-0029, ADR-0030). Platform Owner only.
//   POST { action: "invite", email, role: "admin"|"team", note? } → creates the invited member and emails a /join link
//   POST { action: "resend", memberId }                         → a new link for someone still invited (the old one stops working)
// The link secret is 32 random bytes; only its SHA-256 is stored. The secret goes into the email only: it is never
// returned, logged or put in the audit log. A provider failure is reported as email_failed, never as sent.
import { type ConfigResult, type LogEntry, sendAndLog } from '../_shared/email.ts'
import { renderEmail } from '../_shared/email-templates.ts'
import { UUID, bearerToken, readJsonObject, reply } from '../_shared/http.ts'
import { type MemberRole, hashSecret, newInviteSecret } from '../_shared/team.ts'

export const INVITE_DAYS = 7
const NOTE_MAX = 500

type DbResult<T> = ({ ok: true } & T) | { error: string }

export interface InviteDeps {
  config: ConfigResult
  fetch: typeof fetch
  now?: () => Date
  userIdFromToken(token: string): Promise<string | null>
  isOwner(userId: string): Promise<boolean>
  /** admin_invite_member, called with the caller's own token so the database re-checks the Owner. */
  inviteMember(token: string, email: string, role: MemberRole): Promise<DbResult<{ memberId: string }>>
  getMember(id: string): Promise<{ id: string; email: string; role: MemberRole; status: string } | null>
  createInvite(memberId: string, tokenHash: string, expiresAt: string, actorId: string): Promise<DbResult<{ inviteId: string }>>
  recordEmail(inviteId: string, ok: boolean, detail: string): Promise<void>
  inviterName(userId: string): Promise<string | null>
  logDenied(actorId: string, action: string): Promise<void>
  log(entry: LogEntry): Promise<string>
}

const STATUS_FOR: Record<string, number> = {
  forbidden: 403, already_member: 409, business_owner: 409, owner_protected: 409, not_invited: 409,
  invalid_email: 422, rate_limited: 429, not_found: 404,
}

export async function handleInviteMember(req: Request, deps: InviteDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const token = bearerToken(req)
  const actorId = token ? await deps.userIdFromToken(token) : null
  if (!actorId) return reply(401, { error: 'not_signed_in' })

  const body = await readJsonObject(req, 4_000)
  const action = body?.action
  if (!body || (action !== 'invite' && action !== 'resend')) return reply(400, { error: 'invalid_request' })

  if (!(await deps.isOwner(actorId))) {
    await deps.logDenied(actorId, action === 'invite' ? 'invite_member' : 'resend_member_invite')
    return reply(403, { error: 'forbidden' })
  }
  if (!deps.config.ok) return reply(503, { error: 'not_configured' })
  const config = deps.config.config
  if (!/^https:\/\/[^\s/]+$/.test(config.appBaseUrl)) return reply(503, { error: 'not_configured' })

  let memberId: string
  let note: string | undefined
  if (action === 'invite') {
    const email = typeof body.email === 'string' ? body.email : ''
    const role = body.role
    note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined
    if (role !== 'admin' && role !== 'team') return reply(422, { error: 'invalid_role' })
    if (note && note.length > NOTE_MAX) return reply(422, { error: 'note_too_long' })
    const r = await deps.inviteMember(token, email, role)
    if ('error' in r) return reply(STATUS_FOR[r.error] ?? 400, { error: r.error })
    memberId = r.memberId
  } else {
    if (typeof body.memberId !== 'string' || !UUID.test(body.memberId)) return reply(400, { error: 'invalid_request' })
    memberId = body.memberId
  }

  const member = await deps.getMember(memberId)
  if (!member) return reply(404, { error: 'not_found' })
  if (member.status !== 'invited') return reply(409, { error: 'not_invited' })

  const now = (deps.now ?? (() => new Date()))()
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString()
  const secret = newInviteSecret()
  const invite = await deps.createInvite(member.id, await hashSecret(secret), expiresAt, actorId)
  if ('error' in invite) return reply(STATUS_FOR[invite.error] ?? 400, { error: invite.error })

  const email = renderEmail('team_invitation', 'en', {
    role: member.role,
    note,
    expiresAt,
    inviterName: (await deps.inviterName(actorId)) ?? undefined,
    actionUrl: `${config.appBaseUrl}/join#t=${secret}`,
  })
  const sent = await sendAndLog(
    { config, fetch: deps.fetch, log: deps.log },
    {
      to: member.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      kind: 'team_invitation',
      workflow: `team_invite:${member.id}`,
      triggeredBy: actorId,
      idempotencyKey: `team_invite:${invite.inviteId}`,
    },
  )
  const ok = sent.status === 'accepted'
  await deps.recordEmail(invite.inviteId, ok, ok ? '' : (sent.error ?? sent.status))
  return reply(200, {
    memberId: member.id,
    status: ok ? 'sent' : 'email_failed',
    sentAt: now.toISOString(),
    expiresAt,
    ...(ok ? {} : { error: sent.error ?? sent.status }),
  })
}

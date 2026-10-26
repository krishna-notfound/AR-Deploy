// Request handling for the notify-business-owner Edge Function (R-W7-2, spec §10.3). After a platform-team member
// pauses or activates a catalogue, or unpublishes or deletes a product, the app calls this fire-and-forget:
//   POST { businessId } → { ok: true, sent, skipped }
// Staff only, behind the 2FA gate (R-W1-1). It reads the caller's own audit rows for that business from the last 10
// minutes (the database labelled them Owner, Admin or Team at insert, R-W7-1) and emails the business owner one
// business_notice per row, in the source application's language. The workflow business_notice:<audit id> is the
// dedupe key: a row that already has an email_log entry is skipped, so calling twice sends one email.
// `sent` counts notices Resend accepted; `skipped` counts rows already notified, or rows of a business with no owner.
import { type ConfigResult, type LogEntry, sendAndLog } from '../_shared/email.ts'
import { type BusinessNoticeEvent, businessNoticeEmail } from '../_shared/email-templates.ts'
import { type GateResult, gateReply } from '../_shared/gate.ts'
import { UUID, bearerToken, readJsonObject, reply } from '../_shared/http.ts'

/** How far back the caller's rows are read: the action that triggered the call happened just before it. */
export const NOTICE_WINDOW_MINUTES = 10

/** The platform roles whose changes are told to the owner (audit metadata.actor_label). */
export const STAFF_LABELS = ['Owner', 'Admin', 'Team'] as const

export interface NotifyDeps {
  config: ConfigResult
  fetch: typeof fetch
  now?: () => Date
  userIdFromToken(token: string): Promise<string | null>
  /** The 2FA gate with the caller's own token: caller_mfa_satisfied(), then any staff (Owner or active member). */
  gate(token: string): Promise<GateResult>
  /**
   * The business's audit rows written by `actorId` since `sinceIso` (service role): business_status_changed to
   * inactive or active, product_unpublished and product_deleted, with actor_label Owner, Admin or Team. For a status
   * row, metadata carries to_status.
   */
  recentRows(businessId: string, actorId: string, sinceIso: string): Promise<{ id: string; eventType: string; metadata: Record<string, unknown> }[]>
  /** The business owner's address, the source application's language (else en) and the business name; null without an owner. */
  recipient(businessId: string): Promise<{ email: string; language: 'en' | 'pt'; businessName: string } | null>
  /** True when email_log already has a row for this workflow. */
  alreadySent(workflow: string): Promise<boolean>
  log(entry: LogEntry): Promise<string>
}

const text = (v: unknown) => (typeof v === 'string' ? v : '')

/** Which notice a row is, or null for a row this function does not email (checked again here, not only in the query). */
function noticeFor(row: { eventType: string; metadata: Record<string, unknown> }): BusinessNoticeEvent | null {
  if (!(STAFF_LABELS as readonly string[]).includes(text(row.metadata.actor_label))) return null
  if (row.eventType === 'business_status_changed') {
    const to = text(row.metadata.to_status)
    return to === 'inactive' ? 'paused' : to === 'active' ? 'live' : null
  }
  if (row.eventType === 'product_unpublished' || row.eventType === 'product_deleted') return row.eventType
  return null
}

export async function handleNotifyBusinessOwner(req: Request, deps: NotifyDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const token = bearerToken(req)
  const actorId = token ? await deps.userIdFromToken(token) : null
  if (!actorId) return reply(401, { error: 'not_signed_in' })
  const gate = await deps.gate(token)
  if (gate !== 'ok') return gateReply(gate)

  const body = await readJsonObject(req, 1_000)
  const businessId = body && typeof body.businessId === 'string' && UUID.test(body.businessId) ? body.businessId : ''
  if (!businessId) return reply(400, { error: 'invalid_request' })

  const since = new Date((deps.now?.() ?? new Date()).getTime() - NOTICE_WINDOW_MINUTES * 60_000).toISOString()
  const notices = (await deps.recentRows(businessId, actorId, since)).flatMap((row) => {
    const event = noticeFor(row)
    return event ? [{ row, event }] : []
  })
  if (!notices.length) return reply(200, { ok: true, sent: 0, skipped: 0 })

  const owner = await deps.recipient(businessId)
  if (!owner) return reply(200, { ok: true, sent: 0, skipped: notices.length })

  let sent = 0
  let skipped = 0
  for (const { row, event } of notices) {
    const workflow = `business_notice:${row.id}`
    if (await deps.alreadySent(workflow)) {
      skipped++
      continue
    }
    const email = businessNoticeEmail(owner.language, event, { businessName: owner.businessName, productName: text(row.metadata.name) })
    const base = { kind: 'business_notice' as const, businessId, workflow, triggeredBy: actorId }
    if (!deps.config.ok) {
      await deps.log({ ...base, recipient: owner.email, subject: email.subject, status: 'blocked', error: 'email_not_configured' })
      continue
    }
    // The idempotency key makes Resend send once even if two calls pass the alreadySent check together.
    const r = await sendAndLog({ config: deps.config.config, fetch: deps.fetch, log: deps.log }, { ...email, ...base, to: owner.email, idempotencyKey: workflow })
    if (r.status === 'accepted') sent++
  }
  return reply(200, { ok: true, sent, skipped })
}

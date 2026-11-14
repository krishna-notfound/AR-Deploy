// Request handling for the notify-model-request Edge Function (W5, ADR-0056). request_model sends nothing itself, so
// after it succeeds the business app calls this fire-and-forget:
//   POST { requestId } → { ok: true, notified: boolean }
// Besides the bell and the phone, staff who keep "new 3D model requests" emails on get one email each (ADR-0078).
// The caller's own token reads the request under RLS (a stranger sees nothing), and the request must be theirs, still
// "requested" and at most 10 minutes old, so the function cannot be used to nudge staff about an old request. Staff with
// models.manage (and the Owner) get a bell entry and a phone push, once per request (the dedupe key covers retries).
import { type ConfigResult, type LogEntry, sendAndLog } from '../_shared/email.ts'
import { renderEmail } from '../_shared/email-templates.ts'
import { type EmailPrefReader, emailWanted } from '../_shared/emailPrefs.ts'
import { UUID, bearerToken, readJsonObject, reply, sha256Hex } from '../_shared/http.ts'
import { modelRequestNotice } from '../_shared/notificationText.ts'
import type { Localized, NotifyRequest } from '../_shared/notify.ts'

/** How long after sending a request the sender may still trigger the alert. */
export const ALERT_WINDOW_MINUTES = 10

export interface SentRequest {
  businessName: string
  productName: Localized
  requestedBy: string | null
  status: string
  createdAt: string
}

/** The email that goes with the notification to staff with models.manage (ADR-0078). Absent in tests that do not need it. */
export interface StaffEmailDeps {
  config: ConfigResult
  fetch: typeof fetch
  /** Staff with models.manage and the Owner: account id and address. */
  staff(): Promise<{ userId: string; email: string }[]>
  /** Whether a staff member keeps "new 3D model requests" emails on. Absent: on. */
  emailPref?: EmailPrefReader
  /** True when email_log already has a row for this workflow. */
  alreadySent(workflow: string): Promise<boolean>
  log(entry: LogEntry): Promise<string>
}

export interface NotifyModelRequestDeps {
  now?: () => Date
  userIdFromToken(token: string): Promise<string | null>
  /** The request as the caller's own client sees it (RLS); null when it does not exist or is not visible to them. */
  loadRequest(token: string, requestId: string): Promise<SentRequest | null>
  notify(request: NotifyRequest): Promise<void>
  email?: StaffEmailDeps
}

export async function handleNotifyModelRequest(req: Request, deps: NotifyModelRequestDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  const token = bearerToken(req)
  const userId = token ? await deps.userIdFromToken(token) : null
  if (!userId) return reply(401, { error: 'not_signed_in' })

  const body = await readJsonObject(req, 1_000)
  const requestId = body && typeof body.requestId === 'string' && UUID.test(body.requestId) ? body.requestId : ''
  if (!requestId) return reply(400, { error: 'invalid_request' })

  const request = await deps.loadRequest(token, requestId)
  if (!request) return reply(404, { error: 'not_found' })
  const age = (deps.now?.() ?? new Date()).getTime() - Date.parse(request.createdAt)
  if (request.requestedBy !== userId || request.status !== 'requested' || !(age >= -60_000 && age <= ALERT_WINDOW_MINUTES * 60_000))
    return reply(200, { ok: true, notified: false })

  await deps.notify({
    audience: { staff: 'models.manage' },
    kind: 'new_model_request',
    ...modelRequestNotice(request.businessName, request.productName),
    link: `/admin/model-requests/${requestId}`,
    dedupeKey: `model_request:${requestId}:requested`,
  })
  if (deps.email) await emailStaff(deps.email, requestId, request)
  return reply(200, { ok: true, notified: true })
}

/**
 * One email per staff member with models.manage (and the Owner) who keeps "new 3D model requests" emails on (ADR-0078), once
 * per request and address (the workflow is the dedupe key). Staff have no sign-in language setting for email, so it is English,
 * like the new-application alert. Never throws: the bell is already written and the request is already stored.
 */
async function emailStaff(email: StaffEmailDeps, requestId: string, request: SentRequest) {
  try {
    const recipients = await email.staff()
    const seen = new Set<string>()
    for (const member of recipients) {
      const key = member.email.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      if (!(await emailWanted(email.emailPref, member.userId, 'new_model_request'))) continue
      const workflow = `model_request:${requestId}:requested:${(await sha256Hex(key)).slice(0, 16)}`
      if (await email.alreadySent(workflow)) continue
      const productName = request.productName.en.trim()
      const rendered = renderEmail('model_request_staff', 'en', {
        businessName: request.businessName,
        productName,
        actionUrl: email.config.ok && email.config.config.appBaseUrl.startsWith('https://') ? `${email.config.config.appBaseUrl}/admin/model-requests/${requestId}` : undefined,
      })
      const base = { kind: 'model_request_staff' as const, workflow }
      if (!email.config.ok) {
        await email.log({ ...base, recipient: member.email, subject: rendered.subject, status: 'blocked', error: 'email_not_configured' })
        continue
      }
      await sendAndLog({ config: email.config.config, fetch: email.fetch, log: email.log }, { ...rendered, ...base, to: member.email.trim(), idempotencyKey: workflow, optional: { userId: member.userId, type: 'new_model_request' } })
    }
  } catch (e) {
    console.error(`model request staff email failed: ${String(e).replace(/[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+/g, '[email]').slice(0, 200)}`)
  }
}

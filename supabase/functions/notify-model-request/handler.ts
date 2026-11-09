// Request handling for the notify-model-request Edge Function (W5, ADR-0056). request_model has no staff email today, so
// after it succeeds the business app calls this fire-and-forget:
//   POST { requestId } → { ok: true, notified: boolean }
// The caller's own token reads the request under RLS (a stranger sees nothing), and the request must be theirs, still
// "requested" and at most 10 minutes old, so the function cannot be used to nudge staff about an old request. Staff with
// models.manage (and the Owner) get a bell entry and a phone push, once per request (the dedupe key covers retries).
import { UUID, bearerToken, readJsonObject, reply } from '../_shared/http.ts'
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

export interface NotifyModelRequestDeps {
  now?: () => Date
  userIdFromToken(token: string): Promise<string | null>
  /** The request as the caller's own client sees it (RLS); null when it does not exist or is not visible to them. */
  loadRequest(token: string, requestId: string): Promise<SentRequest | null>
  notify(request: NotifyRequest): Promise<void>
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
  return reply(200, { ok: true, notified: true })
}

// Request handling for the review-model-request Edge Function (S4 R-S4-15, spec 5 and 9.2). Staff handle a 3D model
// request here, and the business owner is told when it is delivered or declined:
//   POST { requestId, action: 'start' | 'deliver' | 'reject', reason? }
//     → { ok: true, status, replacedPaths?, stagedPaths?, email?: { status, error? } }
// The 2FA gate (models.manage, R-W1-1) runs first, so a session without the 2FA step learns only aal2_required, before
// anything is read. The SQL (admin_start/deliver/reject_model_request) runs with the caller's own token, so the audit
// actor and the database checks are the caller's. Only deliver and reject email the owner; start sends nothing. An
// email failure never undoes the status change. A direct SQL call sends no email (as admin_review_application in S1.5).
// Retrying a deliver or reject that already went through answers success and sends the email only if the workflow has
// no email_log row yet, so a retry never emails twice (and a retry that finds it already sent carries no `email`).
import { type ConfigResult, type EmailStatus, type LogEntry, SAFE_EMAIL_REASONS, sendAndLog } from '../_shared/email.ts'
import { type EmailLang, type ModelRequestEmailEvent, REASON_MAX_LENGTH, modelRequestUpdateEmail } from '../_shared/email-templates.ts'
import { type GateResult, gateReply } from '../_shared/gate.ts'
import { UUID, bearerToken, readJsonObject, reply } from '../_shared/http.ts'

export type ModelRequestAction = 'start' | 'deliver' | 'reject'
export type { ModelRequestEmailEvent }
const ACTIONS: readonly ModelRequestAction[] = ['start', 'deliver', 'reject']

/** The status each action leaves the request in (a repeated call finds the request already there). */
const TARGET_STATUS: Record<ModelRequestAction, string> = { start: 'in_progress', deliver: 'delivered', reject: 'rejected' }

/** The database's refusals, as the HTTP status the client maps (anything else is a 500). */
const MODEL_ERRORS: Record<string, number> = {
  aal2_required: 403,
  forbidden: 403,
  invalid_transition: 422,
  reason_required: 422,
  model_request_needs_glb: 422,
  model_request_not_found: 404,
}

export type ActOutcome =
  | { ok: true; status: string; replacedPaths?: string[]; stagedPaths?: string[]; productStatus?: string }
  | { error: string }

type Localized = { en: string; pt?: string }
export interface EmailContext {
  businessId: string
  /** The business owner's address and the source application's language; null when the business has no owner. */
  recipient: { email: string; language: 'en' | 'pt' } | null
  productName: Localized
  optionName?: Localized
  productStatus: string
  /** The decline reason stored on the request. */
  reason?: string
}

export interface ReviewModelRequestDeps {
  config: ConfigResult
  fetch: typeof fetch
  userIdFromToken(token: string): Promise<string | null>
  /** The 2FA gate with the caller's own token: caller_mfa_satisfied(), then platform_can('models.manage'). */
  gate(token: string): Promise<GateResult>
  /**
   * admin_start/deliver/reject_model_request with the caller's own token. The database's refusals come back as
   * { error } with the keys of MODEL_ERRORS; any other failure rejects.
   */
  actAsCaller(token: string, requestId: string, action: ModelRequestAction, reason: string | null): Promise<ActOutcome>
  /** The request's status now (service role); null when it does not exist. */
  currentStatus(requestId: string): Promise<string | null>
  /** What the email needs (service role); null when the request does not exist. */
  emailContext(requestId: string): Promise<EmailContext | null>
  /** True when email_log already has a row for this workflow. */
  alreadySent(workflow: string): Promise<boolean>
  log(entry: LogEntry): Promise<string>
}

type OwnerEmail = { status: EmailStatus | 'skipped'; error?: string }

const pick = (n: Localized, lang: EmailLang) => (lang === 'pt' && n.pt?.trim() ? n.pt : n.en)

export async function handleReviewModelRequest(req: Request, deps: ReviewModelRequestDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  try {
    return await handle(req, deps)
  } catch (e) {
    // Function names and database codes only (callerRpc and index.ts build these); never a token, address or reason.
    console.error(`review-model-request: ${String(e).slice(0, 300)}`)
    return reply(500, { error: 'unknown' })
  }
}

async function handle(req: Request, deps: ReviewModelRequestDeps): Promise<Response> {
  const token = bearerToken(req)
  const actorId = token ? await deps.userIdFromToken(token) : null
  if (!actorId) return reply(401, { error: 'not_signed_in' })
  const gate = await deps.gate(token)
  if (gate !== 'ok') return gateReply(gate)

  // A reason is at most 1000 characters of up to 4 bytes each, plus the other fields.
  const body = await readJsonObject(req, 8_000)
  if (!body) return reply(400, { error: 'invalid_request' })
  const requestId = typeof body.requestId === 'string' && UUID.test(body.requestId) ? body.requestId : ''
  const action = ACTIONS.find((a) => a === body.action)
  if (!requestId || !action) return reply(400, { error: 'invalid_request' })
  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string') return reply(400, { error: 'invalid_request' })
  const reason = action === 'reject' && typeof body.reason === 'string' ? body.reason.trim() : ''
  if ([...reason].length > REASON_MAX_LENGTH)
    return reply(400, { error: 'invalid_request', fields: { reason: `Keep the reason to ${REASON_MAX_LENGTH.toLocaleString('en')} characters or fewer.` } })

  let outcome = await deps.actAsCaller(token, requestId, action, reason || null)
  if ('error' in outcome && outcome.error === 'invalid_transition') {
    // A retry (a double click, a lost response): the request is already where this action leaves it.
    const now = await deps.currentStatus(requestId)
    if (now === TARGET_STATUS[action]) outcome = { ok: true, status: now }
  }
  if ('error' in outcome) {
    const status = MODEL_ERRORS[outcome.error]
    if (!status) throw new Error(`model request action failed: ${outcome.error.slice(0, 100)}`)
    return outcome.error === 'reason_required'
      ? reply(status, { error: outcome.error, fields: { reason: 'Give a reason for declining.' } })
      : reply(status, { error: outcome.error })
  }

  const result: Record<string, unknown> = { ok: true, status: outcome.status }
  if (outcome.replacedPaths) result.replacedPaths = outcome.replacedPaths
  if (outcome.stagedPaths) result.stagedPaths = outcome.stagedPaths
  if (action !== 'start') {
    const email = await notifyOwner(deps, { requestId, action, actorId, reason, productStatus: outcome.productStatus })
    if (email) result.email = email
  }
  return reply(200, result)
}

/**
 * Emails the business owner once per workflow. Returns null when this workflow was already sent (a retry): nothing new
 * to report. The status change is already committed, so nothing here may fail the request; only fixed reason codes
 * reach the browser, and provider text stays in email_log.
 */
async function notifyOwner(
  deps: ReviewModelRequestDeps,
  a: { requestId: string; action: 'deliver' | 'reject'; actorId: string; reason: string; productStatus?: string },
): Promise<OwnerEmail | null> {
  const log = async (e: LogEntry) => deps.log(e).catch(() => '')
  try {
    const ctx = await deps.emailContext(a.requestId)
    if (!ctx?.recipient) return { status: 'skipped' }
    const workflow = `model_request:${a.requestId}:${a.action === 'deliver' ? 'delivered' : 'rejected'}`
    if (await deps.alreadySent(workflow)) return null
    const lang = ctx.recipient.language
    const event: ModelRequestEmailEvent =
      a.action === 'reject' ? 'declined' : (a.productStatus ?? ctx.productStatus) === 'published' ? 'delivered_published' : 'delivered_draft'
    const email = modelRequestUpdateEmail(lang, event, {
      productName: pick(ctx.productName, lang),
      optionName: ctx.optionName ? pick(ctx.optionName, lang) : undefined,
      reason: ctx.reason || a.reason || undefined,
    })
    const base = { kind: 'model_request_update' as const, businessId: ctx.businessId, workflow, triggeredBy: a.actorId }
    if (!deps.config.ok) {
      await log({ ...base, recipient: ctx.recipient.email, subject: email.subject, status: 'blocked', error: 'email_not_configured' })
      return { status: 'blocked', error: 'email_not_configured' }
    }
    // The idempotency key makes Resend send once even if two calls pass the alreadySent check together.
    const r = await sendAndLog({ config: deps.config.config, fetch: deps.fetch, log }, { ...email, ...base, to: ctx.recipient.email, idempotencyKey: workflow })
    return r.error && SAFE_EMAIL_REASONS.has(r.error) ? { status: r.status, error: r.error } : { status: r.status }
  } catch {
    return { status: 'failed' }
  }
}

// Request handling for the review-application Edge Function (R-W2-1, spec §10.3). Every review action goes through
// here, so a rejected applicant is told, in their language.
//   POST { applicationId, action: 'start_review' | 'approve' | 'reject' | 'reopen', reason?, includeReason?, businessName? }
// businessName is the company name typed in the Approve dialog (ADR-0057); an application whose form did not ask for one needs it.
//     → { ok: true, status, businessId?, email?: { status, error? } }
// Staff only, at the 2FA level their policy requires (R-W1-1): the gate runs before anything is read or changed. The
// per-action permission (applications.approve / applications.reject) stays in SQL: admin_review_application runs with
// the caller's own token. Only a reject that changes the status emails the applicant; approve, start review and reopen
// send nothing (the owner invitation is the approval notice). An email failure never undoes the rejection.
// Reopen (R-W2-2) moves an approved application whose business was deleted back to under_review.
import { type ConfigResult, type EmailStatus, type LogEntry, SAFE_EMAIL_REASONS, sendAndLog } from '../_shared/email.ts'
import { REASON_MAX_LENGTH, applicationDecisionEmail } from '../_shared/email-templates.ts'
import { type GateResult, gateReply } from '../_shared/gate.ts'
import { UUID, bearerToken, readJsonObject, reply } from '../_shared/http.ts'

export { REASON_MAX_LENGTH }

export type ReviewAction = 'start_review' | 'approve' | 'reject' | 'reopen'
/** The actions this function takes. Add one here and in admin_review_application. */
const ACTIONS: readonly ReviewAction[] = ['start_review', 'approve', 'reject', 'reopen']

/** The database's refusals, as the HTTP status the client maps (anything else is a 500). */
const REVIEW_ERRORS: Record<string, number> = {
  forbidden: 403,
  reason_required: 422,
  invalid_transition: 422,
  reopen_not_allowed: 422,
  business_name_required: 422,
  business_name_invalid: 422,
  application_not_found: 404,
}

export type ReviewOutcome = { ok: true; status: string; businessId?: string } | { error: string }

export interface ReviewDeps {
  config: ConfigResult
  fetch: typeof fetch
  now?: () => Date
  userIdFromToken(token: string): Promise<string | null>
  /** The 2FA gate with the caller's own token: caller_mfa_satisfied(), then any staff (Owner or active member). */
  gate(token: string): Promise<GateResult>
  /**
   * admin_review_application with the caller's own token. Its refusals come back as { error } with the keys of
   * REVIEW_ERRORS ('forbidden' for a missing permission); any other failure rejects.
   */
  reviewAsCaller(token: string, applicationId: string, action: ReviewAction, reason: string | null, businessName?: string | null): Promise<ReviewOutcome>
  /**
   * The applicant's details for the decision email (service role), and the status before this review, so a repeated
   * reject (a double click or a retry) does not email twice.
   */
  getApplicant(applicationId: string): Promise<{ businessName: string | null; email: string; language: 'en' | 'pt'; status: string } | null>
  /**
   * Atomically marks the application's current rejection as emailed (service_claim_decision_email): true for the one
   * request that gets to send, false for any other (a concurrent or repeated reject). A new rejection (after a reopen) is a
   * new claim. Rejects on a database error.
   */
  claimDecisionEmail(applicationId: string): Promise<boolean>
  log(entry: LogEntry): Promise<string>
}

type DecisionEmail = { status: EmailStatus; error?: string }

export async function handleReviewApplication(req: Request, deps: ReviewDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const token = bearerToken(req)
  const actorId = token ? await deps.userIdFromToken(token) : null
  if (!actorId) return reply(401, { error: 'not_signed_in' })
  const gate = await deps.gate(token)
  if (gate !== 'ok') return gateReply(gate)

  // A reason is at most 1000 characters of up to 4 bytes each, plus the other fields.
  const body = await readJsonObject(req, 8_000)
  if (!body) return reply(400, { error: 'invalid_request' })
  const applicationId = typeof body.applicationId === 'string' && UUID.test(body.applicationId) ? body.applicationId : ''
  const action = ACTIONS.find((a) => a === body.action)
  if (!applicationId || !action) return reply(400, { error: 'invalid_request' })
  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string') return reply(400, { error: 'invalid_request' })
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  // Refused before the review and before any email: the database would refuse it too (decision_reason <= 1000).
  if ([...reason].length > REASON_MAX_LENGTH)
    return reply(400, { error: 'invalid_request', fields: { reason: `Keep the reason to ${REASON_MAX_LENGTH.toLocaleString('en')} characters or fewer.` } })
  const includeReason = body.includeReason === true
  if (body.businessName !== undefined && body.businessName !== null && typeof body.businessName !== 'string') return reply(400, { error: 'invalid_request' })
  const businessName = typeof body.businessName === 'string' ? body.businessName.trim().slice(0, 200) : ''

  const applicant = await deps.getApplicant(applicationId)
  if (!applicant) return reply(404, { error: 'application_not_found' })

  const reviewed = await deps.reviewAsCaller(token, applicationId, action, reason || null, businessName || null)
  if ('error' in reviewed) {
    const status = REVIEW_ERRORS[reviewed.error]
    if (!status) throw new Error(`review failed: ${reviewed.error.slice(0, 100)}`)
    return reviewed.error === 'reason_required'
      ? reply(status, { error: reviewed.error, fields: { reason: 'Give a reason for the rejection.' } })
      : reply(status, { error: reviewed.error })
  }

  const result: Record<string, unknown> = { ok: true, status: reviewed.status }
  if (reviewed.businessId) result.businessId = reviewed.businessId
  // The status read above is only a fast path: two requests can both read "under review" and both get a rejected row back
  // (the database serialises them and the second changes nothing). The claim is atomic, so only one of them emails (EF-3).
  if (action === 'reject' && reviewed.status === 'rejected' && applicant.status !== 'rejected' && (await claimEmail(deps, applicationId))) {
    result.email = await sendDecision(deps, { applicationId, applicant, reason: includeReason ? reason : undefined, actorId })
  }
  return reply(200, result)
}

/**
 * True when this request may send the decision email. If the claim itself fails (for example before its migration is
 * applied) the email is still sent: a duplicate notice is better than a rejection the applicant never hears about.
 */
async function claimEmail(deps: ReviewDeps, applicationId: string): Promise<boolean> {
  try {
    return await deps.claimDecisionEmail(applicationId)
  } catch (e) {
    console.error(`decision email claim failed: ${String(e).slice(0, 120)}`)
    return true
  }
}

async function sendDecision(
  deps: ReviewDeps,
  a: { applicationId: string; applicant: { businessName: string | null; email: string; language: 'en' | 'pt' }; reason?: string; actorId: string },
): Promise<DecisionEmail> {
  const base = { kind: 'application_decision' as const, applicationId: a.applicationId, workflow: `application:${a.applicationId}:decision`, triggeredBy: a.actorId }
  // The rejection is already committed, so nothing here may fail the request. A log row that can't be written
  // doesn't change the real send outcome (the email may well have gone). Only fixed reason codes reach the browser;
  // provider text stays in email_log.
  const log = async (e: LogEntry) => deps.log(e).catch(() => '')
  try {
    const email = applicationDecisionEmail(a.applicant.language, a.applicant.businessName, a.reason || undefined)
    if (!deps.config.ok) {
      await log({ ...base, recipient: a.applicant.email, subject: email.subject, status: 'blocked', error: 'email_not_configured' })
      return { status: 'blocked', error: 'email_not_configured' }
    }
    const r = await sendAndLog({ config: deps.config.config, fetch: deps.fetch, log }, { ...email, ...base, to: a.applicant.email })
    return r.error && SAFE_EMAIL_REASONS.has(r.error) ? { status: r.status, error: r.error } : { status: r.status }
  } catch {
    return { status: 'failed' }
  }
}

// Request handling for the public submit-application Edge Function (design/24-applications.md, ADR-0024).
//   POST <wizard answers + submissionKey>  →  200 { id, reference }
// Validates with the same rules as the wizard, rate-limits every attempt per salted daily IP hash, stores the
// application with the service role, records the audit event and sends the confirmation and the admin notification
// (to the admin inbox and to opted-in staff who can view applications). Nothing after the insert undoes the stored
// application: an audit failure is logged and the emails still go, and a retry with the same submission key sends
// the emails that were never logged (S1.5 R-W2-10, R-W2-11).
import { MAX_CATALOGUE_BYTES, type NormalizedApplication, validateApplication } from '../_shared/application.ts'
import type { ApplyRules } from '../_shared/applyForm.ts'
import { MAX_SUBMISSIONS_PER_HOUR, attemptHashes, submitterHash } from '../_shared/attempts.ts'
import { type ConfigResult, type LogEntry, sendAndLog } from '../_shared/email.ts'
import { renderEmail } from '../_shared/email-templates.ts'
import { clientIp, readJsonObject, reply, sha256Hex } from '../_shared/http.ts'
import type { NotifyRequest } from '../_shared/notify.ts'
import { applicationNotice } from '../_shared/notificationText.ts'

// Kept exported from here: the tests and index.ts import them from the handler.
export { MAX_SUBMISSIONS_PER_HOUR, submitterHash }
/** Room for the answers to up to 10 questions (the custom block itself is capped at 40,000 bytes). */
const MAX_BODY_BYTES = 48_000
/** A key replay newer than this is a double click while the first request may still be sending: it sends nothing. */
const REPLAY_SETTLE_MS = 30_000

export interface StoredApplication {
  id: string
  reference: string
  applicantEmail: string
  /** Null when the published form does not ask for it (ADR-0057). */
  businessName: string | null
  language: 'en' | 'pt'
  createdAt: string
}

export interface SubmitDeps {
  config: ConfigResult
  fetch: typeof fetch
  /** Secret mixed into the submitter hash so raw IPs cannot be recovered from it. */
  salt: string
  now?: () => Date
  findByKey(submissionKey: string): Promise<StoredApplication | null>
  /** An open (submitted / under review) application for the same business name from the same email; with no name, one without a name. */
  findOpenDuplicate(email: string, businessName: string | null): Promise<{ id: string } | null>
  /** service_application_attempt: true when the attempt is allowed (and recorded). */
  allowAttempt(hashes: string[]): Promise<boolean>
  /** Inserts the row; 'duplicate_key' when the submission key already exists (a concurrent retry). */
  insert(app: NormalizedApplication, submitterHash: string): Promise<StoredApplication | 'duplicate_key'>
  audit(event: { eventType: string; applicationId: string; toStatus?: string; metadata?: Record<string, unknown> }): Promise<void>
  /** Whether the application already has its application_submitted audit row. */
  hasSubmittedAudit(applicationId: string): Promise<boolean>
  /** The email_log workflows already logged for the application (any status). */
  loggedWorkflows(applicationId: string): Promise<Set<string>>
  log(entry: LogEntry): Promise<string>
  /** Staff who can see applications (applications.view) and keep new-application alerts on (profiles). */
  staffAlertRecipients(): Promise<string[]>
  /**
   * The rules of the published application form (service role read of site_content.published), or null when nothing is
   * published. Throws when the read fails: that is not "no form" (spec section 10), the request is answered 503.
   */
  loadApplyRules(): Promise<ApplyRules | null>
  /**
   * The stored object at `path` in the application-files bucket (size in bytes and content type), or null when there is
   * none. Throws when storage cannot be read: that is not "no file", the request is answered 503.
   */
  catalogueObject(path: string): Promise<{ size: number; contentType: string } | null>
  /** In-app notification and phone push to staff with applications.view (ADR-0056). Never throws; absent in tests that do not need it. */
  notify?(request: NotifyRequest): Promise<void>
}

/** An error for console.error: email addresses removed (provider and database messages can quote them), shortened. */
export const loggable = (e: unknown, max = 200) => String(e).replace(/[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+/g, '[email]').slice(0, max)

export async function handleSubmitApplication(req: Request, deps: SubmitDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  if (!deps.salt) return reply(500, { error: 'not_configured' })

  const body = await readJsonObject(req, MAX_BODY_BYTES)
  if (!body) return reply(400, { error: 'invalid_application' })
  // Honeypot field: people never see it, so a value means an automated submission.
  if (typeof body.hp === 'string' && body.hp.trim()) return reply(400, { error: 'invalid_application' })
  // The wizard's "I agree to the Terms and the Privacy Policy" tick (S2 legal). Not stored yet: recording the
  // accepted version and time is a later item (docs/legal/drafts/README.md, "What the app must do", 3).
  if (body.acceptedTerms !== true) return reply(422, { error: 'invalid_request' })

  let rules: ApplyRules | null
  try {
    rules = await deps.loadApplyRules()
  } catch (e) {
    // Without the form the server cannot tell what is required or hidden: refuse rather than accept unchecked answers.
    console.error(`apply form lookup failed: ${loggable(e)}`)
    return reply(503, { error: 'config_unavailable' })
  }
  const v = validateApplication(body, rules)
  // The visitor answered a form that was republished meanwhile (an unknown question or option, a hidden option):
  // the page reloads the form and keeps the answers.
  if (!v.ok && v.stale) return reply(409, { error: 'form_changed' })
  if (!v.ok) return reply(400, { error: 'invalid_application', fields: v.errors })
  const app = v.value
  const now = (deps.now ?? (() => new Date()))()

  // The same wizard submission (double click, retry after a lost response) returns the stored row and completes
  // what the first request may not have finished. It is the retry of an attempt that already counted: no rate limit.
  const existing = await deps.findByKey(app.submissionKey)
  if (existing) {
    if (now.getTime() - Date.parse(existing.createdAt) > REPLAY_SETTLE_MS) await completeAfterInsert(deps, existing)
    return reply(200, { id: existing.id, reference: existing.reference })
  }

  // Every attempt counts, including those the duplicate check refuses, so a 409 probe is limited too.
  const hashes = await attemptHashes(clientIp(req), deps.salt, now)
  if (!(await deps.allowAttempt(hashes))) return reply(429, { error: 'rate_limited' })

  // The catalogue file must really be there: a PDF of at most 20 MB, uploaded to the one path of this submission.
  if (app.cataloguePath) {
    let object: Awaited<ReturnType<SubmitDeps['catalogueObject']>>
    try {
      object = await deps.catalogueObject(app.cataloguePath)
    } catch (e) {
      console.error(`catalogue lookup failed: ${loggable(e)}`)
      return reply(503, { error: 'config_unavailable' })
    }
    if (!object || object.contentType !== 'application/pdf' || object.size < 1 || object.size > MAX_CATALOGUE_BYTES)
      return reply(400, { error: 'invalid_application', fields: { catalogue: 'invalid_file' } })
  }

  const dup = await deps.findOpenDuplicate(app.applicantEmail, app.businessName)
  if (dup) return reply(409, { error: 'duplicate_application' })

  const inserted = await deps.insert(app, hashes[0]!)
  if (inserted === 'duplicate_key') {
    // A concurrent request with the same key stored the row; that request sends the emails.
    const again = await deps.findByKey(app.submissionKey)
    return again ? reply(200, { id: again.id, reference: again.reference }) : reply(500, { error: 'unknown' })
  }

  await recordSubmitted(deps, inserted.id)
  await sendApplicationEmails(deps, inserted, new Set())
  return reply(200, { id: inserted.id, reference: inserted.reference })
}

/** Key replay after the settle time: the missing audit row and every email workflow with no email_log row. */
async function completeAfterInsert(deps: SubmitDeps, stored: StoredApplication) {
  try {
    if (!(await deps.hasSubmittedAudit(stored.id))) await recordSubmitted(deps, stored.id)
  } catch {
    console.error(`application ${stored.id}: audit lookup failed`)
  }
  let logged: Set<string>
  try {
    logged = await deps.loggedWorkflows(stored.id)
  } catch {
    // Without the log the replay cannot tell what was sent; it sends nothing rather than risk a second send.
    console.error(`application ${stored.id}: email log lookup failed`)
    return
  }
  await sendApplicationEmails(deps, stored, logged)
}

/** The application_submitted audit row. A failure is logged without its message (it may carry personal data). */
async function recordSubmitted(deps: SubmitDeps, applicationId: string) {
  try {
    await deps.audit({ eventType: 'application_submitted', applicationId, toStatus: 'submitted' })
  } catch {
    console.error(`application ${applicationId}: application_submitted audit failed`)
  }
}

/**
 * Confirmation to the applicant and notification to the platform team, from the stored row (never a replayed body).
 * Skips the workflows in `skip` (already logged, whatever their status). Logs each outcome; never throws.
 */
async function sendApplicationEmails(deps: SubmitDeps, stored: StoredApplication, skip: Set<string>) {
  await notifyStaff(deps, stored)
  const inbox = deps.config.ok ? deps.config.config.adminNotificationEmail : ''
  const jobs: { kind: 'application_confirmation' | 'admin_notification'; to: string; lang: 'en' | 'pt'; workflow: string }[] = [
    { kind: 'application_confirmation', to: stored.applicantEmail, lang: stored.language, workflow: `application:${stored.id}:application_confirmation` },
    { kind: 'admin_notification', to: inbox, lang: 'en', workflow: `application:${stored.id}:admin_notification` },
  ]
  // Opted-in staff get the same alert, once each and never twice for the admin inbox (S1, spec §3).
  const seen = new Set([inbox.trim().toLowerCase()].filter(Boolean))
  for (const email of await staffRecipients(deps)) {
    const key = email.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    jobs.push({ kind: 'admin_notification', to: email.trim(), lang: 'en', workflow: `application:${stored.id}:staff_alert:${(await sha256Hex(key)).slice(0, 16)}` })
  }
  for (const job of jobs) {
    const workflow = job.workflow
    if (skip.has(workflow)) continue
    try {
      if (!deps.config.ok || !job.to) {
        const rendered = renderEmail(job.kind, job.lang, { businessName: stored.businessName ?? undefined })
        await deps.log({
          kind: job.kind,
          recipient: job.to || 'not configured',
          subject: rendered.subject,
          status: 'blocked',
          error: deps.config.ok ? 'admin_recipient_not_configured' : 'email_not_configured',
          applicationId: stored.id,
          workflow,
        })
        continue
      }
      const config = deps.config.config
      const email = renderEmail(job.kind, job.lang, {
        businessName: stored.businessName ?? undefined,
        applicantEmail: stored.applicantEmail,
        actionUrl: job.kind === 'admin_notification' && config.appBaseUrl.startsWith('https://') ? `${config.appBaseUrl}/admin/applications/${stored.id}` : undefined,
      })
      await sendAndLog({ config, fetch: deps.fetch, log: deps.log }, { ...email, to: job.to, kind: job.kind, applicationId: stored.id, workflow, idempotencyKey: workflow })
    } catch (e) {
      // The application is stored; a logging failure must not turn the response into an error.
      console.error(`application email ${job.kind} failed: ${loggable(e)}`)
    }
  }
}

/** The bell and the phone: one notification per staff member per application (the dedupe key covers replays). */
async function notifyStaff(deps: SubmitDeps, stored: StoredApplication) {
  if (!deps.notify) return
  try {
    await deps.notify({ audience: { staff: 'applications.view' }, kind: 'new_application', ...applicationNotice(stored.businessName ?? ''), link: `/admin/applications/${stored.id}`, dedupeKey: `application:${stored.id}` })
  } catch (e) {
    console.error(`application notification failed: ${loggable(e)}`)
  }
}

async function staffRecipients(deps: SubmitDeps): Promise<string[]> {
  try {
    return await deps.staffAlertRecipients()
  } catch (e) {
    console.error(`staff alert lookup failed: ${loggable(e)}`)
    return []
  }
}

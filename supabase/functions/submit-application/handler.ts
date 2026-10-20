// Request handling for the public submit-application Edge Function (design/24-applications.md, ADR-0024).
//   POST <wizard answers + submissionKey>  →  200 { id, reference }
// Validates with the same rules as the wizard, rate-limits per salted IP hash, stores the application with the
// service role, records the audit event and sends the confirmation and admin notification. Email problems never
// undo the stored application: every attempt is logged with what actually happened.
import { type NormalizedApplication, validateApplication } from '../_shared/application.ts'
import { type ConfigResult, type LogEntry, sendAndLog } from '../_shared/email.ts'
import { renderEmail } from '../_shared/email-templates.ts'
import { clientIp, readJsonObject, reply, sha256Hex } from '../_shared/http.ts'

export const MAX_SUBMISSIONS_PER_HOUR = 5
const MAX_BODY_BYTES = 20_000

export interface StoredApplication {
  id: string
  reference: string
}

export interface SubmitDeps {
  config: ConfigResult
  fetch: typeof fetch
  /** Secret mixed into the submitter hash so raw IPs cannot be recovered from it. */
  salt: string
  now?: () => Date
  findByKey(submissionKey: string): Promise<StoredApplication | null>
  /** An open (submitted / under review) application for the same business name from the same email. */
  findOpenDuplicate(email: string, businessName: string): Promise<StoredApplication | null>
  countRecent(submitterHash: string, sinceIso: string): Promise<number>
  /** Inserts the row; 'duplicate_key' when the submission key already exists (a concurrent retry). */
  insert(app: NormalizedApplication, submitterHash: string): Promise<StoredApplication | 'duplicate_key'>
  audit(event: { eventType: string; applicationId: string; toStatus?: string; metadata?: Record<string, unknown> }): Promise<void>
  log(entry: LogEntry): Promise<string>
}

export async function submitterHash(ip: string, salt: string): Promise<string> {
  return sha256Hex(`application|${ip}|${salt}`)
}

export async function handleSubmitApplication(req: Request, deps: SubmitDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  if (!deps.salt) return reply(500, { error: 'not_configured' })

  const body = await readJsonObject(req, MAX_BODY_BYTES)
  if (!body) return reply(400, { error: 'invalid_application' })
  // Honeypot field: people never see it, so a value means an automated submission.
  if (typeof body.hp === 'string' && body.hp.trim()) return reply(400, { error: 'invalid_application' })

  const v = validateApplication(body)
  if (!v.ok) return reply(400, { error: 'invalid_application', fields: v.errors })
  const app = v.value

  // The same wizard submission (double click, retry after a lost response) returns the stored row.
  const existing = await deps.findByKey(app.submissionKey)
  if (existing) return reply(200, { id: existing.id, reference: existing.reference })

  const dup = await deps.findOpenDuplicate(app.applicantEmail, app.businessName)
  if (dup) return reply(409, { error: 'duplicate_application' })

  const now = (deps.now ?? (() => new Date()))()
  const hash = await submitterHash(clientIp(req), deps.salt)
  if ((await deps.countRecent(hash, new Date(now.getTime() - 3600_000).toISOString())) >= MAX_SUBMISSIONS_PER_HOUR) return reply(429, { error: 'rate_limited' })

  const inserted = await deps.insert(app, hash)
  if (inserted === 'duplicate_key') {
    const again = await deps.findByKey(app.submissionKey)
    return again ? reply(200, { id: again.id, reference: again.reference }) : reply(500, { error: 'unknown' })
  }

  await deps.audit({ eventType: 'application_submitted', applicationId: inserted.id, toStatus: 'submitted' })
  await sendApplicationEmails(deps, app, inserted)
  return reply(200, { id: inserted.id, reference: inserted.reference })
}

/** Confirmation to the applicant and notification to the platform team. Logs each outcome; never throws. */
async function sendApplicationEmails(deps: SubmitDeps, app: NormalizedApplication, stored: StoredApplication) {
  const jobs: { kind: 'application_confirmation' | 'admin_notification'; to: string; lang: 'en' | 'pt' }[] = [
    { kind: 'application_confirmation', to: app.applicantEmail, lang: app.language },
    { kind: 'admin_notification', to: deps.config.ok ? deps.config.config.adminNotificationEmail : '', lang: 'en' },
  ]
  for (const job of jobs) {
    const workflow = `application:${stored.id}:${job.kind}`
    try {
      if (!deps.config.ok || !job.to) {
        const rendered = renderEmail(job.kind, job.lang, { businessName: app.businessName })
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
        businessName: app.businessName,
        applicantEmail: app.applicantEmail,
        actionUrl: job.kind === 'admin_notification' && config.appBaseUrl.startsWith('https://') ? `${config.appBaseUrl}/admin/applications/${stored.id}` : undefined,
      })
      await sendAndLog({ config, fetch: deps.fetch, log: deps.log }, { ...email, to: job.to, kind: job.kind, applicationId: stored.id, workflow, idempotencyKey: workflow })
    } catch (e) {
      // The application is stored; a logging failure must not turn the response into an error.
      console.error(`application email ${job.kind} failed: ${String(e).slice(0, 200)}`)
    }
  }
}

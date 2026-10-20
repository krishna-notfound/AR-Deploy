// Server-side email through Resend (design/23-email.md). Web-standard APIs only (fetch, no SDK, no Deno globals),
// so it runs in Edge Functions and under Vitest. The API key is an Edge Function secret and never reaches a browser.

export type EmailKind = 'owner_invitation' | 'invitation_resend' | 'application_confirmation' | 'admin_notification' | 'test'

/** Same values as the email_log.status check constraint. */
export type EmailStatus = 'blocked' | 'failed' | 'accepted' | 'sent' | 'delivered' | 'delayed' | 'bounced' | 'complained'

export interface EmailConfig {
  apiKey: string
  /** e.g. "Sanctus <onboarding@resend.dev>" until a domain is verified. */
  from: string
  /** Base URL for links in emails (the Preview URL during development, the production domain later). */
  appBaseUrl: string
  /** Lower-case recipients allowed while sending from Resend's test domain. */
  testRecipients: string[]
  /** Where admin notifications go. */
  adminNotificationEmail: string
}

export type ConfigResult = { ok: true; config: EmailConfig } | { ok: false; missing: string[] }

/** Reads the email settings from Edge Function secrets. Reports missing names, never values. */
export function readEmailConfig(env: (name: string) => string | undefined): ConfigResult {
  const get = (n: string) => env(n)?.trim() ?? ''
  const config: EmailConfig = {
    apiKey: get('RESEND_API_KEY'),
    from: get('EMAIL_FROM'),
    appBaseUrl: get('APP_BASE_URL').replace(/\/+$/, ''),
    testRecipients: get('EMAIL_TEST_RECIPIENTS').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    adminNotificationEmail: get('ADMIN_NOTIFICATION_EMAIL'),
  }
  const missing = (['RESEND_API_KEY', 'EMAIL_FROM', 'APP_BASE_URL'] as const).filter((n) => !get(n))
  if (config.appBaseUrl && !/^https?:\/\/[^\s/]+/.test(config.appBaseUrl)) missing.push('APP_BASE_URL')
  return missing.length ? { ok: false, missing } : { ok: true, config }
}

const SIMULATION_ADDRESS = /^(delivered|bounced|complained|suppressed)(\+[\w.-]+)?@resend\.dev$/i
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/

export const isValidEmail = (to: string) => to.length <= 320 && EMAIL.test(to)

/** True while sending from Resend's shared test domain (no verified domain yet). */
export const usesTestSender = (from: string) => /@resend\.dev>?\s*$/i.test(from)

/**
 * Resend's test domain only delivers to the Resend account's own address and to its simulation addresses.
 * Refusing other recipients up front gives a clear "blocked" log entry instead of a provider 403.
 */
export function recipientAllowed(config: EmailConfig, to: string): { ok: true } | { ok: false; reason: string } {
  if (!isValidEmail(to)) return { ok: false, reason: 'invalid_recipient' }
  if (!usesTestSender(config.from)) return { ok: true }
  const lower = to.toLowerCase()
  if (SIMULATION_ADDRESS.test(lower) || config.testRecipients.includes(lower)) return { ok: true }
  return { ok: false, reason: 'test_sender_recipient_not_allowed' }
}

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text: string
  /** Same key → Resend sends at most once (protects against double clicks and retries). */
  idempotencyKey?: string
}

export type SendResult = { ok: true; id: string } | { ok: false; status: number; error: string }

/** POST https://api.resend.com/emails. Never throws: network and provider errors come back as { ok: false }. */
export async function sendViaResend(fetchFn: typeof fetch, config: EmailConfig, email: OutgoingEmail): Promise<SendResult> {
  try {
    const res = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        ...(email.idempotencyKey ? { 'Idempotency-Key': email.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: config.from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
    })
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }
    if (res.ok && body.id) return { ok: true, id: body.id }
    return { ok: false, status: res.status, error: (body.message || body.name || `HTTP ${res.status}`).slice(0, 500) }
  } catch (e) {
    return { ok: false, status: 0, error: `network: ${String(e).slice(0, 200)}` }
  }
}

/** Maps Resend's last_event for a message to a log status. Unknown or pre-delivery events stay "accepted". */
export function statusFromProviderEvent(lastEvent: string | undefined): EmailStatus {
  switch (lastEvent) {
    case 'sent':
      return 'sent'
    case 'delivered':
      return 'delivered'
    case 'delivery_delayed':
      return 'delayed'
    case 'bounced':
      return 'bounced'
    case 'complained':
      return 'complained'
    case 'failed':
    case 'canceled':
      return 'failed'
    default:
      return 'accepted'
  }
}

/** GET https://api.resend.com/emails/:id → provider evidence for a sent message. */
export async function fetchProviderStatus(fetchFn: typeof fetch, config: EmailConfig, id: string): Promise<{ ok: true; lastEvent: string; status: EmailStatus } | { ok: false; error: string }> {
  try {
    const res = await fetchFn(`https://api.resend.com/emails/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${config.apiKey}` } })
    const body = (await res.json().catch(() => ({}))) as { last_event?: string; message?: string }
    if (!res.ok) return { ok: false, error: (body.message || `HTTP ${res.status}`).slice(0, 300) }
    const lastEvent = body.last_event ?? 'unknown'
    return { ok: true, lastEvent, status: statusFromProviderEvent(lastEvent) }
  } catch (e) {
    return { ok: false, error: `network: ${String(e).slice(0, 200)}` }
  }
}

export interface LogEntry {
  kind: EmailKind
  recipient: string
  subject: string
  status: EmailStatus
  providerMessageId?: string
  error?: string
  businessId?: string
  applicationId?: string
  /** Groups the attempts of one logical email, e.g. "invite:<business id>". */
  workflow?: string
  attempt?: number
  triggeredBy?: string
}

export interface SendDeps {
  config: EmailConfig
  fetch: typeof fetch
  /** Inserts one public.email_log row with the service role and returns its id. */
  log(entry: LogEntry): Promise<string>
}

export type SendAndLogResult = { logId: string; status: EmailStatus; providerMessageId?: string; error?: string }

/** Guard → send → log. Every attempt is logged; "accepted" means Resend took the message, not that it arrived. */
export async function sendAndLog(
  deps: SendDeps,
  email: OutgoingEmail & Pick<LogEntry, 'kind' | 'businessId' | 'applicationId' | 'workflow' | 'attempt' | 'triggeredBy'>,
): Promise<SendAndLogResult> {
  const base = {
    kind: email.kind,
    recipient: email.to,
    subject: email.subject,
    businessId: email.businessId,
    applicationId: email.applicationId,
    workflow: email.workflow,
    attempt: email.attempt,
    triggeredBy: email.triggeredBy,
  }
  const allowed = recipientAllowed(deps.config, email.to)
  if (!allowed.ok) {
    const logId = await deps.log({ ...base, status: 'blocked', error: allowed.reason })
    return { logId, status: 'blocked', error: allowed.reason }
  }
  const sent = await sendViaResend(deps.fetch, deps.config, email)
  if (!sent.ok) {
    const logId = await deps.log({ ...base, status: 'failed', error: sent.error })
    return { logId, status: 'failed', error: sent.error }
  }
  const logId = await deps.log({ ...base, status: 'accepted', providerMessageId: sent.id })
  return { logId, status: 'accepted', providerMessageId: sent.id }
}

/** email_log insert values for a LogEntry (shared by every function that logs email). */
export function logRow(e: LogEntry) {
  return {
    kind: e.kind,
    recipient: e.recipient,
    subject: e.subject,
    status: e.status,
    provider_message_id: e.providerMessageId ?? null,
    error: e.error ?? null,
    business_id: e.businessId ?? null,
    application_id: e.applicationId ?? null,
    workflow: e.workflow ?? null,
    attempt: e.attempt ?? 1,
    triggered_by: e.triggeredBy ?? null,
  }
}

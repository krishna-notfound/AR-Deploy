// Request handling for the send-test-email Edge Function (design/23-email.md). The platform Owner only, at the 2FA level
// the staff policy requires (R-W1-1).
//   POST { "action": "send", "to": "...", "lang": "en" | "pt" }      → sends the test template, logs it
//   POST { "action": "status", "providerMessageId": "..." }          → asks Resend what happened, updates the log
// Web-standard APIs only, so it runs under Deno in production and under Vitest in tests.
import { type ConfigResult, type EmailStatus, type LogEntry, fetchProviderStatus, sendAndLog } from '../_shared/email.ts'
import { renderEmail } from '../_shared/email-templates.ts'
import { type GateResult, gateReply } from '../_shared/gate.ts'

export interface TestEmailDeps {
  config: ConfigResult
  fetch: typeof fetch
  /** Verifies the caller's access token with Supabase Auth; null when invalid or expired. */
  userIdFromToken(token: string): Promise<string | null>
  /** The 2FA gate with the caller's own token (R-W1-1): caller_mfa_satisfied(), then is_platform_admin(). */
  gate(token: string): Promise<GateResult>
  log(entry: LogEntry): Promise<string>
  updateStatus(providerMessageId: string, status: EmailStatus): Promise<void>
}

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

const reply = (status: number, body?: Record<string, unknown>) =>
  new Response(body ? JSON.stringify(body) : null, { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })

export async function handleTestEmail(req: Request, deps: TestEmailDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const userId = token ? await deps.userIdFromToken(token) : null
  if (!userId) return reply(401, { error: 'not_signed_in' })
  const gate = await deps.gate(token)
  if (gate !== 'ok') return gateReply(gate)

  // Names of missing secrets are safe to show an admin; values never are.
  if (!deps.config.ok) return reply(503, { error: 'email_not_configured', missing: deps.config.missing })
  const config = deps.config.config

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return reply(400, { error: 'invalid_json' })
  }

  if (body.action === 'status') {
    const id = typeof body.providerMessageId === 'string' ? body.providerMessageId : ''
    if (!/^[\w-]{8,100}$/.test(id)) return reply(400, { error: 'invalid_provider_message_id' })
    const r = await fetchProviderStatus(deps.fetch, config, id)
    if (!r.ok) return reply(502, { error: 'provider_lookup_failed', detail: r.error })
    await deps.updateStatus(id, r.status)
    return reply(200, { providerMessageId: id, lastEvent: r.lastEvent, status: r.status })
  }

  if (body.action === 'send') {
    const to = typeof body.to === 'string' ? body.to.trim() : ''
    const lang = body.lang === 'pt' ? 'pt' : 'en'
    const email = renderEmail('test', lang)
    const result = await sendAndLog(
      { config, fetch: deps.fetch, log: deps.log },
      { ...email, to, kind: 'test', triggeredBy: userId, idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey.slice(0, 100) : undefined },
    )
    // 200 even when blocked/failed: the request worked and the log row tells the outcome.
    return reply(200, { ...result, note: result.status === 'accepted' ? 'Accepted by Resend. Not yet evidence of delivery: query action=status.' : undefined })
  }

  return reply(400, { error: 'unknown_action' })
}

// Request handling for the provision-owner Edge Function (ADR-0024). Platform admins only.
//   POST { action: "provision", businessId, email, language, applicationId? }  → links the single owner, emails an invitation
//   POST { action: "resend", businessId, language? }                           → new invitation link for the invited owner
// The link comes from Supabase Auth (auth.admin.generateLink), goes only into the email and is never returned,
// stored or logged. An email failure keeps the owner linked; the admin can resend once the cause is fixed.
import { type ConfigResult, type EmailStatus, type LogEntry, isValidEmail, sendAndLog } from '../_shared/email.ts'
import { renderEmail } from '../_shared/email-templates.ts'
import { UUID, bearerToken, readJsonObject, reply } from '../_shared/http.ts'

export const RESEND_COOLDOWN_SECONDS = 60
export const MAX_INVITATION_ATTEMPTS = 10

export type LinkResult = { ok: true; url: string; userId: string } | { ok: false; error: string }

export interface ProvisionDeps {
  config: ConfigResult
  fetch: typeof fetch
  now?: () => Date
  userIdFromToken(token: string): Promise<string | null>
  isPlatformAdmin(userId: string): Promise<boolean>
  getBusiness(id: string): Promise<{ id: string; name: string } | null>
  getOwner(businessId: string): Promise<{ userId: string; email: string; acceptedAt: string | null } | null>
  userIdByEmail(email: string): Promise<string | null>
  /** auth.admin.generateLink; 'invite' creates the account, 'magiclink' signs an existing one in. */
  generateLink(type: 'invite' | 'magiclink', email: string, redirectTo: string): Promise<LinkResult>
  linkOwner(businessId: string, userId: string, actorId: string, applicationId: string | null): Promise<'linked' | 'already_linked' | 'business_has_owner'>
  /** Invitation emails already logged for this business (any outcome), newest first. */
  invitationAttempts(businessId: string): Promise<{ count: number; lastAt: string | null }>
  audit(event: { eventType: string; actorId: string; businessId: string; applicationId?: string | null; metadata?: Record<string, unknown> }): Promise<void>
  log(entry: LogEntry): Promise<string>
}

type Outcome = { owner: 'linked' | 'already_linked'; email: { status: EmailStatus; error?: string; attempt: number } }

/** Where the invitation lands: APP_BASE_URL when configured, else the admin's own origin (Preview deployments). */
function landingUrl(deps: ProvisionDeps, req: Request, lang: 'en' | 'pt'): string | null {
  const configured = deps.config.ok ? deps.config.config.appBaseUrl : ''
  const origin = req.headers.get('origin') ?? ''
  const base = configured || (/^https:\/\/[^\s/]+$|^http:\/\/localhost(:\d+)?$/.test(origin) ? origin : '')
  return base ? `${base}/accept-invite?lang=${lang}` : null
}

export async function handleProvisionOwner(req: Request, deps: ProvisionDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const token = bearerToken(req)
  const actorId = token ? await deps.userIdFromToken(token) : null
  if (!actorId) return reply(401, { error: 'not_signed_in' })
  if (!(await deps.isPlatformAdmin(actorId))) return reply(403, { error: 'platform_admin_only' })

  const body = await readJsonObject(req, 4_000)
  if (!body) return reply(400, { error: 'invalid_request' })
  const businessId = typeof body.businessId === 'string' && UUID.test(body.businessId) ? body.businessId : ''
  if (!businessId) return reply(400, { error: 'invalid_request' })
  const lang = body.language === 'pt' ? 'pt' : 'en'
  const business = await deps.getBusiness(businessId)
  if (!business) return reply(404, { error: 'business_not_found' })
  const owner = await deps.getOwner(businessId)

  if (body.action === 'provision') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!isValidEmail(email)) return reply(400, { error: 'invalid_request', fields: { email: 'Enter a valid email address.' } })
    const applicationId = typeof body.applicationId === 'string' && UUID.test(body.applicationId) ? body.applicationId : null
    if (owner && owner.email.toLowerCase() !== email) return reply(409, { error: 'business_has_owner' })
    if (owner) return resend(req, deps, { actorId, business, owner, lang, applicationId })

    const existingId = await deps.userIdByEmail(email)
    if (existingId && (await deps.isPlatformAdmin(existingId))) return reply(409, { error: 'email_is_admin' })
    const redirect = landingUrl(deps, req, lang)
    if (!redirect) return reply(503, { error: 'not_configured' })
    const link = await createLink(deps, email, redirect)
    if (!link.ok) {
      await deps.audit({ eventType: 'invitation_failed', actorId, businessId, applicationId, metadata: { reason: link.error.slice(0, 200) } })
      return reply(502, { error: 'invite_link_failed' })
    }
    const linked = await deps.linkOwner(businessId, link.userId, actorId, applicationId)
    if (linked === 'business_has_owner') return reply(409, { error: 'business_has_owner' })
    const attempts = await deps.invitationAttempts(businessId)
    const sent = await sendInvitation(deps, { kind: 'owner_invitation', to: email, lang, business, url: link.url, attempt: attempts.count + 1, actorId, applicationId })
    await deps.audit({ eventType: 'invitation_requested', actorId, businessId, applicationId, metadata: { attempt: sent.attempt, email_status: sent.status } })
    return reply(200, { owner: linked, email: sent } satisfies Outcome)
  }

  if (body.action === 'resend') {
    if (!owner) return reply(404, { error: 'no_owner' })
    return resend(req, deps, { actorId, business, owner, lang, applicationId: null })
  }

  return reply(400, { error: 'unknown_action' })
}

async function resend(
  req: Request,
  deps: ProvisionDeps,
  ctx: { actorId: string; business: { id: string; name: string }; owner: { email: string; acceptedAt: string | null }; lang: 'en' | 'pt'; applicationId: string | null },
): Promise<Response> {
  const { actorId, business, owner, lang, applicationId } = ctx
  if (owner.acceptedAt) return reply(409, { error: 'already_accepted' })
  const attempts = await deps.invitationAttempts(business.id)
  if (attempts.count >= MAX_INVITATION_ATTEMPTS) return reply(429, { error: 'too_many_attempts' })
  const now = (deps.now ?? (() => new Date()))().getTime()
  if (attempts.lastAt && now - Date.parse(attempts.lastAt) < RESEND_COOLDOWN_SECONDS * 1000) return reply(429, { error: 'cooldown' })
  const redirect = landingUrl(deps, req, lang)
  if (!redirect) return reply(503, { error: 'not_configured' })
  const link = await createLink(deps, owner.email, redirect)
  if (!link.ok) {
    await deps.audit({ eventType: 'invitation_failed', actorId, businessId: business.id, applicationId, metadata: { reason: link.error.slice(0, 200), resend: true } })
    return reply(502, { error: 'invite_link_failed' })
  }
  const sent = await sendInvitation(deps, { kind: 'invitation_resend', to: owner.email, lang, business, url: link.url, attempt: attempts.count + 1, actorId, applicationId })
  await deps.audit({ eventType: 'invitation_resent', actorId, businessId: business.id, applicationId, metadata: { attempt: sent.attempt, email_status: sent.status } })
  return reply(200, { owner: 'already_linked', email: sent } satisfies Outcome)
}

/** An invite link for a new or never-confirmed account; a sign-in link once the account is confirmed. */
async function createLink(deps: ProvisionDeps, email: string, redirectTo: string): Promise<LinkResult> {
  const invite = await deps.generateLink('invite', email, redirectTo)
  if (invite.ok) return invite
  const magic = await deps.generateLink('magiclink', email, redirectTo)
  return magic.ok ? magic : { ok: false, error: `${invite.error} / ${magic.error}` }
}

async function sendInvitation(
  deps: ProvisionDeps,
  a: { kind: 'owner_invitation' | 'invitation_resend'; to: string; lang: 'en' | 'pt'; business: { id: string; name: string }; url: string; attempt: number; actorId: string; applicationId: string | null },
): Promise<Outcome['email']> {
  const workflow = `invite:${a.business.id}`
  const base = { kind: a.kind, businessId: a.business.id, applicationId: a.applicationId ?? undefined, workflow, attempt: a.attempt, triggeredBy: a.actorId }
  if (!deps.config.ok) {
    const { subject } = renderEmail(a.kind, a.lang, { businessName: a.business.name })
    await deps.log({ ...base, recipient: a.to, subject, status: 'blocked', error: 'email_not_configured' })
    return { status: 'blocked', error: 'email_not_configured', attempt: a.attempt }
  }
  // Supabase verify links are https:// on hosted projects; anything else is refused by the template.
  const email = renderEmail(a.kind, a.lang, { businessName: a.business.name, actionUrl: a.url })
  const r = await sendAndLog({ config: deps.config.config, fetch: deps.fetch, log: deps.log }, { ...email, ...base, to: a.to, idempotencyKey: `${workflow}:${a.attempt}` })
  return { status: r.status, error: r.error, attempt: a.attempt }
}

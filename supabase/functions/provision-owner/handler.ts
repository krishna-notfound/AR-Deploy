// Request handling for the provision-owner Edge Function (ADR-0024). Staff with owners.manage only, at the 2FA level
// their policy requires (R-W1-1): the gate runs before anything is read or created.
//   POST { action: "provision", businessId, email, language, applicationId? }  → links the single owner, emails an invitation
//   POST { action: "resend", businessId, language? }                           → new invitation code for the invited owner
// The one-time code comes from Supabase Auth (auth.admin.generateLink's email_otp, ADR-0027), goes only into the email
// and is never returned, stored or logged. The email links to the plain /accept-invite page, where the owner types it.
// An email failure keeps the owner linked; the admin can resend once the cause is fixed.
import { type ConfigResult, type EmailStatus, type LogEntry, isValidEmail, sendAndLog } from '../_shared/email.ts'
import { renderEmail } from '../_shared/email-templates.ts'
import { type GateResult, gateReply } from '../_shared/gate.ts'
import { UUID, bearerToken, readJsonObject, reply } from '../_shared/http.ts'

export const RESEND_COOLDOWN_SECONDS = 60
export const MAX_INVITATION_ATTEMPTS = 10

export type CodeResult = { ok: true; code: string; userId: string } | { ok: false; error: string }

export interface ProvisionDeps {
  config: ConfigResult
  fetch: typeof fetch
  now?: () => Date
  userIdFromToken(token: string): Promise<string | null>
  /**
   * The 2FA gate with the caller's own token (R-W1-1): caller_mfa_satisfied(), then platform_can('owners.manage'), so an
   * Owner or an active member with owners.manage (ADR-0029), at aal2 when their policy or factor requires it.
   */
  gate(token: string): Promise<GateResult>
  /** A platform_members row (any status) has this lower-case email: a team invitation counts before any login exists (R-W1-8). */
  isTeamEmail(email: string): Promise<boolean>
  /** Anyone with platform access (an Owner or any platform member): they can never own a business. */
  isPlatformStaff(userId: string): Promise<boolean>
  getBusiness(id: string): Promise<{ id: string; name: string } | null>
  getOwner(businessId: string): Promise<{ userId: string; email: string; acceptedAt: string | null } | null>
  /**
   * The account already registered for this email, if any. `invited` is true when Supabase Auth created it through an
   * invitation (auth.users.invited_at); `ownsBusiness` when it is already a member of a business.
   */
  accountByEmail(email: string): Promise<{ id: string; invited: boolean; ownsBusiness: boolean } | null>
  /** The one-time code of auth.admin.generateLink; 'invite' creates the account, 'magiclink' signs an existing one in. */
  generateCode(type: 'invite' | 'magiclink', email: string): Promise<CodeResult>
  /** service_link_owner; 'email_is_admin' when the database finds a team row for the account's email (R-W1-8). */
  linkOwner(businessId: string, userId: string, actorId: string, applicationId: string | null): Promise<'linked' | 'already_linked' | 'business_has_owner' | 'email_is_admin'>
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
  const gate = await deps.gate(token)
  if (gate !== 'ok') return gateReply(gate)

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

    // Platform staff can never own a business (ADR-0029): a team invitation, active or not, is refused before any
    // account is looked up or created; an Owner (platform_admins) is found through the account.
    if (await deps.isTeamEmail(email)) return reply(409, { error: 'email_is_admin' })
    const existing = await deps.accountByEmail(email)
    if (existing && (await deps.isPlatformStaff(existing.id))) return reply(409, { error: 'email_is_admin' })
    // The dashboard serves one business per owner, and complete_owner_onboarding expects a single pending membership.
    if (existing?.ownsBusiness) return reply(409, { error: 'email_owns_business' })
    // An account this platform did not invite was registered by someone else (or before sign-ups were closed). Linking
    // it would hand the business to whoever set its password, so it is refused rather than reused (SEC-20).
    if (existing && !existing.invited) return reply(409, { error: 'account_not_invited' })
    const page = landingUrl(deps, req, lang)
    if (!page) return reply(503, { error: 'not_configured' })
    const issued = await createCode(deps, email)
    if (!issued.ok) {
      await deps.audit({ eventType: 'invitation_failed', actorId, businessId, applicationId, metadata: { reason: issued.error.slice(0, 200) } })
      return reply(502, { error: 'invite_link_failed' })
    }
    const linked = await deps.linkOwner(businessId, issued.userId, actorId, applicationId)
    if (linked === 'business_has_owner' || linked === 'email_is_admin') return reply(409, { error: linked })
    const attempts = await deps.invitationAttempts(businessId)
    const sent = await sendInvitation(deps, { kind: 'owner_invitation', to: email, lang, business, page, code: issued.code, attempt: attempts.count + 1, actorId, applicationId })
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
  const page = landingUrl(deps, req, lang)
  if (!page) return reply(503, { error: 'not_configured' })
  const issued = await createCode(deps, owner.email)
  if (!issued.ok) {
    await deps.audit({ eventType: 'invitation_failed', actorId, businessId: business.id, applicationId, metadata: { reason: issued.error.slice(0, 200), resend: true } })
    return reply(502, { error: 'invite_link_failed' })
  }
  const sent = await sendInvitation(deps, { kind: 'invitation_resend', to: owner.email, lang, business, page, code: issued.code, attempt: attempts.count + 1, actorId, applicationId })
  await deps.audit({ eventType: 'invitation_resent', actorId, businessId: business.id, applicationId, metadata: { attempt: sent.attempt, email_status: sent.status } })
  return reply(200, { owner: 'already_linked', email: sent } satisfies Outcome)
}

/** An invite code for a new or never-confirmed account; a sign-in code once the account is confirmed. Each replaces the last. */
async function createCode(deps: ProvisionDeps, email: string): Promise<CodeResult> {
  const invite = await deps.generateCode('invite', email)
  if (invite.ok) return invite
  const magic = await deps.generateCode('magiclink', email)
  return magic.ok ? magic : { ok: false, error: `${invite.error} / ${magic.error}` }
}

async function sendInvitation(
  deps: ProvisionDeps,
  a: { kind: 'owner_invitation' | 'invitation_resend'; to: string; lang: 'en' | 'pt'; business: { id: string; name: string }; page: string; code: string; attempt: number; actorId: string; applicationId: string | null },
): Promise<Outcome['email']> {
  const workflow = `invite:${a.business.id}`
  const base = { kind: a.kind, businessId: a.business.id, applicationId: a.applicationId ?? undefined, workflow, attempt: a.attempt, triggeredBy: a.actorId }
  if (!deps.config.ok) {
    const { subject } = renderEmail(a.kind, a.lang, { businessName: a.business.name })
    await deps.log({ ...base, recipient: a.to, subject, status: 'blocked', error: 'email_not_configured' })
    return { status: 'blocked', error: 'email_not_configured', attempt: a.attempt }
  }
  // The landing page must be https:// (the template refuses anything else); the code only ever goes into this email.
  const email = renderEmail(a.kind, a.lang, { businessName: a.business.name, actionUrl: a.page, code: a.code })
  const r = await sendAndLog({ config: deps.config.config, fetch: deps.fetch, log: deps.log }, { ...email, ...base, to: a.to, idempotencyKey: `${workflow}:${a.attempt}` })
  return { status: r.status, error: r.error, attempt: a.attempt }
}

// Request handling for the account-security Edge Function (S1, spec §7). Every action that must be checked on the
// server: emailed action codes, recovery codes, turning 2FA off, account closure and the Owner's reset tools.
//   POST { action, ...args } with the caller's own JWT → { ok: true, ... } | { ok: false, error }
// The caller comes from getUser() on their JWT, never from the body. Action codes and recovery codes exist in plain
// text only inside this function and the email to the account holder: only salted SHA-256 hashes reach the database,
// and neither is ever logged, audited or put in the email log (which stores the subject, kind and status only).
import type { LogEntry, OutgoingEmail, SendAndLogResult } from '../_shared/email.ts'
import { type SecurityNotice, closureRequestEmail, securityCodeEmail, securityNoticeEmail } from '../_shared/email-templates.ts'
import { UUID, bearerToken, clientIp, readJsonObject, reply, sha256Hex } from '../_shared/http.ts'

export const ACTION_PURPOSES = ['disable_2fa', 'regenerate_recovery', 'request_closure', 'owner_reset_2fa', 'complete_closure'] as const
export type ActionPurpose = (typeof ACTION_PURPOSES)[number]
/** Codes only the platform Owner may ask for (their actions refuse everyone else anyway). */
const OWNER_PURPOSES: ReadonlySet<string> = new Set(['owner_reset_2fa', 'complete_closure'])

/** Recovery-code alphabet: no I, L, O, 0 or 1, so a code read aloud or handwritten is unambiguous. */
export const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const RECOVERY_CODES_PER_SET = 8
const RECOVERY_LENGTH = 10
/** The first set after enrolling needs no emailed code while the new factor is this fresh. */
export const FIRST_SET_WINDOW_MS = 15 * 60_000

export type ErrorCode =
  | 'not_signed_in' | 'invalid_request' | 'invalid_code' | 'code_expired' | 'too_many_attempts' | 'rate_limited'
  | 'aal2_required' | 'policy_requires_2fa' | 'owner_cannot_close' | 'already_requested' | 'not_allowed'
  | 'not_found' | 'email_failed' | 'unknown'

const STATUS: Record<ErrorCode, number> = {
  not_signed_in: 401,
  invalid_request: 400, invalid_code: 400, code_expired: 400, already_requested: 400, not_found: 400, email_failed: 400,
  aal2_required: 403, policy_requires_2fa: 403, owner_cannot_close: 403, not_allowed: 403,
  too_many_attempts: 429, rate_limited: 429,
  unknown: 500,
}

export interface Factor {
  id: string
  /** 'totp' (the only kind the app enrols) or another Supabase factor type. */
  type: string
  status: 'verified' | 'unverified' | string
  /** When the factor last changed; for a verified factor, about when it was verified. ISO. */
  updatedAt: string
}

export type SecurityEmail = OutgoingEmail & Pick<LogEntry, 'kind' | 'businessId' | 'workflow' | 'triggeredBy'>

export interface AccountSecurityDeps {
  /** The app's https base URL, the only link a notice may carry ('' when not configured). */
  appBaseUrl: string
  /** The admin notification inbox for closure alerts ('' when not configured). */
  adminNotificationEmail: string
  userIdFromToken(token: string): Promise<string | null>
  /** Read from the JWT payload; only called after userIdFromToken accepted the token. */
  aalFromToken(token: string): 'aal1' | 'aal2'
  /** A service_* SQL function, with the service role. Returns its jsonb result; throws on a transport error. */
  rpc(fn: string, args: Record<string, unknown>): Promise<Record<string, unknown>>
  listFactors(userId: string): Promise<Factor[]>
  deleteFactor(userId: string, factorId: string): Promise<void>
  deleteUser(userId: string): Promise<void>
  /** Deletes the business row (related rows cascade) and its product-media and business-logos folders. */
  deleteBusiness(businessId: string): Promise<void>
  userEmail(userId: string): Promise<string | null>
  /** sendAndLog: sends through Resend and writes one email_log row. */
  send(email: SecurityEmail): Promise<SendAndLogResult>
  /** n bytes from a CSPRNG. */
  random(n: number): Uint8Array
  now(): Date
}

class Refusal {
  constructor(readonly code: ErrorCode) {}
}

const KNOWN = new Set<string>(Object.keys(STATUS))
const fail = (code: ErrorCode) => reply(STATUS[code], { ok: false, error: code })
const done = (extra: Record<string, unknown> = {}) => reply(200, { ok: true, ...extra })

interface Ctx {
  deps: AccountSecurityDeps
  userId: string
  aal: 'aal1' | 'aal2'
  ip: string | null
  body: Record<string, unknown>
}

type Action = (ctx: Ctx) => Promise<Response>

export async function handleAccountSecurity(req: Request, deps: AccountSecurityDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'invalid_request' })

  const token = bearerToken(req)
  const userId = token ? await deps.userIdFromToken(token) : null
  if (!userId) return fail('not_signed_in')

  const body = await readJsonObject(req, 4_000)
  const action = body?.action
  if (!body || typeof action !== 'string' || !Object.hasOwn(ACTIONS, action)) return fail('invalid_request')

  const ip = clientIp(req)
  const ctx: Ctx = { deps, userId, aal: deps.aalFromToken(token), ip: ip === 'unknown' ? null : ip, body }
  try {
    return await ACTIONS[action]!(ctx)
  } catch (e) {
    if (e instanceof Refusal) return fail(e.code)
    throw e
  }
}

// ---------------------------------------------------------------- actions

const ACTIONS: Record<string, Action> = {
  async send_code(ctx) {
    const { deps, userId, body } = ctx
    const purpose = body.purpose
    if (typeof purpose !== 'string' || !(ACTION_PURPOSES as readonly string[]).includes(purpose)) throw new Refusal('invalid_request')
    if (OWNER_PURPOSES.has(purpose) && (await classify(ctx, userId)) !== 'owner') throw new Refusal('not_allowed')
    const email = await deps.userEmail(userId)
    if (!email) throw new Refusal('not_found')

    const code = sixDigitCode(deps.random)
    const salt = hex(deps.random(16))
    const created = await sql(ctx, 'service_create_action_code', { p_user: userId, p_purpose: purpose, p_code_hash: await sha256Hex(salt + code), p_salt: salt })

    let sent: SendAndLogResult | null = null
    try {
      sent = await deps.send({
        ...securityCodeEmail(code),
        to: email,
        kind: 'security_code',
        workflow: `security_code:${userId}:${purpose}`,
        triggeredBy: userId,
        idempotencyKey: `security_code:${String(created.id ?? '')}`,
      })
    } catch (e) {
      console.error(`account-security: code email failed (${errorName(e)})`)
    }
    if (sent?.status !== 'accepted') {
      await voidCodes(ctx, purpose)
      throw new Refusal('email_failed')
    }
    return done({ sentTo: maskEmail(email) })
  },

  async generate_recovery_codes(ctx) {
    const { deps, userId, body } = ctx
    requireAal2(ctx)
    const verified = (await deps.listFactors(userId)).filter(isVerifiedTotp)
    if (!verified.length) throw new Refusal('not_allowed')
    const left = Number((await sql(ctx, 'service_has_recovery_codes', { p_user: userId })).count ?? 0)
    const now = deps.now().getTime()
    const freshFactor = verified.some((f) => {
      const at = Date.parse(f.updatedAt)
      return Number.isFinite(at) && now - at <= FIRST_SET_WINDOW_MS && at - now <= 60_000
    })
    const firstSet = left === 0 && freshFactor
    if (!firstSet) await checkCode(ctx, 'regenerate_recovery', body.code)

    const codes = Array.from({ length: RECOVERY_CODES_PER_SET }, () => recoveryCode(deps.random))
    const salt = hex(deps.random(16))
    const hashes = await Promise.all(codes.map((c) => sha256Hex(salt + c)))
    await sql(ctx, 'service_set_recovery_codes', { p_user: userId, p_hashes: hashes, p_salt: salt })
    await logEvent(ctx, userId, firstSet ? 'account_2fa_enabled' : 'account_recovery_regenerated')
    await notify(ctx, userId, firstSet ? '2fa_enabled' : 'recovery_regenerated')
    return done({ codes: codes.map((c) => `${c.slice(0, 5)}-${c.slice(5)}`) })
  },

  async redeem_recovery_code(ctx) {
    const { deps, userId, body } = ctx
    const code = normalizeRecoveryCode(body.code)
    if (!code) throw new Refusal('invalid_code')
    // Recovery is for someone who cannot finish the second step: at aal2 they turn 2FA off with an emailed code.
    if (ctx.aal !== 'aal1') throw new Refusal('not_allowed')
    if (!(await deps.listFactors(userId)).some(isVerifiedTotp)) throw new Refusal('not_allowed')
    await sql(ctx, 'service_use_recovery_code', { p_user: userId, p_code: code })
    await wipeSecondFactor(ctx, userId)
    await logEvent(ctx, userId, 'account_recovery_used')
    await notify(ctx, userId, 'recovery_used')
    return done()
  },

  async disable_2fa(ctx) {
    const { userId, body } = ctx
    requireAal2(ctx)
    if ((await sql(ctx, 'service_requires_2fa', { p_user: userId })).requires === true) throw new Refusal('policy_requires_2fa')
    await checkCode(ctx, 'disable_2fa', body.code)
    await wipeSecondFactor(ctx, userId)
    await logEvent(ctx, userId, 'account_2fa_disabled')
    await notify(ctx, userId, '2fa_disabled')
    return done()
  },

  async request_closure(ctx) {
    const { deps, userId, body } = ctx
    const kind = await classify(ctx, userId)
    if (kind === 'owner') throw new Refusal('owner_cannot_close')
    if (kind !== 'business' && kind !== 'staff') throw new Refusal('not_allowed')
    await checkCode(ctx, 'request_closure', body.code)
    const email = await deps.userEmail(userId)
    const r = await sql(ctx, 'service_request_closure', { p_user: userId })

    if (r.kind === 'business') {
      const businessId = typeof r.business_id === 'string' ? r.business_id : undefined
      await logEvent(ctx, userId, 'account_closure_requested', businessId ? { business_id: businessId } : {})
      await notify(ctx, userId, 'closure_requested', email)
      if (deps.adminNotificationEmail && email) {
        await sendQuietly(ctx, {
          ...closureRequestEmail(email, deps.appBaseUrl),
          to: deps.adminNotificationEmail,
          kind: 'closure_request',
          businessId,
          workflow: `closure_request:${userId}`,
          triggeredBy: userId,
        })
      }
      return done({ kind: 'business' })
    }

    // Admin or Team member: the SQL deactivated the membership and ended the sessions; the account goes now.
    // Logged first, while the user still exists, with the address replaced by its hash.
    await logEvent(ctx, userId, 'account_deleted', email ? { email_sha256: await emailHash(email) } : {})
    await deps.deleteUser(userId)
    return done({ kind: 'staff' })
  },

  async owner_reset_2fa(ctx) {
    const target = targetUser(ctx)
    await requireOwnerAal2(ctx)
    if (target === ctx.userId) throw new Refusal('not_allowed')
    const kind = await classify(ctx, target)
    if (kind === 'owner') throw new Refusal('not_allowed')
    if (kind !== 'staff' && kind !== 'business') throw new Refusal('not_found')
    await checkCode(ctx, 'owner_reset_2fa', ctx.body.code)
    await wipeSecondFactor(ctx, target)
    await logEvent(ctx, ctx.userId, 'account_2fa_reset_by_owner', { subject_id: target })
    await notify(ctx, target, '2fa_reset_by_owner')
    return done()
  },

  async complete_closure(ctx) {
    const { deps } = ctx
    const target = targetUser(ctx)
    await requireOwnerAal2(ctx)
    if (target === ctx.userId) throw new Refusal('not_allowed')
    const t = await sql(ctx, 'service_closure_target', { p_user: target })
    await checkCode(ctx, 'complete_closure', ctx.body.code)
    const email = typeof t.email === 'string' ? t.email : await deps.userEmail(target)
    const businessId = typeof t.business_id === 'string' ? t.business_id : null

    if (businessId) await deps.deleteBusiness(businessId)
    await deps.deleteUser(target)
    await logEvent(ctx, ctx.userId, 'account_closure_completed', {
      subject_id: target,
      ...(businessId ? { business_id: businessId } : {}),
      ...(email ? { email_sha256: await emailHash(email) } : {}),
    })
    if (email) await notify(ctx, target, 'closure_completed', email)
    return done()
  },

  async restore_closure(ctx) {
    const target = targetUser(ctx)
    await requireOwnerAal2(ctx)
    const email = await ctx.deps.userEmail(target)
    await sql(ctx, 'service_restore_closure', { p_user: target, p_actor: ctx.userId })
    await notify(ctx, target, 'closure_restored', email)
    return done()
  },
}

// ---------------------------------------------------------------- gates and helpers

/** Calls a service_* function; an { error } answer becomes a Refusal with a known code (anything else: unknown). */
async function sql(ctx: Ctx, fn: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await ctx.deps.rpc(fn, args)
  if (!r || typeof r !== 'object') throw new Refusal('unknown')
  if (typeof r.error === 'string') throw new Refusal(KNOWN.has(r.error) ? (r.error as ErrorCode) : 'unknown')
  return r
}

function requireAal2(ctx: Ctx) {
  if (ctx.aal !== 'aal2') throw new Refusal('aal2_required')
}

async function classify(ctx: Ctx, user: string): Promise<string> {
  const kind = (await sql(ctx, 'service_classify_user', { p_user: user })).kind
  return typeof kind === 'string' ? kind : 'none'
}

async function requireOwnerAal2(ctx: Ctx) {
  if ((await classify(ctx, ctx.userId)) !== 'owner') throw new Refusal('not_allowed')
  requireAal2(ctx)
}

function targetUser(ctx: Ctx): string {
  const t = ctx.body.target_user_id
  if (typeof t !== 'string' || !UUID.test(t)) throw new Refusal('invalid_request')
  return t.toLowerCase()
}

/** Checks (and on success consumes) the caller's newest emailed code for this purpose. */
async function checkCode(ctx: Ctx, purpose: ActionPurpose, raw: unknown) {
  const code = typeof raw === 'string' ? raw.replace(/\s+/g, '') : ''
  if (!/^\d{6}$/.test(code)) throw new Refusal('invalid_code')
  await sql(ctx, 'service_check_action_code', { p_user: ctx.userId, p_purpose: purpose, p_code: code })
}

/**
 * After a failed send, store one more code whose plain value is 32 random bytes: a newer code replaces the older
 * ones, and no 6-digit guess can match this one. If even that is refused (rate limit), the unsent code was never
 * shown to anyone and expires in 10 minutes.
 */
async function voidCodes(ctx: Ctx, purpose: string) {
  try {
    const salt = hex(ctx.deps.random(16))
    await ctx.deps.rpc('service_create_action_code', {
      p_user: ctx.userId, p_purpose: purpose, p_code_hash: await sha256Hex(salt + hex(ctx.deps.random(32))), p_salt: salt,
    })
  } catch (e) {
    console.error(`account-security: could not void an unsent code (${errorName(e)})`)
  }
}

/** Deletes every MFA factor of the user and their recovery codes. */
async function wipeSecondFactor(ctx: Ctx, user: string) {
  for (const f of await ctx.deps.listFactors(user)) await ctx.deps.deleteFactor(user, f.id)
  await sql(ctx, 'service_clear_recovery_codes', { p_user: user })
}

async function logEvent(ctx: Ctx, user: string, event: string, metadata: Record<string, unknown> = {}) {
  await sql(ctx, 'service_log_account_event', { p_user: user, p_event: event, p_metadata: metadata, p_ip: ctx.ip })
}

/** A security notice to the account holder. The action already happened, so a failed notice only logs. */
async function notify(ctx: Ctx, user: string, notice: SecurityNotice, knownEmail?: string | null) {
  const to = knownEmail ?? (await ctx.deps.userEmail(user).catch(() => null))
  if (!to) return
  await sendQuietly(ctx, { ...securityNoticeEmail(notice, ctx.deps.appBaseUrl), to, kind: 'security_notice', workflow: `security_notice:${user}:${notice}`, triggeredBy: ctx.userId })
}

async function sendQuietly(ctx: Ctx, email: SecurityEmail) {
  try {
    await ctx.deps.send(email)
  } catch (e) {
    console.error(`account-security: ${email.kind} email failed (${errorName(e)})`)
  }
}

const isVerifiedTotp = (f: Factor) => f.type === 'totp' && f.status === 'verified'
const errorName = (e: unknown) => (e instanceof Error ? e.name : 'error')
const emailHash = (email: string) => sha256Hex(email.trim().toLowerCase())

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 1) return '•••'
  return `${email[0]}•••${email.slice(at)}`
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

/** 6 digits from 32-bit draws, rejecting the top remainder so every code is equally likely. */
export function sixDigitCode(random: (n: number) => Uint8Array): string {
  const LIMIT = 2 ** 32 - (2 ** 32 % 1_000_000)
  for (;;) {
    const b = random(4)
    const v = ((b[0]! << 24) >>> 0) + (b[1]! << 16) + (b[2]! << 8) + b[3]!
    if (v < LIMIT) return String(v % 1_000_000).padStart(6, '0')
  }
}

/** 10 characters from RECOVERY_ALPHABET, rejection-sampled from random bytes (no modulo bias). */
export function recoveryCode(random: (n: number) => Uint8Array): string {
  const n = RECOVERY_ALPHABET.length
  const limit = 256 - (256 % n)
  let out = ''
  while (out.length < RECOVERY_LENGTH) {
    for (const b of random(16)) {
      if (b < limit && out.length < RECOVERY_LENGTH) out += RECOVERY_ALPHABET[b % n]
    }
  }
  return out
}

/** Upper case with spaces and dashes removed; null unless it is then exactly a well-formed recovery code. */
export function normalizeRecoveryCode(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 40) return null
  const code = raw.replace(/[\s-]+/g, '').toUpperCase()
  return code.length === RECOVERY_LENGTH && [...code].every((c) => RECOVERY_ALPHABET.includes(c)) ? code : null
}

/** The aal claim of a JWT the gateway and getUser() already accepted; anything unreadable counts as aal1. */
export function aalFromJwt(token: string): 'aal1' | 'aal2' {
  try {
    const part = token.split('.')[1]
    if (!part) return 'aal1'
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    const payload = JSON.parse(atob(b64)) as { aal?: unknown }
    return payload.aal === 'aal2' ? 'aal2' : 'aal1'
  } catch {
    return 'aal1'
  }
}

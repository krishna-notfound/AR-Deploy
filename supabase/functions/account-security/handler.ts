// Request handling for the account-security Edge Function (S1, spec §7). Every action that must be checked on the
// server: emailed action codes, recovery codes, turning 2FA off, account closure and the Owner's reset tools.
//   POST { action, ...args } with the caller's own JWT → { ok: true, ... } | { ok: false, error }
// The caller comes from getUser() on their JWT, never from the body. Action codes and recovery codes exist in plain
// text only inside this function and the email to the account holder: only salted SHA-256 hashes reach the database,
// and neither is ever logged, audited or put in the email log (which stores the subject, kind and status only).
import type { EmailStatus, LogEntry, OutgoingEmail, SendAndLogResult } from '../_shared/email.ts'
import { type RenderedEmail, type SecurityNotice, closureCancelledEmail, closureRequestEmail, securityCodeEmail, securityNoticeEmail, teamNoticeEmail } from '../_shared/email-templates.ts'
import { UUID, bearerToken, clientIp, readJsonObject, reply, sha256Hex } from '../_shared/http.ts'

export const ACTION_PURPOSES = ['disable_2fa', 'regenerate_recovery', 'request_closure', 'owner_reset_2fa', 'complete_closure'] as const
export type ActionPurpose = (typeof ACTION_PURPOSES)[number]
/** Codes only the platform Owner may ask for (their actions refuse everyone else anyway). */
const OWNER_PURPOSES: ReadonlySet<string> = new Set(['owner_reset_2fa', 'complete_closure'])

/** Recovery-code alphabet: 31 characters (no I, L, O, 0 or 1, so a code read aloud or handwritten is unambiguous).
 * 10 characters give about 49.5 bits per code. */
export const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const RECOVERY_CODES_PER_SET = 8
const RECOVERY_LENGTH = 10
/** The first set after enrolling needs no emailed code while the new factor is this fresh. */
export const FIRST_SET_WINDOW_MS = 15 * 60_000

export type ErrorCode =
  | 'not_signed_in' | 'invalid_request' | 'invalid_code' | 'code_expired' | 'too_many_attempts' | 'rate_limited'
  | 'aal2_required' | 'policy_requires_2fa' | 'owner_cannot_close' | 'already_requested' | 'not_allowed'
  | 'not_found' | 'email_failed' | 'unknown'
  | 'nothing_to_reset' | 'email_blocked'

const STATUS: Record<ErrorCode, number> = {
  not_signed_in: 401,
  invalid_request: 400, invalid_code: 400, code_expired: 400, already_requested: 400, not_found: 400, email_failed: 400,
  email_blocked: 400,
  aal2_required: 403, policy_requires_2fa: 403, owner_cannot_close: 403, not_allowed: 403,
  too_many_attempts: 429, rate_limited: 429,
  nothing_to_reset: 409,
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

/** What happened to a notice email (R-W7-6): the email_log status, and the reason when it was not accepted. */
export interface NoticeOutcome {
  status: EmailStatus
  error?: string
}

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
  /** Deletes the business row; related rows cascade (a closure request keeps its row, with business_id set null). */
  deleteBusiness(businessId: string): Promise<void>
  /** Removes the business's product-media and business-logos folders. Throws when it could not remove everything. */
  sweepBusinessStorage(businessId: string): Promise<void>
  userEmail(userId: string): Promise<string | null>
  /** sendAndLog: sends through Resend and writes one email_log row. */
  send(email: SecurityEmail): Promise<SendAndLogResult>
  /** Writes one email_log row without sending (a blocked alert with nowhere to go). */
  log(entry: LogEntry): Promise<string>
  /** A public database function as the caller (their JWT), so its own auth.uid() and 2FA checks apply. */
  callerRpc(token: string, fn: string, args?: Record<string, unknown>): Promise<Record<string, unknown>>
  /** A business's name and status, read with the service role; null when it no longer exists. */
  businessSummary(businessId: string): Promise<{ name: string; status: string } | null>
  /** The platform Owners' sign-in addresses (team notices, R-W6-3). */
  ownerEmails(): Promise<string[]>
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
  /** The caller's own access token, for the functions that must run as them (cancel_closure). */
  token: string
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
  const ctx: Ctx = { deps, token, userId, aal: deps.aalFromToken(token), ip: ip === 'unknown' ? null : ip, body }
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
      // R-W7-7: a blocked address won't take a retry (only a change on the platform's side will); anything else might.
      throw new Refusal(sent?.status === 'blocked' ? 'email_blocked' : 'email_failed')
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
    // An account protected by 2FA (its own factor, or its group's policy) closes only from a session at aal2: an
    // emailed code alone (someone with the password and the inbox) is not enough. Refused before the code is checked.
    await requireAal2For2faUsers(ctx)
    // An open request is refused before the code is checked, so the code stays usable.
    if ((await deps.rpc('service_closure_target', { p_user: userId }))?.ok === true) throw new Refusal('already_requested')
    await checkCode(ctx, 'request_closure', body.code)
    const email = await deps.userEmail(userId)
    const r = await sql(ctx, 'service_request_closure', { p_user: userId })

    if (r.kind === 'business' && kind === 'business') {
      const businessId = typeof r.business_id === 'string' ? r.business_id : undefined
      // R-W7-9: the event names the business (column and metadata), so it filters and shows with it.
      await logEvent(ctx, userId, 'account_closure_requested', businessId ? { business_id: businessId } : {}, businessId)
      await notify(ctx, userId, 'closure_requested', email)
      await alertInbox(ctx, closureRequestEmail(email ?? 'A business owner', deps.appBaseUrl), businessId, `closure_request:${userId}`)
      return done({ kind: 'business' })
    }

    // Anything but a staff answer for a staff caller deletes nobody.
    if (r.kind !== 'staff' || kind !== 'staff') throw new Refusal('unknown')
    // Admin or Team member: the SQL deactivated the membership and ended the sessions; the account goes now.
    // Logged first, while the user still exists (audit actor_id is a foreign key), with the address hashed.
    const hashed = email ? { email_sha256: await emailHash(email) } : {}
    await logEvent(ctx, userId, 'account_deleted', hashed)
    try {
      await deps.deleteUser(userId)
    } catch (e) {
      console.error(`account-security: staff self-delete failed (${errorName(e)})`)
      await logEvent(ctx, userId, 'account_deleted', { ...hashed, delete_failed: true })
      throw new Refusal('unknown')
    }
    // R-W6-3: each Owner is told. The SQL already wrote access_member_closed while the user existed.
    if (email) await tellOwners(ctx, email, r.role === 'admin' ? 'admin' : 'team')
    return done({ kind: 'staff' })
  },

  // R-W7-9: the app's "Cancel request". The caller's own cancel_account_closure does the work (their auth.uid() and
  // their 2FA gate), then the admin inbox hears about it.
  async cancel_closure(ctx) {
    const { deps, userId } = ctx
    // Read before the request row goes: which business it names.
    const target = await deps.rpc('service_closure_target', { p_user: userId })
    const businessId = target?.ok === true && typeof target.business_id === 'string' ? target.business_id : undefined
    const r = await deps.callerRpc(ctx.token, 'cancel_account_closure', {})
    if (typeof r?.error === 'string') throw new Refusal(KNOWN.has(r.error) ? (r.error as ErrorCode) : 'unknown')
    if (r?.ok !== true) throw new Refusal('unknown')
    const business = businessId ? await deps.businessSummary(businessId).catch(() => null) : null
    const name = business?.name ?? (await deps.userEmail(userId).catch(() => null)) ?? 'A business'
    await alertInbox(ctx, closureCancelledEmail(name, business?.status ?? '', deps.appBaseUrl), businessId, `closure_cancelled:${userId}`)
    return done()
  },

  async owner_reset_2fa(ctx) {
    const target = targetUser(ctx)
    await requireOwnerAal2(ctx)
    if (target === ctx.userId) throw new Refusal('not_allowed')
    const kind = await classify(ctx, target)
    if (kind === 'owner') throw new Refusal('not_allowed')
    if (kind !== 'staff' && kind !== 'business') throw new Refusal('not_found')
    // R-W6-6: nothing to reset (no verified factor, no unused recovery codes) → no email, no event, code kept.
    if (!(await has2fa(ctx, target))) throw new Refusal('nothing_to_reset')
    await checkCode(ctx, 'owner_reset_2fa', ctx.body.code)
    await wipeSecondFactor(ctx, target)
    await logEvent(ctx, ctx.userId, 'account_2fa_reset_by_owner', { subject_id: target })
    return done({ notice: await notify(ctx, target, '2fa_reset_by_owner') })
  },

  async complete_closure(ctx) {
    const { deps } = ctx
    const target = targetUser(ctx)
    await requireOwnerAal2(ctx)
    if (target === ctx.userId) throw new Refusal('not_allowed')
    if ((await classify(ctx, target)) === 'owner') throw new Refusal('not_allowed')
    // Refused before anything is deleted (and before the code is used) unless the request is still open and its
    // requester still owns the business (R-W1-2): `not_found` from SQL, or any answer that is not an explicit ok.
    const t = await sql(ctx, 'service_closure_target', { p_user: target })
    if (t.ok !== true) throw new Refusal('not_found')
    await checkCode(ctx, 'complete_closure', ctx.body.code)
    const email = typeof t.email === 'string' ? t.email : await deps.userEmail(target)
    // null once the business is gone (business_id is on delete set null), e.g. on a retry after a failed user delete.
    const businessId = typeof t.business_id === 'string' ? t.business_id : null
    const metadata: Record<string, unknown> = {
      subject_id: target,
      ...(businessId ? { business_id: businessId } : {}),
      ...(email ? { email_sha256: await emailHash(email) } : {}),
    }

    if (businessId) {
      await deps.deleteBusiness(businessId)
      // Best effort: the rows are gone either way; leftover files are noted in the audit event.
      try {
        await deps.sweepBusinessStorage(businessId)
      } catch (e) {
        console.error(`account-security: storage sweep incomplete (${errorName(e)})`)
        metadata.storage_sweep_incomplete = true
      }
    }
    try {
      await deps.deleteUser(target)
    } catch (e) {
      // The request row stays, so the Owner can retry with a new code; the business is not deleted twice.
      console.error(`account-security: closure user delete failed (${errorName(e)})`)
      await logEvent(ctx, ctx.userId, 'account_closure_completed', { ...metadata, user_delete_failed: true })
      throw new Refusal('unknown')
    }
    await logEvent(ctx, ctx.userId, 'account_closure_completed', metadata)
    return done({ notice: email ? await notify(ctx, target, 'closure_completed', email) : NO_ADDRESS })
  },

  async restore_closure(ctx) {
    const target = targetUser(ctx)
    await requireOwnerAal2(ctx)
    const email = await ctx.deps.userEmail(target)
    await sql(ctx, 'service_restore_closure', { p_user: target, p_actor: ctx.userId })
    return done({ notice: await notify(ctx, target, 'closure_restored', email) })
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

/** aal2 when the caller has a verified TOTP factor or their group's policy requires 2FA. */
async function requireAal2For2faUsers(ctx: Ctx) {
  if (ctx.aal === 'aal2') return
  if ((await ctx.deps.listFactors(ctx.userId)).some(isVerifiedTotp)) throw new Refusal('aal2_required')
  if ((await sql(ctx, 'service_requires_2fa', { p_user: ctx.userId })).requires === true) throw new Refusal('aal2_required')
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
 * After a failed send, every open code for that purpose stops working. If even that fails, the unsent code was never
 * shown to anyone and expires in 10 minutes.
 */
async function voidCodes(ctx: Ctx, purpose: string) {
  try {
    await ctx.deps.rpc('service_void_action_codes', { p_user: ctx.userId, p_purpose: purpose })
  } catch (e) {
    console.error(`account-security: could not void an unsent code (${errorName(e)})`)
  }
}

/** A verified factor or unused recovery codes: the same rule as private.has_2fa (admin_list_members' has2fa). */
async function has2fa(ctx: Ctx, user: string): Promise<boolean> {
  if ((await ctx.deps.listFactors(user)).some((f) => f.status === 'verified')) return true
  return Number((await sql(ctx, 'service_has_recovery_codes', { p_user: user })).count ?? 0) > 0
}

/** Deletes every MFA factor of the user and their recovery codes. */
async function wipeSecondFactor(ctx: Ctx, user: string) {
  for (const f of await ctx.deps.listFactors(user)) await ctx.deps.deleteFactor(user, f.id)
  await sql(ctx, 'service_clear_recovery_codes', { p_user: user })
}

/**
 * The request IP is stored only on the caller's own events: an event about someone else (subject_id) shows in that
 * user's Security activity, which must not reveal where the Owner signed in from.
 */
async function logEvent(ctx: Ctx, user: string, event: string, metadata: Record<string, unknown> = {}, businessId?: string) {
  const aboutSomeoneElse = typeof metadata.subject_id === 'string' && metadata.subject_id !== user
  await sql(ctx, 'service_log_account_event', {
    p_user: user, p_event: event, p_metadata: metadata, p_ip: aboutSomeoneElse ? null : ctx.ip,
    ...(businessId ? { p_business_id: businessId } : {}),
  })
}

/** The account has no address to write to. */
const NO_ADDRESS: NoticeOutcome = { status: 'blocked', error: 'no_recipient' }

/**
 * A security notice to the account holder. The action already happened, so a failed notice never undoes it: the
 * outcome is returned so the Owner's tools can say whether the person was told (R-W7-6).
 */
async function notify(ctx: Ctx, user: string, notice: SecurityNotice, knownEmail?: string | null): Promise<NoticeOutcome> {
  const to = knownEmail ?? (await ctx.deps.userEmail(user).catch(() => null))
  if (!to) return NO_ADDRESS
  return sendQuietly(ctx, { ...securityNoticeEmail(notice, ctx.deps.appBaseUrl), to, kind: 'security_notice', workflow: `security_notice:${user}:${notice}`, triggeredBy: ctx.userId })
}

async function sendQuietly(ctx: Ctx, email: SecurityEmail): Promise<NoticeOutcome> {
  try {
    const r = await ctx.deps.send(email)
    return r.status === 'accepted' || !r.error ? { status: r.status } : { status: r.status, error: r.error }
  } catch (e) {
    console.error(`account-security: ${email.kind} email failed (${errorName(e)})`)
    return { status: 'failed' }
  }
}

/**
 * A closure alert for the admin inbox. With no inbox set, a blocked row is logged instead (R-W7-9), so the email log
 * shows the alert that had nowhere to go.
 */
async function alertInbox(ctx: Ctx, rendered: RenderedEmail, businessId: string | undefined, workflow: string) {
  const to = ctx.deps.adminNotificationEmail
  if (to) {
    await sendQuietly(ctx, { ...rendered, to, kind: 'closure_request', businessId, workflow, triggeredBy: ctx.userId })
    return
  }
  try {
    await ctx.deps.log({ kind: 'closure_request', recipient: 'not configured', subject: rendered.subject, status: 'blocked', error: 'admin_recipient_not_configured', businessId, workflow, triggeredBy: ctx.userId })
  } catch (e) {
    console.error(`account-security: closure_request log failed (${errorName(e)})`)
  }
}

/** R-W6-3: one team_notice per platform Owner. Sent after the account is gone, so no log row names the deleted user. */
async function tellOwners(ctx: Ctx, email: string, role: 'admin' | 'team') {
  const owners = await ctx.deps.ownerEmails().catch((e: unknown) => {
    console.error(`account-security: owner lookup failed (${errorName(e)})`)
    return [] as string[]
  })
  const closedOn = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(ctx.deps.now())
  const rendered = teamNoticeEmail(email, role, closedOn)
  const workflow = `team_notice:${await emailHash(email)}`
  for (const to of new Set(owners.map((o) => o.trim()).filter(Boolean))) {
    await sendQuietly(ctx, { ...rendered, to, kind: 'team_notice', workflow })
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

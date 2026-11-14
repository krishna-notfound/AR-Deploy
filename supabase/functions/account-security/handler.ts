// Request handling for the account-security Edge Function (S1, spec §7). Every action that must be checked on the
// server: emailed action codes, recovery codes, turning 2FA off, account closure and the Owner's reset tools.
//   POST { action, ...args } with the caller's own JWT → { ok: true, ... } | { ok: false, error }
// The caller comes from getUser() on their JWT, never from the body. Action codes and recovery codes exist in plain
// text only inside this function and the email to the account holder: only salted SHA-256 hashes reach the database,
// and neither is ever logged, audited or put in the email log (which stores the subject, kind and status only).
import { type EmailStatus, type LogEntry, type OutgoingEmail, SAFE_EMAIL_REASONS, type SendAndLogResult } from '../_shared/email.ts'
import { type RenderedEmail, type SecurityNotice, aliasCodeEmail, closureCancelledEmail, closureRequestEmail, securityCodeEmail, securityNoticeEmail, teamNoticeEmail } from '../_shared/email-templates.ts'
import { UUID, bearerToken, clientIp, readJsonObject, reply, sha256Hex } from '../_shared/http.ts'

export const ACTION_PURPOSES = ['disable_2fa', 'regenerate_recovery', 'request_closure', 'owner_reset_2fa', 'complete_closure', 'change_password'] as const
export type ActionPurpose = (typeof ACTION_PURPOSES)[number]
/**
 * Every purpose a code can have in private.action_codes. 'add_alias' (ADR-0077) is not in ACTION_PURPOSES: its code goes
 * to the new alias address, not to the account's own email, so send_code refuses it and alias_send_code sends it.
 */
type CodePurpose = ActionPurpose | 'add_alias'
/** Codes only the platform Owner may ask for (their actions refuse everyone else anyway). */
const OWNER_PURPOSES: ReadonlySet<string> = new Set(['owner_reset_2fa', 'complete_closure'])

/**
 * The buckets whose folder named after the business is removed when its closure completes (R-S4-18 adds the request
 * photos, ADR-0069 the public AR copies).
 */
export const SWEEP_BUCKETS = ['product-media', 'business-logos', 'model-request-photos', 'ar-models'] as const
/**
 * How many folder levels sit below the business folder: request photos are {business}/{request}/{file} (1); the public
 * AR copies written by sync-ar-models are {business}/{product}/{variant|base}/{file} (2).
 */
const SWEEP_DEPTH: Readonly<Record<string, number>> = { 'model-request-photos': 1, 'ar-models': 2 }

/** The storage calls the closure sweep needs (the wiring passes the service-role client). Both throw on an error. */
export interface SweepStorage {
  /** One page (up to 1000) of a folder from `offset`: files have an id, subfolders have none. */
  list(bucket: string, folder: string, offset: number): Promise<{ name: string; id: string | null }[]>
  remove(bucket: string, paths: string[]): Promise<void>
}

/**
 * Removes every file in a business's folder (folder = business id) and, for the request-photo bucket, in each
 * request subfolder below it. Never leaves the business's own folder. Keeps going after a failure and throws at the end.
 */
export async function removeBusinessFolder(storage: SweepStorage, bucket: string, folder: string): Promise<void> {
  let failed = false
  const clear = async (dir: string): Promise<string[]> => {
    const entries: { name: string; id: string | null }[] = []
    for (let page = 0; page < 50; page++) {
      const batch = await storage.list(bucket, dir, page * 1000)
      entries.push(...batch)
      if (batch.length < 1000) break
    }
    const files = entries.filter((e) => e.id).map((e) => `${dir}/${e.name}`)
    for (let i = 0; i < files.length; i += 1000) await storage.remove(bucket, files.slice(i, i + 1000))
    return entries.filter((e) => !e.id).map((e) => `${dir}/${e.name}`)
  }
  let level = await clear(folder)
  for (let depth = 1; depth <= (SWEEP_DEPTH[bucket] ?? 0); depth++) {
    const below: string[] = []
    for (const sub of level) {
      try {
        below.push(...(await clear(sub)))
      } catch {
        failed = true
      }
    }
    level = below
  }
  if (failed) throw new Error(`storage sweep incomplete: ${bucket}`)
}

/**
 * Password rules, the same as the reset page and Settings (src/services/accountService.ts PASSWORD_MIN/MAX). The
 * maximum is bcrypt's limit: Supabase Auth hashes only the first 72 BYTES, so a longer one is refused (ADR-0069).
 */
export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 72
/** ADR-0066: a password change by a 2FA account needs an authenticator code verified this recently (JWT amr). */
export const TOTP_FRESH_MS = 5 * 60_000
/** ADR-0066: a password reset needs a sign-in with the emailed reset code this recently (JWT amr). */
export const RESET_WINDOW_MS = 15 * 60_000
/** amr methods Supabase Auth writes for a session started with an emailed one-time code (verifyOtp). */
const EMAILED_CODE_METHODS: ReadonlySet<string> = new Set(['otp', 'recovery', 'magiclink'])
const TOTP_METHODS: ReadonlySet<string> = new Set(['totp', 'mfa/totp'])

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
  | 'totp_required' | 'current_password_mismatch' | 'weak_password' | 'same_password' | 'reset_expired'
  // ADR-0077: owner sign-in aliases. invalid_credentials is the one neutral answer of the anonymous alias sign-in.
  | 'alias_limit' | 'email_in_use' | 'invalid_credentials'

const STATUS: Record<ErrorCode, number> = {
  not_signed_in: 401,
  invalid_request: 400, invalid_code: 400, code_expired: 400, already_requested: 400, not_found: 400, email_failed: 400,
  email_blocked: 400, invalid_credentials: 400,
  alias_limit: 409, email_in_use: 409,
  current_password_mismatch: 400, weak_password: 400, same_password: 400,
  totp_required: 403, reset_expired: 403,
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
  /**
   * The secret mixed into the rate-limit keys of the anonymous alias actions (APPLICATION_SALT, else derived from the
   * service key): the keys hold no readable IP or address.
   */
  attemptSalt: string
  /** service_application_attempt: true when this attempt is allowed (and it is then recorded under hashes[0]). */
  attempt(hashes: string[], max: number): Promise<boolean>
  /** The session_id claim of the (already accepted) token; null when it has none. */
  sessionFromToken(token: string): string | null
  /** Ends every session of the user except `keep` (all of them when null). Throws on an error. */
  endOtherSessions(userId: string, keep: string | null): Promise<void>
  /** Changes the Auth email with the Auth admin API, already confirmed (email_confirm). 'email_taken' when Auth refuses it; throws on anything else. */
  setEmail(userId: string, email: string): Promise<'ok' | 'email_taken'>
  /** Signs in on a throwaway anon client and keeps the session (its tokens go to the browser). */
  signIn(email: string, password: string): Promise<AliasSignInResult>
  /** Signs in with an emailed recovery code on a throwaway anon client and keeps the session. */
  verifyRecovery(email: string, code: string): Promise<AliasSignInResult>
  /** Asks Supabase Auth to email a reset code to this address (the same email "Forgot password" sends). Answers the same for an unknown address. */
  sendRecovery(email: string): Promise<void>
  userIdFromToken(token: string): Promise<string | null>
  /** Read from the JWT payload; only called after userIdFromToken accepted the token. */
  aalFromToken(token: string): 'aal1' | 'aal2'
  /** The JWT's amr claim (how and when this session proved who it is); only read after userIdFromToken accepted it. */
  amrFromToken(token: string): AmrEntry[]
  /** Signs in with the password on a throwaway client and ends that session at once. Never touches the caller's session. */
  checkPassword(email: string, password: string): Promise<'ok' | 'password_incorrect' | 'rate_limited' | 'unknown'>
  /** Sets the password with the Auth admin API: 'weak_password' when Supabase Auth refuses it; throws on anything else. */
  setPassword(userId: string, password: string): Promise<'ok' | 'weak_password'>
  /** Ends every session of the user (service_end_sessions: their refresh tokens stop working). Throws on an error. */
  endSessions(userId: string): Promise<void>
  /** A service_* SQL function, with the service role. Returns its jsonb result; throws on a transport error. */
  rpc(fn: string, args: Record<string, unknown>): Promise<Record<string, unknown>>
  listFactors(userId: string): Promise<Factor[]>
  deleteFactor(userId: string, factorId: string): Promise<void>
  deleteUser(userId: string): Promise<void>
  /** Deletes the business row; related rows cascade (a closure request keeps its row, with business_id set null). */
  deleteBusiness(businessId: string): Promise<void>
  /** Removes the business's folder in every SWEEP_BUCKETS bucket. Throws when it could not remove everything. */
  sweepBusinessStorage(businessId: string): Promise<void>
  /**
   * Takes the business's public AR copies offline (the ar-models folder, and public_url cleared on its model rows) when
   * a closure is requested: the business is inactive from then on, so nothing of it may stay public (ADR-0069).
   * Throws when it could not remove everything.
   */
  removeArCopies(businessId: string): Promise<void>
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

/** The tokens the browser needs to set the session (supabase-js setSession). Never logged or audited. */
export interface AliasSession {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}
export type AliasSignInResult = { status: 'ok'; session: AliasSession } | { status: 'invalid' | 'rate_limited' | 'unknown' }

/** One amr entry; `at` is the time in ms, or null when the token carries the bare method list (no timestamps). */
export interface AmrEntry {
  method: string
  at: number | null
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
  const body = await readJsonObject(req, 4_000)
  const ip = clientIp(req)

  // ADR-0077: the three actions that run before anyone is signed in (the gateway lets the app's public key through:
  // verify_jwt is off for this function, and every other action below still needs the caller's own token).
  if (body && typeof body.action === 'string' && Object.hasOwn(ANONYMOUS_ACTIONS, body.action)) {
    try {
      return await ANONYMOUS_ACTIONS[body.action]!({ deps, body, ip })
    } catch (e) {
      if (e instanceof Refusal) return fail(e.code)
      throw e
    }
  }

  const userId = token ? await deps.userIdFromToken(token) : null
  if (!userId) return fail('not_signed_in')

  const action = body?.action
  if (!body || typeof action !== 'string' || !Object.hasOwn(ACTIONS, action)) return fail('invalid_request')

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
    // The codes are saved now and exist in plain text only in this answer: a failed audit write must not lose them
    // (a retry would then need a new emailed code, and the saved set could never be shown).
    await logEventQuietly(ctx, userId, firstSet ? 'account_2fa_enabled' : 'account_recovery_regenerated')
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
    try {
      await wipeSecondFactor(ctx, userId)
    } catch (e) {
      // The code was spent but the factor is still there: give the code back so the person can try again.
      await restoreRecoveryCode(ctx, userId, code)
      throw e
    }
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
      // ADR-0069: the business is inactive now, so its public AR copies go offline at once (a failure is noted in the event).
      let arCopiesLeft = false
      if (businessId) {
        try {
          await deps.removeArCopies(businessId)
        } catch (e) {
          console.error(`account-security: AR copies not removed (${errorName(e)})`)
          arCopiesLeft = true
        }
      }
      // R-W7-9: the event names the business (column and metadata), so it filters and shows with it.
      const metadata = { ...(businessId ? { business_id: businessId } : {}), ...(arCopiesLeft ? { ar_copies_removal_incomplete: true } : {}) }
      await logEvent(ctx, userId, 'account_closure_requested', metadata, businessId)
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

  // ADR-0066: the app's only way to change a password. Gates, in order, so nothing is spent on a request that can't
  // succeed: 2FA (aal2, plus an authenticator code from the last 5 minutes when the account has a factor) → the new
  // password's rules → the emailed code (consumed) → the current password (after the code, so this endpoint is no
  // password oracle without the inbox) → set with the service role → every session ends → audit event and notice.
  async change_password(ctx) {
    const { deps, userId, body } = ctx
    const current = typeof body.current_password === 'string' ? body.current_password : ''
    const next = typeof body.new_password === 'string' ? body.new_password : ''
    if (!current) throw new Refusal('invalid_request')
    await requireAal2For2faUsers(ctx)
    if ((await deps.listFactors(userId)).some(isVerifiedTotp) && !freshTotp(ctx)) throw new Refusal('totp_required')
    checkNewPassword(next)
    if (next === current) throw new Refusal('same_password')
    await checkCode(ctx, 'change_password', body.code)
    const email = await deps.userEmail(userId)
    if (!email) throw new Refusal('not_found')
    const check = await deps.checkPassword(email, current)
    if (check === 'password_incorrect') throw new Refusal('current_password_mismatch')
    if (check !== 'ok') throw new Refusal(check)
    const signedOut = await applyPassword(ctx, next)
    await voidCodes(ctx, 'change_password')
    // The password has changed: a failed audit write must not turn this into an error answer.
    await logEventQuietly(ctx, userId, 'account_password_changed', signedOut ? {} : { sessions_end_failed: true })
    await notify(ctx, userId, 'password_changed', email)
    return done({ signedOut })
  },

  // ADR-0066: the last step of "Forgot password". Only a session started with the emailed reset code in the last
  // 15 minutes may set a password without the current one, and an account with 2FA must also have passed its second
  // step in that session (aal2): a reset never skips 2FA. Every session, this one too, ends afterwards.
  async reset_password(ctx) {
    const { deps, userId, body } = ctx
    const next = typeof body.new_password === 'string' ? body.new_password : ''
    checkNewPassword(next)
    if (!recentEmailedCode(ctx)) throw new Refusal('reset_expired')
    if (ctx.aal !== 'aal2' && (await deps.listFactors(userId)).some(isVerifiedTotp)) throw new Refusal('aal2_required')
    const signedOut = await applyPassword(ctx, next)
    await logEventQuietly(ctx, userId, 'account_password_reset', signedOut ? {} : { sessions_end_failed: true })
    await notify(ctx, userId, 'password_reset')
    return done({ signedOut })
  },

  async restore_closure(ctx) {
    const target = targetUser(ctx)
    await requireOwnerAal2(ctx)
    const email = await ctx.deps.userEmail(target)
    await sql(ctx, 'service_restore_closure', { p_user: target, p_actor: ctx.userId })
    return done({ notice: await notify(ctx, target, 'closure_restored', email) })
  },

  // ---- ADR-0077: owner sign-in aliases. The Auth email is the primary (every email goes there); an alias only signs in.

  // The Owner's sign-in emails for Settings: the primary (read from Auth) and the verified aliases.
  async alias_list(ctx) {
    await requireOwner(ctx)
    const primary = await ctx.deps.userEmail(ctx.userId)
    if (!primary) throw new Refusal('not_found')
    const r = await sql(ctx, 'service_alias_list', { p_user: ctx.userId })
    const rows = Array.isArray(r.aliases) ? (r.aliases as { email?: unknown; added_at?: unknown }[]) : []
    const aliases = rows.flatMap((a) => (typeof a.email === 'string' ? [{ email: a.email, addedAt: typeof a.added_at === 'string' ? a.added_at : null }] : []))
    return done({ primary, aliases })
  },

  // Step 1 of adding: the address is held as pending and a one-time code (purpose add_alias) goes to THAT address.
  async alias_send_code(ctx) {
    const { deps, userId } = ctx
    await requireOwner(ctx)
    await requireAal2For2faUsers(ctx)
    const alias = aliasEmail(ctx.body.email)
    await sql(ctx, 'service_alias_begin', { p_user: userId, p_email: alias })

    const code = sixDigitCode(deps.random)
    const salt = hex(deps.random(16))
    let sent: SendAndLogResult | null = null
    try {
      const created = await sql(ctx, 'service_create_action_code', { p_user: userId, p_purpose: 'add_alias', p_code_hash: await sha256Hex(salt + code), p_salt: salt })
      sent = await deps.send({
        ...aliasCodeEmail(code),
        to: alias,
        kind: 'security_code',
        workflow: `security_code:${userId}:add_alias`,
        triggeredBy: userId,
        idempotencyKey: `security_code:${String(created.id ?? '')}`,
      })
    } catch (e) {
      if (e instanceof Refusal) {
        await cancelPendingAlias(ctx, alias)
        throw e
      }
      console.error(`account-security: alias code email failed (${errorName(e)})`)
    }
    if (sent?.status !== 'accepted') {
      await voidCodes(ctx, 'add_alias')
      await cancelPendingAlias(ctx, alias)
      throw new Refusal(sent?.status === 'blocked' ? 'email_blocked' : 'email_failed')
    }
    return done({ sentTo: maskEmail(alias) })
  },

  // Step 2: the code proves the person can read the alias inbox. The code is for the one pending address.
  async alias_add(ctx) {
    const { userId } = ctx
    await requireOwner(ctx)
    await requireAal2For2faUsers(ctx)
    const alias = aliasEmail(ctx.body.email)
    await checkCode(ctx, 'add_alias', ctx.body.code)
    await sql(ctx, 'service_alias_verify', { p_user: userId, p_email: alias })
    await logEventQuietly(ctx, userId, 'account_alias_added', { alias_sha256: await emailHash(alias) })
    return done()
  },

  // Swaps the Auth email with a verified alias. aal2 and an authenticator code from the last 5 minutes (as
  // change_password). The Auth email changes first; if the alias table cannot follow, the old email is put back.
  async alias_make_primary(ctx) {
    const { deps, userId } = ctx
    await requireOwner(ctx)
    requireAal2(ctx)
    if (!freshTotp(ctx)) throw new Refusal('totp_required')
    const next = aliasEmail(ctx.body.email)
    const old = await deps.userEmail(userId)
    if (!old) throw new Refusal('not_found')
    const listed = await sql(ctx, 'service_alias_list', { p_user: userId })
    const known = Array.isArray(listed.aliases) && (listed.aliases as { email?: unknown }[]).some((a) => a.email === next)
    if (!known) throw new Refusal('not_found')

    if ((await deps.setEmail(userId, next)) === 'email_taken') throw new Refusal('email_in_use')
    try {
      await sql(ctx, 'service_alias_swap', { p_user: userId, p_new: next, p_old: old.trim().toLowerCase() })
    } catch (e) {
      try {
        await deps.setEmail(userId, old)
      } catch (restore) {
        console.error(`account-security: could not put the old Auth email back (${errorName(restore)})`)
      }
      throw e
    }
    let signedOutOthers = true
    try {
      await deps.endOtherSessions(userId, deps.sessionFromToken(ctx.token))
    } catch (e) {
      console.error(`account-security: ending the other sessions after a primary change failed (${errorName(e)})`)
      signedOutOthers = false
    }
    await logEventQuietly(ctx, userId, 'account_primary_email_changed', { from_sha256: await emailHash(old), to_sha256: await emailHash(next) })
    // Both addresses hear of it: the old one is the person who may not have asked for this.
    for (const to of new Set([old, next])) {
      await sendQuietly(ctx, { ...securityNoticeEmail('primary_email_changed', deps.appBaseUrl), to, kind: 'security_notice', workflow: `security_notice:${userId}:primary_email_changed:${await emailHash(to)}`, triggeredBy: userId })
    }
    return done({ primary: next, signedOutOthers })
  },

  async alias_remove(ctx) {
    const { userId } = ctx
    await requireOwner(ctx)
    requireAal2(ctx)
    const alias = aliasEmail(ctx.body.email)
    // The primary is the Auth email and is not in the alias table, so it cannot be removed here (not_found).
    await sql(ctx, 'service_alias_remove', { p_user: userId, p_email: alias })
    await logEventQuietly(ctx, userId, 'account_alias_removed', { alias_sha256: await emailHash(alias) })
    return done()
  },
}

// ---------------------------------------------------------------- anonymous alias actions (ADR-0077)

interface AnonCtx {
  deps: AccountSecurityDeps
  body: Record<string, unknown>
  ip: string
}

/** Per hour: attempts of one address, and of one IP, per action. A key is a salted hash, never the address or the IP. */
const ALIAS_LIMITS = {
  sign_in: { perEmail: 6, perIp: 20 },
  reset_request: { perEmail: 3, perIp: 10 },
  reset_verify: { perEmail: 8, perIp: 20 },
} as const
/** Never a real address (.invalid is reserved): a lookup for an alias that does not exist signs in here, so it costs the same. */
const PROBE_EMAIL = 'alias-probe@sanctus.invalid'

async function aliasAttemptAllowed(a: AnonCtx, kind: keyof typeof ALIAS_LIMITS, email: string): Promise<boolean> {
  const limit = ALIAS_LIMITS[kind]
  const now = a.deps.now()
  const days = [now.toISOString().slice(0, 10)]
  const hourAgo = new Date(now.getTime() - 3600_000).toISOString().slice(0, 10)
  if (hourAgo !== days[0]) days.push(hourAgo)
  const keys = (scope: string, value: string) => Promise.all(days.map((day) => sha256Hex(`alias|${kind}|${scope}|${day}|${value}|${a.deps.attemptSalt}`)))
  if (!(await a.deps.attempt(await keys('ip', a.ip), limit.perIp))) return false
  return a.deps.attempt(await keys('email', email), limit.perEmail)
}

/** The typed address in its stored form, or null when it is not an address at all. */
function typedEmail(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 254) return null
  const email = raw.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

/** The primary email of the Owner this alias belongs to, or null (unknown, not verified yet, or no Auth email). */
async function primaryOfAlias(a: AnonCtx, alias: string): Promise<string | null> {
  const r = await a.deps.rpc('service_alias_resolve', { p_email: alias })
  const user = r?.ok === true && typeof r.user_id === 'string' ? r.user_id : null
  return user ? ((await a.deps.userEmail(user).catch(() => null)) ?? null) : null
}

const ANONYMOUS_ACTIONS: Record<string, (a: AnonCtx) => Promise<Response>> = {
  // The login form calls this only after a normal sign-in answered invalid_credentials. Every failure is the same
  // neutral answer: it never says whether the address is an alias, nor what the primary is.
  async alias_sign_in(a) {
    const email = typedEmail(a.body.email)
    const password = a.body.password
    if (!email || typeof password !== 'string' || password.length < 1 || password.length > 1024) throw new Refusal('invalid_credentials')
    if (!(await aliasAttemptAllowed(a, 'sign_in', email))) throw new Refusal('rate_limited')
    const primary = await primaryOfAlias(a, email)
    // Not an alias: the same sign-in happens on a probe address, so the answer takes about as long.
    const result = await a.deps.signIn(primary ?? PROBE_EMAIL, password)
    if (primary && result.status === 'ok') return done({ session: result.session })
    if (result.status === 'rate_limited') throw new Refusal('rate_limited')
    if (primary && result.status === 'unknown') throw new Refusal('unknown')
    throw new Refusal('invalid_credentials')
  },

  // "Forgot password" typed with an alias: the reset code goes to the primary. Always the same answer.
  async alias_reset_request(a) {
    const email = typedEmail(a.body.email)
    if (!email || !(await aliasAttemptAllowed(a, 'reset_request', email))) return done()
    const primary = await primaryOfAlias(a, email)
    try {
      await a.deps.sendRecovery(primary ?? PROBE_EMAIL)
    } catch (e) {
      console.error(`account-security: alias reset request failed (${errorName(e)})`)
    }
    return done()
  },

  // The reset page types the alias and the code that was sent to the primary: Auth only knows the primary, so the
  // function swaps the address and answers with the recovery session.
  async alias_reset_verify(a) {
    const email = typedEmail(a.body.email)
    const code = typeof a.body.code === 'string' ? a.body.code.replace(/\s+/g, '') : ''
    if (!email || !/^\d{6,10}$/.test(code)) throw new Refusal('invalid_code')
    if (!(await aliasAttemptAllowed(a, 'reset_verify', email))) throw new Refusal('rate_limited')
    const primary = await primaryOfAlias(a, email)
    const result = await a.deps.verifyRecovery(primary ?? PROBE_EMAIL, code)
    if (primary && result.status === 'ok') return done({ session: result.session })
    if (result.status === 'rate_limited') throw new Refusal('rate_limited')
    throw new Refusal('invalid_code')
  },
}

// ---------------------------------------------------------------- gates and helpers

/** The same rules as the rest of the app: at least 12 characters, at most 72 bytes, nothing more (spec 8: no composition rules). */
function checkNewPassword(next: string) {
  if (next.length < PASSWORD_MIN || new TextEncoder().encode(next).length > PASSWORD_MAX) throw new Refusal('weak_password')
}

/** Has this session an amr entry of one of these methods from the last `windowMs` (and not from the future, 60 s skew)? */
function recentAmr(ctx: Ctx, methods: ReadonlySet<string>, windowMs: number): boolean {
  const now = ctx.deps.now().getTime()
  return ctx.deps.amrFromToken(ctx.token).some((e) => methods.has(e.method) && e.at !== null && now - e.at <= windowMs && e.at - now <= 60_000)
}
const freshTotp = (ctx: Ctx) => recentAmr(ctx, TOTP_METHODS, TOTP_FRESH_MS)
const recentEmailedCode = (ctx: Ctx) => recentAmr(ctx, EMAILED_CODE_METHODS, RESET_WINDOW_MS)

/**
 * Sets the password, then ends every session of the account. A failure to end them is logged and the new password
 * stands; the answer says whether they ended (false: the app must not claim every device was signed out).
 */
async function applyPassword(ctx: Ctx, next: string): Promise<boolean> {
  if ((await ctx.deps.setPassword(ctx.userId, next)) === 'weak_password') throw new Refusal('weak_password')
  try {
    await ctx.deps.endSessions(ctx.userId)
    return true
  } catch (e) {
    console.error(`account-security: ending sessions after a password change failed (${errorName(e)})`)
    return false
  }
}

/** An audit write after the action already happened: a failure is logged, never answered as an error. */
async function logEventQuietly(ctx: Ctx, user: string, event: string, metadata: Record<string, unknown> = {}) {
  try {
    await logEvent(ctx, user, event, metadata)
  } catch (e) {
    console.error(`account-security: audit event ${event} not written (${e instanceof Refusal ? e.code : errorName(e)})`)
  }
}

/** Gives back a recovery code that was spent by a request that then failed (service_restore_recovery_code, just-used codes only). */
async function restoreRecoveryCode(ctx: Ctx, user: string, code: string) {
  try {
    await ctx.deps.rpc('service_restore_recovery_code', { p_user: user, p_code: code })
  } catch (e) {
    console.error(`account-security: could not give back a recovery code (${errorName(e)})`)
  }
}

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

async function requireOwner(ctx: Ctx) {
  if ((await classify(ctx, ctx.userId)) !== 'owner') throw new Refusal('not_allowed')
}

async function requireOwnerAal2(ctx: Ctx) {
  await requireOwner(ctx)
  requireAal2(ctx)
}

/** The alias address from the request body in its stored form (lower case, trimmed); invalid_request when it is not an address. */
function aliasEmail(raw: unknown): string {
  const email = typedEmail(raw)
  if (!email) throw new Refusal('invalid_request')
  return email
}

/** The email failed to send: the held (unverified) alias goes, so nothing stays half added. */
async function cancelPendingAlias(ctx: Ctx, alias: string) {
  try {
    await ctx.deps.rpc('service_alias_cancel', { p_user: ctx.userId, p_email: alias })
  } catch (e) {
    console.error(`account-security: could not drop the pending alias (${errorName(e)})`)
  }
}

function targetUser(ctx: Ctx): string {
  const t = ctx.body.target_user_id
  if (typeof t !== 'string' || !UUID.test(t)) throw new Refusal('invalid_request')
  return t.toLowerCase()
}

/** Checks (and on success consumes) the caller's newest emailed code for this purpose. */
async function checkCode(ctx: Ctx, purpose: CodePurpose, raw: unknown) {
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

/** The fixed reasons a notice may carry to the app. Provider text never leaves this function (§10.2: no raw text). */
const NOTICE_REASONS = SAFE_EMAIL_REASONS

async function sendQuietly(ctx: Ctx, email: SecurityEmail): Promise<NoticeOutcome> {
  try {
    const r = await ctx.deps.send(email)
    return r.status !== 'accepted' && r.error && NOTICE_REASONS.has(r.error) ? { status: r.status, error: r.error } : { status: r.status }
  } catch (e) {
    console.error(`account-security: ${email.kind} email failed (${errorName(e)})`)
    return { status: 'failed' }
  }
}

/**
 * A closure alert for the platform Owner (ADR-0077): to each Owner's primary email, read from Auth now, so it follows
 * "Make primary". ADMIN_NOTIFICATION_EMAIL is no longer read here. With no Owner address, a blocked row is logged
 * instead (R-W7-9), so the email log shows the alert that had nowhere to go.
 */
async function alertInbox(ctx: Ctx, rendered: RenderedEmail, businessId: string | undefined, workflow: string) {
  const owners = await ctx.deps.ownerEmails().catch((e: unknown) => {
    console.error(`account-security: owner lookup failed (${errorName(e)})`)
    return [] as string[]
  })
  const recipients = [...new Set(owners.map((o) => o.trim()).filter(Boolean))]
  if (recipients.length) {
    for (const to of recipients) await sendQuietly(ctx, { ...rendered, to, kind: 'closure_request', businessId, workflow, triggeredBy: ctx.userId })
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

function jwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    const payload: unknown = JSON.parse(atob(b64))
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** The session_id claim of a JWT getUser() already accepted (the row in auth.sessions); null when it has none. */
export function sessionFromJwt(token: string): string | null {
  const id = jwtPayload(token)?.session_id
  return typeof id === 'string' && UUID.test(id) ? id.toLowerCase() : null
}

/** The aal claim of a JWT the gateway and getUser() already accepted; anything unreadable counts as aal1. */
export function aalFromJwt(token: string): 'aal1' | 'aal2' {
  return jwtPayload(token)?.aal === 'aal2' ? 'aal2' : 'aal1'
}

/**
 * The amr claim of a JWT the gateway and getUser() already accepted: [{ method, timestamp (seconds) }, ...]. The bare
 * form (a list of method names) has no times, so it never counts as recent. Anything unreadable is an empty list.
 */
export function amrFromJwt(token: string): AmrEntry[] {
  const amr = jwtPayload(token)?.amr
  if (!Array.isArray(amr)) return []
  return amr.flatMap((e: unknown): AmrEntry[] => {
    if (typeof e === 'string') return [{ method: e, at: null }]
    if (!e || typeof e !== 'object') return []
    const { method, timestamp } = e as { method?: unknown; timestamp?: unknown }
    if (typeof method !== 'string') return []
    return [{ method, at: typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp * 1000 : null }]
  })
}

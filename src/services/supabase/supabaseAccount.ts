// Supabase implementation of the account settings, security and 2FA methods (S1, spec sections 6 to 8).
// - Profile and preferences: the profiles table (own row, RLS) and the public avatars bucket.
// - Password, email and TOTP: Supabase Auth (supabase-js), with its error codes mapped to fixed messages.
// - Recovery codes, emailed action codes, closure and Owner actions: the account-security Edge Function, which answers
//   { ok: true, ... } or { ok: false, error } (FunctionsHttpError on a non-2xx status).
// - Reads: my_security_state, my_recovery_codes_left, list_my_security_events, admin_list_closure_requests.
// A failure is always reported with a reason; nothing here falls back to demo data.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActionPurpose, ClosureRequest, DateFormatPref, PlatformSettings, Profile, SecurityEvent, SecurityState, TotpEnrollment } from '@/domain/types'
import { settingsPath } from '@/lib/urls'
import { type AccountService, AVATAR_MAX_BYTES, AVATAR_TYPES, DISPLAY_NAME_MAX, EMAIL_PATTERN, PASSWORD_MAX, PASSWORD_MIN, type ProfilePatch, accountFail } from '../accountService'
import { type Result, ok } from '../catalogService'

const FUNCTION = 'account-security'
const AVATARS = 'avatars'
const PROFILE_COLUMNS = 'user_id, display_name, avatar_path, timezone, date_format, clock, notify_new_applications, onboarding_completed_at, onboarding_dismissed_at'
const PLATFORM_COLUMNS = 'require_2fa_staff, require_2fa_business, updated_at'

interface ProfileRow {
  user_id: string
  display_name: string | null
  avatar_path: string | null
  timezone: string
  date_format: string
  clock: string
  notify_new_applications: boolean
  onboarding_completed_at: string | null
  onboarding_dismissed_at: string | null
}
interface PlatformRow {
  require_2fa_staff: boolean
  require_2fa_business: boolean
  updated_at: string | null
}
interface SecurityStateRow {
  requires_2fa?: boolean
  aal?: string
  closure?: { requested_at: string; business_id: string | null } | null
  onboarding?: { completed_at: string | null; dismissed_at: string | null }
}
type DbError = { code?: string; message?: string } | null
type AuthErr = { code?: string; status?: number; name?: string } | null
type FnAnswer = Record<string, unknown> & { ok?: boolean; error?: unknown }

const DATE_FORMATS: DateFormatPref[] = ['d MMM yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd']

/** PostgREST and Postgres codes that mean the S1 migration is not applied yet. */
const MISSING = new Set(['PGRST202', 'PGRST205', '42P01', '42883'])
function dbFail<T = never>(error: DbError): Result<T> {
  const code = error?.code ?? ''
  if (MISSING.has(code)) return accountFail('not_enabled')
  if (code === '42501') return accountFail('not_allowed')
  // check_violation, invalid parameter (timezone trigger), raise_exception from a validation trigger
  if (code === '23514' || code === '22023' || code === 'P0001') return accountFail('invalid_request')
  return accountFail('unknown')
}

/** Supabase Auth codes for TOTP being switched off in the dashboard. */
const MFA_OFF = new Set(['mfa_totp_enroll_not_enabled', 'mfa_totp_verify_not_enabled'])
const isRateLimit = (e: AuthErr) => e?.status === 429 || e?.code === 'over_request_rate_limit'

/** Verifying a 6-digit code (challengeAndVerify). */
const mfaFail = <T = never>(e: AuthErr): Result<T> => {
  if (e?.code && MFA_OFF.has(e.code)) return accountFail('mfa_not_enabled')
  if (isRateLimit(e)) return accountFail('rate_limited')
  // A wrong, expired, reused or rejected code: the Auth server answers 4xx (mfa_verification_failed,
  // mfa_verification_rejected, mfa_challenge_expired, ...).
  if (e && (e.status ?? 0) >= 400 && (e.status ?? 0) < 500) return accountFail('invalid_code')
  return accountFail('unknown')
}

/** Listing, removing and enrolling factors: no code is involved, so never invalid_code. */
const enrolFail = <T = never>(e: AuthErr): Result<T> => {
  if (e?.code && MFA_OFF.has(e.code)) return accountFail('mfa_not_enabled')
  if (e?.code === 'insufficient_aal') return accountFail('aal2_required')
  if (isRateLimit(e)) return accountFail('rate_limited')
  // too_many_enrolled_mfa_factors, a name conflict and any other refusal
  return accountFail('unknown')
}

/** The settings scope of the page the user is on (the email-change link returns there). */
const currentScope = (): 'admin' | 'business' => (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin') ? 'admin' : 'business')
const origin = () => (typeof window !== 'undefined' ? window.location.origin : '')
const userAgent = () => (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 200)
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

export type PasswordCheck = 'ok' | 'password_incorrect' | 'rate_limited' | 'unknown'
/** Checks a password without touching the main session (see makeVerifyCurrentPassword). */
export type VerifyCurrentPassword = (email: string, password: string) => Promise<PasswordCheck>

/**
 * verifyCurrentPassword(email, password): signs in on a new throwaway client (client.ts createPasswordCheckClient),
 * then signs that client out at once (scope local), which revokes the extra session. The main client is never used.
 * - 'ok': the password is right;
 * - 'password_incorrect': invalid_credentials (400);
 * - 'rate_limited': 429 or over_request_rate_limit;
 * - 'unknown': a thrown or fetch error, a 5xx or anything else.
 * The answer is also a reason accountFail knows.
 */
export function makeVerifyCurrentPassword(newClient: () => SupabaseClient): VerifyCurrentPassword {
  return async (email, password) => {
    try {
      const check = newClient()
      const { error } = await check.auth.signInWithPassword({ email, password })
      if (error) {
        const e = error as AuthErr
        if (isRateLimit(e)) return 'rate_limited'
        if (e?.code === 'invalid_credentials') return 'password_incorrect'
        return 'unknown'
      }
      await check.auth.signOut({ scope: 'local' }).catch(() => undefined)
      return 'ok'
    } catch {
      return 'unknown'
    }
  }
}

export function createSupabaseAccount(sb: SupabaseClient, deps: { verifyCurrentPassword: VerifyCurrentPassword }): AccountService {
  const avatarUrl = (path: string | null) => (path ? sb.storage.from(AVATARS).getPublicUrl(path).data.publicUrl : null)

  function toProfile(r: ProfileRow): Profile {
    return {
      userId: r.user_id,
      displayName: r.display_name,
      avatarUrl: avatarUrl(r.avatar_path),
      timezone: r.timezone,
      dateFormat: DATE_FORMATS.includes(r.date_format as DateFormatPref) ? (r.date_format as DateFormatPref) : 'd MMM yyyy',
      clock: r.clock === '12h' ? '12h' : '24h',
      notifyNewApplications: r.notify_new_applications,
      onboardingCompletedAt: r.onboarding_completed_at,
      onboardingDismissedAt: r.onboarding_dismissed_at,
    }
  }

  async function currentUser(): Promise<Result<{ id: string; email: string; newEmail: string | null }>> {
    try {
      const { data, error } = await sb.auth.getUser()
      if (error || !data.user) return accountFail(error && (error.status ?? 0) >= 500 ? 'unknown' : 'not_signed_in')
      const u = data.user as { id: string; email?: string; new_email?: string | null }
      return ok({ id: u.id, email: u.email ?? '', newEmail: str(u.new_email) })
    } catch {
      return accountFail('unknown')
    }
  }

  /** Writes (or creates) the caller's own profiles row and returns it. */
  async function writeProfile(uid: string, cols: Record<string, unknown>): Promise<Result<ProfileRow>> {
    const { data, error } = await sb.from('profiles').upsert({ user_id: uid, ...cols }, { onConflict: 'user_id' }).select(PROFILE_COLUMNS).single()
    return error || !data ? dbFail(error) : ok(data as ProfileRow)
  }

  async function readAvatarPath(uid: string): Promise<Result<string | null>> {
    const { data, error } = await sb.from('profiles').select('avatar_path').eq('user_id', uid).maybeSingle()
    return error ? dbFail(error) : ok(((data as { avatar_path?: string | null } | null)?.avatar_path ?? null) || null)
  }

  /** Calls a database function that answers { ok: true, ... } or { error }. */
  async function call(fn: string, args?: Record<string, unknown>): Promise<Result<unknown>> {
    try {
      const { data, error } = await sb.rpc(fn, args)
      if (error) return dbFail(error)
      const err = (data as { error?: unknown } | null)?.error
      return typeof err === 'string' ? accountFail(err) : ok(data)
    } catch {
      return accountFail('unknown')
    }
  }

  /** Posts { action, ...args } to the account-security function. */
  async function invoke(action: string, args: Record<string, unknown> = {}): Promise<Result<FnAnswer>> {
    try {
      const { data, error } = await sb.functions.invoke(FUNCTION, { body: { action, ...args } })
      if (error) {
        const ctx = (error as { context?: unknown }).context
        if (ctx instanceof Response) {
          const body = (await ctx.json().catch(() => null)) as FnAnswer | null
          if (typeof body?.error === 'string') return accountFail(body.error)
          // The gateway refused the JWT (expired or missing) before the function ran.
          if (ctx.status === 401) return accountFail('not_signed_in')
          if (ctx.status === 404) return accountFail('not_enabled')
        }
        return accountFail('unknown')
      }
      const a = (data ?? {}) as FnAnswer
      if (a.ok === false || typeof a.error === 'string') return accountFail(typeof a.error === 'string' ? a.error : 'unknown')
      return ok(a)
    } catch {
      return accountFail('unknown')
    }
  }

  /** The session's assurance level changes when factors are removed: pick up the new token. */
  const refresh = () => sb.auth.refreshSession().catch(() => undefined)
  /** Client-side audit events; a logging failure never undoes the change the user made. */
  const logEvent = (p_event: 'account_password_changed' | 'account_email_change_requested') => sb.rpc('log_account_event', { p_event }).then(() => undefined, () => undefined)
  const voidOf = (r: Result<unknown>): Result<void> => (r.ok ? ok(undefined) : r)

  async function listTotp(): Promise<Result<{ all: { id: string; factor_type: string; status: string }[]; verified: { id: string }[] }>> {
    try {
      const { data, error } = await sb.auth.mfa.listFactors()
      if (error || !data) return enrolFail(error as AuthErr)
      return ok({ all: data.all ?? [], verified: data.totp ?? [] })
    } catch {
      return accountFail('unknown')
    }
  }

  async function verifyTotp(factorId: string, code: string): Promise<Result<void>> {
    try {
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') })
      return error ? mfaFail(error as AuthErr) : ok(undefined)
    } catch {
      return accountFail('unknown')
    }
  }

  return {
    async getProfile() {
      const me = await currentUser()
      if (!me.ok) return me
      const { data, error } = await sb.from('profiles').select(PROFILE_COLUMNS).eq('user_id', me.data.id).maybeSingle()
      if (error) return dbFail(error)
      if (data) return ok(toProfile(data as ProfileRow))
      // The insert trigger creates the row for every new user; an older account without one gets it created now.
      const created = await writeProfile(me.data.id, {})
      return created.ok ? ok(toProfile(created.data)) : created
    },

    async updateProfile(patch: ProfilePatch) {
      const me = await currentUser()
      if (!me.ok) return me
      const cols: Record<string, unknown> = {}
      let name: string | null | undefined
      if ('displayName' in patch) {
        name = patch.displayName?.trim() || null
        if (!name || name.length > DISPLAY_NAME_MAX) return accountFail('invalid_name')
        cols.display_name = name
      }
      if (patch.timezone !== undefined) cols.timezone = patch.timezone
      if (patch.dateFormat !== undefined) cols.date_format = patch.dateFormat
      if (patch.clock !== undefined) cols.clock = patch.clock
      if (patch.notifyNewApplications !== undefined) cols.notify_new_applications = patch.notifyNewApplications
      const r = await writeProfile(me.data.id, cols)
      if (!r.ok) return r
      // Kept for backwards compatibility: the signed-in account still reads its name from user_metadata.
      if (name !== undefined) await sb.auth.updateUser({ data: { display_name: name } }).catch(() => undefined)
      return ok(toProfile(r.data))
    },

    async uploadAvatar(file) {
      const ext = AVATAR_TYPES[file.type]
      if (!ext || file.size > AVATAR_MAX_BYTES) return accountFail('invalid_avatar')
      const me = await currentUser()
      if (!me.ok) return me
      const previous = await readAvatarPath(me.data.id)
      if (!previous.ok) return previous
      const path = `${me.data.id}/${crypto.randomUUID()}.${ext}`
      const bucket = sb.storage.from(AVATARS)
      const up = await bucket.upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' })
      if (up.error) return accountFail('unknown')
      const r = await writeProfile(me.data.id, { avatar_path: path })
      if (!r.ok) {
        await bucket.remove([path]).catch(() => undefined)
        return r
      }
      if (previous.data && previous.data !== path) await bucket.remove([previous.data]).catch(() => undefined)
      return ok(toProfile(r.data))
    },

    async removeAvatar() {
      const me = await currentUser()
      if (!me.ok) return me
      const previous = await readAvatarPath(me.data.id)
      if (!previous.ok) return previous
      const r = await writeProfile(me.data.id, { avatar_path: null })
      if (!r.ok) return r
      if (previous.data) await sb.storage.from(AVATARS).remove([previous.data]).catch(() => undefined)
      return ok(toProfile(r.data))
    },

    async setOnboarding(state) {
      const me = await currentUser()
      if (!me.ok) return me
      const col = state === 'completed' ? 'onboarding_completed_at' : 'onboarding_dismissed_at'
      return voidOf(await writeProfile(me.data.id, { [col]: new Date().toISOString() }))
    },

    async getSecurityState() {
      const [state, factors, me] = await Promise.all([call('my_security_state'), listTotp(), currentUser()])
      if (!state.ok) return state
      if (!factors.ok) return factors
      if (!me.ok) return me
      const s = (state.data ?? {}) as SecurityStateRow
      const hasVerifiedFactor = factors.data.verified.length > 0
      let recoveryCodesLeft: number | null = null
      if (hasVerifiedFactor) {
        const left = await call('my_recovery_codes_left')
        if (!left.ok) return left
        recoveryCodesLeft = typeof left.data === 'number' ? left.data : 0
      }
      const result: SecurityState = {
        requires2fa: s.requires_2fa === true,
        aal: s.aal === 'aal2' ? 'aal2' : 'aal1',
        hasVerifiedFactor,
        recoveryCodesLeft,
        pendingEmail: me.data.newEmail,
        closure: s.closure ? { requestedAt: s.closure.requested_at, businessId: s.closure.business_id ?? null } : null,
        onboarding: { completedAt: s.onboarding?.completed_at ?? null, dismissedAt: s.onboarding?.dismissed_at ?? null },
      }
      return ok(result)
    },

    async recordSignIn() {
      // 'recorded' or 'rate_limited' (at most one per minute): both are fine for the caller.
      return voidOf(await call('record_sign_in', { p_user_agent: userAgent() }))
    },

    async listSecurityEvents() {
      const r = await call('list_my_security_events')
      if (!r.ok) return r
      const rows = (Array.isArray(r.data) ? r.data : []) as { id: string; event_type: string; created_at: string; metadata: Record<string, unknown> | null }[]
      return ok(
        rows.map((e): SecurityEvent => ({
          id: e.id,
          type: e.event_type,
          at: e.created_at,
          userAgent: str(e.metadata?.user_agent),
          ip: str(e.metadata?.ip),
        })),
      )
    },

    async changePassword(current, next) {
      if (next.length < PASSWORD_MIN || next.length > PASSWORD_MAX) return accountFail('weak_password')
      try {
        const { error } = await sb.auth.updateUser({ password: next, current_password: current })
        if (error) {
          const code = (error as AuthErr)?.code ?? ''
          if (code === 'current_password_mismatch' || code === 'current_password_required') return accountFail('current_password_mismatch')
          if (code === 'same_password' || code === 'weak_password' || code === 'reauthentication_needed') return accountFail(code)
          if (code === 'over_request_rate_limit') return accountFail('rate_limited')
          return accountFail('unknown')
        }
      } catch {
        return accountFail('unknown')
      }
      // Every other session ends now. If this fails the password change still stands.
      await sb.auth.signOut({ scope: 'others' }).catch(() => undefined)
      await logEvent('account_password_changed')
      return ok(undefined)
    },

    async requestEmailChange(currentPassword, newEmail) {
      const email = newEmail.trim()
      if (!EMAIL_PATTERN.test(email)) return accountFail('invalid_email')
      const me = await currentUser()
      if (!me.ok) return me
      try {
        // Checked on a throwaway client: signing in on the main one would replace this session (and drop aal2).
        const check = await deps.verifyCurrentPassword(me.data.email, currentPassword)
        if (check !== 'ok') return accountFail(check)
        const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: origin() + settingsPath(currentScope(), 'account') })
        if (error) {
          const code = (error as AuthErr)?.code ?? ''
          if (code === 'email_exists' || code === 'user_already_exists') return accountFail('email_taken')
          if (code === 'email_address_invalid' || code === 'validation_failed') return accountFail('invalid_email')
          if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return accountFail('rate_limited')
          return accountFail('unknown')
        }
      } catch {
        return accountFail('unknown')
      }
      await logEvent('account_email_change_requested')
      return ok(undefined)
    },

    async cancelEmailChange() {
      const me = await currentUser()
      if (!me.ok) return me
      try {
        // Setting the address back to the current one withdraws the pending change.
        const { error } = await sb.auth.updateUser({ email: me.data.email })
        return error ? accountFail('unknown') : ok(undefined)
      } catch {
        return accountFail('unknown')
      }
    },

    async signOutOtherDevices() {
      try {
        const { error } = await sb.auth.signOut({ scope: 'others' })
        return error ? accountFail('unknown') : ok(undefined)
      } catch {
        return accountFail('unknown')
      }
    },

    async startTotpEnrollment() {
      const factors = await listTotp()
      if (!factors.ok) return factors
      try {
        // A setup that was started and never confirmed leaves an unverified factor; it would block a new one.
        for (const f of factors.data.all) {
          if (f.status !== 'verified') {
            const { error } = await sb.auth.mfa.unenroll({ factorId: f.id })
            if (error) return enrolFail(error as AuthErr)
          }
        }
        const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator' })
        if (error || !data) return enrolFail(error as AuthErr)
        const enrolled: TotpEnrollment = { factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret }
        return ok(enrolled)
      } catch {
        return accountFail('unknown')
      }
    },

    confirmTotpEnrollment: (factorId, code) => verifyTotp(factorId, code),

    async verifyTotpForSignIn(code) {
      const factors = await listTotp()
      if (!factors.ok) return factors
      const factor = factors.data.verified[0]
      if (!factor) return accountFail('not_found')
      return verifyTotp(factor.id, code)
    },

    async sendActionCode(purpose: ActionPurpose) {
      const r = await invoke('send_code', { purpose })
      return r.ok ? ok({ sentTo: str(r.data.sentTo) ?? '' }) : r
    },

    async generateRecoveryCodes(code) {
      const r = await invoke('generate_recovery_codes', code ? { code } : {})
      if (!r.ok) return r
      return Array.isArray(r.data.codes) ? ok(r.data.codes.map(String)) : accountFail('unknown')
    },

    async redeemRecoveryCode(code) {
      const r = await invoke('redeem_recovery_code', { code })
      if (r.ok) await refresh()
      return voidOf(r)
    },

    async disable2fa(code) {
      const r = await invoke('disable_2fa', { code })
      if (r.ok) await refresh()
      return voidOf(r)
    },

    async requestClosure(code) {
      const r = await invoke('request_closure', { code })
      return r.ok ? ok({ kind: r.data.kind === 'staff' ? ('staff' as const) : ('business' as const) }) : r
    },

    async cancelClosure() {
      return voidOf(await call('cancel_account_closure'))
    },

    async getPlatformSettings() {
      const { data, error } = await sb.from('platform_settings').select(PLATFORM_COLUMNS).maybeSingle()
      if (error) return dbFail(error)
      const row = data as PlatformRow | null
      const settings: PlatformSettings = { require2faStaff: row?.require_2fa_staff ?? false, require2faBusiness: row?.require_2fa_business ?? false, updatedAt: row?.updated_at ?? null }
      return ok(settings)
    },

    async updatePlatformSettings(patch) {
      const cols: Record<string, boolean> = {}
      if (patch.require2faStaff !== undefined) cols.require_2fa_staff = patch.require2faStaff
      if (patch.require2faBusiness !== undefined) cols.require_2fa_business = patch.require2faBusiness
      const { data, error } = await sb.from('platform_settings').update(cols).eq('id', true).select(PLATFORM_COLUMNS)
      const row = Array.isArray(data) ? (data[0] as PlatformRow | undefined) : undefined
      if (error && error.code !== '42501') return dbFail(error)
      if (!row) {
        // RLS refused the update (no row updated, or 42501). The policy needs the Owner at aal2: say which part failed.
        // A platform Admin or Team member is refused for their role. When the role can't be read (no access row, which
        // the 2FA policy itself can cause at aal1), the aal decides.
        const access = await Promise.resolve(sb.rpc('my_platform_access')).catch(() => null)
        const role = (access?.data as { role?: unknown } | null | undefined)?.role
        if (typeof role === 'string' && role !== 'owner') return accountFail('not_allowed')
        const aal = await sb.auth.mfa.getAuthenticatorAssuranceLevel().catch(() => null)
        return accountFail(aal?.data?.currentLevel === 'aal2' ? 'not_allowed' : 'aal2_required')
      }
      return ok({ require2faStaff: row.require_2fa_staff, require2faBusiness: row.require_2fa_business, updatedAt: row.updated_at ?? null })
    },

    async ownerReset2fa(targetUserId, code) {
      return voidOf(await invoke('owner_reset_2fa', { target_user_id: targetUserId, code }))
    },

    async listClosureRequests() {
      const r = await call('admin_list_closure_requests')
      if (!r.ok) return r
      const rows = (Array.isArray(r.data) ? r.data : []) as { user_id: string; email: string; business_id: string | null; business_name: string | null; requested_at: string }[]
      return ok(
        rows.map((x): ClosureRequest => ({ userId: x.user_id, email: x.email, businessId: x.business_id ?? null, businessName: x.business_name ?? null, requestedAt: x.requested_at })),
      )
    },

    async completeClosure(targetUserId, code) {
      return voidOf(await invoke('complete_closure', { target_user_id: targetUserId, code }))
    },

    async restoreClosure(targetUserId) {
      return voidOf(await invoke('restore_closure', { target_user_id: targetUserId }))
    },
  }
}

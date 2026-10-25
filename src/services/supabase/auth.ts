// Real authentication (Supabase mode only). The demo account picker never touches this.
// Roles come from tables users cannot write to (platform_admins and platform_members via my_platform_access, business_members): see supabase/migrations.
import type { PlatformAccess } from '@/domain/types'
import { type Session, type SupabaseClient, isAuthRetryableFetchError } from '@supabase/supabase-js'
import type { User } from '@/domain/types'
import { type Result, type ServiceError, type ServiceErrorCode, fail, ok } from '../catalogService'
import { mapDbError } from './supabaseCatalogService'

export interface SignedInAccount {
  email: string
  user: User | null
}

/** An auth failure with Supabase's error code (or 'network') as `reason`, so public pages can word it in the visitor's language. */
export interface AuthError extends ServiceError {
  reason?: string
}
export type AuthResult<T> = { ok: true; data: T } | { ok: false; error: AuthError }

/**
 * Supabase Auth error codes the owner can act on, in plain words. Covers the project settings this app can meet:
 * the built-in email sender (it only mails the project's team, a few per hour), unconfirmed accounts and rate limits.
 * Anything else keeps Supabase's own message.
 */
const AUTH_MESSAGES: Record<string, string> = {
  email_not_confirmed: 'This account has not confirmed its email address yet. Ask the platform team for help.',
  email_address_not_authorized: 'We cannot send email to this address yet (the email service is not set up). Ask the platform team for access.',
  over_email_send_rate_limit: 'Too many emails were sent just now. Wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
  invalid_credentials: 'Wrong email or password.',
  weak_password: 'Choose a stronger password.',
  email_address_invalid: 'Enter a valid email address.',
}
export function authMessage(error: { code?: string; message: string }): string {
  return (error.code && AUTH_MESSAGES[error.code]) || error.message
}

function authFail(code: ServiceErrorCode, error: { code?: string; message: string }): AuthResult<never> {
  return { ok: false, error: { code, message: authMessage(error), reason: isAuthRetryableFetchError(error) ? 'network' : error.code } }
}

export interface AuthService {
  getSession(): Promise<Result<Session | null>>
  /** null when signed out; `user` is null when signed in but not given a role yet. */
  getCurrentUser(): Promise<Result<SignedInAccount | null>>
  signInWithPassword(email: string, password: string): Promise<AuthResult<void>>
  /** 'global' (default) ends every session of the user; 'local' only this browser's. */
  signOut(scope?: 'global' | 'local'): Promise<Result<void>>
  /** Emails a one-time reset code (ADR-0027). Succeeds whether or not the email has an account (no account enumeration). */
  requestPasswordReset(email: string, redirectTo: string): Promise<AuthResult<void>>
  /**
   * Signs in with a one-time code from an email (ADR-0027): 'recovery' for a password reset, 'invite' for an owner
   * invitation (an invite code, or a sign-in code once the account is confirmed). Wrong and expired codes both fail.
   */
  verifyEmailCode(email: string, code: string, purpose: 'recovery' | 'invite'): Promise<AuthResult<void>>
  /**
   * Sets a new password for the current (e.g. recovery or invitation) session, then signs out the user's other sessions.
   * Re-entering the current password counts as success.
   */
  updatePassword(password: string): Promise<AuthResult<void>>
  /** Saves the display name in the user's own Auth metadata. Reloads the account via the auth listener. */
  updateDisplayName(name: string): Promise<Result<void>>
  /** An invited owner finished onboarding (password set): records acceptance and returns their business id. */
  completeOwnerOnboarding(): Promise<Result<{ businessId: string | null }>>
  /** Returns an unsubscribe function. */
  onAuthStateChange(listener: () => void): () => void
}

export function createSupabaseAuthService(sb: SupabaseClient): AuthService {
  return {
    async getSession() {
      const { data, error } = await sb.auth.getSession()
      return error ? fail('UNKNOWN', error.message) : ok(data.session)
    },

    async getCurrentUser() {
      // getUser() validates the token with the Auth server instead of trusting local storage.
      const { data, error } = await sb.auth.getUser()
      // A network or server failure is not "signed out": report it, so the visitor is not bounced to the login form.
      if (error && (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500)) return fail('UNKNOWN', 'Could not reach the sign-in service. Check your connection and try again.')
      if (error || !data.user) return ok(null)
      const u = data.user
      const email = u.email ?? ''
      // Platform role and permissions (ADR-0029) come from the database, never from the token's metadata.
      const [admin, member] = await Promise.all([
        sb.rpc('my_platform_access'),
        sb.from('business_members').select('business_id').eq('user_id', u.id).order('created_at', { ascending: false }).limit(1).maybeSingle<{ business_id: string }>(),
      ])
      const err = admin.error ?? member.error
      if (err) return mapDbError(err)
      const meta = (u.user_metadata ?? {}) as { display_name?: unknown }
      const displayName = typeof meta.display_name === 'string' && meta.display_name.trim() ? meta.display_name.trim() : undefined
      const base = { id: u.id, name: displayName ?? (email || 'Signed-in user'), email }
      const platform = admin.data as PlatformAccess | null
      if (platform) return ok({ email, user: { ...base, role: 'super_admin', platform } })
      // A business has exactly one owner (ADR-0024); a user owning several businesses gets the newest one until a switcher exists.
      if (member.data) return ok({ email, user: { ...base, role: 'business_admin', businessId: member.data.business_id } })
      return ok({ email, user: null })
    },

    async signInWithPassword(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      return error ? authFail('PERMISSION', error) : ok(undefined)
    },

    async requestPasswordReset(email, redirectTo) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo })
      // Rate limits and delivery problems are reported; "unknown email" is not distinguishable by design.
      return error ? authFail('UNKNOWN', error) : ok(undefined)
    },

    async verifyEmailCode(email, code, purpose) {
      // 'email' accepts both kinds of code provision-owner sends: an invitation (confirmation token) and a sign-in code.
      const { error } = await sb.auth.verifyOtp({ email, token: code, type: purpose === 'recovery' ? 'recovery' : 'email' })
      return error ? authFail('PERMISSION', error) : ok(undefined)
    },

    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password })
      // Supabase refuses an unchanged password: the account already has the password the user chose.
      if (error && error.code !== 'same_password') return authFail('VALIDATION', error)
      // Sessions opened before the password was set (e.g. on another device) end now. If this fails the user is not blocked.
      await sb.auth.signOut({ scope: 'others' }).catch(() => undefined)
      return ok(undefined)
    },

    async updateDisplayName(name) {
      const display_name = name.trim().slice(0, 80) || null
      const { error } = await sb.auth.updateUser({ data: { display_name } })
      return error ? fail('UNKNOWN', 'Could not save your name. Try again.') : ok(undefined)
    },

    async completeOwnerOnboarding() {
      const { data, error } = await sb.rpc('complete_owner_onboarding')
      if (error) return mapDbError(error)
      return ok({ businessId: (data as string | null) ?? null })
    },

    async signOut(scope = 'global') {
      const { error } = await sb.auth.signOut({ scope })
      return error ? fail('UNKNOWN', error.message) : ok(undefined)
    },

    onAuthStateChange(listener) {
      // Deferred: supabase-js must not be called from inside this callback (it can deadlock).
      const { data } = sb.auth.onAuthStateChange(() => setTimeout(listener, 0))
      return () => data.subscription.unsubscribe()
    },
  }
}

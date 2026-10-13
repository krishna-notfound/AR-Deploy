// Real authentication (Supabase mode only). The demo account picker never touches this.
// Roles come from tables users cannot write to (platform_admins, business_members): see supabase/migrations.
import { type Session, type SupabaseClient, isAuthRetryableFetchError } from '@supabase/supabase-js'
import type { User } from '@/domain/types'
import { type Result, fail, ok } from '../catalogService'
import { mapDbError } from './supabaseCatalogService'

export interface SignedInAccount {
  email: string
  user: User | null
  /** Onboarding step 1 (Auth user metadata, set by the user; grants nothing). Undefined until set or skipped. */
  displayName?: string
  displayNameSkipped?: boolean
}

export interface AuthService {
  getSession(): Promise<Result<Session | null>>
  /** null when signed out; `user` is null when signed in but not given a role yet. */
  getCurrentUser(): Promise<Result<SignedInAccount | null>>
  signInWithPassword(email: string, password: string): Promise<Result<void>>
  signOut(): Promise<Result<void>>
  /** Sends a reset link. Succeeds whether or not the email has an account (no account enumeration). */
  requestPasswordReset(email: string, redirectTo: string): Promise<Result<void>>
  /** Sets a new password for the current (e.g. recovery) session. */
  updatePassword(password: string): Promise<Result<void>>
  /**
   * Creates an account; the user must confirm their email before signing in. Also succeeds for an email that
   * already has an account (Supabase hides which emails exist), so the UI always says "check your email".
   */
  signUp(email: string, password: string, emailRedirectTo: string): Promise<Result<{ needsConfirmation: boolean }>>
  /** Saves the display name in the user's own Auth metadata (null = skipped). Reloads the account via the auth listener. */
  updateDisplayName(name: string | null): Promise<Result<void>>
  /** Registers a NEW business owned by the signed-in, confirmed account. Always a draft until an admin activates it. */
  registerBusiness(name: string, slug: string): Promise<Result<{ businessId: string }>>
  /** Redeems a single-use claim link a platform admin issued; the account becomes an owner of that business. */
  redeemBusinessClaim(token: string): Promise<Result<{ businessId: string }>>
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
      // A network failure is not "signed out": report it, so the visitor is not bounced to the login form.
      if (error && isAuthRetryableFetchError(error)) return fail('UNKNOWN', 'Could not reach the sign-in service. Check your connection and try again.')
      if (error || !data.user) return ok(null)
      const u = data.user
      const email = u.email ?? ''
      const [admin, member] = await Promise.all([
        sb.from('platform_admins').select('user_id').eq('user_id', u.id).maybeSingle(),
        sb.from('business_members').select('business_id').eq('user_id', u.id).order('created_at', { ascending: false }).limit(1).maybeSingle<{ business_id: string }>(),
      ])
      const err = admin.error ?? member.error
      if (err) return mapDbError(err)
      const meta = (u.user_metadata ?? {}) as { display_name?: unknown; display_name_skipped?: unknown }
      const displayName = typeof meta.display_name === 'string' && meta.display_name.trim() ? meta.display_name.trim() : undefined
      const profile = { displayName, displayNameSkipped: meta.display_name_skipped === true }
      const base = { id: u.id, name: displayName ?? (email || 'Signed-in user'), email }
      if (admin.data) return ok({ email, ...profile, user: { ...base, role: 'super_admin' } })
      // ponytail: a user in several businesses gets the newest one (e.g. just claimed); add a business switcher when that case is real.
      if (member.data) return ok({ email, ...profile, user: { ...base, role: 'business_admin', businessId: member.data.business_id } })
      return ok({ email, ...profile, user: null })
    },

    async signInWithPassword(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      return error ? fail('PERMISSION', error.message) : ok(undefined)
    },

    async requestPasswordReset(email, redirectTo) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo })
      // Rate limits and delivery problems are reported; "unknown email" is not distinguishable by design.
      return error ? fail('UNKNOWN', error.message) : ok(undefined)
    },

    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password })
      return error ? fail('VALIDATION', error.message) : ok(undefined)
    },

    async signUp(email, password, emailRedirectTo) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo } })
      // With email confirmation on (the project setting), no session comes back until the link is opened.
      return error ? fail('VALIDATION', error.message) : ok({ needsConfirmation: !data.session })
    },

    async updateDisplayName(name) {
      const display_name = name?.trim().slice(0, 80) || null
      const { error } = await sb.auth.updateUser({ data: { display_name, display_name_skipped: display_name === null } })
      return error ? fail('UNKNOWN', 'Could not save your name. Try again.') : ok(undefined)
    },

    async registerBusiness(name, slug) {
      const { data, error } = await sb.rpc('register_business', { p_name: name, p_slug: slug })
      if (error) return mapDbError(error, { conflictField: 'business' })
      return ok({ businessId: data as string })
    },

    async redeemBusinessClaim(token) {
      const { data, error } = await sb.rpc('redeem_business_claim', { p_token: token })
      if (error) return mapDbError(error)
      return ok({ businessId: data as string })
    },

    async signOut() {
      const { error } = await sb.auth.signOut()
      return error ? fail('UNKNOWN', error.message) : ok(undefined)
    },

    onAuthStateChange(listener) {
      // Deferred: supabase-js must not be called from inside this callback (it can deadlock).
      const { data } = sb.auth.onAuthStateChange(() => setTimeout(listener, 0))
      return () => data.subscription.unsubscribe()
    },
  }
}

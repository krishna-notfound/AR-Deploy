// Real authentication (Supabase mode only). The demo account picker never touches this.
// Roles come from tables users cannot write to (platform_admins, business_members): see supabase/migrations.
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@/domain/types'
import { type Result, fail, ok } from '../catalogService'
import { mapDbError } from './supabaseCatalogService'

export interface SignedInAccount {
  email: string
  user: User | null
}

export interface AuthService {
  getSession(): Promise<Result<Session | null>>
  /** null when signed out; `user` is null when signed in but not given a role yet. */
  getCurrentUser(): Promise<Result<SignedInAccount | null>>
  signInWithPassword(email: string, password: string): Promise<Result<void>>
  signOut(): Promise<Result<void>>
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
      if (error || !data.user) return ok(null)
      const u = data.user
      const email = u.email ?? ''
      const [admin, member] = await Promise.all([
        sb.from('platform_admins').select('user_id').eq('user_id', u.id).maybeSingle(),
        sb.from('business_members').select('business_id').eq('user_id', u.id).order('created_at').limit(1).maybeSingle<{ business_id: string }>(),
      ])
      const err = admin.error ?? member.error
      if (err) return mapDbError(err)
      const base = { id: u.id, name: email || 'Signed-in user', email }
      if (admin.data) return ok({ email, user: { ...base, role: 'super_admin' } })
      // ponytail: a user in several businesses gets the first one; add a business switcher when that case is real.
      if (member.data) return ok({ email, user: { ...base, role: 'business_admin', businessId: member.data.business_id } })
      return ok({ email, user: null })
    },

    async signInWithPassword(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      return error ? fail('PERMISSION', error.message) : ok(undefined)
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

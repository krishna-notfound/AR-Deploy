// "Forgot password" on Supabase Auth (ADR-0027, ADR-0066). See services/passwordResetService.ts.
import type { SupabaseClient } from '@supabase/supabase-js'
import { passwordResetRedirectUrl } from '@/lib/urls'
import { fail, ok } from '../catalogService'
import type { PasswordResetService } from '../passwordResetService'
import { createSupabaseAuthService } from './auth'

export function createSupabasePasswordReset(sb: SupabaseClient): PasswordResetService {
  const auth = createSupabaseAuthService(sb)
  return {
    async requestCode(email) {
      const r = await auth.requestPasswordReset(email, passwordResetRedirectUrl())
      // Only an existing account can hit the per-address resend limit: answering it as an error would tell a stranger
      // that the address has an account. The page waits a minute between sends, so a person rarely meets it.
      if (!r.ok && r.error.reason === 'over_email_send_rate_limit') return ok(undefined)
      return r
    },

    verifyCode: (email, code) => auth.verifyEmailCode(email, code, 'recovery'),

    async hasSession() {
      const r = await auth.getSession()
      return r.ok ? ok(!!r.data) : r
    },

    async signOutHere() {
      try {
        const { error } = await sb.auth.signOut({ scope: 'local' })
        return error ? fail('UNKNOWN', 'Could not sign out on this device.') : ok(undefined)
      } catch {
        return fail('UNKNOWN', 'Could not sign out on this device.')
      }
    },
  }
}

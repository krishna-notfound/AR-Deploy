// "Forgot password" (ADR-0027 codes, ADR-0066 hardening). The page imports `passwordReset` from services/index.ts.
// Supabase: services/supabase/supabasePasswordReset.ts (Supabase Auth). Demo: services/mock/mockPasswordReset.ts, a
// labelled in-memory harness (no email is sent; the code is shown on the page). The new password itself is set with
// `account.resetPassword` (the account-security function), never from here.
import type { Result } from './catalogService'
import type { AuthResult } from './supabase/auth'

export interface PasswordResetService {
  /**
   * Emails a reset code. The answer never says whether the address has an account: Supabase answers the same for an
   * unknown address, and its per-address resend limit (which only an existing account can hit) is answered as success.
   */
  requestCode(email: string): Promise<AuthResult<void>>
  /** Signs in with the emailed code: a recovery session that may only set a new password (ADR-0066). */
  verifyCode(email: string, code: string): Promise<AuthResult<void>>
  /** Is anyone signed in in this browser (any session, recovery or not)? */
  hasSession(): Promise<Result<boolean>>
  /** Ends this browser's session (the person left the reset half way). */
  signOutHere(): Promise<Result<void>>
}

/** The demo's reset code (8 digits, like Supabase's, ADR-0027). Shown on the page in demo mode. */
export const DEMO_RESET_CODE = '12345678'

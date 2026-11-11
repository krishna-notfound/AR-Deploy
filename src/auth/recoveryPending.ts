// ADR-0066: a session started with an emailed reset code is for choosing a new password only. While this tab holds one,
// the dashboards send the person back to /reset-password (RequireRole). UX only, NOT a security boundary: the server
// lets such a session set a password for 15 minutes (account-security reset_password), and with 2FA on it stays at
// aal1, which the database refuses everywhere until the second step is done. No token is stored here, only a deadline.

const KEY = 'arfurn:password-recovery'
/** The same window the server gives a reset session (RESET_WINDOW_MS in account-security). */
export const RECOVERY_WINDOW_MS = 15 * 60_000

/** Marks this tab as in the middle of a password reset. */
export function markRecoveryPending(now = Date.now()): void {
  try {
    sessionStorage.setItem(KEY, String(now + RECOVERY_WINDOW_MS))
  } catch {
    // Storage unavailable: the reset page still works; only the redirect back to it is lost.
  }
}

/** Is a password reset in progress in this tab (and not past its window)? */
export function isRecoveryPending(now = Date.now()): boolean {
  try {
    const until = Number(sessionStorage.getItem(KEY))
    if (!until) return false
    if (until > now) return true
    sessionStorage.removeItem(KEY)
    return false
  } catch {
    return false
  }
}

export function clearRecoveryPending(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing stored.
  }
}

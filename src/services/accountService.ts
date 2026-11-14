// Account settings, security and 2FA (S1, spec sections 7 and 8). The UI imports `account` from services/index.ts.
// Supabase: services/supabase/supabaseAccount.ts (Auth, the profiles and platform_settings tables, database
// functions and the account-security Edge Function). Demo: services/mock/mockAccount.ts, an in-memory test harness.
import type { ActionPurpose, ClosureRequest, EmailAttemptStatus, ID, PlatformSettings, Profile, SecurityEvent, SecurityState, TotpEnrollment } from '@/domain/types'
import type { Result, ServiceErrorCode } from './catalogService'

export type { ActionPurpose, ClosureRequest, DateFormatPref, PlatformSettings, Profile, SecurityEvent, SecurityState, SettingsSection, TotpEnrollment } from '@/domain/types'

/** The session's assurance levels, read locally (supabase-js mfa.getAuthenticatorAssuranceLevel, spec §8). */
export interface AssuranceLevels {
  currentLevel: 'aal1' | 'aal2'
  /** aal2 when the account has a verified factor: the sign-in needs the code step while currentLevel is aal1. */
  nextLevel: 'aal1' | 'aal2'
}

/** What happened to the notice email an Owner action sends the account holder (R-W7-6). */
export interface NoticeOutcome {
  status: EmailAttemptStatus
  error?: string
}

/** A password change (ADR-0066): both passwords, the emailed code and, when the account has 2FA, the authenticator code. */
export interface PasswordChange {
  current: string
  next: string
  code: string
  totp?: string
}

/** What a password change or reset did to the account's sessions (ADR-0069). */
export interface PasswordOutcome {
  /** false: the password changed but ending every session failed, so other devices may still be signed in. */
  sessionsEnded: boolean
}

export type ProfilePatch = Partial<Pick<Profile, 'displayName' | 'timezone' | 'dateFormat' | 'clock' | 'notifyNewApplications'>>

export interface AccountService {
  getProfile(): Promise<Result<Profile>>
  updateProfile(patch: ProfilePatch): Promise<Result<Profile>>
  /** The caller passes the already-resized 256px image (JPEG, PNG or WebP, at most 512 KB). */
  uploadAvatar(file: Blob): Promise<Result<Profile>>
  removeAvatar(): Promise<Result<Profile>>
  setOnboarding(state: 'completed' | 'dismissed'): Promise<Result<void>>
  getSecurityState(): Promise<Result<SecurityState>>
  getAssurance(): Promise<Result<AssuranceLevels>>
  recordSignIn(): Promise<Result<void>>
  listSecurityEvents(): Promise<Result<SecurityEvent[]>>
  /**
   * ADR-0066: checks the current password before a code is emailed (a throwaway sign-in; the session is untouched).
   * Reasons: current_password_mismatch | rate_limited.
   */
  checkCurrentPassword(password: string): Promise<Result<void>>
  /**
   * ADR-0066: through the account-security function, with the emailed code (purpose change_password) and, for an
   * account with 2FA, the authenticator code (verified first, so the session carries a fresh one). On success every
   * session has ended, this one too: the person signs in again. Reasons: invalid_code | code_expired |
   * too_many_attempts | invalid_totp | totp_required | aal2_required | current_password_mismatch | same_password |
   * weak_password | rate_limited.
   */
  changePassword(input: PasswordChange): Promise<Result<PasswordOutcome>>
  /**
   * ADR-0066: the last step of "Forgot password", from the session the emailed reset code started (account-security
   * reset_password). Every session ends afterwards. Reasons: weak_password | reset_expired | aal2_required.
   */
  resetPassword(next: string): Promise<Result<PasswordOutcome>>
  /** Reasons: password_incorrect | email_taken | invalid_email | rate_limited. */
  requestEmailChange(currentPassword: string, newEmail: string): Promise<Result<void>>
  cancelEmailChange(): Promise<Result<void>>
  signOutOtherDevices(): Promise<Result<void>>
  /** Reason: mfa_not_enabled when TOTP is switched off in the Supabase dashboard. */
  startTotpEnrollment(): Promise<Result<TotpEnrollment>>
  /** Reason: invalid_code. */
  confirmTotpEnrollment(factorId: string, code: string): Promise<Result<void>>
  /** Reason: invalid_code. */
  verifyTotpForSignIn(code: string): Promise<Result<void>>
  sendActionCode(purpose: ActionPurpose): Promise<Result<{ sentTo: string }>>
  generateRecoveryCodes(code?: string): Promise<Result<string[]>>
  redeemRecoveryCode(code: string): Promise<Result<void>>
  disable2fa(code: string): Promise<Result<void>>
  requestClosure(code: string): Promise<Result<{ kind: 'business' | 'staff' }>>
  /** Through the account-security function, which cancels as the caller and alerts the admin inbox (R-W7-9). */
  cancelClosure(): Promise<Result<void>>
  getPlatformSettings(): Promise<Result<PlatformSettings>>
  /** Reason: aal2_required when the Owner is signed in without 2FA. */
  updatePlatformSettings(patch: Partial<Pick<PlatformSettings, 'require2faStaff' | 'require2faBusiness'>>): Promise<Result<PlatformSettings>>
  ownerReset2fa(targetUserId: ID, code: string): Promise<Result<{ notice: NoticeOutcome }>>
  listClosureRequests(): Promise<Result<ClosureRequest[]>>
  completeClosure(targetUserId: ID, code: string): Promise<Result<{ notice: NoticeOutcome }>>
  restoreClosure(targetUserId: ID): Promise<Result<{ notice: NoticeOutcome }>>
}

/**
 * One fixed sentence per reason. The server codes come from spec section 7 (the account-security function and the
 * database functions); the rest are client-side checks and Supabase Auth codes. Raw provider text is never shown.
 */
export const ACCOUNT_ERRORS: Record<string, { code: ServiceErrorCode; message: string }> = {
  // account-security Edge Function and database functions
  not_signed_in: { code: 'PERMISSION', message: 'Your session has ended. Sign in again.' },
  invalid_request: { code: 'VALIDATION', message: "That request wasn't valid. Check the details and try again." },
  invalid_code: { code: 'VALIDATION', message: "That code isn't right. Check it and try again." },
  code_expired: { code: 'VALIDATION', message: 'That code has expired. Send a new one.' },
  too_many_attempts: { code: 'RATE_LIMITED', message: 'Too many wrong attempts. Send a new code.' },
  rate_limited: { code: 'RATE_LIMITED', message: 'Too many requests. Wait a while and try again.' },
  aal2_required: { code: 'PERMISSION', message: 'This needs 2FA. Sign in with your authenticator code first.' },
  policy_requires_2fa: { code: 'CONFLICT', message: '2FA is required for your account, so it cannot be turned off.' },
  owner_cannot_close: { code: 'CONFLICT', message: "The platform owner's account can't be closed." },
  already_requested: { code: 'CONFLICT', message: 'A closure request is already open.' },
  not_allowed: { code: 'PERMISSION', message: "You don't have permission to do this." },
  not_found: { code: 'NOT_FOUND', message: 'That account or request no longer exists.' },
  email_failed: { code: 'UNKNOWN', message: "We couldn't send the email. Try again." },
  email_blocked: { code: 'CONFIG', message: "Email can't be sent to this address yet. Contact the Sanctus team." },
  nothing_to_reset: { code: 'CONFLICT', message: "They don't have 2FA set up, so there is nothing to reset." },
  unknown: { code: 'UNKNOWN', message: 'Something went wrong. Try again.' },
  // Supabase Auth and client-side checks
  current_password_mismatch: { code: 'VALIDATION', message: 'Your current password is incorrect.' },
  same_password: { code: 'VALIDATION', message: 'Choose a password different from your current one.' },
  weak_password: { code: 'VALIDATION', message: 'Choose a stronger password of 12 to 72 characters.' },
  reauthentication_needed: { code: 'PERMISSION', message: 'For your security, sign out, sign in again and retry.' },
  // ADR-0066: password change and reset
  invalid_totp: { code: 'VALIDATION', message: "That authenticator code isn't right. Enter the newest code from the app." },
  totp_required: { code: 'PERMISSION', message: 'Enter a new code from your authenticator app and try again.' },
  reset_expired: { code: 'PERMISSION', message: 'This reset has expired. Request a new code and start again.' },
  totp_setup_replaced: { code: 'CONFLICT', message: 'This setup was replaced by one started in another tab or window. Start again here, or finish it there.' },
  password_incorrect: { code: 'VALIDATION', message: 'Password is incorrect.' },
  email_taken: { code: 'CONFLICT', message: 'This email is already used by another account.' },
  invalid_email: { code: 'VALIDATION', message: 'Enter a valid email address.' },
  invalid_name: { code: 'VALIDATION', message: 'Use 1 to 80 characters for your name.' },
  invalid_avatar: { code: 'VALIDATION', message: 'Use a JPEG, PNG or WebP image of 512 KB or less.' },
  mfa_not_enabled: { code: 'CONFIG', message: '2FA is not available yet: an administrator must enable it.' },
  not_enabled: { code: 'CONFIG', message: "This isn't switched on yet: the database update has not been applied." },
}

/** Other names the database functions use for a known reason (admin_* functions answer {"error":"forbidden"}). */
const ALIASES: Record<string, string> = { forbidden: 'not_allowed' }

/** A failed Result whose `reason` is the error code; unknown codes become 'unknown' (never raw text). */
export function accountFail<T = never>(code: string): Result<T> {
  const reason = Object.hasOwn(ALIASES, code) ? (ALIASES[code] as string) : code
  const known = Object.hasOwn(ACCOUNT_ERRORS, reason) ? reason : 'unknown'
  const e = ACCOUNT_ERRORS[known] ?? { code: 'UNKNOWN' as const, message: 'Something went wrong. Try again.' }
  return { ok: false, error: { code: e.code, message: e.message, reason: known } }
}

export const PASSWORD_MIN = 12
/** bcrypt, which Supabase Auth uses, hashes only the first 72 BYTES of a password (ADR-0069), so that is the limit. */
export const PASSWORD_MAX = 72
/** Longer than bcrypt hashes: counted in UTF-8 bytes, because an accented letter or emoji takes more than one. */
export const passwordTooLong = (password: string): boolean => new TextEncoder().encode(password).length > PASSWORD_MAX
export const DISPLAY_NAME_MAX = 80
export const AVATAR_MAX_BYTES = 512 * 1024
export const AVATAR_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

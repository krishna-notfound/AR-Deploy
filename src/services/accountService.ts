// Account settings, security and 2FA (S1, spec sections 7 and 8). The UI imports `account` from services/index.ts.
// Supabase: services/supabase/supabaseAccount.ts (Auth, the profiles and platform_settings tables, database
// functions and the account-security Edge Function). Demo: services/mock/mockAccount.ts, an in-memory test harness.
import type { ActionPurpose, ClosureRequest, ID, PlatformSettings, Profile, SecurityEvent, SecurityState, TotpEnrollment } from '@/domain/types'
import type { Result, ServiceErrorCode } from './catalogService'

export type { ActionPurpose, ClosureRequest, DateFormatPref, PlatformSettings, Profile, SecurityEvent, SecurityState, SettingsSection, TotpEnrollment } from '@/domain/types'

/** The session's assurance levels, read locally (supabase-js mfa.getAuthenticatorAssuranceLevel, spec §8). */
export interface AssuranceLevels {
  currentLevel: 'aal1' | 'aal2'
  /** aal2 when the account has a verified factor: the sign-in needs the code step while currentLevel is aal1. */
  nextLevel: 'aal1' | 'aal2'
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
  /** Reasons: current_password_mismatch | same_password | weak_password | reauthentication_needed. */
  changePassword(current: string, next: string): Promise<Result<void>>
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
  cancelClosure(): Promise<Result<void>>
  getPlatformSettings(): Promise<Result<PlatformSettings>>
  /** Reason: aal2_required when the Owner is signed in without 2FA. */
  updatePlatformSettings(patch: Partial<Pick<PlatformSettings, 'require2faStaff' | 'require2faBusiness'>>): Promise<Result<PlatformSettings>>
  ownerReset2fa(targetUserId: ID, code: string): Promise<Result<void>>
  listClosureRequests(): Promise<Result<ClosureRequest[]>>
  completeClosure(targetUserId: ID, code: string): Promise<Result<void>>
  restoreClosure(targetUserId: ID): Promise<Result<void>>
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
  nothing_to_reset: { code: 'CONFLICT', message: "They don't have 2FA set up, so there is nothing to reset." },
  unknown: { code: 'UNKNOWN', message: 'Something went wrong. Try again.' },
  // Supabase Auth and client-side checks
  current_password_mismatch: { code: 'VALIDATION', message: 'Your current password is incorrect.' },
  same_password: { code: 'VALIDATION', message: 'Choose a password different from your current one.' },
  weak_password: { code: 'VALIDATION', message: 'Choose a stronger password of 12 to 128 characters.' },
  reauthentication_needed: { code: 'PERMISSION', message: 'For your security, sign out, sign in again and retry.' },
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
export const PASSWORD_MAX = 128
export const DISPLAY_NAME_MAX = 80
export const AVATAR_MAX_BYTES = 512 * 1024
export const AVATAR_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

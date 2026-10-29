// Account failures as a sentence in the person's language. The account service answers with a `reason`; the shared
// `common.error.*` sentences are worded for other screens (for example `rate_limited` there is about invitations), so
// the account reasons have their own sentences (`settings.err.*`) and anything else falls back to errorText.
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { errorText } from '@/i18n/errorText'
import type { Vars } from '@/i18n/translate'
import { AVATAR_MAX_BYTES, DISPLAY_NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, type ServiceError } from '@/services'

const REASON_KEY: Record<string, TranslationKey> = {
  not_signed_in: 'settings.err.not_signed_in',
  invalid_request: 'settings.err.invalid_request',
  invalid_code: 'settings.err.invalid_code',
  code_expired: 'settings.err.code_expired',
  too_many_attempts: 'settings.err.too_many_attempts',
  rate_limited: 'settings.err.rate_limited',
  policy_requires_2fa: 'settings.err.policy_requires_2fa',
  owner_cannot_close: 'settings.err.owner_cannot_close',
  already_requested: 'settings.err.already_requested',
  not_found: 'settings.err.not_found',
  email_failed: 'settings.err.email_failed',
  email_blocked: 'settings.err.email_blocked',
  current_password_mismatch: 'settings.err.current_password_mismatch',
  same_password: 'settings.err.same_password',
  weak_password: 'settings.err.weak_password',
  reauthentication_needed: 'settings.err.reauthentication_needed',
  password_incorrect: 'settings.err.password_incorrect',
  email_taken: 'settings.err.email_taken',
  invalid_name: 'settings.err.invalid_name',
  invalid_avatar: 'settings.err.invalid_avatar',
  mfa_not_enabled: 'settings.err.mfa_not_enabled',
  not_enabled: 'settings.err.not_enabled',
  unknown: 'settings.err.unknown',
}

export function accountErrorText(error: ServiceError, t: (key: TranslationKey, vars?: Vars) => string): string {
  const key = error.reason && Object.hasOwn(REASON_KEY, error.reason) ? REASON_KEY[error.reason] : undefined
  if (!key) return errorText(error, t)
  return t(key, { min: PASSWORD_MIN, max: PASSWORD_MAX, name: DISPLAY_NAME_MAX, kb: AVATAR_MAX_BYTES / 1024 })
}

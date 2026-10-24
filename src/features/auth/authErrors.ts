import type { TranslationKey } from '@/i18n/dictionaries/en'
import type { AuthError } from '@/services'

const KEYS: Record<string, TranslationKey> = {
  weak_password: 'auth.error.weakPassword',
  over_request_rate_limit: 'auth.error.rateLimited',
  over_email_send_rate_limit: 'auth.error.emailRateLimited',
  email_address_invalid: 'auth.error.emailInvalid',
  email_address_not_authorized: 'auth.error.emailNotAuthorized',
  session_expired: 'auth.error.sessionExpired',
  session_not_found: 'auth.error.sessionExpired',
  refresh_token_not_found: 'auth.error.sessionExpired',
  network: 'auth.error.network',
  otp_expired: 'auth.error.codeInvalid',
}

/** A code as typed or pasted from the email: spaces and dashes dropped. Valid when 6 to 10 digits remain. */
export function normalizeCode(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, '')
  return /^\d{6,10}$/.test(code) ? code : null
}

/** Auth errors on the public (EN/PT) auth pages, in the visitor's language. Unknown codes get a generic message. */
export function authErrorText(t: (key: TranslationKey) => string, error: AuthError): string {
  const key = error.reason ? KEYS[error.reason] : undefined
  return t(key ?? 'auth.error.generic')
}

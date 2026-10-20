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
}

/** Auth errors on the public (EN/PT) auth pages, in the visitor's language. Unknown codes get a generic message. */
export function authErrorText(t: (key: TranslationKey) => string, error: AuthError): string {
  const key = error.reason ? KEYS[error.reason] : undefined
  return t(key ?? 'auth.error.generic')
}

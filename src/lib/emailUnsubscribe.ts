// Reads which email type an unsubscribe link names, for the confirm page's wording only (ADR-0078). The Edge Function does the real
// check: this never trusts the token, it just avoids asking "unsubscribe from what?" when the link is plainly malformed.
import { type EmailPrefType, isEmailPrefType } from '@/domain/notifications'

/** The email type inside a token (`v1.<payload>.<signature>`; demo: `demo.<type>`), or null when it is not readable. */
export function emailTypeOfToken(token: string | null | undefined): EmailPrefType | null {
  if (!token || token.length > 300) return null
  if (token.startsWith('demo.')) {
    const type = token.slice(5)
    return isEmailPrefType(type) ? type : null
  }
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  try {
    const base64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/')
    const type = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')).split('|')[1]
    return isEmailPrefType(type) ? type : null
  } catch {
    return null
  }
}

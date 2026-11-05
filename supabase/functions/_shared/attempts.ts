// The per-IP attempt limit of the public application functions (R-W2-10), shared by submit-application and application-upload
// (ADR-0050): both count their attempts in the same table through public.service_application_attempt, under the same salted
// daily hash of the caller's IP, so an upload and a submission from one address share one hourly allowance. Web-standard APIs only.
import { sha256Hex } from './http.ts'

/** Applications (and replays of nothing): at most this many counted attempts per hour and address. */
export const MAX_SUBMISSIONS_PER_HOUR = 5
/**
 * Catalogue uploads: one less than the applications' allowance, so uploads alone can never use up the hour and leave a
 * visitor who has chosen their file (a few tries) unable to send the application.
 */
export const MAX_UPLOADS_PER_HOUR = MAX_SUBMISSIONS_PER_HOUR - 1

/** Salted hash of the submitter's IP for one UTC day (`YYYY-MM-DD`): it cannot follow a submitter across days. */
export async function submitterHash(ip: string, salt: string, day: string): Promise<string> {
  return sha256Hex(`application|${day}|${ip}|${salt}`)
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10)

/** Today's hash first; when the hour before `now` started on the previous UTC day, that day's hash as well. */
export async function attemptHashes(ip: string, salt: string, now: Date): Promise<string[]> {
  const today = utcDay(now)
  const hourAgo = utcDay(new Date(now.getTime() - 3600_000))
  const hashes = [await submitterHash(ip, salt, today)]
  if (hourAgo !== today) hashes.push(await submitterHash(ip, salt, hourAgo))
  return hashes
}

/** The secret mixed into the hash: APPLICATION_SALT, else derived from the service key (which never leaves the server). */
export async function applicationSalt(env: (name: string) => string | undefined, serviceKey: string): Promise<string> {
  return env('APPLICATION_SALT') || (serviceKey ? await sha256Hex(`submit-application-salt|${serviceKey}`) : '')
}

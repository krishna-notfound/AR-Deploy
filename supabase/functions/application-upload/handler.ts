// Request handling for the public application-upload Edge Function (ADR-0050).
//   POST { submissionKey, size, contentType }  →  200 { path, signedUrl, token }
// The application form uploads the optional PDF catalogue straight to Storage with the signed upload URL this returns, so the
// file never passes through an Edge Function. The URL points at the one object of this submission,
// `pending/<submissionKey>/catalogue.pdf` in the private bucket application-files (20 MB, application/pdf only: the bucket
// refuses anything else even if the caller lies here). Every accepted request counts against the same per-IP hourly limit as
// submit-application (R-W2-10), with an allowance one smaller than the applications' so uploads cannot use up the hour.
// Once an application with the submission key is stored, no URL is signed: the catalogue cannot be replaced afterwards (409 already_submitted).
import { MAX_CATALOGUE_BYTES, cataloguePathFor } from '../_shared/application.ts'
import { MAX_UPLOADS_PER_HOUR, attemptHashes } from '../_shared/attempts.ts'
import { UUID, clientIp, readJsonObject, reply } from '../_shared/http.ts'

/** The body is three small fields. */
const MAX_BODY_BYTES = 2_000

export interface UploadDeps {
  /** Secret mixed into the submitter hash so raw IPs cannot be recovered from it (same as submit-application). */
  salt: string
  now?: () => Date
  /** service_application_attempt: true when the attempt is allowed (and recorded). `max` is this function's allowance. */
  allowAttempt(hashes: string[], max: number): Promise<boolean>
  /** Whether an application with this submission key (lower case) is already stored. Throws on a database error. */
  submissionExists(submissionKey: string): Promise<boolean>
  /** A signed upload URL for `path` (replacing an earlier upload of the same submission). Throws on a storage error. */
  createUpload(path: string): Promise<{ path: string; signedUrl: string; token: string }>
}

/** An error for console.error: email addresses removed (provider and database messages can quote them), shortened. */
const loggable = (e: unknown, max = 200) => String(e).replace(/[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+/g, '[email]').slice(0, max)

export async function handleApplicationUpload(req: Request, deps: UploadDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  if (!deps.salt) return reply(500, { error: 'not_configured' })

  const body = await readJsonObject(req, MAX_BODY_BYTES)
  const { submissionKey, size, contentType } = body ?? {}
  if (
    typeof submissionKey !== 'string' ||
    !UUID.test(submissionKey) ||
    typeof size !== 'number' ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > MAX_CATALOGUE_BYTES ||
    contentType !== 'application/pdf'
  )
    return reply(400, { error: 'invalid_request' })

  try {
    // The one object of a submission may be replaced (a retry) only until the application is stored; after that the file
    // is what the reviewers saw, so no new URL is signed (QA 2026-11-14 EF-2).
    if (await deps.submissionExists(submissionKey.toLowerCase())) return reply(409, { error: 'already_submitted' })
    const now = (deps.now ?? (() => new Date()))()
    if (!(await deps.allowAttempt(await attemptHashes(clientIp(req), deps.salt, now), MAX_UPLOADS_PER_HOUR))) return reply(429, { error: 'rate_limited' })
    const { path, signedUrl, token } = await deps.createUpload(cataloguePathFor(submissionKey))
    return reply(200, { path, signedUrl, token })
  } catch (e) {
    console.error(`application-upload: ${loggable(e)}`)
    return reply(500, { error: 'unknown' })
  }
}

// Request handling for the manage-member Edge Function (ADR-0029). Platform Owner only; the SQL functions check that
// again (they run with the caller's own token) and write the access audit.
//   POST { action: "set_role", memberId, role: "admin"|"team" }
//   POST { action: "deactivate" | "reactivate" | "revoke_invite", memberId }
//   POST { action: "remove", memberId } -> { ok, loginDeleted } (S1.5 R-W6-1: deactivated members only)
// Deactivation also signs the member out on every device. The database already refuses their next request, so a
// failed sign-out is reported but does not fail the action. Removal deletes the member's row in the database, then
// their login (sessions ended, auth user deleted) when no business and no Owner row still uses it.
import { UUID, bearerToken, readJsonObject, reply } from '../_shared/http.ts'

/** What an admin_* function answers: { ok: true, ... } or { error }. */
type DbResult = { ok?: true; error?: string } & Record<string, unknown>

export interface ManageDeps {
  userIdFromToken(token: string): Promise<string | null>
  rpcAsCaller(token: string, fn: string, args: Record<string, unknown>): Promise<DbResult>
  signOutUser(userId: string): Promise<void>
  /** Service role: when the user has no business_members and no platform_admins row, ends their sessions and deletes the auth user. True when deleted. */
  deleteLoginIfUnused(userId: string): Promise<boolean>
}

const FUNCTIONS = {
  set_role: 'admin_set_member_role',
  deactivate: 'admin_deactivate_member',
  reactivate: 'admin_reactivate_member',
  revoke_invite: 'admin_revoke_member_invite',
  remove: 'admin_remove_member',
} as const

const STATUS_FOR: Record<string, number> = {
  forbidden: 403, not_found: 404, self: 409, owner_protected: 409, not_deactivated: 409, no_live_invite: 409,
}

export async function handleManageMember(req: Request, deps: ManageDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const token = bearerToken(req)
  if (!token || !(await deps.userIdFromToken(token))) return reply(401, { error: 'not_signed_in' })

  const body = await readJsonObject(req, 2_000)
  const action = body?.action
  if (!body || typeof action !== 'string' || !(action in FUNCTIONS)) return reply(400, { error: 'invalid_request' })
  if (typeof body.memberId !== 'string' || !UUID.test(body.memberId)) return reply(400, { error: 'invalid_request' })
  if (action === 'set_role' && body.role !== 'admin' && body.role !== 'team') return reply(400, { error: 'invalid_request' })

  const args: Record<string, unknown> = { p_member: body.memberId, ...(action === 'set_role' ? { p_role: body.role } : {}) }
  const result = await deps.rpcAsCaller(token, FUNCTIONS[action as keyof typeof FUNCTIONS], args)
  if (typeof result.error === 'string') return reply(STATUS_FOR[result.error] ?? 400, { error: result.error })

  if (action === 'remove') {
    // The row is already gone; a login that could not be deleted is reported, not an error (it grants nothing now).
    let loginDeleted = false
    if (typeof result.user_id === 'string') {
      loginDeleted = await deps.deleteLoginIfUnused(result.user_id).catch((e: unknown) => {
        // A trace for the operator: a fixed prefix and the cause, never a token, and any address masked.
        console.error('manage-member: delete login failed: ' + String(e).replace(/[^\s@]+@[^\s@]+/g, '[email]').slice(0, 200))
        return false
      })
    }
    return reply(200, { ok: true, loginDeleted })
  }

  if (action === 'deactivate' && typeof result.userId === 'string') {
    try {
      await deps.signOutUser(result.userId)
    } catch {
      return reply(200, { ok: true, signOut: 'failed' })
    }
  }
  return reply(200, { ok: true })
}

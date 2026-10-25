// Request handling for the manage-member Edge Function (ADR-0029). Platform Owner only; the SQL functions check that
// again (they run with the caller's own token) and write the access audit.
//   POST { action: "set_role", memberId, role: "admin"|"team" }
//   POST { action: "deactivate" | "reactivate" | "revoke_invite", memberId }
// Deactivation also signs the member out on every device. The database already refuses their next request, so a
// failed sign-out is reported but does not fail the action.
import { UUID, bearerToken, readJsonObject, reply } from '../_shared/http.ts'

type DbResult = ({ ok: true } & Record<string, unknown>) | { error: string }

export interface ManageDeps {
  userIdFromToken(token: string): Promise<string | null>
  rpcAsCaller(token: string, fn: string, args: Record<string, unknown>): Promise<DbResult>
  signOutUser(userId: string): Promise<void>
}

const FUNCTIONS = {
  set_role: 'admin_set_member_role',
  deactivate: 'admin_deactivate_member',
  reactivate: 'admin_reactivate_member',
  revoke_invite: 'admin_revoke_member_invite',
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
  if ('error' in result) return reply(STATUS_FOR[result.error] ?? 400, { error: result.error })

  if (action === 'deactivate' && typeof result.userId === 'string') {
    try {
      await deps.signOutUser(result.userId)
    } catch {
      return reply(200, { ok: true, signOut: 'failed' })
    }
  }
  return reply(200, { ok: true })
}

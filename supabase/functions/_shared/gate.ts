// The 2FA gate for Edge Functions a person calls (R-W1-1). It asks the database's gated helpers, through the caller's
// own client (_shared/caller.ts), whether the caller meets the 2FA rule and then whether they may do this. It never
// re-implements those checks. Web-standard APIs only, so handlers and tests can use it.
import { reply } from './http.ts'

export type GateResult = 'ok' | 'aal2_required' | 'forbidden'
/** A permission key (platform_can), the platform Owner (is_platform_admin), or any staff (Owner or active member). */
export type GateCheck = { permission: string } | 'owner' | 'staff'
/** Calls a SQL function as the caller. Rejects on an RPC error. */
export type CallerRpc = (fn: string, args?: Record<string, unknown>) => Promise<unknown>

/**
 * caller_mfa_satisfied() first, so a session without the required 2FA step learns only that, then the helper for
 * `check`. Only a literal `true` passes. An RPC error propagates (index.ts turns it into 500 unknown).
 */
export async function gateCaller(rpc: CallerRpc, check: GateCheck): Promise<GateResult> {
  if ((await rpc('caller_mfa_satisfied')) !== true) return 'aal2_required'
  let allowed: boolean
  if (check === 'owner') allowed = (await rpc('is_platform_admin')) === true
  else if (check === 'staff') allowed = (await rpc('is_platform_admin')) === true || (await rpc('is_platform_member')) === true
  else allowed = (await rpc('platform_can', { p_permission: check.permission })) === true
  return allowed ? 'ok' : 'forbidden'
}

/** 403 with the gate's reason as the error key. */
export function gateReply(g: Exclude<GateResult, 'ok'>): Response {
  return reply(403, { error: g })
}

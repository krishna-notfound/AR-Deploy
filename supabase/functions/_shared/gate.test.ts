// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { type CallerRpc, gateCaller, gateReply } from './gate'

/** A caller RPC answering from `answers`, recording each call. */
function rpc(answers: Record<string, unknown>) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = []
  const fn: CallerRpc = async (name, args) => {
    calls.push({ fn: name, ...(args ? { args } : {}) })
    if (!(name in answers)) throw new Error(`unexpected rpc ${name}`)
    return answers[name]
  }
  return { fn, calls }
}

describe('gateCaller (R-W1-1)', () => {
  it('returns aal2_required when caller_mfa_satisfied is false and never asks the permission', async () => {
    for (const check of [{ permission: 'owners.manage' }, 'owner', 'staff'] as const) {
      const r = rpc({ caller_mfa_satisfied: false, platform_can: true, is_platform_admin: true, is_platform_member: true })
      expect(await gateCaller(r.fn, check)).toBe('aal2_required')
      expect(r.calls).toEqual([{ fn: 'caller_mfa_satisfied' }])
    }
  })

  it('returns forbidden when the helper is false', async () => {
    const perm = rpc({ caller_mfa_satisfied: true, platform_can: false })
    expect(await gateCaller(perm.fn, { permission: 'owners.manage' })).toBe('forbidden')
    expect(perm.calls).toEqual([{ fn: 'caller_mfa_satisfied' }, { fn: 'platform_can', args: { p_permission: 'owners.manage' } }])

    const owner = rpc({ caller_mfa_satisfied: true, is_platform_admin: false })
    expect(await gateCaller(owner.fn, 'owner')).toBe('forbidden')
    expect(owner.calls.map((c) => c.fn)).toEqual(['caller_mfa_satisfied', 'is_platform_admin'])

    expect(await gateCaller(rpc({ caller_mfa_satisfied: true, platform_can: true }).fn, { permission: 'owners.manage' })).toBe('ok')
    expect(await gateCaller(rpc({ caller_mfa_satisfied: true, is_platform_admin: true }).fn, 'owner')).toBe('ok')
    // Only a literal true passes: a null or a string from a misbehaving RPC is a refusal.
    expect(await gateCaller(rpc({ caller_mfa_satisfied: true, platform_can: 'true' }).fn, { permission: 'owners.manage' })).toBe('forbidden')
    expect(await gateCaller(rpc({ caller_mfa_satisfied: null, platform_can: true }).fn, { permission: 'owners.manage' })).toBe('aal2_required')
  })

  it('staff = admin or member', async () => {
    expect(await gateCaller(rpc({ caller_mfa_satisfied: true, is_platform_admin: true, is_platform_member: false }).fn, 'staff')).toBe('ok')
    expect(await gateCaller(rpc({ caller_mfa_satisfied: true, is_platform_admin: false, is_platform_member: true }).fn, 'staff')).toBe('ok')
    const none = rpc({ caller_mfa_satisfied: true, is_platform_admin: false, is_platform_member: false })
    expect(await gateCaller(none.fn, 'staff')).toBe('forbidden')
    expect(none.calls.map((c) => c.fn)).toEqual(['caller_mfa_satisfied', 'is_platform_admin', 'is_platform_member'])
  })

  it('propagates an rpc error', async () => {
    const failing: CallerRpc = async (name) => {
      if (name === 'platform_can') throw new Error('platform_can failed: boom')
      return true
    }
    await expect(gateCaller(failing, { permission: 'owners.manage' })).rejects.toThrow(/platform_can failed/)
    await expect(gateCaller(async () => Promise.reject(new Error('caller_mfa_satisfied failed')), 'owner')).rejects.toThrow(/caller_mfa_satisfied/)
  })

  it('gateReply is a 403 with the reason as the error key', async () => {
    for (const g of ['aal2_required', 'forbidden'] as const) {
      const res = gateReply(g)
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: g })
    }
  })
})

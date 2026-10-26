import { beforeEach, describe, expect, it } from 'vitest'
import type { Result } from '../catalogService'
import { mockCatalogService as svc } from './mockCatalogService'
import { createSeed } from './seed'
import { store } from './store'

const ACCOUNT_KEY = 'arfurn:account'
const as = (platformRole: 'owner' | 'admin' | 'team') => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole }))
function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}/${r.error.reason}: ${r.error.message}`)
  return r.data
}

beforeEach(() => {
  store.replace(createSeed())
  as('owner')
})

describe('team (demo service)', () => {
  it('reports the demo role and its permissions', async () => {
    expect(unwrap(await svc.getMyAccess())?.role).toBe('owner')
    as('team')
    const team = unwrap(await svc.getMyAccess())
    expect(team?.role).toBe('team')
    expect(team?.permissions).toContain('products.edit')
    expect(team?.permissions).not.toContain('products.publish')
  })

  it('lists sample members including the owner', async () => {
    const members = unwrap(await svc.listMembers())
    expect(members.map((m) => m.role).sort()).toEqual(['admin', 'admin', 'owner', 'team', 'team'])
    expect(members.find((m) => m.email.startsWith('marta'))).toMatchObject({ status: 'invited', invite: { status: 'sent' } })
  })

  it('invites case-insensitively and refuses duplicates', async () => {
    const r = unwrap(await svc.inviteMember({ email: '  New@Studio.test ', role: 'team' }))
    expect(r.status).toBe('sent')
    expect(unwrap(await svc.listMembers()).find((m) => m.email === 'new@studio.test')?.status).toBe('invited')
    const again = await svc.inviteMember({ email: 'new@studio.test', role: 'admin' })
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.error.reason).toBe('already_member')
  })

  it('only the owner manages the team', async () => {
    as('admin')
    const r = await svc.inviteMember({ email: 'x@studio.test', role: 'team' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatchObject({ code: 'PERMISSION', reason: 'forbidden', message: "You don't have permission to do this." })
  })

  it('updates role permissions and refuses unknown keys', async () => {
    unwrap(await svc.setRolePermissions('team', ['products.view', 'analytics.view']))
    expect(unwrap(await svc.getRolePermissions()).team.sort()).toEqual(['analytics.view', 'products.view'])
    const bad = await svc.setRolePermissions('team', ['products.view', 'x' as never])
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.reason).toBe('unknown_permission')
  })

  it('stores a set with its prerequisites and answers what it added (R-W3-3)', async () => {
    expect(unwrap(await svc.setRolePermissions('team', ['products.publish']))).toEqual({ added: ['products.view', 'products.edit'] })
    expect(unwrap(await svc.getRolePermissions()).team.sort()).toEqual(['products.edit', 'products.publish', 'products.view'])
    expect(unwrap(await svc.setRolePermissions('team', ['products.view', 'products.edit', 'products.publish']))).toEqual({ added: [] })
  })

  it('never changes the owner', async () => {
    const owner = unwrap(await svc.listMembers()).find((m) => m.role === 'owner')!
    const r = await svc.setMemberRole(owner.id, 'team')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.reason).toBe('owner_protected')
  })

  it('accepts the demo invitation once', async () => {
    const seen = unwrap(await svc.inspectInvite('demo-invite-token'))
    expect(seen).toMatchObject({ state: 'valid', role: 'team' })
    expect(seen.email).toMatch(/^marta./)
    unwrap(await svc.acceptInviteCreate({ token: 'demo-invite-token', fullName: 'Marta Lopes', password: 'a-long-passphrase' }))
    expect(unwrap(await svc.listMembers()).find((m) => m.email.startsWith('marta'))?.status).toBe('active')
    expect(unwrap(await svc.inspectInvite('demo-invite-token')).state).toBe('used')
  })

  it('records access events for every change', async () => {
    const before = unwrap(await svc.getAccessEvents()).total
    const ana = unwrap(await svc.listMembers()).find((m) => m.email.startsWith('ana'))!
    unwrap(await svc.deactivateMember(ana.id))
    unwrap(await svc.reactivateMember(ana.id))
    const after = unwrap(await svc.getAccessEvents())
    expect(after.total).toBe(before + 2)
    expect(after.items[0]!.action).toBe('member_reactivated')
    expect(unwrap(await svc.getAccessEvents({ outcome: 'denied' })).items.every((e) => e.outcome === 'denied')).toBe(true)
  })

  it('S1.5 Task 9: removes only a deactivated member (Owner only), records it and frees the email', async () => {
    const before = unwrap(await svc.listMembers())
    const pedro = before.find((m) => m.email.startsWith('pedro'))!
    const ana = before.find((m) => m.email.startsWith('ana'))!
    expect(pedro.status).toBe('deactivated')
    const active = await svc.removeMember(ana.id)
    expect(active.ok === false && active.error.reason).toBe('not_deactivated')
    as('admin')
    const forbidden = await svc.removeMember(pedro.id)
    expect(forbidden.ok === false && forbidden.error.reason).toBe('forbidden')
    as('owner')
    expect(unwrap(await svc.removeMember(pedro.id))).toEqual({ loginDeleted: true })
    expect(unwrap(await svc.listMembers()).some((m) => m.id === pedro.id)).toBe(false)
    expect(unwrap(await svc.listMemberInvites(pedro.id))).toEqual([])
    expect(unwrap(await svc.getAccessEvents()).items[0]).toMatchObject({ action: 'member_removed', member: pedro.email, fromRole: 'admin' })
    const missing = await svc.removeMember(pedro.id)
    expect(missing.ok === false && missing.error.reason).toBe('not_found')
    expect(unwrap(await svc.inviteMember({ email: pedro.email, role: 'team' })).status).toBe('sent')
  })

  it('S1.5 Task 9: the demo access of a deactivated demo member says so', async () => {
    as('owner')
    const ana = unwrap(await svc.listMembers()).find((m) => m.email.startsWith('ana'))!
    unwrap(await svc.deactivateMember(ana.id))
    as('admin') // the demo Admin is Ana
    expect(unwrap(await svc.getMyAccess())).toEqual({ role: null, permissions: [], status: 'deactivated' })
    as('team')
    expect(unwrap(await svc.getMyAccess())?.status).toBe('active')
  })
})

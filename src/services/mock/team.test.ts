import { beforeEach, describe, expect, it } from 'vitest'
import type { Result } from '../catalogService'
import { DEMO_CODE, mockAccountService, resetMockAccount } from './mockAccount'
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
    if (!r.ok) expect(r.error.reason).toBe('self') // the Owner is the signed-in demo person (R-W8-5)
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

  // R-W6-4: a member's history is matched on exact ids, never an email search.
  it("access history for delivered+a_b@resend.dev shows its events; an@x.pt doesn't show jan@x.pt's", async () => {
    const plus = unwrap(await svc.inviteMember({ email: 'delivered+a_b@resend.dev', role: 'team' })).memberId
    const an = unwrap(await svc.inviteMember({ email: 'an@x.pt', role: 'team' })).memberId
    const jan = unwrap(await svc.inviteMember({ email: 'jan@x.pt', role: 'admin' })).memberId
    unwrap(await svc.revokeMemberInvite(jan))
    const history = async (memberId: string) => unwrap(await svc.getAccessEvents({ memberId })).items.map((e) => [e.member, e.action])
    expect(await history(plus)).toEqual([
      ['delivered+a_b@resend.dev', 'invite_email_sent'],
      ['delivered+a_b@resend.dev', 'invite_created'],
    ])
    expect(await history(an)).toEqual([
      ['an@x.pt', 'invite_email_sent'],
      ['an@x.pt', 'invite_created'],
    ])
    expect((await history(jan)).map(([, a]) => a)).toEqual(['invite_revoked', 'invite_email_sent', 'invite_created'])
  })

  it("a member's history includes the access refusals of their login, and only theirs", async () => {
    as('team') // João tries something only the Owner may do
    expect((await svc.listMembers()).ok).toBe(false)
    as('owner')
    const members = unwrap(await svc.listMembers())
    const joao = members.find((m) => m.email.startsWith('joao'))!
    const items = unwrap(await svc.getAccessEvents({ memberId: joao.id, userId: joao.userId! })).items
    expect(items.filter((e) => e.action === 'denied')).toHaveLength(2) // the seeded one and this one
    expect(items.map((e) => e.action)).toContain('invite_accepted')
    const ana = members.find((m) => m.email.startsWith('ana'))!
    expect(unwrap(await svc.getAccessEvents({ memberId: ana.id, userId: ana.userId! })).items.some((e) => e.action === 'denied')).toBe(false)
  })

  it('lists has2fa per member (R-W6-6)', async () => {
    const members = unwrap(await svc.listMembers())
    expect(Object.fromEntries(members.map((m) => [m.email.split('@')[0], m.has2fa]))).toMatchObject({
      'ana.ribeiro': true,
      'joao.costa': true,
      'marta.lopes': false,
      'pedro.alves': false,
    })
  })

  it('Reset 2FA: nothing_to_reset for a member without 2FA; after a reset, has2fa is false (R-W6-6)', async () => {
    resetMockAccount()
    const e = await mockAccountService.startTotpEnrollment() // the demo Owner at aal2
    if (!e.ok) throw new Error('enrollment did not start')
    unwrap(await mockAccountService.confirmTotpEnrollment(e.data.factorId, DEMO_CODE))
    const members = unwrap(await svc.listMembers())
    const pedro = members.find((m) => m.email.startsWith('pedro'))!
    const r = await mockAccountService.ownerReset2fa(pedro.userId!, DEMO_CODE)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatchObject({ code: 'CONFLICT', reason: 'nothing_to_reset' })
    const ana = members.find((m) => m.email.startsWith('ana'))!
    unwrap(await mockAccountService.ownerReset2fa(ana.userId!, DEMO_CODE))
    expect(unwrap(await svc.listMembers()).find((m) => m.id === ana.id)?.has2fa).toBe(false)
  })

  // R-W6-4 (controller ruling): the Access history "Member email" filter is an exact address, as in the Supabase query.
  it("the member email filter is exact: delivered+a_b@resend.dev finds its own events; an@x.pt doesn't match jan@x.pt", async () => {
    unwrap(await svc.inviteMember({ email: 'delivered+a_b@resend.dev', role: 'team' }))
    unwrap(await svc.inviteMember({ email: 'an@x.pt', role: 'team' }))
    unwrap(await svc.inviteMember({ email: 'jan@x.pt', role: 'admin' }))
    const members = async (q: string) => [...new Set(unwrap(await svc.getAccessEvents({ q })).items.map((e) => e.member))]
    expect(await members('delivered+a_b@resend.dev')).toEqual(['delivered+a_b@resend.dev'])
    expect(await members('  An@X.pt ')).toEqual(['an@x.pt'])
    expect(await members('jan@x.pt')).toEqual(['jan@x.pt'])
    expect(await members('x.pt')).toEqual([])
  })
})

describe('team (demo service): the database rules (S1.5 R-W8-5)', () => {
  it('checks real owner memberships: an owner email is refused, a business contact address is not', async () => {
    unwrap(await svc.provisionOwner({ businessId: 'biz_casa', email: 'Owner@Casa.test', language: 'en' }))
    const refused = await svc.inviteMember({ email: 'owner@casa.test', role: 'team' })
    expect(!refused.ok && refused.error.reason).toBe('business_owner')
    // hello@casalisboa.example is only a contact address on the business, not an owner membership.
    expect(unwrap(await svc.inviteMember({ email: 'hello@casalisboa.example', role: 'team' })).status).toBe('sent')
  })

  it('the 6th resend in an hour is rate_limited', async () => {
    const marta = unwrap(await svc.listMembers()).find((m) => m.email.startsWith('marta'))!
    for (let i = 0; i < 5; i++) unwrap(await svc.resendMemberInvite(marta.id))
    const sixth = await svc.resendMemberInvite(marta.id)
    expect(!sixth.ok && sixth.error.reason).toBe('rate_limited')
    expect(!sixth.ok && sixth.error.code).toBe('RATE_LIMITED')
  })

  it("self refusal: the signed-in person can't change, deactivate or remove their own row", async () => {
    const owner = unwrap(await svc.listMembers()).find((m) => m.role === 'owner')!
    for (const r of [await svc.setMemberRole(owner.id, 'team'), await svc.deactivateMember(owner.id), await svc.removeMember(owner.id)]) {
      expect(!r.ok && r.error.reason).toBe('self')
    }
  })

  it('a removed demo Admin has no platform access (as my_platform_access)', async () => {
    const ana = unwrap(await svc.listMembers()).find((m) => m.email.startsWith('ana.'))!
    unwrap(await svc.deactivateMember(ana.id))
    unwrap(await svc.removeMember(ana.id))
    as('admin')
    expect(unwrap(await svc.getMyAccess())).toBeNull()
  })

  it('access history filtered as R-W6-4: one member by exact id, a denied actor by exact user id', async () => {
    const marta = unwrap(await svc.listMembers()).find((m) => m.email.startsWith('marta'))!
    const mine = unwrap(await svc.getAccessEvents({ memberId: marta.id })).items
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((e) => e.member?.startsWith('marta'))).toBe(true)
    const denied = unwrap(await svc.getAccessEvents({ userId: 'usr_mem_joao' })).items
    expect(denied.map((e) => e.action)).toEqual(['denied'])
    expect(unwrap(await svc.getAccessEvents({ memberId: 'nobody' })).items).toEqual([])
  })
})

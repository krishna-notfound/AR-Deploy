import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { account, service } from '@/services'
import { DEMO_CODE, resetMockAccount } from '@/services/mock/mockAccount'

function open(url: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

beforeAll(async () => {
  await import('@/features/team/MemberDetailPage')
}, 60_000)
beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  resetMockAccount()
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('Member detail (ADR-0029)', () => {
  it('shows who they are, their role and what it allows', { timeout: 20_000 }, async () => {
    open('/admin/team/mem_marta')
    expect(await screen.findByRole('heading', { level: 1, name: 'marta.lopes@sanctus.example' })).toBeInTheDocument()
    expect(screen.getByText('Last sign-in')).toBeInTheDocument()
    expect(screen.getByText('Never')).toBeInTheDocument()
    const perms = screen.getByRole('list', { name: 'Team permissions' })
    expect(within(perms).getByText('Create and edit products')).toBeInTheDocument()
    expect(within(perms).queryByText('Publish and unpublish')).toBeNull()
    expect(await screen.findByText('Invited as Team')).toBeInTheDocument() // this member's access events
  })

  // R-W6-4: the member's Access history is matched on their ids, not an email search.
  it("asks for this member's access history by id and login", { timeout: 20_000 }, async () => {
    const spy = vi.spyOn(service, 'getAccessEvents')
    open('/admin/team/mem_joao')
    expect(await screen.findByText('Tried to open Team & Access')).toBeInTheDocument() // João's own refusal
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ memberId: 'mem_joao', userId: 'usr_mem_joao', q: undefined }))
    expect(screen.queryByText('Joined as Admin')).toBeNull() // Ana's event
  })

  it('shows the header avatar as a 48px Inter square with the initials when there is no photo', { timeout: 20_000 }, async () => {
    open('/admin/team/mem_ana')
    await screen.findByRole('heading', { level: 1, name: 'Ana Ribeiro' })
    const avatar = screen.getByText('AR')
    expect(avatar).toHaveAttribute('data-avatar')
    expect(avatar.className).toContain('size-12')
    expect(avatar.className).toContain('font-[family-name:var(--font-ui)]')
    expect(avatar.className).not.toContain('font-display')
    expect(avatar.querySelector('img')).toBeNull()
  })

  it("shows the member's photo in the header when they have one", { timeout: 20_000 }, async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' })) // the demo team is staff-only
    const real = await service.listMembers()
    if (!real.ok) throw new Error('demo team did not load')
    // The page reads the member from the team list.
    vi.spyOn(service, 'listMembers').mockResolvedValue({ ok: true, data: real.data.map((m) => (m.id === 'mem_ana' ? { ...m, avatarUrl: 'https://cdn.test/avatars/ana.webp' } : m)) })
    open('/admin/team/mem_ana')
    await screen.findByRole('heading', { level: 1, name: 'Ana Ribeiro' })
    const img = document.querySelector('main [data-avatar] img')
    expect(img?.getAttribute('src')).toBe('https://cdn.test/avatars/ana.webp')
  })

  it('lists the invitation history', { timeout: 20_000 }, async () => {
    open('/admin/team/mem_marta')
    const history = await screen.findByRole('region', { name: 'Invitations' })
    expect(await within(history).findByText('Sent')).toBeInTheDocument()
  })

  it('changes the role after showing what they lose', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(service, 'setMemberRole')
    open('/admin/team/mem_ana')
    await screen.findByRole('heading', { level: 1, name: 'Ana Ribeiro' })
    await user.click(screen.getByRole('button', { name: 'Change role' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Make Team' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Loses: .*Publish and unpublish/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Make Team' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('mem_ana', 'team'))
  })

  it('explains deactivation before doing it', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    open('/admin/team/mem_ana')
    await screen.findByRole('heading', { level: 1, name: 'Ana Ribeiro' })
    await user.click(screen.getByRole('button', { name: 'Deactivate' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/loses access immediately and is signed out on every device/)).toBeInTheDocument()
  })

  it("S1.5 Task 9: Remove shows only on a deactivated member, with the §11.1 title, body and button; toast '{email} was removed.'", { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    const remove = vi.spyOn(service, 'removeMember')
    const { unmount } = open('/admin/team/mem_ana')
    await screen.findByRole('heading', { level: 1, name: 'Ana Ribeiro' })
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    unmount()

    open('/admin/team/mem_pedro')
    await screen.findByRole('heading', { level: 1, name: 'Pedro Alves' })
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove pedro.alves@sanctus.example from the team?' })
    expect(within(dialog).getByText("Their access record and login are deleted. Past actions stay in the audit log as 'Deleted user (Admin)'. They can be invited again later.")).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Remove member' }))
    expect(await screen.findByText('pedro.alves@sanctus.example was removed.')).toBeInTheDocument()
    expect(remove).toHaveBeenCalledWith('mem_pedro')
    // The member no longer exists: back to the team list, without them.
    await waitFor(() => expect(window.location.pathname).toBe('/admin/team'))
    const after = await service.listMembers()
    expect(after.ok && after.data.some((m) => m.id === 'mem_pedro')).toBe(false)
  })

  it('S1.5 Task 9: a refused removal keeps the member and says why', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    vi.spyOn(service, 'removeMember').mockResolvedValue({ ok: false, error: { code: 'CONFLICT', message: 'This member is not deactivated.', reason: 'not_deactivated' } })
    open('/admin/team/mem_pedro')
    await screen.findByRole('heading', { level: 1, name: 'Pedro Alves' })
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove member' }))
    expect(await screen.findByText('This member is not deactivated.')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/admin/team/mem_pedro')
  })

  it('shows no actions for the Owner and a not-found state for an unknown id', { timeout: 20_000 }, async () => {
    const { unmount } = open('/admin/team/usr_platform')
    await screen.findByRole('heading', { level: 1, name: 'Platform Admin' })
    expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change role' })).toBeNull()
    expect(screen.getByText(/The Owner always has every permission/)).toBeInTheDocument()
    unmount()
    open('/admin/team/nobody')
    expect(await screen.findByText('This team member does not exist')).toBeInTheDocument()
  })
})

describe('Member detail: Reset 2FA (Owner only)', () => {
  /** The demo Owner sets up their own authenticator, which leaves the session at aal2. */
  async function ownerAtAal2() {
    const e = await account.startTotpEnrollment()
    if (!e.ok) throw new Error('enrollment did not start')
    await account.confirmTotpEnrollment(e.data.factorId, DEMO_CODE)
  }

  it("Reset 2FA on a member opens the action-code dialog and toasts 'Their 2FA was reset. They were emailed.'", { timeout: 20_000 }, async () => {
    await ownerAtAal2()
    const reset = vi.spyOn(account, 'ownerReset2fa')
    const user = userEvent.setup()
    open('/admin/team/mem_ana')
    await screen.findByRole('heading', { level: 1, name: 'Ana Ribeiro' })
    await user.click(screen.getByRole('button', { name: 'Reset 2FA' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reset 2FA for Ana Ribeiro?' })
    expect(within(dialog).getByText(/removes their authenticator and recovery codes/)).toBeInTheDocument()
    await within(dialog).findByText(/We emailed a 6-digit code/)
    await user.type(within(dialog).getByLabelText('6-digit code'), DEMO_CODE)
    await user.click(within(dialog).getByRole('button', { name: 'Reset 2FA' }))
    expect(await screen.findByText('Their 2FA was reset. They were emailed.')).toBeInTheDocument()
    expect(reset).toHaveBeenCalledWith('usr_mem_ana', DEMO_CODE)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps the dialog open with the reason when the reset is refused', { timeout: 20_000 }, async () => {
    // Signed in without 2FA: the server refuses (aal2_required) and nothing is reset.
    const user = userEvent.setup()
    open('/admin/team/mem_joao')
    await screen.findByRole('heading', { level: 1, name: 'João Costa' })
    await user.click(screen.getByRole('button', { name: 'Reset 2FA' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText(/We emailed a 6-digit code/)
    await user.type(within(dialog).getByLabelText('6-digit code'), DEMO_CODE)
    await user.click(within(dialog).getByRole('button', { name: 'Reset 2FA' }))
    expect(await within(dialog).findByText(/This needs 2FA/)).toBeInTheDocument()
    expect(screen.queryByText('Their 2FA was reset. They were emailed.')).toBeNull()
  })

  it('none of these appear for Admin or Team', { timeout: 20_000 }, async () => {
    for (const platformRole of ['admin', 'team'] as const) {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole }))
      window.history.replaceState(null, '', '/admin/team/mem_ana')
      const { unmount } = render(<App />)
      expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reset 2FA' })).toBeNull()
      unmount()
    }
  })

  it('keeps the Change role trigger at the control height and its natural width', { timeout: 20_000 }, async () => {
    open('/admin/team/mem_ana')
    await screen.findByRole('heading', { level: 1, name: 'Ana Ribeiro' })
    const trigger = screen.getByRole('button', { name: 'Change role' })
    for (const c of ['h-10!', 'max-sm:h-11!', 'pointer-coarse:h-11!', 'w-auto!']) expect(trigger.className).toContain(c)
  })

  // R-W6-6: Reset 2FA only when has2fa (a verified authenticator or unused recovery codes).
  it('Reset 2FA only when has2fa', { timeout: 20_000 }, async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' })) // the demo team is staff-only
    const real = await service.listMembers()
    if (!real.ok) throw new Error('demo team did not load')
    vi.spyOn(service, 'listMembers').mockResolvedValue({ ok: true, data: real.data.map((m) => (m.id === 'mem_ana' ? { ...m, has2fa: false } : m)) })
    const { unmount } = open('/admin/team/mem_ana')
    await screen.findByRole('heading', { level: 1, name: 'Ana Ribeiro' })
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset 2FA' })).toBeNull()
    unmount()
    open('/admin/team/mem_joao') // has2fa: true
    await screen.findByRole('heading', { level: 1, name: 'João Costa' })
    expect(screen.getByRole('button', { name: 'Reset 2FA' })).toBeInTheDocument()
  })

  it('is not offered for an invited member with no account yet, nor for the Owner', { timeout: 20_000 }, async () => {
    const { unmount } = open('/admin/team/mem_marta')
    await screen.findByRole('heading', { level: 1, name: 'marta.lopes@sanctus.example' })
    expect(screen.queryByRole('button', { name: 'Reset 2FA' })).toBeNull()
    unmount()
    open('/admin/team/usr_platform')
    await screen.findByRole('heading', { level: 1, name: 'Platform Admin' })
    expect(screen.queryByRole('button', { name: 'Reset 2FA' })).toBeNull()
  })
})

describe('Email failed invitations (R-W7-3)', () => {
  it('an email_failed invite shows "Email failed" on the member page', { timeout: 20_000 }, async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' })) // the demo team is staff-only
    const team = await service.listMembers()
    const invites = await service.listMemberInvites('mem_marta')
    if (!team.ok || !invites.ok) throw new Error('demo team did not load')
    vi.spyOn(service, 'listMembers').mockResolvedValue({
      ok: true,
      data: team.data.map((m) => (m.id === 'mem_marta' && m.invite ? { ...m, invite: { ...m.invite, status: 'email_failed' as const } } : m)),
    })
    vi.spyOn(service, 'listMemberInvites').mockResolvedValue({
      ok: true,
      data: invites.data.map((i, k) => (k === 0 ? { ...i, status: 'email_failed' as const, lastEmailResult: 'bounced' } : i)),
    })
    open('/admin/team/mem_marta')
    await screen.findByRole('heading', { level: 1, name: 'marta.lopes@sanctus.example' })
    const history = await screen.findByRole('region', { name: 'Invitations' })
    expect((await within(history).findAllByText('Email failed')).length).toBeGreaterThan(0)
  })
})

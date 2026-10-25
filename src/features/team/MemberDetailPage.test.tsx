import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { service } from '@/services'

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

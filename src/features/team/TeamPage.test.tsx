import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { service } from '@/services'
import { fail } from '@/services/catalogService'

function open(url: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  window.history.replaceState(null, '', url)
  return render(<App />)
}
const table = () => screen.getByRole('table')
const rowFor = (text: string) => within(table()).getByText(text).closest('tr') as HTMLElement

beforeAll(async () => {
  await import('@/features/team/TeamPage')
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

describe('Team & Access page (ADR-0029)', () => {
  it('shows the four counts from the team data', { timeout: 20_000 }, async () => {
    open('/admin/team')
    await screen.findByRole('heading', { level: 1, name: 'Team & Access' })
    // A stat card is <div><div><dt>label</dt></div><dd>value</dd></div> (StatGroup).
    const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement!.parentElement as HTMLElement
    await waitFor(() => expect(within(stat('Active members')).getByText('3')).toBeInTheDocument())
    expect(within(stat('Pending invitations')).getByText('1')).toBeInTheDocument()
    expect(within(stat('Admins')).getByText('2')).toBeInTheDocument()
    expect(within(stat('Team')).getByText('2')).toBeInTheDocument()
  })

  it('searches and filters members', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    open('/admin/team')
    await within(await screen.findByRole('table')).findByText('ana.ribeiro@sanctus.example')
    await user.type(screen.getByRole('searchbox', { name: 'Search members' }), 'marta')
    await waitFor(() => expect(within(table()).queryByText('ana.ribeiro@sanctus.example')).toBeNull(), { timeout: 5_000 })
    expect(within(table()).getByText('marta.lopes@sanctus.example')).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: 'Search members' }))
    await user.selectOptions(screen.getByLabelText('Role'), 'team')
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(3), { timeout: 5_000 }) // header + 2 (after the search debounce)
  })

  it('offers only the actions that make sense for each person', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    open('/admin/team')
    await within(await screen.findByRole('table')).findByText('ana.ribeiro@sanctus.example')
    expect(within(rowFor('admin@platform.example')).queryByRole('button', { name: /^Actions for/ })).toBeNull()

    await user.click(within(rowFor('marta.lopes@sanctus.example')).getByRole('button', { name: /^Actions for/ }))
    let items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent)
    expect(items).toEqual(expect.arrayContaining(['View', 'Resend invitation', 'Revoke invitation']))
    expect(items).not.toContain('Deactivate')
    await user.keyboard('{Escape}')

    await user.click(within(rowFor('ana.ribeiro@sanctus.example')).getByRole('button', { name: /^Actions for/ }))
    items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent)
    expect(items).toContain('Deactivate')
    expect(items).not.toContain('Resend invitation')
  })

  it('revokes an invitation after confirming', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    open('/admin/team')
    await within(await screen.findByRole('table')).findByText('marta.lopes@sanctus.example')
    await user.click(within(rowFor('marta.lopes@sanctus.example')).getByRole('button', { name: /^Actions for/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Revoke invitation' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Revoke invitation' }))
    await waitFor(() => expect(within(rowFor('marta.lopes@sanctus.example')).getByText('Revoked')).toBeInTheDocument())
  })

  it('lists access history and filters refused attempts', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    open('/admin/team?tab=history')
    expect(await screen.findByText('Tried to open Team & Access')).toBeInTheDocument()
    expect(screen.getByText('Joined as Admin')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Outcome'), 'denied')
    await waitFor(() => expect(screen.queryByText('Joined as Admin')).toBeNull())
    expect(screen.getByText('Tried to open Team & Access')).toBeInTheDocument()
  })

  it('shows a retry state when the members cannot load', { timeout: 20_000 }, async () => {
    vi.spyOn(service, 'listMembers').mockResolvedValue(fail('UNKNOWN', 'Network down.'))
    open('/admin/team')
    expect(await screen.findByText(/Network down/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

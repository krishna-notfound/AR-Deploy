import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { LANG_KEY } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import type { PlatformMember } from '@/domain/types'
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
    // Admins and Team count active members only: not the deactivated Admin, not the pending Team invitation.
    expect(within(stat('Admins')).getByText('1')).toBeInTheDocument()
    expect(within(stat('Team')).getByText('1')).toBeInTheDocument()
  })

  it('styles role badges per the design: Owner is obsidian, no badge is uppercase, member rows are two-line (60px)', { timeout: 20_000 }, async () => {
    open('/admin/team')
    await within(await screen.findByRole('table')).findByText('ana.ribeiro@sanctus.example')
    const owner = within(rowFor('admin@platform.example')).getByText('Owner')
    expect(owner.className).toContain('bg-obsidian')
    expect(owner.className).not.toContain('uppercase')
    expect(within(rowFor('ana.ribeiro@sanctus.example')).getByText('Admin').className).not.toContain('uppercase')
    expect(rowFor('ana.ribeiro@sanctus.example').className).toContain('h-[60px]')
  })

  it('renders each member as a two-line mobile list item with the dates line', { timeout: 20_000 }, async () => {
    open('/admin/team')
    const list = await screen.findByRole('list', { name: 'Platform members' })
    const item = within(list).getByText('marta.lopes@sanctus.example').closest('li') as HTMLElement
    expect(item.textContent).toMatch(/Invited .*· Last sign-in Never/)
    expect(item.textContent).toContain('Team')
    const ana = within(list).getByText('ana.ribeiro@sanctus.example').closest('li') as HTMLElement
    expect(ana.textContent).toMatch(/Joined .*· Last sign-in/)
  })

  it('searches and filters members', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    open('/admin/team')
    await within(await screen.findByRole('table')).findByText('ana.ribeiro@sanctus.example')
    await user.type(screen.getByRole('searchbox', { name: 'Search members' }), 'marta')
    await waitFor(() => expect(within(table()).queryByText('ana.ribeiro@sanctus.example')).toBeNull(), { timeout: 10_000 })
    expect(within(table()).getByText('marta.lopes@sanctus.example')).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: 'Search members' }))
    await user.selectOptions(screen.getByLabelText('Role'), 'team')
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(3), { timeout: 10_000 }) // header + 2 (after the search debounce)
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
    // R-W6-9: the toast says how to send a new link.
    expect(await screen.findByText('Invitation revoked. Use Resend to send them a new link.')).toBeInTheDocument()
  })

  it("'Pending invitations' counts only sent or pending, unexpired invites", { timeout: 20_000 }, async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' })) // the demo team is staff-only
    const real = await service.listMembers()
    if (!real.ok) throw new Error('demo team did not load')
    const marta = real.data.find((m) => m.email.startsWith('marta'))!
    const later = new Date(Date.now() + 86_400_000).toISOString()
    const earlier = new Date(Date.now() - 86_400_000).toISOString()
    const invited = (n: number, invite: PlatformMember['invite']): PlatformMember => ({ ...marta, id: `inv_${n}`, email: `invited${n}@studio.test`, invite })
    vi.spyOn(service, 'listMembers').mockResolvedValue({
      ok: true,
      data: [
        ...real.data.filter((m) => m.status !== 'invited'),
        invited(1, { status: 'sent', expiresAt: later }),
        invited(2, { status: 'pending', expiresAt: later }),
        invited(3, { status: 'sent', expiresAt: earlier }), // expired, not yet marked
        invited(4, { status: 'expired', expiresAt: earlier }),
        invited(5, { status: 'email_failed', expiresAt: later }),
        invited(6, { status: 'revoked', expiresAt: later }),
        invited(7, null),
      ],
    })
    open('/admin/team')
    await screen.findByRole('heading', { level: 1, name: 'Team & Access' })
    const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement!.parentElement as HTMLElement
    await waitFor(() => expect(within(stat('Pending invitations')).getByText('2')).toBeInTheDocument())
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
    expect(await screen.findByText(/Could not load the team. Something went wrong/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('Email failed invitations (R-W7-3)', () => {
  it('an email_failed invite shows "Email failed" on the Team page', { timeout: 20_000 }, async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' })) // the demo team is staff-only
    const real = await service.listMembers()
    if (!real.ok) throw new Error('demo team did not load')
    vi.spyOn(service, 'listMembers').mockResolvedValue({
      ok: true,
      data: real.data.map((m) => (m.id === 'mem_marta' && m.invite ? { ...m, invite: { ...m.invite, status: 'email_failed' as const } } : m)),
    })
    open('/admin/team?tab=invitations')
    const row = (await within(await screen.findByRole('table')).findByText('marta.lopes@sanctus.example')).closest('tr') as HTMLElement
    expect(within(row).getByText('Email failed')).toBeInTheDocument()
  })

  it('shows the page in Portuguese when the language is pt', { timeout: 20_000 }, async () => {
    localStorage.setItem(LANG_KEY, 'pt')
    open('/admin/team')
    await screen.findByRole('heading', { level: 1, name: 'Equipa e acessos' })
    expect(screen.getByRole('button', { name: 'Convidar membro' })).toBeInTheDocument()
    expect(screen.getByText('Membros ativos', { selector: 'dt' })).toBeInTheDocument()
    const row = (await within(await screen.findByRole('table')).findByText('ana.ribeiro@sanctus.example')).closest('tr') as HTMLElement
    expect(within(row).getByText('Administrador')).toBeInTheDocument()
    expect(within(row).getByText('Ativo')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Histórico de acessos/ })).toBeInTheDocument()
    expect(screen.queryByText('Invite member')).toBeNull()
  })
})

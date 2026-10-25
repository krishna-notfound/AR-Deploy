import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import type { PlatformMember } from '@/domain/types'
import { service } from '@/services'

function open(url: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

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

describe('MembersTable avatars', () => {
  it("MembersTable shows a member's photo when present", { timeout: 20_000 }, async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' })) // the demo team is staff-only
    const real = await service.listMembers()
    if (!real.ok) throw new Error('demo team did not load')
    const withPhoto: PlatformMember[] = real.data.map((m) => (m.id === 'mem_ana' ? { ...m, avatarUrl: 'https://cdn.test/avatars/ana.webp' } : { ...m, avatarUrl: null }))
    vi.spyOn(service, 'listMembers').mockResolvedValue({ ok: true, data: withPhoto })
    open('/admin/team')
    const table = await screen.findByRole('table')
    const row = (await within(table).findByText('ana.ribeiro@sanctus.example')).closest('tr') as HTMLElement
    expect(row.querySelector('[data-avatar] img')?.getAttribute('src')).toBe('https://cdn.test/avatars/ana.webp')
    // Without a photo: the initials.
    const joao = within(table).getByText('joao.costa@sanctus.example').closest('tr') as HTMLElement
    expect(joao.querySelector('[data-avatar] img')).toBeNull()
    expect(joao.querySelector('[data-avatar]')?.textContent).toBe('JC')
    // The mobile list shows the same photo.
    const list = screen.getByRole('list', { name: 'Platform members' })
    const item = within(list).getByText('ana.ribeiro@sanctus.example').closest('li') as HTMLElement
    expect(item.querySelector('[data-avatar] img')?.getAttribute('src')).toBe('https://cdn.test/avatars/ana.webp')
  })
})

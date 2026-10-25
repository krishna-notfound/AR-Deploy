import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import type { SecurityEvent } from '@/domain/types'
import { account, service } from '@/services'
import { accountFail } from '@/services/accountService'
import { resetMockAccount } from '@/services/mock/mockAccount'

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

function open() {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
  window.history.replaceState(null, '', '/admin/settings/activity')
  return render(<App />)
}

const ev = (e: Partial<SecurityEvent> & Pick<SecurityEvent, 'id' | 'type' | 'at'>): SecurityEvent => ({ userAgent: null, ip: null, ...e })

beforeAll(async () => {
  await Promise.all([import('@/features/settings/SettingsSectionPage'), import('./ActivitySection')])
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

describe('Security activity section', () => {
  it('lists events with label, time and device', { timeout: 20_000 }, async () => {
    vi.spyOn(account, 'listSecurityEvents').mockResolvedValue({
      ok: true,
      data: [
        ev({ id: 'e1', type: 'account_2fa_enabled', at: '2026-07-25T13:05:00Z', userAgent: SAFARI_IPHONE, ip: '203.0.113.7' }),
        ev({ id: 'e2', type: 'account_password_changed', at: '2026-07-24T09:00:00Z', userAgent: CHROME_WIN }),
        ev({ id: 'e3', type: 'account_signed_in', at: '2026-07-20T08:00:00Z' }),
        ev({ id: 'e4', type: 'account_something_new', at: '2026-07-19T08:00:00Z' }),
      ],
    })
    open()
    const list = await screen.findByRole('list', { name: 'Security events' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('2FA turned on')
    // The default preference (d MMM yyyy, 24h, Europe/Lisbon) applies once the profile has loaded.
    await waitFor(() => expect(items[0]).toHaveTextContent('25 Jul 2026, 14:05'))
    expect(items[0]).toHaveTextContent('Safari on iPhone')
    expect(items[0]).toHaveTextContent('203.0.113.7')
    expect(items[1]).toHaveTextContent('Password changed')
    expect(items[1]).toHaveTextContent('Chrome on Windows')
    expect(items[2]).toHaveTextContent('Signed in')
    expect(items[2]).toHaveTextContent('Unknown device')
    expect(items[3]).toHaveTextContent('Something new')
    expect(within(items[0]!).getByText('25 Jul 2026, 14:05').closest('time')).toHaveAttribute('dateTime', '2026-07-25T13:05:00Z')
  })

  it("shows 'Account deletion failed' and hides the plain account_deleted just before it", { timeout: 20_000 }, async () => {
    vi.spyOn(account, 'listSecurityEvents').mockResolvedValue({
      ok: true,
      data: [
        ev({ id: 'f', type: 'account_deleted', at: '2026-07-25T13:05:20Z', deleteFailed: true }),
        ev({ id: 'd', type: 'account_deleted', at: '2026-07-25T13:05:00Z' }),
        ev({ id: 'old', type: 'account_deleted', at: '2026-07-20T10:00:00Z' }),
      ],
    })
    open()
    const list = await screen.findByRole('list', { name: 'Security events' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((i) => i.querySelector('p')?.textContent)).toEqual(['Account deletion failed', 'Account deleted'])
  })

  it('shows an empty state', { timeout: 20_000 }, async () => {
    vi.spyOn(account, 'listSecurityEvents').mockResolvedValue({ ok: true, data: [] })
    open()
    expect(await screen.findByText('No security activity yet')).toBeInTheDocument()
  })

  it('shows an error state with a retry', { timeout: 20_000 }, async () => {
    const spy = vi.spyOn(account, 'listSecurityEvents').mockResolvedValue(accountFail('unknown'))
    open()
    expect(await screen.findByText(/Could not load your security activity/)).toBeInTheDocument()
    spy.mockResolvedValue({ ok: true, data: [ev({ id: 'e1', type: 'account_signed_in', at: '2026-07-25T13:05:00Z' })] })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Signed in')).toBeInTheDocument()
  })
})

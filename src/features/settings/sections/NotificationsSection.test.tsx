import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { account, service } from '@/services'
import { accountFail } from '@/services/accountService'
import { resetMockAccount } from '@/services/mock/mockAccount'

type As = { role: 'super_admin'; platformRole?: 'owner' | 'admin' | 'team' } | { role: 'business_admin'; businessId: string }

function open(as: As, url: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(as))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

beforeAll(async () => {
  await Promise.all([import('@/features/settings/SettingsSectionPage'), import('./NotificationsSection')])
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

describe('Notifications section', () => {
  it('staff with applications.view see the new-applications switch; it saves to the profile', { timeout: 20_000 }, async () => {
    open({ role: 'super_admin', platformRole: 'team' }, '/admin/settings/notifications')
    const sw = await screen.findByRole('switch', { name: 'New business applications' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(sw)
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'))
    const p = await account.getProfile()
    expect(p.ok && p.data.notifyNewApplications).toBe(false)
  })

  it('business owners do not see the new-applications switch; security emails are shown as always on', { timeout: 20_000 }, async () => {
    open({ role: 'business_admin', businessId: 'biz_casa' }, '/dashboard/settings/notifications')
    expect(await screen.findByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument()
    expect(await screen.findByText('Security emails')).toBeInTheDocument()
    expect(screen.getByText('Always on')).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'New business applications' })).toBeNull()
  })

  it('staff also see security emails as always on, with no switch to turn them off', { timeout: 20_000 }, async () => {
    open({ role: 'super_admin' }, '/admin/settings/notifications')
    await screen.findByRole('switch', { name: 'New business applications' })
    expect(screen.getByText('Security emails')).toBeInTheDocument()
    expect(screen.getByText('Always on')).toBeInTheDocument()
    expect(screen.getAllByRole('switch')).toHaveLength(1)
  })

  it('rolls the switch back and says so when saving fails', { timeout: 20_000 }, async () => {
    open({ role: 'super_admin' }, '/admin/settings/notifications')
    const sw = await screen.findByRole('switch', { name: 'New business applications' })
    vi.spyOn(account, 'updateProfile').mockResolvedValue(accountFail('unknown'))
    await userEvent.click(sw)
    expect(await screen.findByText('Could not save the notification setting')).toBeInTheDocument()
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'))
  })

  it('shows an error with a retry when the profile cannot be loaded', { timeout: 20_000 }, async () => {
    const spy = vi.spyOn(account, 'getProfile').mockResolvedValue(accountFail('unknown'))
    open({ role: 'super_admin' }, '/admin/settings/notifications')
    expect(await screen.findByText(/Could not load your notification settings/)).toBeInTheDocument()
    spy.mockRestore()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('switch', { name: 'New business applications' })).toBeInTheDocument()
  })
})

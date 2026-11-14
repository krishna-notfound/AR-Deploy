import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { notifications, service } from '@/services'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { resetMockNotifications } from '@/services/mock/mockNotifications'

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
  resetMockNotifications()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('Notifications section: Email switches (ADR-0078)', () => {
  it('staff with applications.view see In-app and Email for new applications; Email saves to their preferences', { timeout: 20_000 }, async () => {
    open({ role: 'super_admin', platformRole: 'team' }, '/admin/settings/notifications')
    const email = await screen.findByRole('switch', { name: 'New applications Email' })
    expect(screen.getByRole('switch', { name: 'New applications In-app' })).toHaveAttribute('aria-checked', 'true')
    expect(email).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(email)
    await waitFor(() => expect(email).toHaveAttribute('aria-checked', 'false'))
    const prefs = await notifications.getNotificationPrefs()
    expect(prefs.ok && prefs.data).toMatchObject({ emailNewApplication: false, emailNewModelRequest: true, newApplication: true })
  })

  it('each Email switch changes only its own type', { timeout: 20_000 }, async () => {
    open({ role: 'super_admin' }, '/admin/settings/notifications')
    await userEvent.click(await screen.findByRole('switch', { name: 'New 3D model requests Email' }))
    await waitFor(async () => {
      const p = await notifications.getNotificationPrefs()
      expect(p.ok && p.data).toMatchObject({ emailNewModelRequest: false, emailNewApplication: true, emailBusinessNotices: true, newModelRequest: true })
    })
  })

  it('business owners see 3D model request updates and platform notices, each with Email, and no staff types', { timeout: 20_000 }, async () => {
    open({ role: 'business_admin', businessId: 'biz_casa' }, '/dashboard/settings/notifications')
    expect(await screen.findByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument()
    const updates = await screen.findByRole('switch', { name: '3D model request updates Email' })
    const notices = screen.getByRole('switch', { name: 'Platform notices about your company Email' })
    expect(screen.queryByRole('switch', { name: /^New applications/ })).toBeNull()
    expect(screen.queryByRole('switch', { name: /^New 3D model requests/ })).toBeNull()
    await userEvent.click(notices)
    await waitFor(() => expect(notices).toHaveAttribute('aria-checked', 'false'))
    expect(updates).toHaveAttribute('aria-checked', 'true')
    const prefs = await notifications.getNotificationPrefs()
    expect(prefs.ok && prefs.data).toMatchObject({ emailBusinessNotices: false, emailModelRequestUpdates: true })
  })

  it('security emails are shown as always on, with no switch, for staff and business owners', { timeout: 20_000 }, async () => {
    const view = open({ role: 'super_admin' }, '/admin/settings/notifications')
    await screen.findByRole('switch', { name: 'New applications Email' })
    expect(screen.getByText('Security emails')).toBeInTheDocument()
    expect(screen.getByText('Always on')).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: /security/i })).toBeNull()
    view.unmount()
    open({ role: 'business_admin', businessId: 'biz_casa' }, '/dashboard/settings/notifications')
    expect(await screen.findByText('Security emails')).toBeInTheDocument()
    expect(screen.getByText('Always on')).toBeInTheDocument()
  })

  it('rolls the switch back and says so when saving fails', { timeout: 20_000 }, async () => {
    open({ role: 'super_admin' }, '/admin/settings/notifications')
    const sw = await screen.findByRole('switch', { name: 'New applications Email' })
    vi.spyOn(notifications, 'setNotificationPrefs').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', message: 'x' } })
    await userEvent.click(sw)
    expect(await screen.findByText('Could not save the notification setting')).toBeInTheDocument()
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'))
  })

  it('shows an error with a retry when the switches cannot be loaded', { timeout: 20_000 }, async () => {
    const spy = vi.spyOn(notifications, 'getNotificationPrefs').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', message: 'x' } })
    open({ role: 'super_admin' }, '/admin/settings/notifications')
    expect(await screen.findByText(/Could not load your notification settings/)).toBeInTheDocument()
    spy.mockRestore()
    await userEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]!)
    expect(await screen.findByRole('switch', { name: 'New applications Email' })).toBeInTheDocument()
  })
})
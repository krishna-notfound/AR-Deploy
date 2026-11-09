import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { notifications, service } from '@/services'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { addMockNotification, resetMockNotifications } from '@/services/mock/mockNotifications'
import { BELL_REFRESH_MS } from './NotificationBell'

// The bell in the dashboard header (ADR-0056): unread count, list with time-ago and links, mark read, refresh.

function open(as: object, url: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(as))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

beforeAll(async () => {
  await import('./NotificationBell')
}, 60_000)

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  resetMockAccount()
  resetMockNotifications()
  await service.resetDemoData()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

const OWNER = { role: 'super_admin' }
const bell = (name: string | RegExp) => screen.findByRole('button', { name })

describe('NotificationBell', () => {
  it('shows the unread count on the bell, then the list with the unread one marked', { timeout: 20_000 }, async () => {
    open(OWNER, '/admin')
    const trigger = await bell('Notifications, 1 unread')
    expect(within(trigger).getByText('1')).toBeInTheDocument()
    await userEvent.click(trigger)
    const panel = await screen.findByRole('dialog', { name: /Notifications/ })
    expect(within(panel).getByText('Sample: new business application')).toBeInTheDocument()
    expect(within(panel).getByText('Sample: your catalog is live')).toBeInTheDocument()
    expect(within(panel).getByText(/Unread:/)).toBeInTheDocument()
    expect(within(panel).getAllByText(/ago|min|hour|yesterday/i).length).toBeGreaterThan(0)
    expect(within(panel).getByRole('link', { name: /Notification settings/ })).toHaveAttribute('href', '/admin/settings/notifications')
  })

  it('opening one marks it read, closes the panel and follows its link', { timeout: 20_000 }, async () => {
    open(OWNER, '/admin')
    await userEvent.click(await bell('Notifications, 1 unread'))
    await userEvent.click(await screen.findByRole('link', { name: /Sample: new business application/ }))
    await waitFor(() => expect(window.location.pathname).toBe('/admin/applications'))
    expect(screen.queryByRole('dialog', { name: /Notifications/ })).toBeNull()
    await waitFor(async () => {
      const r = await notifications.getNotifications()
      expect(r.ok && r.data.unread).toBe(0)
    })
    expect(await bell('Notifications')).toBeInTheDocument()
  })

  it('Mark all as read clears the count', { timeout: 20_000 }, async () => {
    addMockNotification({ kind: 'new_model_request', title: 'Sample: a 3D request', body: '', link: '/admin/model-requests' })
    open(OWNER, '/admin')
    await userEvent.click(await bell('Notifications, 2 unread'))
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }))
    expect(await bell('Notifications')).toBeInTheDocument()
    expect(await screen.findByText('All notifications marked as read')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled()
  })

  it('shows an empty state when there is nothing', { timeout: 20_000 }, async () => {
    vi.spyOn(notifications, 'getNotifications').mockResolvedValue({ ok: true, data: { items: [], unread: 0 } })
    open(OWNER, '/admin')
    await userEvent.click(await bell('Notifications'))
    expect(await screen.findByText('Nothing yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled()
  })

  it('an error with no data yet shows a retry that loads the list', { timeout: 20_000 }, async () => {
    const spy = vi.spyOn(notifications, 'getNotifications').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', message: 'x' } })
    open(OWNER, '/admin')
    await userEvent.click(await bell('Notifications'))
    expect(await screen.findByText('Could not load your notifications.')).toBeInTheDocument()
    spy.mockRestore()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Sample: new business application')).toBeInTheDocument()
  })

  it('refreshes every minute while the tab is visible and never while it is hidden', { timeout: 20_000 }, async () => {
    const timers: { fn: () => void; ms: number }[] = []
    const realSetInterval = window.setInterval.bind(window)
    vi.spyOn(window, 'setInterval').mockImplementation(((fn: () => void, ms?: number) => {
      timers.push({ fn, ms: ms ?? 0 })
      return realSetInterval(() => {}, 1_000_000)
    }) as typeof window.setInterval)
    const spy = vi.spyOn(notifications, 'getNotifications')
    open(OWNER, '/admin')
    await bell('Notifications, 1 unread')
    const minute = timers.find((t) => t.ms === BELL_REFRESH_MS)
    expect(minute).toBeDefined()

    addMockNotification({ kind: 'company_update', title: 'Sample: later one', body: '', link: null })
    await act(async () => minute!.fn())
    await bell('Notifications, 2 unread')

    // A hidden tab is left alone.
    const calls = spy.mock.calls.length
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    await act(async () => minute!.fn())
    expect(spy.mock.calls.length).toBe(calls)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
  it('is on the business dashboard too, with its own settings link', { timeout: 20_000 }, async () => {
    open({ role: 'business_admin', businessId: 'biz_casa' }, '/dashboard')
    await userEvent.click(await bell(/Notifications/))
    expect(await screen.findByRole('link', { name: /Notification settings/ })).toHaveAttribute('href', '/dashboard/settings/notifications')
  })
})

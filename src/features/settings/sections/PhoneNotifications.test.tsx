import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { notifications, service } from '@/services'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { mockPushEndpoints, resetMockNotifications } from '@/services/mock/mockNotifications'

// Settings → Notifications: the phone card's states (unsupported, iPhone note, not configured, blocked, off, on), the permission
// prompt only on the tap, and the event switches (ADR-0056). Notification, PushManager and the service worker are stubs.

const KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYevOq8'
const ENDPOINT = 'https://push.example/device-1'

function open(as: object, url: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(as))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

function fakeSubscription() {
  const bytes = (n: number) => new Uint8Array([n, n + 1, n + 2]).buffer
  return { endpoint: ENDPOINT, getKey: (name: string) => (name === 'p256dh' ? bytes(1) : bytes(9)), unsubscribe: vi.fn(async () => true) }
}

/** Installs the browser pieces. `permission` is what Notification.permission says; `existing` is an already saved subscription. */
function installPush(opts: { permission?: NotificationPermission; request?: NotificationPermission; existing?: boolean } = {}) {
  const sub = fakeSubscription()
  let current: ReturnType<typeof fakeSubscription> | null = opts.existing ? sub : null
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => (current = sub)),
  }
  const reg = { pushManager }
  const request = vi.fn(async () => opts.request ?? 'granted')
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', Object.assign(function () {}, { permission: opts.permission ?? 'default', requestPermission: request }))
  const sw = { register: vi.fn(async () => reg), getRegistration: vi.fn(async () => (opts.existing ? reg : undefined)), ready: Promise.resolve(reg) }
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true })
  sub.unsubscribe.mockImplementation(async () => {
    current = null
    return true
  })
  return { sub, pushManager, request, sw }
}

const removeServiceWorker = () => Reflect.deleteProperty(navigator, 'serviceWorker')

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
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  removeServiceWorker()
  window.history.replaceState(null, '', '/')
})

const OWNER = { role: 'super_admin' }
const BUSINESS = { role: 'business_admin', businessId: 'biz_casa' }

describe('Phone notifications card', () => {
  it('says so when the browser cannot do push', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', KEY)
    open(OWNER, '/admin/settings/notifications')
    expect(await screen.findByText(/can't show phone notifications/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on phone notifications' })).toBeNull()
  })

  it('on iPhone in Safari it asks for Add to Home Screen first (iOS 16.4)', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', KEY)
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')
    open(OWNER, '/admin/settings/notifications')
    expect(await screen.findByText(/add Sanctus to your Home Screen first \(iOS 16\.4 or later\)/)).toBeInTheDocument()
  })

  it('says it is not set up when the site has no VAPID key', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')
    installPush()
    open(OWNER, '/admin/settings/notifications')
    expect(await screen.findByText(/not set up on this site yet/)).toBeInTheDocument()
  })

  it('explains how to unblock when the browser has blocked notifications', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', KEY)
    installPush({ permission: 'denied' })
    open(OWNER, '/admin/settings/notifications')
    expect(await screen.findByText(/blocked for this site/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on phone notifications' })).toBeNull()
  })

  it('off: nothing is asked on load; the tap shows the prompt, saves the device and flips to On', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', KEY)
    const push = installPush()
    open(OWNER, '/admin/settings/notifications')
    const button = await screen.findByRole('button', { name: 'Turn on phone notifications' })
    expect(screen.getByText('Off for this device')).toBeInTheDocument()
    expect(push.request).not.toHaveBeenCalled()
    expect(push.sw.register).not.toHaveBeenCalled()

    await userEvent.click(button)
    expect(await screen.findByText('On for this device')).toBeInTheDocument()
    expect(push.request).toHaveBeenCalledTimes(1)
    expect(push.sw.register).toHaveBeenCalledWith('/sw.js')
    expect(push.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }))
    expect(mockPushEndpoints()).toEqual([ENDPOINT])
    // The language in use is saved with the switches, so notification text matches.
    const prefs = await notifications.getNotificationPrefs()
    expect(prefs.ok && prefs.data.language).toBe('en')
  })

  it('refusing the prompt leaves it off (dismissed) or blocked (denied) and saves nothing', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', KEY)
    const dismissed = installPush({ request: 'default' })
    const view = open(OWNER, '/admin/settings/notifications')
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on phone notifications' }))
    expect(await screen.findByText("You didn't allow notifications")).toBeInTheDocument()
    expect(dismissed.pushManager.subscribe).not.toHaveBeenCalled()
    expect(screen.getByText('Off for this device')).toBeInTheDocument()
    expect(mockPushEndpoints()).toEqual([])
    view.unmount()

    installPush({ request: 'denied' })
    open(OWNER, '/admin/settings/notifications')
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on phone notifications' }))
    expect(await screen.findByText(/blocked for this site/)).toBeInTheDocument()
    expect(mockPushEndpoints()).toEqual([])
  })

  it('undoes the browser subscription and reports it when the server cannot save the device', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', KEY)
    const push = installPush()
    vi.spyOn(notifications, 'subscribePush').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', message: 'x' } })
    open(OWNER, '/admin/settings/notifications')
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on phone notifications' }))
    expect(await screen.findByText('Could not change phone notifications')).toBeInTheDocument()
    expect(push.sub.unsubscribe).toHaveBeenCalled()
    expect(screen.getByText('Off for this device')).toBeInTheDocument()
  })

  it('on: shows On for this device and Turn off forgets the device', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', KEY)
    const push = installPush({ permission: 'granted', existing: true })
    await notifications.subscribePush({ endpoint: ENDPOINT, p256dh: 'k', auth: 'a' })
    open(OWNER, '/admin/settings/notifications')
    expect(await screen.findByText('On for this device')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }))
    expect(await screen.findByText('Off for this device')).toBeInTheDocument()
    expect(push.sub.unsubscribe).toHaveBeenCalled()
    expect(mockPushEndpoints()).toEqual([])
  })
})

describe('Event switches', () => {
  it('platform staff see applications, 3D requests and the phone switch; each saves and survives a reload', async () => {
    open(OWNER, '/admin/settings/notifications')
    const apps = await screen.findByRole('switch', { name: 'New applications' })
    expect(screen.getByRole('switch', { name: 'New 3D model requests' })).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Updates about your company' })).toBeNull()
    expect(apps).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(apps)
    await waitFor(() => expect(apps).toHaveAttribute('aria-checked', 'false'))
    const prefs = await notifications.getNotificationPrefs()
    expect(prefs.ok && prefs.data).toMatchObject({ newApplication: false, newModelRequest: true, companyUpdates: true })
    await userEvent.click(screen.getByRole('switch', { name: 'Send to my phones' }))
    await waitFor(async () => {
      const p = await notifications.getNotificationPrefs()
      expect(p.ok && p.data.pushEnabled).toBe(false)
    })
  })

  it('business owners see only the company updates switch and the phone switch', async () => {
    open(BUSINESS, '/dashboard/settings/notifications')
    expect(await screen.findByRole('switch', { name: 'Updates about your company' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Send to my phones' })).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'New applications' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'New 3D model requests' })).toBeNull()
  })

  it('a failed save says so and the switch rolls back', async () => {
    vi.spyOn(notifications, 'setNotificationPrefs').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', message: 'x' } })
    open(OWNER, '/admin/settings/notifications')
    const apps = await screen.findByRole('switch', { name: 'New applications' })
    await userEvent.click(apps)
    expect(await screen.findByText('Could not save the notification setting')).toBeInTheDocument()
    await waitFor(() => expect(apps).toHaveAttribute('aria-checked', 'true'))
  })

  it('shows an error with a retry when the switches cannot be loaded', async () => {
    const spy = vi.spyOn(notifications, 'getNotificationPrefs').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', message: 'x' } })
    open(OWNER, '/admin/settings/notifications')
    expect(await screen.findByText(/Could not load your notification settings/)).toBeInTheDocument()
    spy.mockRestore()
    await userEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]!)
    expect(await screen.findByRole('switch', { name: 'New applications' })).toBeInTheDocument()
  })
})

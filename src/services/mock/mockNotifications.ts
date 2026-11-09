// Demo implementation of the notification service (ADR-0056). A test harness only: it keeps its state in memory (gone on
// reload) and sends nothing. The list starts with two sample notifications so the bell is not empty in the demo; they are
// labelled "Sample" in their text. Subscribing records the endpoint here and nothing else.
import { type AppNotification, DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs, type PushSubscriptionInput } from '@/domain/notifications'
import { newId } from '@/lib/id'
import { type Result, fail, ok } from '../catalogService'
import { NOTIFICATION_PAGE, type NotificationService } from '../notificationService'

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

function seed(): AppNotification[] {
  return [
    { id: 'demo-note-1', kind: 'new_application', title: 'Sample: new business application', body: 'Sample data. A business applied to join Sanctus.', link: '/admin/applications', readAt: null, createdAt: minutesAgo(12) },
    { id: 'demo-note-2', kind: 'company_update', title: 'Sample: your catalog is live', body: 'Sample data. The Sanctus team made your catalog public.', link: '/dashboard', readAt: minutesAgo(600), createdAt: minutesAgo(1500) },
  ]
}

let items = seed()
let prefs: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS }
let devices = new Map<string, PushSubscriptionInput>()

export function resetMockNotifications(): void {
  items = seed()
  prefs = { ...DEFAULT_NOTIFICATION_PREFS }
  devices = new Map()
}

/** Demo only: adds a notification to the list, as an Edge Function would. */
export function addMockNotification(n: Pick<AppNotification, 'kind' | 'title' | 'body' | 'link'>): void {
  items = [{ id: newId('note'), readAt: null, createdAt: new Date().toISOString(), ...n }, ...items]
}

/** The endpoints saved for this demo session (tests). */
export const mockPushEndpoints = (): string[] => [...devices.keys()]

export const mockNotificationService: NotificationService = {
  async getNotifications() {
    return ok({ items: items.slice(0, NOTIFICATION_PAGE).map((n) => ({ ...n })), unread: items.filter((n) => !n.readAt).length })
  },
  async markNotificationRead(id) {
    const now = new Date().toISOString()
    items = items.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now } : n))
    return ok(undefined)
  },
  async markAllRead() {
    const now = new Date().toISOString()
    items = items.map((n) => (n.readAt ? n : { ...n, readAt: now }))
    return ok(undefined)
  },
  async subscribePush(sub): Promise<Result<void>> {
    if (!sub.endpoint.startsWith('https://')) return fail('VALIDATION', 'That device address is not valid.')
    devices.set(sub.endpoint, sub)
    return ok(undefined)
  },
  async unsubscribePush(endpoint) {
    devices.delete(endpoint)
    return ok(undefined)
  },
  async getNotificationPrefs() {
    return ok({ ...prefs })
  },
  async setNotificationPrefs(patch) {
    prefs = { ...prefs, ...patch }
    return ok({ ...prefs })
  },
}

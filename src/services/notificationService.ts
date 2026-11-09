// In-app notifications, phone push subscriptions and their switches (ADR-0056). The UI imports `notifications` from
// services/index.ts. Supabase: services/supabase/supabaseNotifications.ts (tables notifications, push_subscriptions,
// notification_prefs; the Edge Functions write the notifications). Demo: services/mock/mockNotifications.ts, an in-memory harness.
import type { AppNotification, NotificationList, NotificationPrefs, PushSubscriptionInput } from '@/domain/notifications'
import type { Result } from './catalogService'

export type { AppNotification, NotificationKind, NotificationList, NotificationPrefs, PushSubscriptionInput } from '@/domain/notifications'

/** How many notifications the bell loads. */
export const NOTIFICATION_PAGE = 30

export interface NotificationService {
  /** The latest notifications and the unread count. */
  getNotifications(): Promise<Result<NotificationList>>
  markNotificationRead(id: AppNotification['id']): Promise<Result<void>>
  markAllRead(): Promise<Result<void>>
  /** Saves this device for the signed-in user (a device another user had is moved to them). */
  subscribePush(sub: PushSubscriptionInput): Promise<Result<void>>
  /** Forgets this device (by its endpoint). */
  unsubscribePush(endpoint: string): Promise<Result<void>>
  getNotificationPrefs(): Promise<Result<NotificationPrefs>>
  /** Saves the given switches (and the language the text is written in); returns the saved prefs. */
  setNotificationPrefs(patch: Partial<NotificationPrefs>): Promise<Result<NotificationPrefs>>
}

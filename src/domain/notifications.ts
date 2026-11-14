// In-app notifications and phone push (ADR-0056).
export type NotificationKind = 'new_application' | 'new_model_request' | 'company_update'

export interface AppNotification {
  id: string
  kind: NotificationKind
  /** Already written in the language the person chose (or English) by the Edge Function. */
  title: string
  body: string
  /** An in-app path such as /admin/applications/<id>, or null. */
  link: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationList {
  /** The latest notifications, newest first. */
  items: AppNotification[]
  /** All unread, which can be more than `items` holds. */
  unread: number
}

export interface NotificationPrefs {
  newApplication: boolean
  newModelRequest: boolean
  companyUpdates: boolean
  /** Email switches (ADR-0078), one per optional email type. Security, invitation and applicant emails have none: they are always sent. */
  emailNewApplication: boolean
  emailNewModelRequest: boolean
  emailCompanyUpdates: boolean
  emailModelRequestUpdates: boolean
  emailBusinessNotices: boolean
  /** Master switch for phone push; the bell is not affected. */
  pushEnabled: boolean
  /** The language notification text is written in; null until the person saves a choice (English). */
  language: 'en' | 'pt' | null
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  newApplication: true,
  newModelRequest: true,
  companyUpdates: true,
  emailNewApplication: true,
  emailNewModelRequest: true,
  emailCompanyUpdates: true,
  emailModelRequestUpdates: true,
  emailBusinessNotices: true,
  pushEnabled: true,
  language: null,
}

/** The optional email types a person can switch off (ADR-0078); the same names the unsubscribe token carries. */
export type EmailPrefType = 'new_application' | 'new_model_request' | 'company_updates' | 'model_request_updates' | 'business_notices'
export const EMAIL_PREF_TYPES: readonly EmailPrefType[] = ['new_application', 'new_model_request', 'company_updates', 'model_request_updates', 'business_notices']
export const isEmailPrefType = (v: unknown): v is EmailPrefType => typeof v === 'string' && (EMAIL_PREF_TYPES as readonly string[]).includes(v)

/** What the browser's PushManager gave back for this device. */
export interface PushSubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
}

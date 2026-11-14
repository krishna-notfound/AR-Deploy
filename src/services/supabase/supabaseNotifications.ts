// Supabase implementation of the notification service (ADR-0056). Row-level security limits every call to the signed-in
// user's own rows; the Edge Functions (service role) are the only writers of notifications. A failure is always reported:
// nothing here falls back to demo data.
import type { SupabaseClient } from '@supabase/supabase-js'
import { type AppNotification, DEFAULT_NOTIFICATION_PREFS, type EmailPrefType, type NotificationKind, type NotificationPrefs, isEmailPrefType } from '@/domain/notifications'
import { type Result, fail, ok } from '../catalogService'
import { NOTIFICATION_PAGE, type NotificationService } from '../notificationService'

const UNSUBSCRIBE_FUNCTION = 'email-unsubscribe'
const UNKNOWN = 'The request could not be completed. Try again in a moment.'
/** Postgres and PostgREST codes that mean the migration is not applied yet (table or function missing). */
const MISSING = new Set(['PGRST202', 'PGRST205', '42P01', '42883'])

type DbError = { code?: string } | null
const failed = <T = never>(error: DbError): Result<T> =>
  MISSING.has(error?.code ?? '')
    ? { ok: false, error: { code: 'UNKNOWN', message: "Notifications aren't enabled on this database yet.", reason: 'not_enabled' } }
    : error?.code === '42501'
      ? fail('PERMISSION', "You don't have permission to do this.")
      : fail('UNKNOWN', UNKNOWN)

interface NotificationRow {
  id: string
  kind: NotificationKind
  title: string
  body: string
  link: string | null
  read_at: string | null
  created_at: string
}
interface PrefsRow {
  new_application: boolean
  new_model_request: boolean
  company_updates: boolean
  email_new_application: boolean
  email_new_model_request: boolean
  email_company_updates: boolean
  email_model_request_updates: boolean
  email_business_notices: boolean
  push_enabled: boolean
  language: string | null
}

const toNotification = (r: NotificationRow): AppNotification => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, readAt: r.read_at, createdAt: r.created_at })
const toPrefs = (r: PrefsRow): NotificationPrefs => ({
  newApplication: r.new_application,
  newModelRequest: r.new_model_request,
  companyUpdates: r.company_updates,
  emailNewApplication: r.email_new_application,
  emailNewModelRequest: r.email_new_model_request,
  emailCompanyUpdates: r.email_company_updates,
  emailModelRequestUpdates: r.email_model_request_updates,
  emailBusinessNotices: r.email_business_notices,
  pushEnabled: r.push_enabled,
  language: r.language === 'pt' ? 'pt' : r.language === 'en' ? 'en' : null,
})
const PREFS_COLUMNS =
  'new_application, new_model_request, company_updates, email_new_application, email_new_model_request, email_company_updates, email_model_request_updates, email_business_notices, push_enabled, language'

export function createSupabaseNotifications(sb: SupabaseClient): NotificationService {
  const guard = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
    try {
      return await fn()
    } catch {
      return fail('UNKNOWN', UNKNOWN)
    }
  }
  const userId = async (): Promise<string | null> => {
    const { data, error } = await sb.auth.getUser()
    return error ? null : (data.user?.id ?? null)
  }

  return {
    getNotifications: () =>
      guard(async () => {
        const [list, unread] = await Promise.all([
          sb.from('notifications').select('id, kind, title, body, link, read_at, created_at').order('created_at', { ascending: false }).limit(NOTIFICATION_PAGE),
          sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
        ])
        if (list.error) return failed(list.error)
        if (unread.error) return failed(unread.error)
        return ok({ items: ((list.data ?? []) as NotificationRow[]).map(toNotification), unread: unread.count ?? 0 })
      }),

    markNotificationRead: (id) =>
      guard(async () => {
        const { error } = await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null)
        return error ? failed(error) : ok(undefined)
      }),

    markAllRead: () =>
      guard(async () => {
        const { error } = await sb.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
        return error ? failed(error) : ok(undefined)
      }),

    subscribePush: (sub) =>
      guard(async () => {
        const { error } = await sb.rpc('register_push_subscription', {
          p_endpoint: sub.endpoint,
          p_p256dh: sub.p256dh,
          p_auth: sub.auth,
          p_user_agent: sub.userAgent ?? null,
        })
        return error ? failed(error) : ok(undefined)
      }),

    unsubscribePush: (endpoint) =>
      guard(async () => {
        const { error } = await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)
        return error ? failed(error) : ok(undefined)
      }),

    getNotificationPrefs: () =>
      guard(async () => {
        const { data, error } = await sb.from('notification_prefs').select(PREFS_COLUMNS).maybeSingle<PrefsRow>()
        if (error) return failed(error)
        return ok(data ? toPrefs(data) : { ...DEFAULT_NOTIFICATION_PREFS })
      }),

    unsubscribeEmail: (token) =>
      guard(async () => {
        // Public page, no session needed: the signed token in the email is the credential (verify_jwt is off for this function).
        const { data, error } = await sb.functions.invoke(UNSUBSCRIBE_FUNCTION, { body: { t: token } })
        if (!error) return isEmailPrefType((data as { type?: unknown } | null)?.type) ? ok({ type: (data as { type: EmailPrefType }).type }) : fail('UNKNOWN', UNKNOWN)
        const res = (error as { context?: Response }).context
        const payload = res && typeof res.json === 'function' ? ((await res.json().catch(() => ({}))) as { error?: string }) : {}
        // Fixed reason codes only: the page words them; nothing else the server says is shown.
        const reason = payload.error === 'invalid_token' || payload.error === 'expired_token' || payload.error === 'rate_limited' ? payload.error : 'unknown'
        return { ok: false, error: { code: reason === 'rate_limited' ? 'RATE_LIMITED' : 'VALIDATION', message: UNKNOWN, reason } }
      }),

    setNotificationPrefs: (patch) =>
      guard(async () => {
        const uid = await userId()
        if (!uid) return fail('PERMISSION', 'Your session has ended. Sign in again.')
        const cols: Record<string, unknown> = {}
        if (patch.newApplication !== undefined) cols.new_application = patch.newApplication
        if (patch.newModelRequest !== undefined) cols.new_model_request = patch.newModelRequest
        if (patch.companyUpdates !== undefined) cols.company_updates = patch.companyUpdates
        if (patch.emailNewApplication !== undefined) cols.email_new_application = patch.emailNewApplication
        if (patch.emailNewModelRequest !== undefined) cols.email_new_model_request = patch.emailNewModelRequest
        if (patch.emailCompanyUpdates !== undefined) cols.email_company_updates = patch.emailCompanyUpdates
        if (patch.emailModelRequestUpdates !== undefined) cols.email_model_request_updates = patch.emailModelRequestUpdates
        if (patch.emailBusinessNotices !== undefined) cols.email_business_notices = patch.emailBusinessNotices
        if (patch.pushEnabled !== undefined) cols.push_enabled = patch.pushEnabled
        if (patch.language !== undefined) cols.language = patch.language
        const { data, error } = await sb.from('notification_prefs').upsert({ user_id: uid, ...cols }, { onConflict: 'user_id' }).select(PREFS_COLUMNS).single<PrefsRow>()
        return error ? failed(error) : ok(toPrefs(data))
      }),
  }
}

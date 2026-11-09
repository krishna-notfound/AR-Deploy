// The real notifier for Edge Functions (ADR-0056): resolves an audience to user ids and gives notify() a store on the
// service-role client plus the Web Push sender. Deno only: imported by index.ts files, never by a handler.
// @ts-ignore: resolved by Deno at deploy time
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3'
import { type NewNotification, type NotifyRequest, type NotifyStore, type Prefs, type PushSender, notify } from './notify.ts'
import { createPushSender } from './webpush.ts'

/** Active members whose platform role has `permission`, plus the Owner (platform_admins). Throws on a read error. */
export async function staffUserIds(admin: SupabaseClient, permission: string): Promise<string[]> {
  const perms = await admin.from('platform_role_permissions').select('role').eq('permission', permission)
  if (perms.error) throw new Error(`permission lookup failed: ${perms.error.code ?? 'unknown'}`)
  const roles = (perms.data ?? []).map((r: { role: string }) => r.role)
  const members = roles.length
    ? await admin.from('platform_members').select('user_id').eq('status', 'active').in('role', roles).not('user_id', 'is', null)
    : { data: [] as { user_id: string }[], error: null }
  if (members.error) throw new Error(`member lookup failed: ${members.error.code ?? 'unknown'}`)
  const owners = await admin.from('platform_admins').select('user_id')
  if (owners.error) throw new Error(`owner lookup failed: ${owners.error.code ?? 'unknown'}`)
  return [...new Set<string>([...(members.data ?? []), ...(owners.data ?? [])].map((r: { user_id: string }) => r.user_id))]
}

/** Every member of the business. Throws on a read error. */
export async function businessUserIds(admin: SupabaseClient, businessId: string): Promise<string[]> {
  const { data, error } = await admin.from('business_members').select('user_id').eq('business_id', businessId)
  if (error) throw new Error(`member lookup failed: ${error.code ?? 'unknown'}`)
  return (data ?? []).map((r: { user_id: string }) => r.user_id)
}

type PrefsRow = { user_id: string; new_application: boolean; new_model_request: boolean; company_updates: boolean; push_enabled: boolean; language: string | null }

export function createStore(admin: SupabaseClient): NotifyStore {
  return {
    async prefs(userIds) {
      const { data, error } = await admin
        .from('notification_prefs')
        .select('user_id, new_application, new_model_request, company_updates, push_enabled, language')
        .in('user_id', userIds)
      if (error) throw new Error(`prefs lookup failed: ${error.code ?? 'unknown'}`)
      return new Map(
        ((data ?? []) as PrefsRow[]).map((r): [string, Prefs] => [
          r.user_id,
          {
            newApplication: r.new_application,
            newModelRequest: r.new_model_request,
            companyUpdates: r.company_updates,
            pushEnabled: r.push_enabled,
            language: r.language === 'pt' ? 'pt' : r.language === 'en' ? 'en' : null,
          },
        ]),
      )
    },
    async insert(rows: NewNotification[]) {
      // ignoreDuplicates = ON CONFLICT DO NOTHING, so the response holds only the rows really written.
      const { data, error } = await admin
        .from('notifications')
        .upsert(
          rows.map((r) => ({ recipient: r.recipient, kind: r.kind, title: r.title, body: r.body, link: r.link, dedupe_key: r.dedupeKey })),
          { onConflict: 'recipient,dedupe_key', ignoreDuplicates: true },
        )
        .select('recipient')
      if (error) throw new Error(`notification insert failed: ${error.code ?? 'unknown'}`)
      return (data ?? []).map((r: { recipient: string }) => r.recipient)
    },
    async subscriptions(userIds) {
      const { data, error } = await admin.from('push_subscriptions').select('user_id, endpoint, p256dh, auth').in('user_id', userIds)
      if (error) throw new Error(`subscription lookup failed: ${error.code ?? 'unknown'}`)
      return (data ?? []).map((r: { user_id: string; endpoint: string; p256dh: string; auth: string }) => ({ userId: r.user_id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }))
    },
    async removeSubscriptions(endpoints) {
      const { error } = await admin.from('push_subscriptions').delete().in('endpoint', endpoints)
      if (error) throw new Error(`subscription delete failed: ${error.code ?? 'unknown'}`)
    },
  }
}

/**
 * The function a handler calls: `(request) => Promise<void>`. Resolves the audience, then notify(). Never throws.
 * One sender per function instance (the VAPID details are set once).
 */
export function createNotifier(admin: SupabaseClient, env: (name: string) => string | undefined): (request: NotifyRequest) => Promise<void> {
  const store = createStore(admin)
  const push: PushSender | null = createPushSender(env)
  return async ({ audience, ...input }) => {
    try {
      const recipients = 'staff' in audience ? await staffUserIds(admin, audience.staff) : await businessUserIds(admin, audience.business)
      await notify({ store, push }, { ...input, recipients })
    } catch (e) {
      console.error(`notify: audience lookup failed (${String(e).slice(0, 120)})`)
    }
  }
}

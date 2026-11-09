// The Web Push sender: npm:web-push (ADR-0056), used only here and only inside Edge Functions. Deno only: imported by
// notifyAdmin.ts, never by a handler or a test (they pass a fake PushSender to notify()).
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (a mailto: or https: address). Generate the pair once with
// `npx web-push generate-vapid-keys`. Without all three there is no sender and notify() skips the push.
// @ts-ignore: resolved by Deno at deploy time
import webpush from 'npm:web-push@3.6.7'
import type { PushSender } from './notify.ts'

/** A day: a phone that is off still gets the message when it comes back, an old one is dropped. */
const TTL_SECONDS = 24 * 60 * 60
const TIMEOUT_MS = 8_000

export function createPushSender(env: (name: string) => string | undefined): PushSender | null {
  const publicKey = env('VAPID_PUBLIC_KEY')?.trim()
  const privateKey = env('VAPID_PRIVATE_KEY')?.trim()
  const subject = env('VAPID_SUBJECT')?.trim()
  if (!publicKey || !privateKey || !subject) return null
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
  } catch {
    // A malformed key or subject: treated as not configured (notify logs it once).
    return null
  }
  return async (sub, payload) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
        TTL: TTL_SECONDS,
        urgency: 'normal',
        timeout: TIMEOUT_MS,
      })
      return { ok: true }
    } catch (e) {
      const status = (e as { statusCode?: unknown }).statusCode
      return { ok: false, status: typeof status === 'number' ? status : 0 }
    }
  }
}

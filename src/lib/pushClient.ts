// Phone notifications in the browser (ADR-0056): feature detection, the permission prompt, the service worker and the push
// subscription. Nothing here runs until someone taps "Turn on" in Settings, except syncPushSubscription on a dashboard load
// for a device that is already subscribed. The prompt is only ever shown from enablePush, which a tap calls.
import type { PushSubscriptionInput } from '@/domain/notifications'
import { isIOS } from './userAgent'

/** The public half of the VAPID key pair: public by design, safe in the browser bundle. */
export const vapidPublicKey = (): string => String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim()

export const SERVICE_WORKER_URL = '/sw.js'

export type PushState =
  /** This browser cannot do push at all (or the page is not served securely). */
  | 'unsupported'
  /** iPhone or iPad in Safari: push only works once the site is on the Home Screen (iOS 16.4 and later). */
  | 'needs-install'
  /** The site was built without VITE_VAPID_PUBLIC_KEY. */
  | 'unconfigured'
  /** The person blocked notifications in the browser; only the browser's site settings can undo that. */
  | 'denied'
  | 'off'
  | 'on'

const standalone = (): boolean => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

/** Service worker, Push API and Notification API are all there. */
export const pushApisAvailable = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** The base64url VAPID key as the bytes PushManager.subscribe wants. */
export function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

const b64url = (buffer: ArrayBuffer | null): string => {
  if (!buffer) return ''
  let s = ''
  for (const b of new Uint8Array(buffer)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** What the server needs from a browser subscription (the endpoint and the two keys), or null when a key is missing. */
export function subscriptionInput(sub: PushSubscription): PushSubscriptionInput | null {
  const p256dh = b64url(sub.getKey('p256dh'))
  const auth = b64url(sub.getKey('auth'))
  if (!sub.endpoint || !p256dh || !auth) return null
  return { endpoint: sub.endpoint, p256dh, auth, userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : undefined }
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    return (await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL)) ?? null
  } catch {
    return null
  }
}

/** The state of phone notifications on this device. Registers nothing and asks for nothing. */
export async function readPushState(): Promise<{ state: PushState; endpoint?: string }> {
  if (!pushApisAvailable()) return { state: isIOS() && !standalone() ? 'needs-install' : 'unsupported' }
  if (!vapidPublicKey()) return { state: 'unconfigured' }
  if (Notification.permission === 'denied') return { state: 'denied' }
  if (Notification.permission === 'granted') {
    const sub = await (await registration())?.pushManager.getSubscription()
    if (sub) return { state: 'on', endpoint: sub.endpoint }
  }
  return { state: 'off' }
}

export type EnableResult = { ok: true; endpoint: string } | { ok: false; reason: 'denied' | 'dismissed' | 'unsupported' | 'failed' }

/**
 * Turns phone notifications on for this device. Call it from a tap only: it shows the browser's permission prompt. `save`
 * stores the subscription on the server; when it fails the browser subscription is undone so the two never disagree.
 */
export async function enablePush(save: (sub: PushSubscriptionInput) => Promise<boolean>): Promise<EnableResult> {
  if (!pushApisAvailable() || !vapidPublicKey()) return { ok: false, reason: 'unsupported' }
  try {
    const permission = await Notification.requestPermission()
    if (permission === 'denied') return { ok: false, reason: 'denied' }
    if (permission !== 'granted') return { ok: false, reason: 'dismissed' }
    const reg = await navigator.serviceWorker.register(SERVICE_WORKER_URL)
    await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapidPublicKey()) }))
    const input = subscriptionInput(sub)
    if (!input || !(await save(input))) {
      if (!existing) await sub.unsubscribe().catch(() => false)
      return { ok: false, reason: 'failed' }
    }
    return { ok: true, endpoint: sub.endpoint }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/** Turns phone notifications off for this device: forgets it on the server, then unsubscribes the browser. */
export async function disablePush(forget: (endpoint: string) => Promise<boolean>): Promise<boolean> {
  try {
    const sub = await (await registration())?.pushManager.getSubscription()
    if (!sub) return true
    if (!(await forget(sub.endpoint))) return false
    await sub.unsubscribe()
    return true
  } catch {
    return false
  }
}

/**
 * On a dashboard load: a device that is already subscribed re-registers the worker and re-saves its subscription (the push
 * service can rotate it, and a shared browser may belong to another user now). Never prompts; does nothing otherwise.
 */
export async function syncPushSubscription(save: (sub: PushSubscriptionInput) => Promise<boolean>): Promise<void> {
  try {
    if (!pushApisAvailable() || !vapidPublicKey() || Notification.permission !== 'granted') return
    const reg = (await registration()) ?? (await navigator.serviceWorker.register(SERVICE_WORKER_URL))
    const sub = await reg.pushManager.getSubscription()
    const input = sub ? subscriptionInput(sub) : null
    if (input) await save(input)
  } catch {
    // Syncing is a courtesy; the next load tries again.
  }
}

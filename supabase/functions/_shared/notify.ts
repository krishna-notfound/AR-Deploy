// In-app notifications and phone push (ADR-0056). notify() writes one public.notifications row per recipient (respecting
// their switches) and sends Web Push to each of their saved devices. Web-standard APIs only: the database and the push
// library come in through NotifyStore and PushSender, so this runs under Vitest too. notifyAdmin.ts (Deno only) builds
// the real store and sender. notify() never throws: an event that already happened is never undone by a failed alert.

export type NotificationKind = 'new_application' | 'new_model_request' | 'company_update'
export type NoticeLang = 'en' | 'pt'
/** Text in both languages; a missing pt falls back to en. */
export type Localized = { en: string; pt?: string }

/** Who gets it: staff whose role has a permission (plus the Owner), or every member of a business. Resolved by notifyAdmin.ts. */
export type Audience = { staff: string } | { business: string }

export interface NotifyInput {
  /** Auth user ids. */
  recipients: string[]
  kind: NotificationKind
  title: Localized
  body: Localized
  /** An in-app path such as /admin/applications/<id>. */
  link: string
  /** Same recipient + same key → one row and one push, however often the event is retried. */
  dedupeKey?: string
  /** The language for a recipient who has not saved one (a business owner's application language); else English. */
  fallbackLang?: NoticeLang
}

/** What a handler asks for; the audience becomes `recipients` in notifyAdmin.ts. */
export type NotifyRequest = Omit<NotifyInput, 'recipients'> & { audience: Audience }

export interface Prefs {
  newApplication: boolean
  newModelRequest: boolean
  companyUpdates: boolean
  pushEnabled: boolean
  language: NoticeLang | null
}

/** A person with no notification_prefs row: everything on, no saved language. */
export const DEFAULT_PREFS: Prefs = { newApplication: true, newModelRequest: true, companyUpdates: true, pushEnabled: true, language: null }

export interface PushSub {
  userId: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface NewNotification {
  recipient: string
  kind: NotificationKind
  title: string
  body: string
  link: string
  dedupeKey: string | null
}

export interface NotifyStore {
  /** Saved switches by user id; users without a row are absent. */
  prefs(userIds: string[]): Promise<Map<string, Prefs>>
  /** Inserts the rows, skipping those whose (recipient, dedupe key) exists; returns the recipients of the rows really inserted. */
  insert(rows: NewNotification[]): Promise<string[]>
  subscriptions(userIds: string[]): Promise<PushSub[]>
  removeSubscriptions(endpoints: string[]): Promise<void>
}

export type PushOutcome = { ok: true } | { ok: false; status: number }
/** Sends one Web Push message; never throws (a network failure is { ok: false, status: 0 }). */
export type PushSender = (sub: PushSub, payload: string) => Promise<PushOutcome>

export interface NotifyDeps {
  store: NotifyStore
  /** null when the VAPID secrets are missing: in-app notifications still work. */
  push: PushSender | null
  log?: (message: string) => void
}

export interface NotifyResult {
  /** In-app rows written. */
  inApp: number
  /** Push messages the push service accepted. */
  pushed: number
  /** Subscriptions deleted because the push service answered 404 or 410. */
  removed: number
}

export const MAX_RECIPIENTS = 200
const TITLE_MAX = 200
const BODY_MAX = 500

const KIND_PREF: Record<NotificationKind, keyof Prefs> = {
  new_application: 'newApplication',
  new_model_request: 'newModelRequest',
  company_update: 'companyUpdates',
}

const pick = (text: Localized, lang: NoticeLang) => (lang === 'pt' && text.pt?.trim() ? text.pt : text.en)
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

let warnedNoPush = false
/** Test hook: the "push not configured" line is logged once per process. */
export const resetNotifyWarnings = () => {
  warnedNoPush = false
}

/** True for a path the app can open: starts with one slash, no scheme or host. */
export const isAppPath = (link: string) => /^\/[^/\\]/.test(link) && link.length <= 300

export async function notify(deps: NotifyDeps, input: NotifyInput): Promise<NotifyResult> {
  const result: NotifyResult = { inApp: 0, pushed: 0, removed: 0 }
  const log = deps.log ?? ((m: string) => console.error(m))
  try {
    const recipients = [...new Set(input.recipients.filter(Boolean))].slice(0, MAX_RECIPIENTS)
    if (!recipients.length) return result
    if (!isAppPath(input.link)) {
      log('notify: refused a link that is not an app path')
      return result
    }

    const saved = await deps.store.prefs(recipients)
    const prefsOf = (id: string) => saved.get(id) ?? DEFAULT_PREFS
    const wanted = recipients.filter((id) => prefsOf(id)[KIND_PREF[input.kind]])
    if (!wanted.length) return result

    const langOf = (id: string): NoticeLang => prefsOf(id).language ?? input.fallbackLang ?? 'en'
    const text = (id: string) => ({ title: clip(pick(input.title, langOf(id)), TITLE_MAX), body: clip(pick(input.body, langOf(id)), BODY_MAX) })

    const insertedFor = await deps.store.insert(
      wanted.map((id) => ({ recipient: id, kind: input.kind, ...text(id), link: input.link, dedupeKey: input.dedupeKey ?? null })),
    )
    result.inApp = insertedFor.length

    // Only recipients whose row was just written get a push, and only if they keep phone push on.
    const pushTo = insertedFor.filter((id) => prefsOf(id).pushEnabled)
    if (!pushTo.length) return result
    if (!deps.push) {
      if (!warnedNoPush) {
        warnedNoPush = true
        log('notify: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT is not set; phone push is skipped (in-app notifications still work)')
      }
      return result
    }

    const subs = await deps.store.subscriptions(pushTo)
    const dead: string[] = []
    await Promise.all(
      subs.map(async (sub) => {
        const { title, body } = text(sub.userId)
        const outcome = await deps.push!(sub, JSON.stringify({ title, body, url: input.link, tag: input.kind }))
        if (outcome.ok) result.pushed++
        else if (outcome.status === 404 || outcome.status === 410) dead.push(sub.endpoint)
      }),
    )
    if (dead.length) {
      await deps.store.removeSubscriptions(dead)
      result.removed = dead.length
    }
  } catch (e) {
    // Database or push-service text can quote addresses and keys: log a short, address-free line.
    log(`notify: failed (${String(e).replace(/[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+/g, '[email]').slice(0, 200)})`)
  }
  return result
}

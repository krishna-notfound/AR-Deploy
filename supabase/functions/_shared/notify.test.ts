// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applicationNotice, companyNotice, modelRequestNotice, modelUpdateNotice } from './notificationText'
import {
  DEFAULT_PREFS,
  type NewNotification,
  type NotifyDeps,
  type NotifyInput,
  type Prefs,
  type PushOutcome,
  type PushSub,
  isAllowedPushEndpoint,
  notify,
  resetNotifyWarnings,
} from './notify'

const ANA = 'user-ana'
const BEN = 'user-ben'
const CAT = 'user-cat'

const INPUT: NotifyInput = {
  recipients: [ANA, BEN],
  kind: 'new_application',
  title: { en: 'New business application', pt: 'Nova candidatura' },
  body: { en: 'Atelier applied.', pt: 'Atelier candidatou-se.' },
  link: '/admin/applications/app-1',
  dedupeKey: 'application:app-1',
}

function setup(opts: { prefs?: Record<string, Partial<Prefs>>; subs?: PushSub[]; outcome?: (s: PushSub) => PushOutcome; push?: boolean } = {}) {
  const rows: NewNotification[] = []
  const seen = new Set<string>()
  const removed: string[][] = []
  const pushes: { sub: PushSub; payload: Record<string, unknown> }[] = []
  const log = vi.fn()
  const deps: NotifyDeps = {
    log,
    store: {
      prefs: async (ids) => new Map(ids.filter((id) => opts.prefs?.[id]).map((id) => [id, { ...DEFAULT_PREFS, ...opts.prefs![id] }])),
      insert: async (batch) => {
        const inserted: string[] = []
        for (const r of batch) {
          const k = `${r.recipient}|${r.dedupeKey}`
          if (r.dedupeKey && seen.has(k)) continue
          seen.add(k)
          rows.push(r)
          inserted.push(r.recipient)
        }
        return inserted
      },
      subscriptions: async (ids) => (opts.subs ?? []).filter((s) => ids.includes(s.userId)),
      removeSubscriptions: async (endpoints) => void removed.push(endpoints),
    },
    push:
      opts.push === false
        ? null
        : async (sub, payload) => {
            pushes.push({ sub, payload: JSON.parse(payload) as Record<string, unknown> })
            return opts.outcome?.(sub) ?? { ok: true }
          },
  }
  return { deps, rows, removed, pushes, log }
}

const sub = (userId: string, n = 1): PushSub => ({ userId, endpoint: `https://fcm.googleapis.com/fcm/send/${userId}-${n}`, p256dh: 'k', auth: 'a' })

describe('isAllowedPushEndpoint (EF-4)', () => {
  it('accepts the browser push services over https', () => {
    for (const e of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com/wp/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/QAbc',
      'https://db5p.notify.windows.com/?token=abc',
      'https://WNS2-pn1p.notify.windows.com/w/?token=abc',
    ])
      expect(isAllowedPushEndpoint(e), e).toBe(true)
  })
  it('refuses any other host, plain http, credentials, ports and look-alike names', () => {
    for (const e of [
      'https://push.example/x',
      'https://evil.example/fcm.googleapis.com',
      'https://fcm.googleapis.com.evil.example/x',
      'https://evilfcm.googleapis.com/x',
      'https://notify.windows.com/x',
      'https://x.notify.windows.com.evil.example/x',
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://user:pw@fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://127.0.0.1/x',
      'https://169.254.169.254/latest/meta-data',
      'javascript:alert(1)',
      'not a url',
      '',
    ])
      expect(isAllowedPushEndpoint(e), e).toBe(false)
  })
})

beforeEach(() => resetNotifyWarnings())

describe('notify()', () => {
  it('writes one in-app row per recipient and pushes to each of their devices', async () => {
    const { deps, rows, pushes } = setup({ subs: [sub(ANA, 1), sub(ANA, 2), sub(BEN)] })
    const r = await notify(deps, INPUT)
    expect(r).toEqual({ inApp: 2, pushed: 3, removed: 0 })
    expect(rows.map((x) => [x.recipient, x.kind, x.title, x.link, x.dedupeKey])).toEqual([
      [ANA, 'new_application', 'New business application', '/admin/applications/app-1', 'application:app-1'],
      [BEN, 'new_application', 'New business application', '/admin/applications/app-1', 'application:app-1'],
    ])
    expect(pushes[0]!.payload).toEqual({ title: 'New business application', body: 'Atelier applied.', url: '/admin/applications/app-1', tag: 'new_application' })
  })

  it('removes a subscription the push service reports gone (404 or 410) and keeps the others', async () => {
    const { deps, removed } = setup({
      subs: [sub(ANA, 1), sub(ANA, 2), sub(BEN, 1), sub(BEN, 2)],
      outcome: (s) => (s.endpoint.endsWith('user-ana-1') ? { ok: false, status: 410 } : s.endpoint.endsWith('user-ben-2') ? { ok: false, status: 404 } : s.endpoint.endsWith('user-ben-1') ? { ok: false, status: 500 } : { ok: true }),
    })
    const r = await notify(deps, INPUT)
    expect(r).toMatchObject({ pushed: 1, removed: 2 })
    expect(removed).toEqual([['https://fcm.googleapis.com/fcm/send/user-ana-1', 'https://fcm.googleapis.com/fcm/send/user-ben-2']])
  })

  it('never sends to an endpoint that is not a push service host, and drops that saved device (EF-4)', async () => {
    const evil: PushSub = { userId: ANA, endpoint: 'https://169.254.169.254/latest/meta-data', p256dh: 'k', auth: 'a' }
    const { deps, pushes, removed } = setup({ subs: [evil, sub(ANA, 2)] })
    const r = await notify(deps, INPUT)
    expect(pushes.map((p) => p.sub.endpoint)).toEqual(['https://fcm.googleapis.com/fcm/send/user-ana-2'])
    expect(r).toMatchObject({ pushed: 1, removed: 1 })
    expect(removed).toEqual([['https://169.254.169.254/latest/meta-data']])
  })

  it('respects each kind switch: nothing is written or pushed for a person who turned that kind off', async () => {
    const { deps, rows, pushes } = setup({ prefs: { [ANA]: { newApplication: false } }, subs: [sub(ANA), sub(BEN)] })
    const r = await notify(deps, INPUT)
    expect(r).toEqual({ inApp: 1, pushed: 1, removed: 0 })
    expect(rows.map((x) => x.recipient)).toEqual([BEN])
    expect(pushes.map((p) => p.sub.userId)).toEqual([BEN])
    // The other kinds use their own switch.
    const other = setup({ prefs: { [ANA]: { newApplication: false, companyUpdates: false }, [BEN]: { newModelRequest: false } } })
    await notify(other.deps, { ...INPUT, kind: 'new_model_request' })
    expect(other.rows.map((x) => x.recipient)).toEqual([ANA])
    await notify(other.deps, { ...INPUT, kind: 'company_update', dedupeKey: 'x' })
    expect(other.rows.map((x) => [x.recipient, x.kind])).toEqual([[ANA, 'new_model_request'], [BEN, 'company_update']])
  })

  it('phone push off keeps the in-app row but sends no push', async () => {
    const { deps, rows, pushes } = setup({ prefs: { [ANA]: { pushEnabled: false } }, subs: [sub(ANA), sub(BEN)] })
    const r = await notify(deps, INPUT)
    expect(r.inApp).toBe(2)
    expect(rows.map((x) => x.recipient)).toEqual([ANA, BEN])
    expect(pushes.map((p) => p.sub.userId)).toEqual([BEN])
  })

  it('a repeated event with the same dedupe key writes and pushes nothing the second time', async () => {
    const { deps, rows, pushes } = setup({ subs: [sub(ANA)] })
    await notify(deps, { ...INPUT, recipients: [ANA] })
    const again = await notify(deps, { ...INPUT, recipients: [ANA] })
    expect(again).toEqual({ inApp: 0, pushed: 0, removed: 0 })
    expect(rows).toHaveLength(1)
    expect(pushes).toHaveLength(1)
  })

  it('writes the text in the saved language, else the fallback language, else English', async () => {
    const { deps, rows, pushes } = setup({ prefs: { [ANA]: { language: 'pt' }, [BEN]: { language: 'en' } }, subs: [sub(ANA), sub(CAT)] })
    await notify(deps, { ...INPUT, recipients: [ANA, BEN, CAT], fallbackLang: 'pt' })
    expect(rows.map((x) => [x.recipient, x.title])).toEqual([
      [ANA, 'Nova candidatura'],
      [BEN, 'New business application'],
      [CAT, 'Nova candidatura'],
    ])
    expect(pushes.find((p) => p.sub.userId === ANA)!.payload.title).toBe('Nova candidatura')
    const english = setup()
    await notify(english.deps, { ...INPUT, recipients: [CAT] })
    expect(english.rows[0]!.title).toBe('New business application')
    // A missing Portuguese text falls back to English.
    const noPt = setup({ prefs: { [ANA]: { language: 'pt' } } })
    await notify(noPt.deps, { ...INPUT, recipients: [ANA], title: { en: 'Only English' } })
    expect(noPt.rows[0]!.title).toBe('Only English')
  })

  it('without VAPID keys the in-app rows are written, no push is tried, and the reason is logged once', async () => {
    const { deps, rows, log } = setup({ push: false, subs: [sub(ANA)] })
    const r = await notify(deps, INPUT)
    expect(r).toEqual({ inApp: 2, pushed: 0, removed: 0 })
    expect(rows).toHaveLength(2)
    await notify(deps, { ...INPUT, dedupeKey: 'application:app-2' })
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]![0])).toContain('VAPID_PUBLIC_KEY')
  })

  it('never throws: a store failure comes back as an empty result and a short log line without addresses', async () => {
    const { deps, log } = setup()
    deps.store.insert = async () => Promise.reject(new Error('relation failed for ana@studio.test'))
    await expect(notify(deps, INPUT)).resolves.toEqual({ inApp: 0, pushed: 0, removed: 0 })
    expect(String(log.mock.calls[0]![0])).not.toContain('ana@studio.test')
  })

  it('refuses a link that is not an in-app path, ignores empty or repeated recipients and truncates long text', async () => {
    const bad = setup()
    for (const link of ['https://evil.example/x', '//evil.example', 'admin/x', '/\\evil'])
      expect(await notify(bad.deps, { ...INPUT, link })).toEqual({ inApp: 0, pushed: 0, removed: 0 })
    expect(bad.rows).toEqual([])
    const ok = setup()
    await notify(ok.deps, { ...INPUT, recipients: [ANA, '', ANA], title: { en: 'T'.repeat(300) }, body: { en: 'B'.repeat(900) } })
    expect(ok.rows).toHaveLength(1)
    expect(ok.rows[0]!.title.length).toBe(200)
    expect(ok.rows[0]!.body.length).toBe(500)
    expect(await notify(setup().deps, { ...INPUT, recipients: [] })).toEqual({ inApp: 0, pushed: 0, removed: 0 })
  })
})

describe('notification text', () => {
  it('has both languages for every event and keeps names in the sentence', () => {
    const all = [
      applicationNotice('Atelier'),
      modelRequestNotice('Atelier', { en: 'Oslo sofa', pt: 'Sofá Oslo' }),
      modelUpdateNotice('delivered', { en: 'Oslo sofa', pt: 'Sofá Oslo' }),
      modelUpdateNotice('declined', { en: 'Oslo sofa' }),
      ...(['paused', 'live', 'product_unpublished', 'product_deleted'] as const).map((e) => companyNotice(e, { businessName: 'Casa', productName: { en: 'Oslo sofa' } })),
    ]
    for (const t of all) {
      expect(t.title.en.length).toBeGreaterThan(0)
      expect(t.title.pt?.length).toBeGreaterThan(0)
      expect(t.body.pt?.length).toBeGreaterThan(0)
      expect(t.title.pt).not.toBe(t.title.en)
    }
    expect(modelRequestNotice('Atelier', { en: 'Oslo sofa', pt: 'Sofá Oslo' }).body).toEqual({
      en: 'Atelier asked for a 3D model of Oslo sofa.',
      pt: 'Atelier pediu um modelo 3D de Sofá Oslo.',
    })
    expect(applicationNotice('').body.en).toBe('A business applied to join Sanctus.')
  })
})
